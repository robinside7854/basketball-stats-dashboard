import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { evaluateAllBadges, type PlayerCareerInput, type TeamAverages } from '@/lib/stats/badges'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'] as const

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId') ?? undefined
  const unit = searchParams.get('unit') ?? 'round'
  const supabase = createClient()

  const [
    { data: leaguePlayers },
    { data: allGames },
    { data: teams },
    { data: league },
    { data: memberships },
    { data: gpRows },
  ] = await Promise.all([
    supabase.from('league_players').select('id, plus_one').eq('league_id', leagueId),
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
  function resolveTeamColor(teamId: string, qId: string | null | undefined): string {
    const ov = qId ? overrideMap[qId]?.[teamId] : undefined
    return ov?.color ?? baseTeamMap[teamId]?.color ?? '#9ca3af'
  }

  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
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
  const CHUNK = 1000
  const playerEvents: { league_game_id: string; type: string; result: string | null; points: number | null; team_id: string | null }[] = []
  for (let pg = 0; ; pg++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_game_id, type, result, points, team_id')
      .in('league_game_id', gameIds)
      .eq('league_player_id', playerId)
      .order('id', { ascending: true })
      .range(pg * CHUNK, (pg + 1) * CHUNK - 1)
    if (!chunk || chunk.length === 0) break
    playerEvents.push(...(chunk as typeof playerEvents))
    if (chunk.length < CHUNK) break
  }
  const assistEvents: { league_game_id: string; team_id: string | null }[] = []
  for (let pg = 0; ; pg++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_game_id, team_id')
      .in('league_game_id', gameIds)
      .eq('related_player_id', playerId)
      .eq('result', 'made')
      .in('type', SHOT_TYPES)
      .order('id', { ascending: true })
      .range(pg * CHUNK, (pg + 1) * CHUNK - 1)
    if (!chunk || chunk.length === 0) break
    assistEvents.push(...(chunk as typeof assistEvents))
    if (chunk.length < CHUNK) break
  }

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

  // allEvents: 랭킹/배지 계산용 — 1000행 서버 제한을 피해 페이지네이션으로 전체 수집
  type AllEventRow = { league_player_id: string | null; league_game_id: string; related_player_id: string | null; type: string; result: string | null; points: number | null; team_id: string | null }
  const allEvents: AllEventRow[] = []
  {
    const PAGE = 1000
    let pg = 0
    while (true) {
      const { data: chunk } = await supabase
        .from('league_game_events')
        .select('league_player_id, league_game_id, related_player_id, type, result, points, team_id')
        .in('league_game_id', gameIds)
        .not('league_player_id', 'is', null)
        .order('id', { ascending: true })
        .range(pg * PAGE, (pg + 1) * PAGE - 1)
      if (chunk && chunk.length > 0) allEvents.push(...(chunk as AllEventRow[]))
      if (!chunk || chunk.length < PAGE) break
      pg++
    }
  }

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
    drive: { m: 0, a: 0 }, three: { m: 0, a: 0 }, ft:    { m: 0, a: 0 },
  }

  for (const e of playerEvents ?? []) {
    // sub_in/sub_out은 실제 출전 기록이 아니므로 perGame 엔트리 생성 안 함 (GP 인플레이션 방지)
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    const s = ensureG(e.league_game_id)
    const made = e.result === 'made'
    const gamePlusOne = gamePlusOneMap[e.league_game_id]
    const isPlusOne = gamePlusOne !== null ? playerId === gamePlusOne : plusOneSet.has(playerId)
    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++; sb.three.a++
        if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3; sb.three.m++ }
        break
      case 'shot_2p_mid': s.fga++; sb.mid.a++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2; sb.mid.m++ }; break
      case 'shot_layup':  s.fga++; sb.layup.a++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2; sb.layup.m++ }; break
      case 'shot_post':   s.fga++; sb.post.a++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2; sb.post.m++ }; break
      case 'shot_2p_drive': s.fga++; sb.drive.a++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2; sb.drive.m++ }; break
      case 'and_one':
        if (made) { s.pts += 1 }; break
      case 'ft_2pt':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += 2; sb.ft.m++ }; break
      case 'ft_3pt_1':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += 2; sb.ft.m++ }; break
      case 'free_throw': case 'ft_3pt_2':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += 1; sb.ft.m++ }; break
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
      return { ...gameInfo(firstGId ?? '', tid), pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a }
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
      if (e.type === 'shot_3p') { s.pts += isP1 ? 4 : 3; s.fg3m++; s.fgm++ }
      else if (['shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'].includes(e.type as string)) { s.pts += isP1 ? 3 : 2; s.fgm++ }
      else if (e.type === 'ft_2pt') { s.pts += 2; s.ftm++ }
      else if (e.type === 'ft_3pt_1') { s.pts += 2; s.ftm++ }
      else if (['free_throw', 'ft_3pt_2'].includes(e.type as string)) { s.pts += 1; s.ftm++ }
      else if (e.type === 'and_one') { s.pts += 1; s.andOneM++ }
    }
    if (e.type === 'shot_3p') { s.fg3a++; s.fga++ }
    else if (e.type === 'shot_2p_mid')   { s.fga++; s.midA++ }
    else if (e.type === 'shot_layup')    { s.fga++; s.slashA++ }
    else if (e.type === 'shot_2p_drive') { s.fga++; s.slashA++ }
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
    .map(([pid, s]) => ({ pid, ...toMetrics(s) }))

  const ranked = allMetricsList.map(m => ({
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

  const rankings = {
    ppg: getRank('ppg'), rpg: getRank('rpg'), apg: getRank('apg'),
    spg: getRank('spg'), bpg: getRank('bpg'),
    total: ranked.length,
    win_rate_rank,
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
        if (!badgeMap[pid]) badgeMap[pid] = emptyAS()
        if (e.type !== 'sub_in' && e.type !== 'sub_out') {
          if (!badgeGp[pid]) badgeGp[pid] = new Set()
          badgeGp[pid].add(unit === 'round' ? (badgeGameMap[gId]?.date ?? gId) : gId)
        }
        const s = badgeMap[pid]
        if (made) {
          if (e.type === 'shot_3p') { s.pts += isP1 ? 4 : 3; s.fg3m++; s.fgm++ }
          else if (['shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'].includes(e.type)) { s.pts += isP1 ? 3 : 2; s.fgm++ }
          else if (e.type === 'ft_2pt') { s.pts += 2; s.ftm++ }
          else if (e.type === 'ft_3pt_1') { s.pts += 2; s.ftm++ }
          else if (['free_throw', 'ft_3pt_2'].includes(e.type)) { s.pts += 1; s.ftm++ }
          else if (e.type === 'and_one') { s.pts += 1; s.andOneM++ }
        }
        if (e.type === 'shot_3p') { s.fg3a++; s.fga++ }
        else if (e.type === 'shot_2p_mid')   { s.fga++; s.midA++ }
        else if (e.type === 'shot_layup')    { s.fga++; s.slashA++ }
        else if (e.type === 'shot_2p_drive') { s.fga++; s.slashA++ }
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
    shot_2p_drive: { attempted: 0, made: 0 },
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
      else if (e.type === 'shot_layup' || e.type === 'shot_post' || e.type === 'shot_2p_drive') astPaint++
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
    if (pid && e.type !== 'sub_in' && e.type !== 'sub_out') {
      t.playerUnits.add(`${pid}:${unitKey}`)
    }
    if (made) {
      if (e.type === 'shot_3p') t.pts += isP1 ? 4 : 3
      else if (e.type === 'shot_2p_mid' || e.type === 'shot_layup' || e.type === 'shot_post' || e.type === 'shot_2p_drive') t.pts += isP1 ? 3 : 2
      else if (e.type === 'ft_2pt' || e.type === 'ft_3pt_1') t.pts += 2
      else if (e.type === 'free_throw' || e.type === 'ft_3pt_2') t.pts += 1
      else if (e.type === 'and_one') t.pts += 1
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
    const won = myPts > oppPts
    playerPtsTotal += s.pts
    teamPtsTotal   += myPts
    const bucket = won ? winS : lossS
    bucket.pts += s.pts; bucket.reb += s.reb; bucket.ast += s.ast
    bucket.stl += s.stl; bucket.blk += s.blk; bucket.gp++
  }
  const avgWLS = (b: WLS) => b.gp === 0 ? null : ({
    ppg: +(b.pts / b.gp).toFixed(1), rpg: +(b.reb / b.gp).toFixed(1),
    apg: +(b.ast / b.gp).toFixed(1), spg: +(b.stl / b.gp).toFixed(1),
    bpg: +(b.blk / b.gp).toFixed(1),
  })
  const winLoss = {
    wins: winS.gp, losses: lossS.gp,
    win_rate: (winS.gp + lossS.gp) > 0 ? +(winS.gp / (winS.gp + lossS.gp) * 100).toFixed(1) : 0,
    win_stats:  avgWLS(winS),
    loss_stats: avgWLS(lossS),
    pts_share:  teamPtsTotal > 0 ? +(playerPtsTotal / teamPtsTotal * 100).toFixed(1) : 0,
  }

  // ── Shot breakdown ───────────────────────────────────────────
  const totalFGA = sb.layup.a + sb.mid.a + sb.post.a + sb.drive.a + sb.three.a
  const pct = (m: number, a: number) => a > 0 ? +(m / a * 100).toFixed(1) : 0
  const dist = (a: number) => totalFGA > 0 ? +(a / totalFGA * 100).toFixed(1) : 0
  const shotBreakdown = {
    layup: { ...sb.layup, dist: dist(sb.layup.a), fg_pct: pct(sb.layup.m, sb.layup.a) },
    mid:   { ...sb.mid,   dist: dist(sb.mid.a),   fg_pct: pct(sb.mid.m,   sb.mid.a)   },
    post:  { ...sb.post,  dist: dist(sb.post.a),  fg_pct: pct(sb.post.m,  sb.post.a)  },
    drive: { ...sb.drive, dist: dist(sb.drive.a), fg_pct: pct(sb.drive.m, sb.drive.a) },
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

  // ── 상대팀별 스탯 (vs Opponents) ──────────────────────────────
  // 본인 팀 제외, 친선전 제외. GP = 출전한 슬롯(쿼터/경기) 수.
  type OppAgg = {
    team_id: string; team_name: string; team_color: string
    gp: number; pts: number; reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; tov: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
    wins: number; losses: number
  }
  const oppMap: Record<string, OppAgg> = {}

  for (const gId of Object.keys(perGame)) {
    const g = gameMap[gId] as { home_team_id?: string; away_team_id?: string; home_score?: number; away_score?: number; is_exhibition?: boolean; quarter_id?: string | null } | undefined
    if (!g) continue
    if (g.is_exhibition) continue  // 친선전 제외

    const myTeamId = teamForGame(gameMap[gId])
    if (!myTeamId) continue
    const oppTeamId = g.home_team_id === myTeamId ? g.away_team_id : g.home_team_id
    if (!oppTeamId) continue

    // 각 게임의 quarter override 로 팀 이름/색상 해석 — 락다운(Q1-2)과 굿모닝(Q3)이 같은 team_id 라도
    // 서로 다른 entry 로 집계되도록 (team_id + 표시명) 조합을 key 로 사용
    const oppName = resolveTeamName(oppTeamId, g.quarter_id)
    const oppColor = resolveTeamColor(oppTeamId, g.quarter_id)
    const oppKey = `${oppTeamId}::${oppName}`

    if (!oppMap[oppKey]) {
      oppMap[oppKey] = {
        team_id: oppTeamId, team_name: oppName, team_color: oppColor,
        gp: 0, pts: 0, reb: 0, oreb: 0, dreb: 0,
        ast: 0, stl: 0, blk: 0, tov: 0,
        fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
        wins: 0, losses: 0,
      }
    }
    const o = oppMap[oppKey]
    const s = perGame[gId]
    o.gp++
    o.pts += s.pts; o.reb += s.reb; o.oreb += s.oreb; o.dreb += s.dreb
    o.ast += s.ast; o.stl += s.stl; o.blk += s.blk; o.tov += s.tov
    o.fgm += s.fgm; o.fga += s.fga; o.fg3m += s.fg3m; o.fg3a += s.fg3a
    o.ftm += s.ftm; o.fta += s.fta

    // 슬롯 단위 승/패 (재미 요소)
    const isHome = g.home_team_id === myTeamId
    const myScore = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0)
    const oppScore = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0)
    if (myScore > oppScore) o.wins++
    else if (myScore < oppScore) o.losses++
  }

  const vs_opponents = Object.values(oppMap)
    .map(o => ({
      team_id: o.team_id, team_name: o.team_name, team_color: o.team_color,
      gp: o.gp,
      pts: o.pts, reb: o.reb, oreb: o.oreb, dreb: o.dreb,
      ast: o.ast, stl: o.stl, blk: o.blk, tov: o.tov,
      fgm: o.fgm, fga: o.fga, fg3m: o.fg3m, fg3a: o.fg3a, ftm: o.ftm, fta: o.fta,
      ppg: o.gp > 0 ? +(o.pts / o.gp).toFixed(1) : 0,
      rpg: o.gp > 0 ? +(o.reb / o.gp).toFixed(1) : 0,
      apg: o.gp > 0 ? +(o.ast / o.gp).toFixed(1) : 0,
      spg: o.gp > 0 ? +(o.stl / o.gp).toFixed(1) : 0,
      bpg: o.gp > 0 ? +(o.blk / o.gp).toFixed(1) : 0,
      fg_pct:  o.fga  > 0 ? +(o.fgm  / o.fga  * 100).toFixed(1) : null,
      fg3_pct: o.fg3a > 0 ? +(o.fg3m / o.fg3a * 100).toFixed(1) : null,
      ft_pct:  o.fta  > 0 ? +(o.ftm  / o.fta  * 100).toFixed(1) : null,
      wins: o.wins, losses: o.losses,
    }))
    .sort((a, b) => b.gp - a.gp)

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
      // 단위 W/L: 그 단위의 모든 슬랏 게임을 합쳐 본인 팀 W가 더 많으면 W
      // (round 모드: 그날 본인 출전 슬랏들의 W>L 비교 / game 모드: 1슬랏 W/L 그대로)
      let unitWins = 0, unitLosses = 0
      for (const gId of playedGames) {
        const g = gameMap[gId] as { date?: string; home_team_id?: string; away_team_id?: string; home_score?: number; away_score?: number } | undefined
        if (!g) continue
        const thisUnitKey = unit === 'round' ? (g.date ?? gId) : gId
        if (thisUnitKey !== unitKey) continue
        const tid = teamForGame(gameMap[gId])
        if (!tid) continue
        const isHome = g.home_team_id === tid
        const my = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0)
        const opp = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0)
        if (my > opp) unitWins++
        else if (my < opp) unitLosses++
      }
      if (unitWins > unitLosses) sWin++
      else sWinDone = true
    }
    if (s10Done && s20Done && s3pDone && sWinDone) break
  }
  const active_streaks = { ten: s10, twenty: s20, three: s3p, win: sWin }

  return NextResponse.json({
    rankings, career_high: careerHigh, shot_breakdown: shotBreakdown,
    recent_games: recentGames,
    badges, badges_scope: 'season' as const,
    win_loss: winLoss, player_stats, monthly_stats, vs_opponents, unit,
    active_streaks,
  })
}
