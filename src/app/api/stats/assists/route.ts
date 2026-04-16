import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

const SHOT_LABELS: Record<string, string> = {
  shot_3p: '3점슛',
  shot_layup: '레이업',
  shot_2p_mid: '미들슛',
  shot_post: '골밑슛',
}
const FIELD_SHOT_TYPES = new Set(['shot_3p', 'shot_layup', 'shot_2p_mid', 'shot_post'])

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tournamentId = searchParams.get('tournamentId')
  const team = searchParams.get('team')

  const supabase = createClient()

  let playersQuery = supabase.from('players').select('id, name, number').eq('is_active', true).order('number')
  if (team) playersQuery = playersQuery.eq('team_type', team)
  const { data: players } = await playersQuery

  let gameIds: string[] | null = null
  if (tournamentId) {
    const { data: games } = await supabase
      .from('games')
      .select('id')
      .eq('tournament_id', tournamentId)
    if (!games || games.length === 0) {
      return NextResponse.json({ players: [], matrix: {}, topPairs: [], scorerStats: [], shotTypeBreakdown: {} })
    }
    gameIds = games.map(g => g.id)
  }

  // Fetch ALL made field-goal events (assisted and unassisted)
  let allShotsData
  if (gameIds) {
    allShotsData = await supabase
      .from('game_events')
      .select('player_id, related_player_id, type, points')
      .eq('result', 'made')
      .in('game_id', gameIds)
  } else {
    allShotsData = await supabase
      .from('game_events')
      .select('player_id, related_player_id, type, points')
      .eq('result', 'made')
  }

  const allShots = allShotsData.data ?? []

  if (!players) {
    return NextResponse.json({ players: [], matrix: {}, topPairs: [], scorerStats: [], shotTypeBreakdown: {} })
  }

  // Split into field goals only (exclude free throws)
  const fieldGoals = allShots.filter(e => e.type && FIELD_SHOT_TYPES.has(e.type))
  const assistedShots = fieldGoals.filter(e => e.related_player_id)

  // ── Assist matrix (assister → scorer) ──────────────────────────
  const matrix: Record<string, Record<string, number>> = {}
  for (const e of assistedShots) {
    const aid = e.related_player_id!
    const sid = e.player_id
    if (!aid || !sid) continue
    if (!matrix[aid]) matrix[aid] = {}
    matrix[aid][sid] = (matrix[aid][sid] || 0) + 1
  }

  // ── Top pairs ───────────────────────────────────────────────────
  const pairs: { assisterId: string; scorerId: string; count: number }[] = []
  for (const [aid, scorers] of Object.entries(matrix)) {
    for (const [sid, count] of Object.entries(scorers)) {
      pairs.push({ assisterId: aid, scorerId: sid, count })
    }
  }
  pairs.sort((a, b) => b.count - a.count)

  const playerMap = new Map(players.map(p => [p.id, p]))

  const topPairs = pairs.slice(0, 8).flatMap(p => {
    const assister = playerMap.get(p.assisterId)
    const scorer = playerMap.get(p.scorerId)
    if (!assister || !scorer) return []
    return [{ assister, scorer, count: p.count }]
  })

  // ── Per-scorer stats ────────────────────────────────────────────
  // scorerStats[playerId] = { totalFgm, assistedFgm, assistedPts, unassistedPts, byType }
  interface ScorerAcc {
    totalFgm: number
    assistedFgm: number
    assistedPts: number
    unassistedPts: number
    byType: Record<string, number>            // shot type → assisted count
    unassistedByType: Record<string, number>  // shot type → unassisted count
  }
  const scorerMap = new Map<string, ScorerAcc>()

  for (const e of fieldGoals) {
    if (!e.player_id) continue
    if (!scorerMap.has(e.player_id)) {
      scorerMap.set(e.player_id, { totalFgm: 0, assistedFgm: 0, assistedPts: 0, unassistedPts: 0, byType: {}, unassistedByType: {} })
    }
    const acc = scorerMap.get(e.player_id)!
    acc.totalFgm++
    const pts = e.points ?? 0
    const t = e.type ?? 'unknown'
    if (e.related_player_id) {
      acc.assistedFgm++
      acc.assistedPts += pts
      acc.byType[t] = (acc.byType[t] || 0) + 1
    } else {
      acc.unassistedPts += pts
      acc.unassistedByType[t] = (acc.unassistedByType[t] || 0) + 1
    }
  }

  const scorerStats = [...scorerMap.entries()]
    .filter(([, s]) => s.totalFgm > 0)
    .map(([pid, s]) => {
      const p = playerMap.get(pid)
      return {
        playerId: pid,
        playerName: p?.name ?? '?',
        playerNumber: p?.number ?? 0,
        totalFgm: s.totalFgm,
        assistedFgm: s.assistedFgm,
        assistedPts: s.assistedPts,
        unassistedPts: s.unassistedPts,
        assistedRatio: s.totalFgm > 0 ? Math.round((s.assistedFgm / s.totalFgm) * 1000) / 10 : 0,
        byType: s.byType,
        unassistedByType: s.unassistedByType,
      }
    })
    .sort((a, b) => b.assistedPts - a.assistedPts)

  // ── Shot type breakdown (all assisted shots) ────────────────────
  const shotTypeBreakdown: Record<string, number> = {}
  for (const e of assistedShots) {
    const t = e.type ?? 'unknown'
    shotTypeBreakdown[t] = (shotTypeBreakdown[t] || 0) + 1
  }

  // Only return players who appear in the network
  const relevantIds = new Set([
    ...Object.keys(matrix),
    ...Object.values(matrix).flatMap(v => Object.keys(v)),
  ])
  const relevantPlayers = players.filter(p => relevantIds.has(p.id))

  return NextResponse.json({
    players: relevantPlayers,
    matrix,
    topPairs,
    scorerStats,
    shotTypeBreakdown,
    shotLabels: SHOT_LABELS,
  })
}
