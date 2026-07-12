// GET /api/leagues/[leagueId]/players/[playerId]/badges
// 응답: { badges: Array<{ badge_type, game_id, earned_at_date, meta, opponent_name?, score? }> }
// 날짜 desc 정렬.

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  const supabase = createClient()

  const { data: rows } = await supabase
    .from('player_badges')
    .select('badge_type, game_id, earned_at_date, meta')
    .eq('league_id', leagueId)
    .eq('player_id', playerId)
    .order('earned_at_date', { ascending: false })

  const badges = rows ?? []
  const gameIds = Array.from(new Set(badges.map(b => b.game_id as string)))

  // 팀명/스코어 조인 — 상대팀 이름 표시용
  let gameMap: Record<string, { home_team_id: string | null; away_team_id: string | null; home_score: number | null; away_score: number | null; date: string; quarter_id: string | null }> = {}
  let teamMap: Record<string, string> = {}
  let overrideMap: Record<string, Record<string, string>> = {} // quarter_id → team_id → name

  if (gameIds.length > 0) {
    const [{ data: games }, { data: teams }, { data: overrides }] = await Promise.all([
      supabase
        .from('league_games')
        .select('id, home_team_id, away_team_id, home_score, away_score, date, quarter_id')
        .in('id', gameIds),
      supabase.from('league_teams').select('id, name').eq('league_id', leagueId),
      supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name').eq('league_id', leagueId),
    ])
    gameMap = Object.fromEntries((games ?? []).map(g => [g.id as string, {
      home_team_id: g.home_team_id as string | null,
      away_team_id: g.away_team_id as string | null,
      home_score: g.home_score as number | null,
      away_score: g.away_score as number | null,
      date: g.date as string,
      quarter_id: (g as { quarter_id?: string | null }).quarter_id ?? null,
    }]))
    teamMap = Object.fromEntries((teams ?? []).map(t => [t.id as string, t.name as string]))
    for (const ov of overrides ?? []) {
      const qId = ov.quarter_id as string
      const tid = ov.team_id as string
      const name = (ov as { name?: string | null }).name
      if (!name) continue
      if (!overrideMap[qId]) overrideMap[qId] = {}
      overrideMap[qId][tid] = name
    }
  }

  // 이 선수가 그 게임에서 뛴 팀 판단 — 이벤트 team_id 다수결 (단일 쿼리)
  const playerTeamByGame: Record<string, string | null> = {}
  if (gameIds.length > 0) {
    const { data: evRows } = await supabase
      .from('league_game_events')
      .select('league_game_id, team_id')
      .eq('league_player_id', playerId)
      .in('league_game_id', gameIds)
      .limit(2000)
    const cnt: Record<string, Record<string, number>> = {}
    for (const e of evRows ?? []) {
      const gid = e.league_game_id as string
      const tid = e.team_id as string | null
      if (!tid) continue
      if (!cnt[gid]) cnt[gid] = {}
      cnt[gid][tid] = (cnt[gid][tid] ?? 0) + 1
    }
    for (const [gid, byTeam] of Object.entries(cnt)) {
      const top = Object.entries(byTeam).sort((a, b) => b[1] - a[1])[0]
      playerTeamByGame[gid] = top ? top[0] : null
    }
  }

  function resolveTeamName(teamId: string, quarterId: string | null): string {
    return overrideMap[quarterId ?? '']?.[teamId] ?? teamMap[teamId] ?? '—'
  }

  const enriched = badges.map(b => {
    const gid = b.game_id as string
    const g = gameMap[gid]
    let opponent_name: string | undefined
    let score: string | undefined
    let result: 'W' | 'L' | 'D' | undefined
    if (g) {
      const myTeam = playerTeamByGame[gid]
      if (myTeam && (myTeam === g.home_team_id || myTeam === g.away_team_id)) {
        const oppId = myTeam === g.home_team_id ? g.away_team_id : g.home_team_id
        if (oppId) opponent_name = resolveTeamName(oppId, g.quarter_id)
        const myPts = myTeam === g.home_team_id ? (g.home_score ?? 0) : (g.away_score ?? 0)
        const oppPts = myTeam === g.home_team_id ? (g.away_score ?? 0) : (g.home_score ?? 0)
        score = `${myPts}-${oppPts}`
        result = myPts > oppPts ? 'W' : myPts < oppPts ? 'L' : 'D'
      }
    }
    return {
      badge_type: b.badge_type,
      game_id: gid,
      earned_at_date: b.earned_at_date,
      meta: b.meta,
      opponent_name,
      score,
      result,
    }
  })

  return NextResponse.json({ badges: enriched })
}
