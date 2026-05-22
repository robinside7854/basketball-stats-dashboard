import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { computeBadges, type PlayerMetrics } from '@/lib/league/badges'

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
      .select('id, date, quarter_id, home_team_id, away_team_id, home_score, away_score, round_num, plus_one_player_id')
      .eq('league_id', leagueId)
      .eq('is_started', true)   // 마감 여부와 무관하게 기록 시작된 게임 전체 포함
      .order('date', { ascending: false }),
    supabase.from('league_teams').select('id, name').eq('league_id', leagueId),
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

  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  const teamMap = Object.fromEntries((teams ?? []).map(t => [t.id, t.name]))
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
  // 헬퍼: 게임 g 에서 이 선수가 실제로 뛴 팀 ID
  function teamForGame(g: { id: string; quarter_id?: string | null } | null | undefined): string | undefined {
    if (!g) return undefined
    return gpTeamMap[g.id] ?? (g.quarter_id ? qTeamMap[g.quarter_id] : undefined)
  }

  if (gameIds.length === 0) {
    return NextResponse.json({ rankings: {}, career_high: {}, shot_breakdown: {}, recent_games: [], player_stats: null })
  }

  const [
    { data: playerEvents },
    { data: assistEvents },
  ] = await Promise.all([
    supabase
      .from('league_game_events')
      .select('league_game_id, type, result, points')
      .in('league_game_id', gameIds)
      .eq('league_player_id', playerId),
    supabase
      .from('league_game_events')
      .select('league_game_id')
      .in('league_game_id', gameIds)
      .eq('related_player_id', playerId)
      .eq('result', 'made')
      .in('type', SHOT_TYPES),
  ])

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
    pts: null, reb: null, ast: null, stl: null, blk: null, fgPct: null, ftm: null,
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
    upd('ftm', s.ftm, s.fta > 0 ? `FT ${+(s.ftm / s.fta * 100).toFixed(1)}% (${s.ftm}/${s.fta})` : undefined)
    if (s.fga >= 5) upd('fgPct', +(s.fgm / s.fga * 100).toFixed(1), `${s.fgm}/${s.fga}`)
  }

  function gameInfo(gId: string, teamId?: string) {
    const g = gameMap[gId]
    if (!g) return null
    const isHome = g.home_team_id === teamId
    const oppId = isHome ? g.away_team_id : g.home_team_id
    const myPts = isHome ? g.home_score : g.away_score
    const oppPts = isHome ? g.away_score : g.home_score
    return {
      date: g.date as string,
      opponent: oppId ? (teamMap[oppId] ?? '상대') : '상대',
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

  // per-game 통계 + 배지 메트릭
  const toMetrics = (_pid: string, s: AS): PlayerMetrics => {
    const gp = s.gp || 1
    const ppg = s.pts / gp; const rpg = s.reb / gp; const apg = s.ast / gp
    const spg = s.stl / gp; const bpg = s.blk / gp; const topg = s.tov / gp
    const drebPerG = s.dreb / gp; const orebPerG = s.oreb / gp; const pfPerG = s.pf / gp
    const fg3_pct = s.fg3a > 0 ? s.fg3m / s.fg3a * 100 : 0
    const fg3aPerG = s.fg3a / gp
    const efg_pct = s.fga > 0 ? (s.fgm + 0.5 * s.fg3m) / s.fga * 100 : 0
    const fgaPerG = s.fga / gp
    const ft_pct = s.fta > 0 ? s.ftm / s.fta * 100 : 0
    const ftaPerG = s.fta / gp
    const atoRatio = s.tov > 0 ? s.ast / s.tov : s.ast
    const defComposite = spg + bpg
    const hustleComposite = spg + bpg + orebPerG
    const stlTotal = s.stl
    // Phase 2
    const midPerG   = s.midA / gp
    const slashPerG = s.slashA / gp
    const postPerG  = s.postA / gp
    const andOnePerG = s.andOneM / gp
    const fieldFGA  = s.fg3a + s.midA + s.slashA + s.postA
    const threeDistPct = fieldFGA > 0 ? s.fg3a  / fieldFGA * 100 : 0
    const midDistPct   = fieldFGA > 0 ? s.midA   / fieldFGA * 100 : 0
    const slashDistPct = fieldFGA > 0 ? s.slashA / fieldFGA * 100 : 0
    return {
      gp: s.gp, ppg, rpg, apg, spg, bpg, topg, drebPerG, orebPerG, pfPerG,
      fg3_pct, fg3aPerG, efg_pct, fgaPerG, ft_pct, ftaPerG,
      atoRatio, defComposite, hustleComposite, stlTotal,
      midPerG, slashPerG, postPerG, andOnePerG,
      threeDistPct, midDistPct, slashDistPct,
    }
  }

  const allMetricsList = Object.entries(allMap)
    .filter(([, s]) => s.gp > 0)
    .map(([pid, s]) => ({ pid, ...toMetrics(pid, s) }))

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

  // 배지 계산
  const playerEntry = allMap[playerId]
  const playerMetrics: PlayerMetrics = playerEntry
    ? toMetrics(playerId, playerEntry)
    : { gp: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, topg: 0, drebPerG: 0, orebPerG: 0, pfPerG: 0, fg3_pct: 0, fg3aPerG: 0, efg_pct: 0, fgaPerG: 0, ft_pct: 0, ftaPerG: 0, atoRatio: 0, defComposite: 0, hustleComposite: 0, stlTotal: 0, midPerG: 0, slashPerG: 0, postPerG: 0, andOnePerG: 0, threeDistPct: 0, midDistPct: 0, slashDistPct: 0 }
  const badges = computeBadges(playerMetrics, allMetricsList)

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

  return NextResponse.json({ rankings, career_high: careerHigh, shot_breakdown: shotBreakdown, recent_games: recentGames, badges, win_loss: winLoss, player_stats, monthly_stats, unit })
}
