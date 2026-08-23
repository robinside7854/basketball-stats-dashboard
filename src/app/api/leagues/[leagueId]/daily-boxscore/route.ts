import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { makeIdentityResolver, type QuarterOverride, type TeamBase } from '@/lib/stats/teamIdentity'
import { scorePoints, fetchScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'

// GET /api/leagues/[leagueId]/daily-boxscore?date=YYYY-MM-DD
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supabase = createClient()

  // 이 파일에도 득점 계산이 있었다 — 공용 룰 하나로 통일
  const scoringRules = await fetchScoringRules(supabase, leagueId)

  const [
    { data: games },
    { data: players },
    { data: teams },
    { data: memberships },
    { data: overrides },
  ] = await Promise.all([
    supabase
      .from('league_games')
      .select('id, slot_num, date, home_team_id, away_team_id, home_score, away_score, is_complete, is_started, youtube_url, youtube_start_offset, quarter_id, round_num, plus_one_player_id, plus_one_extra_ids')
      .eq('league_id', leagueId)
      .eq('date', date)
      .eq('is_started', true)
      .order('slot_num'),
    // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 대회 묶음에서 0명이 나와
    //   plus_one 맵이 비고, 가산점이 에러 없이 조용히 빠진다.
    supabase.from('league_players').select('id, name, number, plus_one, photo_url').eq('team_id', await resolveTeamId(leagueId)),
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('league_player_quarters').select('league_player_id, quarter_id, team_id').eq('league_id', leagueId),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
  ])

  // 프랜차이즈 정체성 resolver — game 의 quarter_id 기준으로 팀명/색상 override 적용
  const identityResolver = makeIdentityResolver(
    (teams ?? []) as TeamBase[],
    (overrides ?? []) as QuarterOverride[],
  )

  if (!games || games.length === 0) return NextResponse.json({ games: [], daily_stats: [] })

  const gameIds = games.map(g => g.id)
  const { data: events } = await supabase
    .from('league_game_events')
    .select('league_game_id, league_player_id, related_player_id, type, result, points, quarter, team_id')
    .in('league_game_id', gameIds)
    .not('league_player_id', 'is', null)

  // teamMap 제거 — identityResolver 로 대체 (Q3 override 반영)
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))
  const plusOneSet = new Set((players ?? []).filter(p => p.plus_one).map(p => p.id))
  const gamePlusOneMap: Record<string, GamePlusOne> = {}
  for (const g of games ?? []) gamePlusOneMap[g.id] = g as GamePlusOne

  // quarter_id → team_id for each player (정규 선수)
  const qTeamMap: Record<string, Record<string, string>> = {}
  for (const m of memberships ?? []) {
    if (!m.quarter_id) continue
    if (!qTeamMap[m.quarter_id]) qTeamMap[m.quarter_id] = {}
    qTeamMap[m.quarter_id][m.league_player_id] = m.team_id
  }

  // 비정규 선수: league_game_players (game_id → player_id → team_id)
  const { data: gamePlayerRows } = await supabase
    .from('league_game_players')
    .select('league_game_id, league_player_id, team_id')
    .in('league_game_id', gameIds)
  const gpTeamMap: Record<string, Record<string, string>> = {}
  for (const r of gamePlayerRows ?? []) {
    if (!gpTeamMap[r.league_game_id]) gpTeamMap[r.league_game_id] = {}
    gpTeamMap[r.league_game_id][r.league_player_id] = r.team_id
  }

  type GS = { pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; pf: number; fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number }
  const emptyGS = (): GS => ({ pts:0,reb:0,oreb:0,dreb:0,ast:0,stl:0,blk:0,tov:0,pf:0,fgm:0,fga:0,fg3m:0,fg3a:0,ftm:0,fta:0 })

  // per game → per player stats
  const gamePlayerStats: Record<string, Record<string, GS>> = {}
  for (const g of games) gamePlayerStats[g.id] = {}

  // 쿼터별 스코어 — 1~4쿼터(+연장)로 치른 정식 경기에서만 의미가 있다.
  //   미라클의 짧은 슬롯 경기는 전부 quarter=1 이라 항목이 1개뿐이고, 화면이 그때는 줄을 그리지 않는다.
  //   팀 판정은 이벤트의 team_id(트리거가 경기별 배정 → 분기 소속 순으로 채운다)를 쓰고,
  //   비어 있으면 아래 게임별/분기별 배정 맵으로 되짚는다.
  const gameById = Object.fromEntries(games.map(g => [g.id, g]))
  const quarterScores: Record<string, Record<number, { home: number; away: number }>> = {}

  const SHOT_TYPES = ['shot_3p','shot_2p_mid','shot_layup','shot_post']

  for (const e of events ?? []) {
    const gId = e.league_game_id as string
    const pid = e.league_player_id as string
    const made = e.result === 'made'
    const isP1 = isPlusOneFor(pid, gamePlusOneMap[gId], plusOneSet)
    const pts = scorePoints(e.type as string, e.result as string | null, isP1, scoringRules)
    if (!gamePlayerStats[gId]) continue
    if (!gamePlayerStats[gId][pid]) gamePlayerStats[gId][pid] = emptyGS()
    const s = gamePlayerStats[gId][pid]

    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++
        if (made) { s.fg3m++; s.fgm++; s.pts += pts }
        break
      case 'shot_2p_mid': case 'shot_layup': case 'shot_post':
        s.fga++
        if (made) { s.fgm++; s.pts += pts }
        break
      case 'and_one':
        if (made) { s.pts += pts }; break
      case 'ft_2pt':
        s.fta++; if (made) { s.ftm++; s.pts += pts }; break
      case 'ft_3pt_1':
        s.fta++; if (made) { s.ftm++; s.pts += pts }; break
      case 'ft_3pt_2': case 'free_throw':
        s.fta++; if (made) { s.ftm++; s.pts += pts }; break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }
    // 쿼터별 스코어 — 득점이 난 이벤트만 홈/어웨이로 가른다.
    if (pts > 0) {
      const gm = gameById[gId] as { quarter_id: string | null; home_team_id: string | null; away_team_id: string | null } | undefined
      const teamId = (e.team_id as string | null)
        ?? gpTeamMap[gId]?.[pid]
        ?? (gm?.quarter_id ? qTeamMap[gm.quarter_id]?.[pid] : null)
        ?? null
      const side = teamId && gm
        ? (teamId === gm.home_team_id ? 'home' : teamId === gm.away_team_id ? 'away' : null)
        : null
      if (side) {
        const q = Math.min(Math.max(Number(e.quarter) || 1, 1), 6)
        const bucket = (quarterScores[gId] ||= {})
        ;(bucket[q] ||= { home: 0, away: 0 })[side] += pts
      }
    }

    // assists
    if (e.related_player_id && made && SHOT_TYPES.includes(e.type as string)) {
      const ap = e.related_player_id as string
      if (!gamePlayerStats[gId][ap]) gamePlayerStats[gId][ap] = emptyGS()
      gamePlayerStats[gId][ap].ast++
    }
  }

  const pct = (m: number, a: number) => a > 0 ? +(m / a * 100).toFixed(1) : null

  // Build game list with boxscores (슬롯 단위 — 아래에서 대진별로 롤업한다)
  const slotList = games.map(g => {
    const qId = g.quarter_id as string | null
    // game.quarter_id 를 기준으로 identity 해결 (Q3 게임이면 굿모닝/챗지피지기 등으로)
    const homeIdentity = g.home_team_id ? identityResolver(g.home_team_id, qId) : null
    const awayIdentity = g.away_team_id ? identityResolver(g.away_team_id, qId) : null
    const gps = gamePlayerStats[g.id] ?? {}

    const rows = Object.entries(gps).map(([pid, s]) => {
      const p = playerMap[pid]
      // 1차: league_game_players (이 경기 한정 배정 — 비정규/타팀 임시 출전) → 2차: league_player_quarters (정규 분기 소속)
      const teamId = gpTeamMap[g.id]?.[pid] || (qId && qTeamMap[qId]?.[pid]) || null
      // 선수 팀 표시도 identity 기반 (락다운 vs 굿모닝 분리)
      const playerIdentity = teamId ? identityResolver(teamId, qId) : null
      return {
        player_id: pid,
        name: p?.name ?? '?',
        number: p?.number ?? null,
        team_id: teamId ?? null,
        team_name: playerIdentity?.display_name ?? null,
        team_color: playerIdentity?.color ?? null,
        pts: s.pts, reb: s.reb, oreb: s.oreb, dreb: s.dreb,
        ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, pf: s.pf,
        fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a, ftm: s.ftm, fta: s.fta,
        fg_pct: pct(s.fgm, s.fga),
        fg3_pct: pct(s.fg3m, s.fg3a),
      }
    }).sort((a, b) => b.pts - a.pts)

    return {
      id: g.id, slot_num: g.slot_num, round_num: g.round_num,
      is_complete: g.is_complete, is_started: g.is_started,
      home_score: g.home_score, away_score: g.away_score,
      home_team: homeIdentity ? { id: homeIdentity.team_id, name: homeIdentity.display_name, color: homeIdentity.color } : null,
      away_team: awayIdentity ? { id: awayIdentity.team_id, name: awayIdentity.display_name, color: awayIdentity.color } : null,
      youtube_url: g.youtube_url ?? null,
      youtube_start_offset: g.youtube_start_offset ?? 0,
      // 쿼터 오름차순. 항목이 1개면 쿼터를 나누지 않은 경기라는 뜻이라 화면에서 감춘다.
      //   ⚠ 쿼터 합이 저장된 스코어와 어긋나면 아예 내보내지 않는다. 팀 판정이 안 되는 이벤트가
      //   섞이면(team_id 가 비고 경기별·분기별 배정에도 없는 옛 기록) 그 득점만 쿼터에서 빠져
      //   "9+12+8 = 29 인데 합계 31" 같은 표가 된다. 숫자가 맞지 않는 표는 없는 편이 낫다.
      quarter_scores: (() => {
        const list = Object.entries(quarterScores[g.id] ?? {})
          .map(([q, s]) => ({ quarter: Number(q), home: s.home, away: s.away }))
          .sort((a, b) => a.quarter - b.quarter)
        if (list.length < 2) return []
        const sum = list.reduce((t, s) => ({ home: t.home + s.home, away: t.away + s.away }), { home: 0, away: 0 })
        return sum.home === (g.home_score ?? 0) && sum.away === (g.away_score ?? 0) ? list : []
      })(),
      players: rows,
    }
  })

  // ── 대진 롤업 ───────────────────────────────────────────────────────
  //   같은 대진(팀 조합)이 **연속된 슬롯**으로 이어지면 한 경기로 본다.
  //
  //   왜 필요한가 (2026-08-22)
  //     영상이 쿼터별로 쪼개져 올라오는 날은 슬롯을 쿼터 단위로 쓴다(3경기 → 슬롯 10칸).
  //     그대로 두면 화면에 경기가 10개로 보이고, 승패도 10경기로 세고, 선수 `gp` 가 쿼터 수가 된다.
  //
  //   왜 "연속" 조건이 붙는가
  //     정규전은 승자 잔류 로테이션이라 **같은 대진이 하루에 여러 번** 나온다. 대진만으로 묶으면
  //     서로 다른 경기가 합쳐진다. 다만 로테이션 규칙상 2연속 뛴 팀은 강제 휴식이라 같은 대진이
  //     연속될 수 없다 — 즉 이 조건 아래에서 **정규전은 한 칸도 묶이지 않고 종전과 똑같이 보인다.**
  //
  //   홈/어웨이가 쿼터마다 뒤집혀 있어도 묶는다. 대신 점수·쿼터표는 첫 슬롯의 좌우 기준으로 맞춘다 —
  //   안 맞추면 2쿼터에 코트를 바꾼 경기의 합계가 서로 반대편에 쌓인다.
  type SlotGame = (typeof slotList)[number]
  type PlayerRow = SlotGame['players'][number]
  type GroupGame = Omit<SlotGame, 'players'> & {
    players: PlayerRow[]
    /** 이 경기를 이루는 슬롯 번호 (롤업 안 된 경기는 1개) */
    slot_nums: number[]
    /** 슬롯 id 전부 — 딥링크(?game=)가 중간 슬롯을 가리켜도 찾을 수 있어야 한다 */
    slot_ids: string[]
    /** 슬롯마다 붙은 영상. 쿼터별로 쪼갠 날은 여러 개가 된다 */
    videos: { slot_num: number; url: string; start_offset: number }[]
  }

  const pairKey = (a: string | null | undefined, b: string | null | undefined) =>
    a && b ? [a, b].sort().join('|') : null

  const groups: GroupGame[] = []
  const groupKeys: (string | null)[] = []

  for (const g of slotList) {
    const key = pairKey(g.home_team?.id, g.away_team?.id)
    const prev = groups[groups.length - 1]
    const prevKey = groupKeys[groupKeys.length - 1]
    // 슬롯 **번호**가 바로 다음일 때만 잇는다. 이 목록은 기록이 시작된 슬롯만 담고 있어서
    //   목록상 이웃이 곧 슬롯상 이웃은 아니다 — 중간 슬롯이 미기록이면 3경기와 5경기가 붙는다.
    //   3팀 로테이션에서 같은 대진은 한 칸 건너 다시 나올 수 있으므로(A-B, A-C, A-B) 실제로 위험하다.
    //   한 쿼터를 기록 안 한 날은 대신 경기가 둘로 갈려 보인다 — 조용히 잘못 합치는 것보다 낫다.
    const adjacent = prev ? g.slot_num === prev.slot_nums[prev.slot_nums.length - 1] + 1 : false
    // key 가 null(팀 미배정)이면 절대 묶지 않는다 — 빈 슬롯끼리 한 덩어리가 되면 표가 거짓말을 한다
    if (!prev || !key || key !== prevKey || !adjacent) {
      groups.push({
        ...g,
        players: g.players.map(r => ({ ...r })),
        slot_nums: [g.slot_num],
        slot_ids: [g.id],
        videos: g.youtube_url
          ? [{ slot_num: g.slot_num, url: g.youtube_url, start_offset: g.youtube_start_offset }]
          : [],
      })
      groupKeys.push(key)
      continue
    }

    // 같은 대진이 이어진다 → 합친다. 좌우가 뒤집혀 있으면 첫 슬롯 기준으로 되돌려 더한다.
    const flipped = g.home_team?.id !== prev.home_team?.id
    const addHome = flipped ? (g.away_score ?? 0) : (g.home_score ?? 0)
    const addAway = flipped ? (g.home_score ?? 0) : (g.away_score ?? 0)
    prev.home_score = (prev.home_score ?? 0) + addHome
    prev.away_score = (prev.away_score ?? 0) + addAway
    prev.slot_nums.push(g.slot_num)
    prev.slot_ids.push(g.id)
    if (g.youtube_url) prev.videos.push({ slot_num: g.slot_num, url: g.youtube_url, start_offset: g.youtube_start_offset })
    prev.is_started = prev.is_started || g.is_started
    prev.is_complete = prev.is_complete && g.is_complete

    const byId = new Map(prev.players.map(r => [r.player_id, r]))
    for (const r of g.players) {
      const cur = byId.get(r.player_id)
      if (!cur) { const copy = { ...r }; prev.players.push(copy); byId.set(r.player_id, copy); continue }
      cur.pts += r.pts; cur.reb += r.reb; cur.oreb += r.oreb; cur.dreb += r.dreb
      cur.ast += r.ast; cur.stl += r.stl; cur.blk += r.blk; cur.tov += r.tov; cur.pf += r.pf
      cur.fgm += r.fgm; cur.fga += r.fga; cur.fg3m += r.fg3m; cur.fg3a += r.fg3a
      cur.ftm += r.ftm; cur.fta += r.fta
    }
  }

  for (const grp of groups) {
    if (grp.slot_nums.length > 1) {
      // 슬롯 하나가 곧 한 쿼터인 날 — 쿼터표는 슬롯 순서로 다시 만든다.
      //   슬롯 자체에 들어 있던 쿼터표는 의미가 겹치므로 버린다(전부 1Q 로 기록돼 있다).
      grp.quarter_scores = grp.slot_nums.map((sn, i) => {
        const slot = slotList.find(x => x.slot_num === sn)!
        const flipped = slot.home_team?.id !== grp.home_team?.id
        return {
          quarter: i + 1,
          home: flipped ? (slot.away_score ?? 0) : (slot.home_score ?? 0),
          away: flipped ? (slot.home_score ?? 0) : (slot.away_score ?? 0),
        }
      })
      grp.players.sort((a, b) => b.pts - a.pts)
      for (const r of grp.players) {
        r.fg_pct = pct(r.fgm, r.fga)
        r.fg3_pct = pct(r.fg3m, r.fg3a)
      }
    }
  }

  // 롤업 결과가 곧 "경기" 다. 아래 daily_stats 의 gp 도 이걸 세므로 쿼터 수가 아니라 경기 수가 된다.
  const gameList = groups
  const rolledUp = groups.some(g => g.slot_nums.length > 1)

  // Aggregate daily stats per player (팀 정보 포함)
  // photo_url: playerMap 에서 직접 조회(게임별 row 에는 안 실어둠 — StatTable 은 안 쓰므로 불필요한
  // 필드 증식 방지) · "그날의 주인공" 히어로(2026-08-10, BoxscoreContent 최다득점자 얼굴)용
  type DailyEntry = GS & { gp: number; name: string; number: number | null; team_id: string | null; team_name: string | null; team_color: string | null; photo_url: string | null }
  const dailyMap: Record<string, DailyEntry> = {}
  for (const g of gameList) {
    for (const row of g.players) {
      if (!dailyMap[row.player_id]) dailyMap[row.player_id] = {
        ...emptyGS(), gp: 0, name: row.name, number: row.number,
        team_id: row.team_id ?? null, team_name: row.team_name ?? null, team_color: row.team_color ?? null,
        photo_url: (playerMap[row.player_id] as { photo_url?: string | null } | undefined)?.photo_url ?? null,
      }
      const d = dailyMap[row.player_id]
      d.gp++; d.pts+=row.pts; d.reb+=row.reb; d.oreb+=row.oreb; d.dreb+=row.dreb
      d.ast+=row.ast; d.stl+=row.stl; d.blk+=row.blk; d.tov+=row.tov; d.pf+=row.pf
      d.fgm+=row.fgm; d.fga+=row.fga; d.fg3m+=row.fg3m; d.fg3a+=row.fg3a; d.ftm+=row.ftm; d.fta+=row.fta
    }
  }
  const dailyStats = Object.entries(dailyMap)
    .map(([pid, d]) => ({
      player_id: pid, name: d.name, number: d.number, gp: d.gp,
      team_id: d.team_id, team_name: d.team_name, team_color: d.team_color, photo_url: d.photo_url,
      pts: d.pts, reb: d.reb, oreb: d.oreb, dreb: d.dreb, ast: d.ast, stl: d.stl, blk: d.blk, tov: d.tov, pf: d.pf,
      fgm: d.fgm, fga: d.fga, fg3m: d.fg3m, fg3a: d.fg3a, ftm: d.ftm, fta: d.fta,
      fg_pct: pct(d.fgm, d.fga), fg3_pct: pct(d.fg3m, d.fg3a),
    }))
    .sort((a, b) => b.pts - a.pts)

  // slots: 롤업 전 슬롯 단위 원본. 화면에서 "슬롯별로 보기" 로 되돌릴 때 쓴다.
  return NextResponse.json({ games: gameList, daily_stats: dailyStats, slots: slotList, rolled_up: rolledUp })
}
