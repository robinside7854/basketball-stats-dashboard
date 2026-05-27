import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/leagues/[leagueId]/stats
// 쿼리 파라미터: quarterId, teamId, playerId, from, to
// 분기별/팀별/선수별 시즌 누적 스탯 반환
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const quarterId = sp.get('quarterId')
  const teamId    = sp.get('teamId')
  const playerId  = sp.get('playerId')
  const from      = sp.get('from')
  const to        = sp.get('to')
  const unit      = sp.get('unit') ?? 'round'  // 'round' | 'game'

  const supabase = createClient()

  // 1. 선수 메타 + plus_one 플래그를 이벤트 루프 전에 미리 조회
  const { data: allLeaguePlayers } = await supabase
    .from('league_players')
    .select('id, name, number, position, plus_one')
    .eq('league_id', leagueId)

  const plusOneSet = new Set((allLeaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  const metaMap = Object.fromEntries((allLeaguePlayers ?? []).map(p => [p.id, p]))

  // 2. 대상 게임 ID 추출 — is_started=true 기준 (detail API와 동일, 마감 미처리 경기도 포함)
  let gQuery = supabase
    .from('league_games')
    .select('id, plus_one_player_id, date, round_num')
    .eq('league_id', leagueId)
    .eq('is_started', true)

  if (quarterId) gQuery = gQuery.eq('quarter_id', quarterId)
  if (from)      gQuery = gQuery.gte('date', from)
  if (to)        gQuery = gQuery.lte('date', to)

  const { data: games, error: gErr } = await gQuery
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  const gameIds = (games ?? []).map(g => g.id)
  if (gameIds.length === 0) return NextResponse.json({ players: [] })

  const gamePlusOneMap: Record<string, string | null> = {}
  const gameToDate: Record<string, string> = {}
  for (const g of (games ?? [])) {
    gamePlusOneMap[g.id] = (g as Record<string, unknown>).plus_one_player_id as string | null ?? null
    gameToDate[g.id] = (g as Record<string, unknown>).date as string ?? g.id
  }
  // '라운드' = 경기일(date) 기준 그룹핑 (round_num은 하루 내 슬롯 번호라 부정확)

  // 3. 이벤트 조회 — Supabase 서버 max-rows(1000) 제한을 피해 페이지네이션으로 전체 수집
  type EventRow = { league_player_id: string | null; related_player_id: string | null; team_id: string | null; type: string; result: string | null; points: number | null; league_game_id: string }
  const events: EventRow[] = []
  const PAGE = 1000
  let page = 0
  while (true) {
    let q = supabase
      .from('league_game_events')
      .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      // ⚠ ORDER BY 없으면 페이지네이션 중복/누락 발생 (PostgreSQL 동작 — 일관 정렬 필요)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (teamId)   q = q.eq('team_id', teamId)
    if (playerId) q = q.eq('league_player_id', playerId)
    const { data: chunk, error: eErr } = await q
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })
    if (chunk && chunk.length > 0) events.push(...(chunk as EventRow[]))
    if (!chunk || chunk.length < PAGE) break
    page++
  }
  // 4. 선수별 스탯 집계
  type PlayerStats = {
    player_id: string
    gp: number
    pts: number
    fgm: number; fga: number
    fg3m: number; fg3a: number
    ftm: number;  fta: number
    oreb: number; dreb: number; reb: number
    ast: number; stl: number; blk: number
    tov: number; pf: number
    and_one: number  // 성공한 앤드원 횟수
    // 슛 분포 — 존별 made/attempted (DS=골밑, LU=레이업+드라이브, MD=미들)
    ds_a: number; ds_m: number
    lu_a: number; lu_m: number
    md_a: number; md_m: number
    // TRB% 계산용: 본인이 뛴 경기에서 본인 팀의 총 리바운드
    team_reb_in_games: number
  }

  const statsMap: Record<string, PlayerStats> = {}
  const gpMap: Record<string, Set<string>> = {}  // player_id → game_ids set
  // (team_id, game_id) → 그 팀의 그 경기 리바운드 수
  const teamRebByGame: Record<string, Record<string, number>> = {}
  // player_id → game_id → team_id → count (선수가 그 경기에서 어느 팀으로 뛰었는지 다수결)
  const playerTeamGameCount: Record<string, Record<string, Record<string, number>>> = {}

  const ensure = (pid: string): PlayerStats => {
    if (!statsMap[pid]) {
      statsMap[pid] = {
        player_id: pid, gp: 0,
        pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
        oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
        and_one: 0,
        ds_a: 0, ds_m: 0, lu_a: 0, lu_m: 0, md_a: 0, md_m: 0,
        team_reb_in_games: 0,
      }
    }
    return statsMap[pid]
  }

  for (const e of events ?? []) {
    if (!e.league_player_id) continue
    const pid = e.league_player_id
    const s = ensure(pid)
    const gId = e.league_game_id

    // 출전 일수 집계 — sub_in/sub_out 제외, 날짜 기준으로 카운트 (일별 스탯)
    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!gpMap[pid]) gpMap[pid] = new Set()
      gpMap[pid].add(unit === 'round' ? (gameToDate[gId] ?? gId) : gId)
    }

    // 선수-게임별 team_id 카운트 (TRB% 계산용 — 다수결로 본인 팀 결정)
    if (e.team_id && e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!playerTeamGameCount[pid]) playerTeamGameCount[pid] = {}
      if (!playerTeamGameCount[pid][gId]) playerTeamGameCount[pid][gId] = {}
      playerTeamGameCount[pid][gId][e.team_id] = (playerTeamGameCount[pid][gId][e.team_id] ?? 0) + 1
    }

    const made = e.result === 'made'
    // 필드골 득점: 게임별 plus_one_player_id 오버라이드 우선, 없으면 영구 플래그 사용
    const gamePlusOneOverride = gamePlusOneMap[e.league_game_id]
    const isPlusOne = gamePlusOneOverride !== null
      ? pid === gamePlusOneOverride
      : plusOneSet.has(pid)

    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++
        if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3 }
        break
      case 'shot_post':
        s.fga++; s.ds_a++
        if (made) { s.fgm++; s.ds_m++; s.pts += isPlusOne ? 3 : 2 }
        break
      case 'shot_layup':
      case 'shot_2p_drive':
        s.fga++; s.lu_a++
        if (made) { s.fgm++; s.lu_m++; s.pts += isPlusOne ? 3 : 2 }
        break
      case 'shot_2p_mid':
        s.fga++; s.md_a++
        if (made) { s.fgm++; s.md_m++; s.pts += isPlusOne ? 3 : 2 }
        break
      // 앤드원: FTA/FTM 제외, 득점 +1, 카운트도 집계
      case 'and_one':
        if (made) { s.pts += 1; s.and_one++ }
        break
      // ft_2pt: 1회 시도 2점 / 나머지 자유투: 1점
      case 'ft_2pt':
        s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
      case 'ft_3pt_1':
        s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
      case 'free_throw': case 'ft_3pt_2':
        s.fta++; if (made) { s.ftm++; s.pts += 1 }; break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }

    // 팀-게임 reb 카운트 (TRB% 계산용)
    if ((e.type === 'oreb' || e.type === 'dreb') && e.team_id) {
      if (!teamRebByGame[e.team_id]) teamRebByGame[e.team_id] = {}
      teamRebByGame[e.team_id][gId] = (teamRebByGame[e.team_id][gId] ?? 0) + 1
    }

    // 어시스트: 슛 성공 + related_player_id → 어시스터에게 ast 추가
    if (made &&
        ['shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive'].includes(e.type) &&
        e.related_player_id) {
      const as = ensure(e.related_player_id)
      as.ast++
      if (!gpMap[e.related_player_id]) gpMap[e.related_player_id] = new Set()
      gpMap[e.related_player_id].add(unit === 'round' ? (gameToDate[gId] ?? gId) : gId)
      // 어시스터의 팀도 카운트 (관전만 한 게임에서 어시스트만 있을 수 있음)
      if (e.team_id) {
        if (!playerTeamGameCount[e.related_player_id]) playerTeamGameCount[e.related_player_id] = {}
        if (!playerTeamGameCount[e.related_player_id][gId]) playerTeamGameCount[e.related_player_id][gId] = {}
        playerTeamGameCount[e.related_player_id][gId][e.team_id] = (playerTeamGameCount[e.related_player_id][gId][e.team_id] ?? 0) + 1
      }
    }
  }

  // gp 채우기 + team_reb_in_games 계산
  for (const pid of Object.keys(statsMap)) {
    statsMap[pid].gp = gpMap[pid]?.size ?? 0

    // TRB% 계산: 본인이 뛴 각 경기에서 본인 팀(다수결)의 리바운드 합산
    let teamRebSum = 0
    const gameTeams = playerTeamGameCount[pid] ?? {}
    for (const gid of Object.keys(gameTeams)) {
      const teams = gameTeams[gid]
      const top = Object.entries(teams).sort((a, b) => b[1] - a[1])[0]
      if (top) {
        const teamId = top[0]
        teamRebSum += teamRebByGame[teamId]?.[gid] ?? 0
      }
    }
    statsMap[pid].team_reb_in_games = teamRebSum
  }

  // 5. 평균/퍼센트 계산 후 반환
  if (Object.keys(statsMap).length === 0) return NextResponse.json({ players: [] })
  const result = Object.values(statsMap)
    .filter(s => s.gp > 0)
    .map(s => {
      const meta = metaMap[s.player_id] ?? {}
      return {
        ...s,
        name:     (meta as Record<string,unknown>).name     ?? '알 수 없음',
        number:   (meta as Record<string,unknown>).number   ?? null,
        position: (meta as Record<string,unknown>).position ?? null,
        // 평균
        ppg:  s.gp > 0 ? +(s.pts  / s.gp).toFixed(1) : 0,
        rpg:  s.gp > 0 ? +(s.reb  / s.gp).toFixed(1) : 0,
        orp:  s.gp > 0 ? +(s.oreb / s.gp).toFixed(1) : 0,
        drp:  s.gp > 0 ? +(s.dreb / s.gp).toFixed(1) : 0,
        apg:  s.gp > 0 ? +(s.ast  / s.gp).toFixed(1) : 0,
        spg:  s.gp > 0 ? +(s.stl  / s.gp).toFixed(1) : 0,
        bpg:  s.gp > 0 ? +(s.blk  / s.gp).toFixed(1) : 0,
        topg: s.gp > 0 ? +(s.tov  / s.gp).toFixed(1) : 0,
        // 슈팅 퍼센트
        fg_pct:  s.fga  > 0 ? +(s.fgm  / s.fga  * 100).toFixed(1) : 0,
        fg3_pct: s.fg3a > 0 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : 0,
        ft_pct:  s.fta  > 0 ? +(s.ftm  / s.fta  * 100).toFixed(1) : 0,
        // eFG% = (FGM + 0.5 * FG3M) / FGA
        efg_pct: s.fga  > 0 ? +((s.fgm + 0.5 * s.fg3m) / s.fga * 100).toFixed(1) : 0,
        // 2P% = (FGM - FG3M) / (FGA - FG3A)
        fg2m: s.fgm - s.fg3m,
        fg2a: s.fga - s.fg3a,
        fg2_pct: (s.fga - s.fg3a) > 0 ? +((s.fgm - s.fg3m) / (s.fga - s.fg3a) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.pts - a.pts) // 득점 순 정렬

  return NextResponse.json({ players: result, games_count: gameIds.length, unit })
}
