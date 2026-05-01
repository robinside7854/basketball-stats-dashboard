import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/leagues/[leagueId]/daily-boxscore?date=YYYY-MM-DD
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const supabase = createClient()

  const [
    { data: games },
    { data: players },
    { data: teams },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from('league_games')
      .select('id, slot_num, date, home_team_id, away_team_id, home_score, away_score, is_complete, is_started, youtube_url, youtube_start_offset, quarter_id, round_num')
      .eq('league_id', leagueId)
      .eq('date', date)
      .eq('is_started', true)
      .order('slot_num'),
    supabase.from('league_players').select('id, name, number, plus_one').eq('league_id', leagueId),
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('league_player_quarters').select('league_player_id, quarter_id, team_id').eq('league_id', leagueId),
  ])

  if (!games || games.length === 0) return NextResponse.json({ games: [], daily_stats: [] })

  const gameIds = games.map(g => g.id)
  const { data: events } = await supabase
    .from('league_game_events')
    .select('league_game_id, league_player_id, related_player_id, type, result, points')
    .in('league_game_id', gameIds)
    .not('league_player_id', 'is', null)

  const teamMap = Object.fromEntries((teams ?? []).map(t => [t.id, t]))
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))
  const plusOneSet = new Set((players ?? []).filter(p => p.plus_one).map(p => p.id))

  // quarter_id → team_id for each player
  const qTeamMap: Record<string, Record<string, string>> = {}
  for (const m of memberships ?? []) {
    if (!m.quarter_id) continue
    if (!qTeamMap[m.quarter_id]) qTeamMap[m.quarter_id] = {}
    qTeamMap[m.quarter_id][m.league_player_id] = m.team_id
  }

  type GS = { pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number }
  const emptyGS = (): GS => ({ pts:0,reb:0,oreb:0,dreb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,fg3m:0,fg3a:0,ftm:0,fta:0 })

  // per game → per player stats
  const gamePlayerStats: Record<string, Record<string, GS>> = {}
  for (const g of games) gamePlayerStats[g.id] = {}

  const SHOT_TYPES = ['shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive']

  for (const e of events ?? []) {
    const gId = e.league_game_id as string
    const pid = e.league_player_id as string
    const made = e.result === 'made'
    const isP1 = plusOneSet.has(pid)
    if (!gamePlayerStats[gId]) continue
    if (!gamePlayerStats[gId][pid]) gamePlayerStats[gId][pid] = emptyGS()
    const s = gamePlayerStats[gId][pid]

    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++
        if (made) { s.fg3m++; s.fgm++; s.pts += isP1 ? 4 : 3 }
        break
      case 'shot_2p_mid': case 'shot_layup': case 'shot_post': case 'shot_2p_drive':
        s.fga++
        if (made) { s.fgm++; s.pts += isP1 ? 3 : 2 }
        break
      case 'and_one':
        if (made) { s.pts += 1 }; break
      case 'ft_2pt':
        s.fta++; if (made) { s.ftm++; s.pts += 2 }; break
      case 'ft_3pt_1': case 'ft_3pt_2': case 'free_throw':
        s.fta++; if (made) { s.ftm++; s.pts += 1 }; break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
    }
    // assists
    if (e.related_player_id && made && SHOT_TYPES.includes(e.type as string)) {
      const ap = e.related_player_id as string
      if (!gamePlayerStats[gId][ap]) gamePlayerStats[gId][ap] = emptyGS()
      gamePlayerStats[gId][ap].ast++
    }
  }

  const pct = (m: number, a: number) => a > 0 ? +(m / a * 100).toFixed(1) : null

  // Build game list with boxscores
  const gameList = games.map(g => {
    const homeTeam = g.home_team_id ? teamMap[g.home_team_id] : null
    const awayTeam = g.away_team_id ? teamMap[g.away_team_id] : null
    const qId = g.quarter_id as string | null
    const gps = gamePlayerStats[g.id] ?? {}

    const rows = Object.entries(gps).map(([pid, s]) => {
      const p = playerMap[pid]
      const teamId = qId && qTeamMap[qId]?.[pid]
      const team = teamId ? teamMap[teamId] : null
      return {
        player_id: pid,
        name: p?.name ?? '?',
        number: p?.number ?? null,
        team_id: teamId ?? null,
        team_name: team?.name ?? null,
        team_color: team?.color ?? null,
        pts: s.pts, reb: s.reb, oreb: s.oreb, dreb: s.dreb,
        ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov,
        fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a, ftm: s.ftm, fta: s.fta,
        fg_pct: pct(s.fgm, s.fga),
        fg3_pct: pct(s.fg3m, s.fg3a),
      }
    }).sort((a, b) => b.pts - a.pts)

    return {
      id: g.id, slot_num: g.slot_num, round_num: g.round_num,
      is_complete: g.is_complete, is_started: g.is_started,
      home_score: g.home_score, away_score: g.away_score,
      home_team: homeTeam ? { id: homeTeam.id, name: homeTeam.name, color: homeTeam.color } : null,
      away_team: awayTeam ? { id: awayTeam.id, name: awayTeam.name, color: awayTeam.color } : null,
      youtube_url: g.youtube_url ?? null,
      youtube_start_offset: g.youtube_start_offset ?? 0,
      players: rows,
    }
  })

  // Aggregate daily stats per player
  const dailyMap: Record<string, GS & { gp: number; name: string; number: number | null }> = {}
  for (const g of gameList) {
    for (const row of g.players) {
      if (!dailyMap[row.player_id]) dailyMap[row.player_id] = { ...emptyGS(), gp: 0, name: row.name, number: row.number }
      const d = dailyMap[row.player_id]
      d.gp++; d.pts+=row.pts; d.reb+=row.reb; d.oreb+=row.oreb; d.dreb+=row.dreb
      d.ast+=row.ast; d.stl+=row.stl; d.blk+=row.blk; d.tov+=row.tov
      d.fgm+=row.fgm; d.fga+=row.fga; d.fg3m+=row.fg3m; d.fg3a+=row.fg3a; d.ftm+=row.ftm; d.fta+=row.fta
    }
  }
  const dailyStats = Object.entries(dailyMap)
    .map(([pid, d]) => ({
      player_id: pid, name: d.name, number: d.number, gp: d.gp,
      pts: d.pts, reb: d.reb, oreb: d.oreb, dreb: d.dreb, ast: d.ast, stl: d.stl, blk: d.blk, tov: d.tov,
      fgm: d.fgm, fga: d.fga, fg3m: d.fg3m, fg3a: d.fg3a, ftm: d.ftm, fta: d.fta,
      fg_pct: pct(d.fgm, d.fga), fg3_pct: pct(d.fg3m, d.fg3a),
    }))
    .sort((a, b) => b.pts - a.pts)

  return NextResponse.json({ games: gameList, daily_stats: dailyStats })
}
