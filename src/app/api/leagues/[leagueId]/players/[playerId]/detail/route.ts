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
  const supabase = createClient()

  const [
    { data: leaguePlayers },
    { data: allGames },
    { data: teams },
    { data: league },
    { data: memberships },
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

  if (gameIds.length === 0) {
    return NextResponse.json({ rankings: {}, career_high: {}, shot_breakdown: {}, recent_games: [] })
  }

  const [
    { data: playerEvents },
    { data: assistEvents },
    { data: allEvents },
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
    supabase
      .from('league_game_events')
      .select('league_player_id, league_game_id, related_player_id, type, result, points')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null),
  ])

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

  // ── Career High ──────────────────────────────────────────────
  type CH = { value: number; gameId: string; extra?: string }
  const ch: Record<string, CH | null> = {
    pts: null, reb: null, ast: null, stl: null, blk: null, fgPct: null, ftm: null,
  }
  for (const gId of playedGames) {
    const s = perGame[gId]
    const upd = (key: string, val: number, extra?: string) => {
      if (val > (ch[key]?.value ?? -1)) ch[key] = { value: val, gameId: gId, extra }
    }
    upd('pts', s.pts, s.fga > 0 ? `FG ${+(s.fgm / s.fga * 100).toFixed(1)}% (${s.fgm}/${s.fga})` : undefined)
    upd('reb', s.reb, `OR ${s.oreb} / DR ${s.dreb}`)
    upd('ast', s.ast)
    upd('stl', s.stl)
    upd('blk', s.blk)
    upd('ftm', s.ftm, s.fta > 0 ? `FT ${+(s.ftm / s.fta * 100).toFixed(1)}% (${s.ftm}/${s.fta})` : undefined)
    if (s.fga >= 3) upd('fgPct', +(s.fgm / s.fga * 100).toFixed(1), `${s.fgm}/${s.fga}`)
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
  for (const [key, entry] of Object.entries(ch)) {
    if (!entry) continue
    const g = gameMap[entry.gameId]
    const tid = g?.quarter_id ? qTeamMap[g.quarter_id] : undefined
    careerHigh[key] = { value: entry.value, extra: entry.extra, ...gameInfo(entry.gameId, tid) }
  }

  // ── Recent 5 games ───────────────────────────────────────────
  const recentGames = playedGames
    .filter(gId => gameMap[gId])
    .sort((a, b) => new Date(gameMap[b].date).getTime() - new Date(gameMap[a].date).getTime())
    .slice(0, 5)
    .map(gId => {
      const s = perGame[gId]
      const g = gameMap[gId]
      const tid = g?.quarter_id ? qTeamMap[g.quarter_id] : undefined
      return { ...gameInfo(gId, tid), pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a }
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

  for (const e of allEvents ?? []) {
    const pid = e.league_player_id as string
    const made = e.result === 'made'
    const gId = e.league_game_id as string
    const gamePlusOne = gamePlusOneMap[gId]
    const isP1 = gamePlusOne !== null ? pid === gamePlusOne : plusOneSet.has(pid)
    if (!allMap[pid]) allMap[pid] = emptyAS()
    // sub_in/sub_out은 GP 카운트 제외
    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!allGp[pid]) allGp[pid] = new Set()
      allGp[pid].add(gId)
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
      allGp[ap].add(gId)
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
  const rankings = {
    ppg: getRank('ppg'), rpg: getRank('rpg'), apg: getRank('apg'),
    spg: getRank('spg'), bpg: getRank('bpg'),
    total: ranked.length,
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
    const tid = g.quarter_id ? qTeamMap[g.quarter_id] : undefined
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

  return NextResponse.json({ rankings, career_high: careerHigh, shot_breakdown: shotBreakdown, recent_games: recentGames, badges, win_loss: winLoss })
}
