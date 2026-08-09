import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { evaluateAllBadges, type PlayerCareerInput, type TeamAverages } from '@/lib/stats/badges'
import { canViewStats } from '@/lib/auth/guard'
import { scorePoints, fetchScoringRules, type ScoringRules } from '@/lib/stats/scoring'
import { resolveTeamId } from '@/lib/league/teamScope'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] as const

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId') ?? undefined
  const unit = searchParams.get('unit') ?? 'round'
  const supabase = createClient()

  // 이 파일에는 득점 계산이 5곳 있었다. 전부 이 룰 하나를 공유한다.
  const scoringRules: ScoringRules = await fetchScoringRules(supabase, leagueId)

  const [
    { data: leaguePlayers },
    { data: allGames },
    { data: teams },
    { data: league },
    { data: memberships },
    { data: gpRows },
  ] = await Promise.all([
    // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 대회 묶음에서 0명이 나와
    //   plus_one 맵이 비고, 가산점이 에러 없이 조용히 빠진다.
    supabase.from('league_players').select('id, name, number, photo_url, plus_one').eq('team_id', await resolveTeamId(leagueId)),
    supabase
      .from('league_games')
      .select('id, date, quarter_id, home_team_id, away_team_id, home_score, away_score, round_num, plus_one_player_id, is_exhibition')
      .eq('league_id', leagueId)
      .eq('is_started', true)   // 마감 여부와 무관하게 기록 시작된 게임 전체 포함
      .order('date', { ascending: false }),
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('leagues').select('name').eq('id', leagueId).single(),
    supabase
      .from('league_player_quarters')
      .select('quarter_id, team_id')
      .eq('league_player_id', playerId)
      .eq('league_id', leagueId),
    // 게임별 비정규/타팀 임시 출전 배정 (정규 팀보다 우선 적용)
    supabase
      .from('league_game_players')
      .select('league_game_id, team_id')
      .eq('league_player_id', playerId)
      .eq('league_id', leagueId),
  ])

  // quarterId 필터: 해당 분기 게임만
  const games = quarterId
    ? (allGames ?? []).filter(g => g.quarter_id === quarterId)
    : (allGames ?? [])

  // 분기별 팀명/색상 override — 항상 전체를 조회해서 게임별로 그 게임의 quarter override 를 적용.
  // (누적 뷰에서도 Q1-Q2 게임의 상대가 락다운으로 정확히 표시되도록.)
  const { data: allOverridesData } = await supabase
    .from('league_team_quarter_overrides')
    .select('quarter_id, team_id, name, color')
    .eq('league_id', leagueId)
  type OverrideRow = { quarter_id: string; team_id: string; name: string | null; color: string | null }
  const overrideMap: Record<string, Record<string, { name?: string; color?: string }>> = {}
  for (const ov of (allOverridesData as OverrideRow[] | null) ?? []) {
    if (!overrideMap[ov.quarter_id]) overrideMap[ov.quarter_id] = {}
    overrideMap[ov.quarter_id][ov.team_id] = { name: ov.name ?? undefined, color: ov.color ?? undefined }
  }

  // quarterId 필터가 있으면 그 분기 기준으로 teamsForDisplay 를 미리 치환 (기존 동작 유지).
  let teamsForDisplay = (teams ?? []) as { id: string; name: string; color?: string }[]
  if (quarterId) {
    const ovMap = overrideMap[quarterId] ?? {}
    teamsForDisplay = teamsForDisplay.map(t => {
      const ov = ovMap[t.id]
      return ov ? { ...t, name: ov.name ?? t.name, color: ov.color ?? t.color } : t
    })
  }

  // 게임의 quarter_id 기반 팀 이름/색상 조회 (누적 뷰에서 게임별로 정확히 적용됨)
  const baseTeamMap = Object.fromEntries((teams ?? []).map(t => [t.id, { name: t.name, color: t.color ?? '#9ca3af' }]))
  function resolveTeamName(teamId: string, qId: string | null | undefined): string {
    const ov = qId ? overrideMap[qId]?.[teamId] : undefined
    return ov?.name ?? baseTeamMap[teamId]?.name ?? '—'
  }

  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  // 듀오 파트너 표시용 메타 (이름/등번호/사진)
  type LPMeta = { id: string; name: string | null; number: number | null; photo_url: string | null }
  const playerMetaMap: Record<string, LPMeta> = Object.fromEntries(
    ((leaguePlayers ?? []) as unknown as LPMeta[]).map(p => [p.id, p])
  )
  const teamMap = Object.fromEntries(teamsForDisplay.map(t => [t.id, t.name]))
  const teamFullMap = Object.fromEntries(teamsForDisplay.map(t => [t.id, { id: t.id, name: t.name, color: t.color ?? '#9ca3af' }]))
  const gameIds = (games ?? []).map(g => g.id)
  const gameMap = Object.fromEntries((games ?? []).map(g => [g.id, g]))
  const gamePlusOneMap: Record<string, string | null> = {}
  for (const g of games ?? []) gamePlusOneMap[g.id] = (g as Record<string, unknown>).plus_one_player_id as string | null ?? null
  const leagueName = (league as { name?: string } | null)?.name ?? ''

  const qTeamMap: Record<string, string> = {}
  for (const m of memberships ?? []) {
    if (m.quarter_id) qTeamMap[m.quarter_id] = m.team_id
  }
  // 게임별 배정 (비정규/타팀 임시 출전) — 정규 팀보다 우선
  const gpTeamMap: Record<string, string> = {}
  for (const r of gpRows ?? []) {
    if (r.league_game_id && r.team_id) gpTeamMap[r.league_game_id] = r.team_id
  }

  if (gameIds.length === 0) {
    return NextResponse.json({ rankings: {}, career_high: {}, shot_breakdown: {}, recent_games: [], player_stats: null })
  }

  // 서버측 db-max-rows(=1000) 우회 위해 페이지네이션 청크 조회.
  // playerEvents · assistEvents · allEvents 3종은 서로 독립적이므로 병렬 실행.
  const CHUNK = 1000
  type PlayerEventRow = { league_game_id: string; type: string; result: string | null; points: number | null; team_id: string | null }
  type AssistEventRow = { league_game_id: string; team_id: string | null }
  type AllEventRow = { league_player_id: string | null; league_game_id: string; related_player_id: string | null; type: string; result: string | null; points: number | null; team_id: string | null }

  const fetchPaged = async <T,>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  ): Promise<T[]> => {
    const out: T[] = []
    for (let pg = 0; ; pg++) {
      const { data: chunk } = await build(pg * CHUNK, (pg + 1) * CHUNK - 1)
      if (!chunk || chunk.length === 0) break
      out.push(...chunk)
      if (chunk.length < CHUNK) break
    }
    return out
  }

  const [playerEvents, assistEvents, allEvents] = await Promise.all([
    fetchPaged<PlayerEventRow>((from, to) =>
      supabase
        .from('league_game_events')
        .select('league_game_id, type, result, points, team_id')
        .in('league_game_id', gameIds)
        .eq('league_player_id', playerId)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchPaged<AssistEventRow>((from, to) =>
      supabase
        .from('league_game_events')
        .select('league_game_id, team_id')
        .in('league_game_id', gameIds)
        .eq('related_player_id', playerId)
        .eq('result', 'made')
        .in('type', SHOT_TYPES)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchPaged<AllEventRow>((from, to) =>
      supabase
        .from('league_game_events')
        .select('league_player_id, league_game_id, related_player_id, type, result, points, team_id')
        .in('league_game_id', gameIds)
        .not('league_player_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ])

  // 이벤트의 team_id 기반 게임별 출전 팀 결정 (진실의 원천 — 실제 발생한 사건 기준)
  // 같은 게임 안에서 다수결 (정상 데이터는 모두 동일하지만 데이터 일관성 보호 차원)
  const eventTeamCount: Record<string, Record<string, number>> = {}
  for (const e of (playerEvents ?? [])) {
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    const tid = (e as { team_id?: string | null }).team_id
    if (!tid) continue
    if (!eventTeamCount[e.league_game_id]) eventTeamCount[e.league_game_id] = {}
    eventTeamCount[e.league_game_id][tid] = (eventTeamCount[e.league_game_id][tid] ?? 0) + 1
  }
  // 어시스트 이벤트도 반영 (관전 안 한 게임에서 어시스트만 있을 수 있음)
  for (const e of (assistEvents ?? [])) {
    const tid = (e as { team_id?: string | null }).team_id
    if (!tid) continue
    if (!eventTeamCount[e.league_game_id]) eventTeamCount[e.league_game_id] = {}
    eventTeamCount[e.league_game_id][tid] = (eventTeamCount[e.league_game_id][tid] ?? 0) + 1
  }
  const eventTeamMap: Record<string, string> = {}
  for (const [gId, counts] of Object.entries(eventTeamCount)) {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (top) eventTeamMap[gId] = top[0]
  }

  // 헬퍼: 게임 g 에서 이 선수가 실제로 뛴 팀 ID
  // 우선순위: ① 이벤트 team_id 다수결 (진실) → ② league_game_players → ③ league_player_quarters
  function teamForGame(g: { id: string; quarter_id?: string | null } | null | undefined): string | undefined {
    if (!g) return undefined
    return eventTeamMap[g.id] ?? gpTeamMap[g.id] ?? (g.quarter_id ? qTeamMap[g.quarter_id] : undefined)
  }

  // allEvents 는 위에서 playerEvents/assistEvents 와 함께 병렬 페이지네이션 완료.

  // ── Per-game stats ───────────────────────────────────────────
  type GS = {
    pts: number; reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; tov: number; pf: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  }
  const perGame: Record<string, GS> = {}
  const ensureG = (gId: string): GS => {
    if (!perGame[gId]) perGame[gId] = {
      pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    }
    return perGame[gId]
  }

  const sb = {
    layup: { m: 0, a: 0 }, mid:   { m: 0, a: 0 }, post:  { m: 0, a: 0 },
    three: { m: 0, a: 0 }, ft:    { m: 0, a: 0 },
  }

  for (const e of playerEvents ?? []) {
    // sub_in/sub_out은 실제 출전 기록이 아니므로 perGame 엔트리 생성 안 함 (GP 인플레이션 방지)
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    const s = ensureG(e.league_game_id)
    const made = e.result === 'made'
    const gamePlusOne = gamePlusOneMap[e.league_game_id]
    const isPlusOne = gamePlusOne !== null ? playerId === gamePlusOne : plusOneSet.has(playerId)
    const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++; sb.three.a++
        if (made) { s.fg3m++; s.fgm++; s.pts += pts; sb.three.m++ }
        break
      case 'shot_2p_mid': s.fga++; sb.mid.a++; if (made) { s.fgm++; s.pts += pts; sb.mid.m++ }; break
      case 'shot_layup':  s.fga++; sb.layup.a++; if (made) { s.fgm++; s.pts += pts; sb.layup.m++ }; break
      case 'shot_post':   s.fga++; sb.post.a++; if (made) { s.fgm++; s.pts += pts; sb.post.m++ }; break
      case 'and_one':
        if (made) { s.pts += pts }; break
      case 'ft_2pt':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += pts; sb.ft.m++ }; break
      case 'ft_3pt_1':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += pts; sb.ft.m++ }; break
      case 'free_throw': case 'ft_3pt_2':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += pts; sb.ft.m++ }; break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }
  }
  for (const e of assistEvents ?? []) ensureG(e.league_game_id).ast++

  const playedGames = Object.keys(perGame)

  // ── unit(라운드/게임) 단위 승패 판정 — recentGames 카드와 연승(sWin) 스트릭이 공유 ──
  //   과거엔 recentGames 가 "그 unit의 첫 경기" 하나만으로 승패를 판정해, 스탯은 하루
  //   합산인데 승패만 첫 경기인 사고가 났다(2026-08-09, 김로빈 8/8 2승4패인데 W로 표시됨).
  //   이제 이 함수 하나로 두 곳 모두 "그 unit에 속한 모든 게임"을 합산해 판정한다.
  //   unit === 'game' 모드에서는 unitKey 가 gId 자체라 게임 하나 = 판정 하나로 기존과 동일.
  function computeUnitRecord(unitKey: string): { wins: number; losses: number; draws: number; games: number; result: 'W' | 'L' | 'D' } {
    let wins = 0, losses = 0, draws = 0
    for (const gId of playedGames) {
      const g = gameMap[gId] as { date?: string; home_team_id?: string; away_team_id?: string; home_score?: number; away_score?: number } | undefined
      if (!g) continue
      const thisUnitKey = unit === 'round' ? (g.date ?? gId) : gId
      if (thisUnitKey !== unitKey) continue
      const tid = teamForGame(gameMap[gId] as { id: string; quarter_id?: string | null })
      if (!tid) continue
      const isHome = g.home_team_id === tid
      const my = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0)
      const opp = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0)
      if (my > opp) wins++
      else if (my < opp) losses++
      else draws++
    }
    const result: 'W' | 'L' | 'D' = wins > losses ? 'W' : wins < losses ? 'L' : 'D'
    return { wins, losses, draws, games: wins + losses + draws, result }
  }

  // ── 집계 단위 (aggregateMap): round=라운드별, game=경기별 ──────
  const aggregateMap: Record<string, GS> = {}
  const unitToFirstGame: Record<string, string> = {}  // unitKey → first gameId
  for (const gId of playedGames) {
    const g = gameMap[gId] as { date?: string } | undefined
    // '라운드' = 경기일(date) 기준 그룹핑 (round_num은 하루 내 슬롯 번호라 부정확)
    const unitKey = unit === 'round' ? (g?.date ?? gId) : gId
    if (!aggregateMap[unitKey]) {
      aggregateMap[unitKey] = { pts:0, reb:0, oreb:0, dreb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0 }
      unitToFirstGame[unitKey] = gId
    }
    const s = perGame[gId]
    aggregateMap[unitKey].pts  += s.pts;  aggregateMap[unitKey].reb   += s.reb
    aggregateMap[unitKey].oreb += s.oreb; aggregateMap[unitKey].dreb  += s.dreb
    aggregateMap[unitKey].ast  += s.ast;  aggregateMap[unitKey].stl   += s.stl
    aggregateMap[unitKey].blk  += s.blk;  aggregateMap[unitKey].tov   += s.tov
    aggregateMap[unitKey].pf   += s.pf;   aggregateMap[unitKey].fgm   += s.fgm
    aggregateMap[unitKey].fga  += s.fga;  aggregateMap[unitKey].fg3m  += s.fg3m
    aggregateMap[unitKey].fg3a += s.fg3a; aggregateMap[unitKey].ftm   += s.ftm
    aggregateMap[unitKey].fta  += s.fta
  }
  const playedUnits = Object.keys(aggregateMap).sort((a, b) => {
    const da = (gameMap[unitToFirstGame[a]] as {date?:string})?.date ?? a
    const db = (gameMap[unitToFirstGame[b]] as {date?:string})?.date ?? b
    return da.localeCompare(db)
  })

  // ── Career High Day (unit 파라미터와 무관하게 항상 "일자" 기준 집계) ──
  // 같은 날의 여러 경기를 합산한 하루치 스탯에서 최고점 선정
  type CHDay = { value: number; date: string; extra?: string }
  const chDay: Record<string, CHDay | null> = {
    pts: null, reb: null, ast: null, stl: null, blk: null, fgPct: null, fg3m: null,
  }
  const dayMap: Record<string, GS> = {}
  for (const gId of playedGames) {
    const g = gameMap[gId] as { date?: string } | undefined
    if (!g?.date) continue
    if (!dayMap[g.date]) dayMap[g.date] = {
      pts:0, reb:0, oreb:0, dreb:0, ast:0, stl:0, blk:0, tov:0, pf:0,
      fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0,
    }
    const s = perGame[gId]
    const d = dayMap[g.date]
    d.pts += s.pts; d.reb += s.reb; d.oreb += s.oreb; d.dreb += s.dreb
    d.ast += s.ast; d.stl += s.stl; d.blk += s.blk; d.tov += s.tov
    d.pf += s.pf;   d.fgm += s.fgm; d.fga += s.fga
    d.fg3m += s.fg3m; d.fg3a += s.fg3a; d.ftm += s.ftm; d.fta += s.fta
  }
  for (const [date, s] of Object.entries(dayMap)) {
    const upd = (key: string, val: number, extra?: string) => {
      if (val > (chDay[key]?.value ?? -1)) chDay[key] = { value: val, date, extra }
    }
    upd('pts', s.pts, s.fga > 0 ? `FG ${+(s.fgm / s.fga * 100).toFixed(1)}% (${s.fgm}/${s.fga})` : undefined)
    upd('reb', s.reb, `OR ${s.oreb} / DR ${s.dreb}`)
    upd('ast', s.ast)
    upd('stl', s.stl)
    upd('blk', s.blk)
    upd('fg3m', s.fg3m, s.fg3a > 0 ? `3P ${+(s.fg3m / s.fg3a * 100).toFixed(1)}% (${s.fg3m}/${s.fg3a})` : undefined)
    if (s.fga >= 5) upd('fgPct', +(s.fgm / s.fga * 100).toFixed(1), `${s.fgm}/${s.fga}`)
  }

  function gameInfo(gId: string, teamId?: string) {
    const g = gameMap[gId]
    if (!g) return null
    const isHome = g.home_team_id === teamId
    const oppId = isHome ? g.away_team_id : g.home_team_id
    const myPts = isHome ? g.home_score : g.away_score
    const oppPts = isHome ? g.away_score : g.home_score
    // 게임의 quarter override 를 우선 적용, 없으면 base team 이름 사용
    const gameQuarterId = (g as { quarter_id?: string | null }).quarter_id ?? null
    const opponent = oppId ? resolveTeamName(oppId, gameQuarterId) : '상대'
    return {
      date: g.date as string,
      opponent,
      round_num: g.round_num as number,
      result: myPts > oppPts ? 'W' : 'L',
      score: `${myPts}-${oppPts}`,
      league_name: leagueName,
    }
  }

  const careerHigh: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(chDay)) {
    if (!entry) continue
    // Career High Day: date + extra (opponent/result는 일자 기반이라 의미 모호 — 제외)
    careerHigh[key] = { value: entry.value, date: entry.date, extra: entry.extra, league_name: leagueName }
  }

  // ── Recent 5 units ─────────────────────────────────────────
  const recentGames = playedUnits
    .slice().reverse()
    .slice(0, 5)
    .map(unitKey => {
      const s = aggregateMap[unitKey]
      const firstGId = unitToFirstGame[unitKey]
      const g = firstGId ? gameMap[firstGId] : null
      const tid = teamForGame(g)
      // 승패는 그 unit(라운드)의 **모든 경기**를 합산해 판정한다. 첫 경기 하나로 정하면
      //   스탯은 하루 합산인데 승패만 첫 경기가 되어 어긋난다(2026-08-09 사고).
      //   opponent/score 는 라운드에 여러 상대가 섞이므로 아래 record 로 대체해 쓴다.
      const rec = computeUnitRecord(unitKey)
      return {
        ...gameInfo(firstGId ?? '', tid),
        result: rec.result,
        record: { wins: rec.wins, losses: rec.losses, draws: rec.draws, games: rec.games },
        pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a,
      }
    })

  // ── Full Game Log (trend chart 용) ────────────────────────
  // 오래된 → 최근 순으로 전체 unit 스탯 제공. 클라이언트가 rolling avg 를 계산.
  const gameLog = playedUnits.map(unitKey => {
    const s = aggregateMap[unitKey]
    const firstGId = unitToFirstGame[unitKey]
    const g = firstGId ? (gameMap[firstGId] as { date?: string } | undefined) : undefined
    return {
      date: g?.date ?? unitKey,
      pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk,
      fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a,
    }
  })

  // ── Rankings + Badge metrics ──────────────────────────────────
  type AS = {
    pts: number; reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; tov: number; pf: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
    midA: number; slashA: number; postA: number; andOneM: number  // Phase 2
    gp: number
  }
  const emptyAS = (): AS => ({
    pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    midA: 0, slashA: 0, postA: 0, andOneM: 0, gp: 0,
  })
  const allMap: Record<string, AS> = {}
  const allGp: Record<string, Set<string>> = {}
  // playerTeamInGame[pid][gId] = team_id (for win_rate computation)
  const playerTeamInGame: Record<string, Record<string, string>> = {}

  for (const e of allEvents ?? []) {
    const pid = e.league_player_id as string
    const made = e.result === 'made'
    const gId = e.league_game_id as string
    const gamePlusOne = gamePlusOneMap[gId]
    const isP1 = gamePlusOne !== null ? pid === gamePlusOne : plusOneSet.has(pid)
    const pts = scorePoints(e.type, e.result, isP1, scoringRules)
    if (!allMap[pid]) allMap[pid] = emptyAS()
    // 일수 기준 GP 카운트 (날짜로 중복 제거)
    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!allGp[pid]) allGp[pid] = new Set()
      allGp[pid].add(unit === 'round' ? ((gameMap[gId] as {date?:string})?.date ?? gId) : gId)
    }
    // track team_id from event (column may not exist in select; rely on qTeamMap as fallback)
    const evTeamId = (e as Record<string, unknown>).team_id as string | undefined
    if (evTeamId) {
      if (!playerTeamInGame[pid]) playerTeamInGame[pid] = {}
      if (!playerTeamInGame[pid][gId]) playerTeamInGame[pid][gId] = evTeamId
    }
    const s = allMap[pid]
    if (made) {
      if (e.type === 'shot_3p') { s.pts += pts; s.fg3m++; s.fgm++ }
      else if (['shot_2p_mid', 'shot_layup', 'shot_post'].includes(e.type as string)) { s.pts += pts; s.fgm++ }
      else if (e.type === 'ft_2pt') { s.pts += pts; s.ftm++ }
      else if (e.type === 'ft_3pt_1') { s.pts += pts; s.ftm++ }
      else if (['free_throw', 'ft_3pt_2'].includes(e.type as string)) { s.pts += pts; s.ftm++ }
      else if (e.type === 'and_one') { s.pts += pts; s.andOneM++ }
    }
    if (e.type === 'shot_3p') { s.fg3a++; s.fga++ }
    else if (e.type === 'shot_2p_mid')   { s.fga++; s.midA++ }
    else if (e.type === 'shot_layup')    { s.fga++; s.slashA++ }
    else if (e.type === 'shot_post')     { s.fga++; s.postA++ }
    else if (['free_throw', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2'].includes(e.type as string)) s.fta++
    else if (e.type === 'oreb') { s.oreb++; s.reb++ }
    else if (e.type === 'dreb') { s.dreb++; s.reb++ }
    else if (e.type === 'steal') s.stl++
    else if (e.type === 'block') s.blk++
    else if (e.type === 'turnover') s.tov++
    else if (e.type === 'foul') s.pf++
    if (e.related_player_id && made && (SHOT_TYPES as readonly string[]).includes(e.type as string)) {
      const ap = e.related_player_id as string
      if (!allMap[ap]) allMap[ap] = emptyAS()
      if (!allGp[ap]) allGp[ap] = new Set()
      allGp[ap].add(unit === 'round' ? ((gameMap[gId] as {date?:string})?.date ?? gId) : gId)
      allMap[ap].ast++
    }
  }
  for (const pid of Object.keys(allMap)) allMap[pid].gp = allGp[pid]?.size ?? 0

  // per-game 통계 (ranking 전용 — 배지는 별도 evaluateAllBadges 사용)
  const toMetrics = (s: AS) => {
    const gp = s.gp || 1
    return {
      ppg: s.pts / gp,
      rpg: s.reb / gp,
      apg: s.ast / gp,
      spg: s.stl / gp,
      bpg: s.blk / gp,
    }
  }

  const allMetricsList = Object.entries(allMap)
    .filter(([, s]) => s.gp > 0)
    .map(([pid, s]) => ({ pid, gp: s.gp, ...toMetrics(s) }))

  // 자격 요건 (2026-08-03 완화): 해당 기간에 열린 라운드(경기일)의 30% 이상 참여.
  // 스탯 탭 리더보드(MIN_ROUND_RATIO=0.3)와 동일 기준 — 두 화면의 순위가 어긋나지 않도록 통일.
  const roundsHeld = new Set(
    (games ?? []).map(g => (g as { date?: string }).date).filter(Boolean) as string[]
  ).size
  const maxGpAll = allMetricsList.reduce((m, e) => Math.max(m, e.gp), 0)
  const rankBase = roundsHeld > 0 ? roundsHeld : maxGpAll
  const effectiveMinGp = Math.max(1, Math.ceil(rankBase * 0.3))
  const eligibleForRank = allMetricsList.filter(m => m.gp >= effectiveMinGp)

  const ranked = eligibleForRank.map(m => ({
    pid: m.pid, ppg: +m.ppg.toFixed(1), rpg: +m.rpg.toFixed(1),
    apg: +m.apg.toFixed(1), spg: +m.spg.toFixed(1), bpg: +m.bpg.toFixed(1),
  }))

  const getRank = (stat: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg') => {
    const sorted = [...ranked].sort((a, b) => b[stat] - a[stat])
    const idx = sorted.findIndex(p => p.pid === playerId)
    return idx >= 0 ? idx + 1 : 0
  }

  // 승률 순위 계산 (gp >= 3 인 선수만)
  const winRateMap: Record<string, { wins: number; losses: number; rate: number; gp: number }> = {}
  for (const pid of Object.keys(allMap)) {
    let wins = 0, losses = 0
    const gpSet = allGp[pid] ?? new Set<string>()
    for (const gId of gpSet) {
      const g = gameMap[gId]
      if (!g) continue
      // 플레이어 팀 결정: 이벤트에서 추출한 team_id 우선, 없으면 게임별 배정/분기-팀 매핑 fallback (본인 한정)
      let tid: string | undefined = playerTeamInGame[pid]?.[gId]
      if (!tid && pid === playerId) tid = teamForGame(g)
      if (!tid) continue
      const isHome = g.home_team_id === tid
      const myPts = isHome ? (g.home_score as number) : (g.away_score as number)
      const oppPts = isHome ? (g.away_score as number) : (g.home_score as number)
      if (myPts > oppPts) wins++
      else if (myPts < oppPts) losses++
    }
    const total = wins + losses
    winRateMap[pid] = { wins, losses, rate: total > 0 ? wins / total * 100 : 0, gp: gpSet.size }
  }
  const winRateEligible = Object.entries(winRateMap)
    .filter(([, w]) => w.gp >= 3 && (w.wins + w.losses) > 0)
    .sort(([, a], [, b]) => b.rate - a.rate)
  const winRateRankIdx = winRateEligible.findIndex(([pid]) => pid === playerId)
  const win_rate_rank = winRateRankIdx >= 0 ? winRateRankIdx + 1 : 0

  // 추가 랭킹 (gp, fg_pct, fg3_pct, ft_pct) — gp>=1 자격, shooting은 시도>0
  //   { rank, total } 객체 형태로 하위호환 위해 기존 필드는 유지
  type ExtraStats = { pid: string; gp: number; fg_pct: number; fg3_pct: number; ft_pct: number; fga: number; fg3a: number; fta: number }
  const gpEligible: ExtraStats[] = Object.entries(allMap)
    .filter(([, s]) => s.gp >= 1)
    .map(([pid, s]) => ({
      pid,
      gp: s.gp,
      fg_pct:  s.fga  > 0 ? s.fgm  / s.fga  : 0,
      fg3_pct: s.fg3a > 0 ? s.fg3m / s.fg3a : 0,
      ft_pct:  s.fta  > 0 ? s.ftm  / s.fta  : 0,
      fga: s.fga, fg3a: s.fg3a, fta: s.fta,
    }))

  const getRankTotal = (
    stat: 'gp' | 'fg_pct' | 'fg3_pct' | 'ft_pct',
    requireAttempt?: 'fga' | 'fg3a' | 'fta',
  ): { rank: number; total: number } => {
    const pool = requireAttempt ? gpEligible.filter(p => p[requireAttempt] > 0) : gpEligible
    const sorted = [...pool].sort((a, b) => b[stat] - a[stat])
    const idx = sorted.findIndex(p => p.pid === playerId)
    return { rank: idx >= 0 ? idx + 1 : 0, total: pool.length }
  }

  const rankings = {
    ppg: getRank('ppg'), rpg: getRank('rpg'), apg: getRank('apg'),
    spg: getRank('spg'), bpg: getRank('bpg'),
    total: ranked.length,     // 자격 요건(min GP) 통과 인원. rank 표시 계산의 분모로 사용됨
    win_rate_rank,
    // 신규 (#5a): { rank, total } 형태 — gp>=1 자격
    gp:      getRankTotal('gp'),
    fg_pct:  getRankTotal('fg_pct',  'fga'),
    fg3_pct: getRankTotal('fg3_pct', 'fg3a'),
    ft_pct:  getRankTotal('ft_pct',  'fta'),
  }

  // ── 배지: 분기 필터와 무관하게 항상 시즌 전체 기준 ───────────
  // badgeAllEvents: 시즌 전체 이벤트 (quarterId 무관)
  let badgeAllEvents: AllEventRow[] = allEvents
  let badgeMap: Record<string, AS> = allMap
  let badgeGp: Record<string, Set<string>> = allGp
  let badgeGameMap: Record<string, { date?: string }> = Object.fromEntries(
    (games ?? []).map(g => [g.id as string, g as { date?: string }])
  )
  if (quarterId) {
    // 분기 필터가 적용된 상태 → allMap은 부분 집합. 시즌 전체를 별도 페치/집계.
    const seasonGameIds = (allGames ?? []).map(g => g.id)
    if (seasonGameIds.length > 0) {
      const seasonEvents: AllEventRow[] = []
      const PAGE = 1000
      let pg = 0
      while (true) {
        const { data: chunk } = await supabase
          .from('league_game_events')
          .select('league_player_id, league_game_id, related_player_id, type, result, points, team_id')
          .in('league_game_id', seasonGameIds)
          .not('league_player_id', 'is', null)
          .order('id', { ascending: true })
          .range(pg * PAGE, (pg + 1) * PAGE - 1)
        if (chunk && chunk.length > 0) seasonEvents.push(...(chunk as AllEventRow[]))
        if (!chunk || chunk.length < PAGE) break
        pg++
      }
      badgeAllEvents = seasonEvents
      badgeGameMap = Object.fromEntries(
        (allGames ?? []).map(g => [g.id as string, g as { date?: string }])
      )
      badgeMap = {}
      badgeGp = {}
      for (const e of seasonEvents) {
        const pid = e.league_player_id as string
        const made = e.result === 'made'
        const gId = e.league_game_id as string
        const gamePlusOne = gamePlusOneMap[gId]
        const isP1 = gamePlusOne !== null ? pid === gamePlusOne : plusOneSet.has(pid)
        const pts = scorePoints(e.type, e.result, isP1, scoringRules)
        if (!badgeMap[pid]) badgeMap[pid] = emptyAS()
        if (e.type !== 'sub_in' && e.type !== 'sub_out') {
          if (!badgeGp[pid]) badgeGp[pid] = new Set()
          badgeGp[pid].add(unit === 'round' ? (badgeGameMap[gId]?.date ?? gId) : gId)
        }
        const s = badgeMap[pid]
        if (made) {
          if (e.type === 'shot_3p') { s.pts += pts; s.fg3m++; s.fgm++ }
          else if (['shot_2p_mid', 'shot_layup', 'shot_post'].includes(e.type)) { s.pts += pts; s.fgm++ }
          else if (e.type === 'ft_2pt') { s.pts += pts; s.ftm++ }
          else if (e.type === 'ft_3pt_1') { s.pts += pts; s.ftm++ }
          else if (['free_throw', 'ft_3pt_2'].includes(e.type)) { s.pts += pts; s.ftm++ }
          else if (e.type === 'and_one') { s.pts += pts; s.andOneM++ }
        }
        if (e.type === 'shot_3p') { s.fg3a++; s.fga++ }
        else if (e.type === 'shot_2p_mid')   { s.fga++; s.midA++ }
        else if (e.type === 'shot_layup')    { s.fga++; s.slashA++ }
        else if (e.type === 'shot_post')     { s.fga++; s.postA++ }
        else if (['free_throw', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2'].includes(e.type)) s.fta++
        else if (e.type === 'oreb') { s.oreb++; s.reb++ }
        else if (e.type === 'dreb') { s.dreb++; s.reb++ }
        else if (e.type === 'steal') s.stl++
        else if (e.type === 'block') s.blk++
        else if (e.type === 'turnover') s.tov++
        else if (e.type === 'foul') s.pf++
        if (e.related_player_id && made && (SHOT_TYPES as readonly string[]).includes(e.type)) {
          const ap = e.related_player_id as string
          if (!badgeMap[ap]) badgeMap[ap] = emptyAS()
          if (!badgeGp[ap]) badgeGp[ap] = new Set()
          badgeGp[ap].add(unit === 'round' ? (badgeGameMap[gId]?.date ?? gId) : gId)
          badgeMap[ap].ast++
        }
      }
      for (const pid of Object.keys(badgeMap)) badgeMap[pid].gp = badgeGp[pid]?.size ?? 0
    }
  }

  // ── 파란날개 19개 배지 평가 (PlayerCareerInput + TeamAverages) ───
  // 1. 타겟 선수의 슛 유형별 made/attempted + 어시스트 세부 (3P/Paint) + 주 팀 결정
  const tShot: Record<string, { attempted: number; made: number }> = {
    shot_post:     { attempted: 0, made: 0 },
    shot_layup:    { attempted: 0, made: 0 },
    shot_2p_mid:   { attempted: 0, made: 0 },
    shot_3p:       { attempted: 0, made: 0 },
  }
  let ast3pts = 0
  let astPaint = 0
  const playerTeamCount: Record<string, number> = {}
  for (const e of badgeAllEvents) {
    if (e.league_player_id === playerId) {
      if (e.team_id && e.type !== 'sub_in' && e.type !== 'sub_out') {
        playerTeamCount[e.team_id] = (playerTeamCount[e.team_id] ?? 0) + 1
      }
      if (tShot[e.type]) {
        tShot[e.type].attempted++
        if (e.result === 'made') tShot[e.type].made++
      }
    }
    if (e.related_player_id === playerId && e.result === 'made') {
      if (e.type === 'shot_3p') ast3pts++
      else if (e.type === 'shot_layup' || e.type === 'shot_post') astPaint++
    }
  }
  let primaryTeamId: string | undefined
  {
    let maxCnt = 0
    for (const [tid, c] of Object.entries(playerTeamCount)) {
      if (c > maxCnt) { maxCnt = c; primaryTeamId = tid }
    }
  }

  // 2. 팀별 평균 산출 (선수-단위 평균: 같은 팀에 속한 선수들의 합계 / 선수-단위 출전 수)
  type TeamAgg = {
    pts: number; reb: number; dreb: number; ast: number
    stl: number; blk: number; fta: number; fg3a: number
    playerUnits: Set<string>
  }
  const teamAgg: Record<string, TeamAgg> = {}
  const ensureTeamAgg = (tid: string): TeamAgg => {
    if (!teamAgg[tid]) teamAgg[tid] = {
      pts: 0, reb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, fta: 0, fg3a: 0,
      playerUnits: new Set(),
    }
    return teamAgg[tid]
  }
  for (const e of badgeAllEvents) {
    const tid = e.team_id
    if (!tid) continue
    const t = ensureTeamAgg(tid)
    const gId = e.league_game_id
    const unitKey = unit === 'round' ? (badgeGameMap[gId]?.date ?? gId) : gId
    const pid = e.league_player_id
    const made = e.result === 'made'
    const gpo = gamePlusOneMap[gId]
    const isP1 = pid != null && (gpo != null ? pid === gpo : plusOneSet.has(pid))
    const pts = scorePoints(e.type, e.result, isP1, scoringRules)
    if (pid && e.type !== 'sub_in' && e.type !== 'sub_out') {
      t.playerUnits.add(`${pid}:${unitKey}`)
    }
    if (made) {
      if (e.type === 'shot_3p') t.pts += pts
      else if (e.type === 'shot_2p_mid' || e.type === 'shot_layup' || e.type === 'shot_post') t.pts += pts
      else if (e.type === 'ft_2pt' || e.type === 'ft_3pt_1') t.pts += pts
      else if (e.type === 'free_throw' || e.type === 'ft_3pt_2') t.pts += pts
      else if (e.type === 'and_one') t.pts += pts
    }
    if (e.type === 'shot_3p') t.fg3a++
    else if (e.type === 'free_throw' || e.type === 'ft_2pt' || e.type === 'ft_3pt_1' || e.type === 'ft_3pt_2') t.fta++
    else if (e.type === 'oreb') t.reb++
    else if (e.type === 'dreb') { t.reb++; t.dreb++ }
    else if (e.type === 'steal') t.stl++
    else if (e.type === 'block') t.blk++
    if (made && e.related_player_id && (SHOT_TYPES as readonly string[]).includes(e.type)) {
      t.ast++
      t.playerUnits.add(`${e.related_player_id}:${unitKey}`)
    }
  }
  const teamAverages: TeamAverages = primaryTeamId && teamAgg[primaryTeamId]
    ? (() => {
        const t = teamAgg[primaryTeamId!]
        const n = t.playerUnits.size || 1
        return {
          ptsPerGame: t.pts / n,
          rebPerGame: t.reb / n,
          astPerGame: t.ast / n,
          stlPerGame: t.stl / n,
          blkPerGame: t.blk / n,
          ftaPerGame: t.fta / n,
          fg3aPerGame: t.fg3a / n,
          hustlePerGame: (t.stl + t.blk + t.dreb) / n,
        }
      })()
    : { ptsPerGame: 0, rebPerGame: 0, astPerGame: 0, stlPerGame: 0, blkPerGame: 0, ftaPerGame: 0, fg3aPerGame: 0, hustlePerGame: 0 }

  // 3. PlayerCareerInput 빌드 후 평가
  const ps = badgeMap[playerId] ?? emptyAS()
  const psGp = ps.gp || 0
  const careerInput: PlayerCareerInput = {
    gamesPlayed: psGp,
    totalTeamGames: psGp,
    pts: ps.pts,
    fgm: ps.fgm, fga: ps.fga,
    fg2m: ps.fgm - ps.fg3m, fg2a: ps.fga - ps.fg3a,
    fg3m: ps.fg3m, fg3a: ps.fg3a,
    ftm: ps.ftm, fta: ps.fta,
    oreb: ps.oreb, dreb: ps.dreb, reb: ps.reb,
    ast: ps.ast, stl: ps.stl, blk: ps.blk, tov: ps.tov,
    ppg: psGp > 0 ? ps.pts / psGp : 0,
    rpg: psGp > 0 ? ps.reb / psGp : 0,
    apg: psGp > 0 ? ps.ast / psGp : 0,
    spg: psGp > 0 ? ps.stl / psGp : 0,
    bpg: psGp > 0 ? ps.blk / psGp : 0,
    fg3Pct: ps.fg3a > 0 ? ps.fg3m / ps.fg3a * 100 : 0,
    ftPct:  ps.fta  > 0 ? ps.ftm  / ps.fta  * 100 : 0,
    astToTov: ps.tov > 0 ? ps.ast / ps.tov : ps.ast,
    doubleDoubles: 0,
    tripleDoubles: 0,
    q1pts: 0, q2pts: 0, q3pts: 0, q4pts: 0,  // 리그엔 쿼터별 분리 데이터 없음 → CLUTCH_Q4 자동 미부여
    ast3pts,
    astPaint,
    shotBreakdown: Object.fromEntries(
      Object.entries(tShot).map(([k, v]) => [k, {
        attempted: v.attempted,
        made: v.made,
        pct: v.attempted > 0 ? +(v.made / v.attempted * 100).toFixed(1) : 0,
      }])
    ),
  }
  const badges = evaluateAllBadges(careerInput, teamAverages).filter(b => b.tier !== null)

  // ── Win/Loss impact ──────────────────────────────────────────
  type WLS = { pts: number; reb: number; ast: number; stl: number; blk: number; gp: number }
  const winS:  WLS = { pts:0, reb:0, ast:0, stl:0, blk:0, gp:0 }
  const lossS: WLS = { pts:0, reb:0, ast:0, stl:0, blk:0, gp:0 }
  // 무승부 버킷 — 예전엔 `won ? winS : lossS` 라 **무승부가 전부 패로 셌다**
  //   (2026-08-09: 김로빈 실제 78승 37패 7무인데 78W 44L 로 표시, 승률 67.8%→63.9%).
  //   이 리그는 짧은 쿼터 경기라 동점이 실제로 나온다. 승률 순위(winRateMap)는 이미
  //   무를 분모에서 빼고 있었으므로, 표시값도 같은 기준으로 맞춘다.
  const drawS: WLS = { pts:0, reb:0, ast:0, stl:0, blk:0, gp:0 }
  let playerPtsTotal = 0, teamPtsTotal = 0

  for (const gId of playedGames) {
    const s = perGame[gId]
    const g = gameMap[gId]
    if (!g) continue
    const tid = teamForGame(g)
    if (!tid) continue
    const isHome = g.home_team_id === tid
    const myPts  = isHome ? (g.home_score as number) : (g.away_score as number)
    const oppPts = isHome ? (g.away_score as number) : (g.home_score as number)
    playerPtsTotal += s.pts
    teamPtsTotal   += myPts
    const bucket = myPts > oppPts ? winS : myPts < oppPts ? lossS : drawS
    bucket.pts += s.pts; bucket.reb += s.reb; bucket.ast += s.ast
    bucket.stl += s.stl; bucket.blk += s.blk; bucket.gp++
  }
  // 승/패 split 스탯(이길 때·질 때)은 2026-08-03 선수카드 개편에서 제거 — 전적/승률/기여도만 유지
  const winLoss = {
    wins: winS.gp, losses: lossS.gp, draws: drawS.gp,
    // 무는 분모에서 제외 — 승률 순위(winRateMap)와 같은 기준이라야 옆에 붙는 순위와 안 어긋난다.
    // (팀 순위표는 무를 분모에 넣는 다른 관행을 쓴다 — 선수와 팀은 별개 지표로 둔다.)
    win_rate: (winS.gp + lossS.gp) > 0 ? +(winS.gp / (winS.gp + lossS.gp) * 100).toFixed(1) : 0,
    pts_share:  teamPtsTotal > 0 ? +(playerPtsTotal / teamPtsTotal * 100).toFixed(1) : 0,
  }

  // ── Shot breakdown ───────────────────────────────────────────
  const totalFGA = sb.layup.a + sb.mid.a + sb.post.a + sb.three.a
  const pct = (m: number, a: number) => a > 0 ? +(m / a * 100).toFixed(1) : 0
  const dist = (a: number) => totalFGA > 0 ? +(a / totalFGA * 100).toFixed(1) : 0
  const shotBreakdown = {
    layup: { ...sb.layup, dist: dist(sb.layup.a), fg_pct: pct(sb.layup.m, sb.layup.a) },
    mid:   { ...sb.mid,   dist: dist(sb.mid.a),   fg_pct: pct(sb.mid.m,   sb.mid.a)   },
    post:  { ...sb.post,  dist: dist(sb.post.a),  fg_pct: pct(sb.post.m,  sb.post.a)  },
    three: { ...sb.three, dist: dist(sb.three.a), fg_pct: pct(sb.three.m, sb.three.a) },
    ft:    { ...sb.ft,    ft_pct: pct(sb.ft.m, sb.ft.a) },
    total_fga: totalFGA,
  }

  // player_stats: aggregateMap 기반 단위별 집계 → 평균은 unit 단위(round/game)
  const playerGp = playedUnits.length  // 단위 수 (round 또는 game)
  const player_stats = playerGp > 0 ? (() => {
    let pts=0,reb=0,ast=0,stl=0,blk=0,tov=0,fgm=0,fga=0,fg3m=0,fg3a=0,ftm=0,fta=0
    for (const unitKey of playedUnits) {
      const s = aggregateMap[unitKey]
      pts+=s.pts; reb+=s.reb; ast+=s.ast; stl+=s.stl; blk+=s.blk; tov+=s.tov
      fgm+=s.fgm; fga+=s.fga; fg3m+=s.fg3m; fg3a+=s.fg3a; ftm+=s.ftm; fta+=s.fta
    }
    const gp = playerGp; const g = Math.max(gp, 1)
    return {
      gp, pts, reb, ast, stl, blk, tov, fgm, fga, fg3m, fg3a, ftm, fta,
      ppg: +(pts/g).toFixed(1), rpg: +(reb/g).toFixed(1), apg: +(ast/g).toFixed(1),
      spg: +(stl/g).toFixed(1), bpg: +(blk/g).toFixed(1), topg: +(tov/g).toFixed(1),
      fg_pct:  fga  > 0 ? +(fgm/fga*100).toFixed(1)   : 0,
      fg3_pct: fg3a > 0 ? +(fg3m/fg3a*100).toFixed(1) : 0,
      ft_pct:  fta  > 0 ? +(ftm/fta*100).toFixed(1)   : 0,
    }
  })() : null

  // ── Monthly stats — aggregateMap 기반 단위별 → 월별 그룹 ──────────────
  const monthlyMap: Record<string, { pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; days: number }> = {}
  for (const unitKey of playedUnits) {
    const date = (gameMap[unitToFirstGame[unitKey]] as {date?:string})?.date ?? ''
    const month = date.slice(0, 7) // YYYY-MM
    if (!month) continue
    if (!monthlyMap[month]) monthlyMap[month] = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, days: 0 }
    const s = aggregateMap[unitKey]
    monthlyMap[month].pts  += s.pts;  monthlyMap[month].reb += s.reb
    monthlyMap[month].ast  += s.ast;  monthlyMap[month].stl += s.stl
    monthlyMap[month].blk  += s.blk;  monthlyMap[month].fgm += s.fgm
    monthlyMap[month].fga  += s.fga;  monthlyMap[month].days++
  }

  const monthly_stats = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, s]) => ({
      month,
      label: `${parseInt(month.slice(5))}월`,
      gp: s.days,
      ppg:     +(s.pts / s.days).toFixed(1),
      rpg:     +(s.reb / s.days).toFixed(1),
      apg:     +(s.ast / s.days).toFixed(1),
      spg:     +(s.stl / s.days).toFixed(1),
      bpg:     +(s.blk / s.days).toFixed(1),
      fg_pct:  s.fga > 0 ? +(s.fgm / s.fga * 100).toFixed(1) : 0,
    }))

  // ── Active Streaks (현재 진행 중인 연속 기록) ────────────────────
  // unit 기준(round 또는 game)으로 최신부터 역방향 walk, 조건 깨지면 stop
  const sortedUnitsDesc = [...playedUnits].reverse()
  let s10 = 0, s10Done = false
  let s20 = 0, s20Done = false
  let s3p = 0, s3pDone = false
  let sWin = 0, sWinDone = false

  for (const unitKey of sortedUnitsDesc) {
    const agg = aggregateMap[unitKey]
    if (!s10Done) {
      if (agg.pts >= 10) s10++; else s10Done = true
    }
    if (!s20Done) {
      if (agg.pts >= 20) s20++; else s20Done = true
    }
    if (!s3pDone) {
      if (agg.fg3m >= 1) s3p++; else s3pDone = true
    }
    if (!sWinDone) {
      // recentGames 카드와 **같은 판정 함수**를 쓴다. 예전엔 이 블록만 전 경기를 합산하고
      //   recentGames 는 첫 경기만 봐서, 같은 화면에 승패 정의가 둘이었다(2026-08-09 사고).
      //   무승부 라운드(승==패)는 연승을 잇지 않는다 — 이긴 날이 아니기 때문.
      if (computeUnitRecord(unitKey).result === 'W') sWin++
      else sWinDone = true
    }
    if (s10Done && s20Done && s3pDone && sWinDone) break
  }
  const active_streaks = { ten: s10, twenty: s20, three: s3p, win: sWin }

  // ── 자동 배지 요약 (player_badges) ─────────────────────────
  // 시즌 전체 기준 — 4종 카운트만 반환. 개별 목록은 별도 엔드포인트.
  const badges_summary = { perfect_game: 0, double_double: 0, triple_double: 0, winning_shot: 0 }
  {
    const { data: pbRows } = await supabase
      .from('player_badges')
      .select('badge_type')
      .eq('league_id', leagueId)
      .eq('player_id', playerId)
    for (const r of pbRows ?? []) {
      const t = r.badge_type as keyof typeof badges_summary
      if (t in badges_summary) badges_summary[t]++
    }
  }

  // ── 다이나믹 듀오 (Dynamic Duo) ───────────────────────────────
  //   정의: 나와 상대 선수 사이의 "어시스트 → 득점" 합작 점수 합계 (양방향 모두 합산).
  //         pair_pts = Σ points  WHERE (scorer, assister) ∈ {(me, X), (X, me)}
  //   범위: 어워즈 BEST_DUO 와 동일하게 필드 야투(자유투/앤드원 제외) · made 만.
  //   출력: 합작 점수 상위 3조합 + 각 방향별 기여 분해.
  const dynamic_duo = (() => {
    type DuoAcc = { total: number; iScored: number; partnerScored: number; iAssists: number; partnerAssists: number }
    const acc: Record<string, DuoAcc> = {}
    const shotTypeSet = new Set<string>(SHOT_TYPES)

    for (const e of allEvents ?? []) {
      if (e.result !== 'made') continue
      if (!shotTypeSet.has(e.type)) continue
      const scorer = e.league_player_id
      const assister = e.related_player_id
      if (!scorer || !assister || scorer === assister) continue
      if (scorer !== playerId && assister !== playerId) continue

      // 저장된 points 폴백은 6건이 틀린 것으로 확인되어 룰 계산으로 통일 (득점자 scorer 기준 plus-one 판정).
      const gamePlusOne = gamePlusOneMap[e.league_game_id]
      const isPlusOneForEvent = gamePlusOne !== null ? scorer === gamePlusOne : plusOneSet.has(scorer)
      const pts = scorePoints(e.type, e.result, isPlusOneForEvent, scoringRules)
      const partnerId = scorer === playerId ? assister : scorer
      if (!acc[partnerId]) acc[partnerId] = { total: 0, iScored: 0, partnerScored: 0, iAssists: 0, partnerAssists: 0 }
      const a = acc[partnerId]
      a.total += pts
      if (scorer === playerId) {
        // 파트너 어시 → 내 득점
        a.iScored += pts
        a.partnerAssists += 1
      } else {
        // 내 어시 → 파트너 득점
        a.partnerScored += pts
        a.iAssists += 1
      }
    }

    return Object.entries(acc)
      .map(([partner_id, a]) => {
        const meta = playerMetaMap[partner_id]
        return {
          partner_id,
          partner_name: meta?.name ?? '알 수 없음',
          partner_number: meta?.number ?? null,
          partner_photo_url: meta?.photo_url ?? null,
          total_pts: a.total,
          // 파트너의 어시스트로 내가 넣은 점수
          pts_from_partner: a.iScored,
          assists_from_partner: a.partnerAssists,
          // 내 어시스트로 파트너가 넣은 점수
          pts_to_partner: a.partnerScored,
          assists_to_partner: a.iAssists,
        }
      })
      .sort((x, y) => y.total_pts - x.total_pts)
      .slice(0, 3)
  })()

  // 프로필카드에 노출할 "내 베스트샷" 핀 (최대 3개)
  let pinned_event_ids: string[] = []
  {
    // 이 선수 행은 이제 팀 소유다 — 대회 화면에서 보는 선수카드도 league_id 가 아니라
    // team_id 로 소속을 확인해야 찾아진다(행 자체의 출생 league_id 는 리그일 수 있다).
    const teamId = await resolveTeamId(leagueId)
    const { data: pinRow } = await supabase
      .from('league_players')
      .select('pinned_event_ids')
      .eq('id', playerId)
      .eq('team_id', teamId)
      .maybeSingle()
    pinned_event_ids = (pinRow as { pinned_event_ids: string[] | null } | null)?.pinned_event_ids ?? []
  }

  return NextResponse.json({
    rankings, career_high: careerHigh, shot_breakdown: shotBreakdown,
    recent_games: recentGames,
    game_log: gameLog,
    badges, badges_scope: 'season' as const,
    badges_summary,
    win_loss: winLoss, player_stats, monthly_stats, unit,
    active_streaks,
    dynamic_duo,
    pinned_event_ids,
  })
}
