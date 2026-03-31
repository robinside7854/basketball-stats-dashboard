import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'free_throw'] as const
type ShotType = typeof SHOT_TYPES[number]
// 드라이브는 레이업으로 통합
const DRIVE_TO_LAYUP = 'shot_2p_drive'

interface ShotBreakdown {
  att: number
  made: number
  pts: number
}

interface OppPlayerStat {
  player_id: string
  player_number: string
  player_name: string | null
  games: Set<string>
  pts: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  oreb: number
  shot_breakdown: Record<ShotType, ShotBreakdown>
}

function emptyShotBreakdown(): Record<ShotType, ShotBreakdown> {
  return Object.fromEntries(
    SHOT_TYPES.map(t => [t, { att: 0, made: 0, pts: 0 }])
  ) as Record<ShotType, ShotBreakdown>
}

function shotPoints(type: string): number {
  if (type === 'shot_3p') return 3
  if (type === 'free_throw') return 1
  return 2
}

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 })

  // 팀 게임 목록
  const { data: games, error: gErr } = await supabase
    .from('opponent_games')
    .select('*')
    .eq('opponent_team_id', teamId)
    .order('date', { ascending: true })
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
  if (!games || games.length === 0) {
    return NextResponse.json({ players: [], team_shot_breakdown: emptyShotBreakdown(), games: [] })
  }

  const gameIds = games.map((g: { id: string }) => g.id)

  // 플레이어 목록 + 이벤트 목록
  const [playersRes, ...eventResults] = await Promise.all([
    supabase.from('opponent_players').select('*').eq('team_id', teamId).order('number'),
    ...gameIds.map((gid: string) =>
      supabase.from('opponent_game_events').select('*').eq('game_id', gid)
    )
  ])

  if (playersRes.error) return NextResponse.json({ error: 'Failed to fetch players' }, { status: 500 })

  const playerMap = new Map<string, OppPlayerStat>()
  for (const p of playersRes.data) {
    playerMap.set(p.id, {
      player_id: p.id,
      player_number: p.number,
      player_name: p.name,
      games: new Set(),
      pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      oreb: 0,
      shot_breakdown: emptyShotBreakdown(),
    })
  }

  // 팀 전체 shot breakdown
  const teamShotBreakdown = emptyShotBreakdown()

  // 게임별 상세 (분석 탭 드릴다운용)
  const gameDetails = games.map((g: { id: string; date: string; our_score: number; opponent_score: number; round?: string; tournament_name?: string }) => ({
    game_id: g.id,
    date: g.date,
    our_score: g.our_score,
    opponent_score: g.opponent_score,
    round: g.round ?? null,
    tournament_name: g.tournament_name ?? null,
    players: [] as Array<{ player_id: string; player_number: string; player_name: string | null; pts: number; fga: number; fgm: number; shot_breakdown: Record<ShotType, ShotBreakdown> }>,
  }))

  // 이벤트 집계
  for (let i = 0; i < gameIds.length; i++) {
    const evRes = eventResults[i] as { data: Array<{ id: string; game_id: string; player_id: string; type: string; result: string; points: number }> | null; error: unknown }
    if (!evRes.data) continue
    const events = evRes.data

    // 게임별 선수 임시 map
    const gamePlayerMap = new Map<string, { player_id: string; player_number: string; player_name: string | null; pts: number; fga: number; fgm: number; shot_breakdown: Record<ShotType, ShotBreakdown> }>()

    for (const ev of events) {
      if (!ev.player_id) continue
      const stat = playerMap.get(ev.player_id)
      if (!stat) continue

      // 게임 추가
      stat.games.add(gameIds[i])

      // 게임별 선수 stat 초기화
      if (!gamePlayerMap.has(ev.player_id)) {
        gamePlayerMap.set(ev.player_id, {
          player_id: stat.player_id,
          player_number: stat.player_number,
          player_name: stat.player_name,
          pts: 0, fga: 0, fgm: 0,
          shot_breakdown: emptyShotBreakdown(),
        })
      }
      const gameStat = gamePlayerMap.get(ev.player_id)!

      // 드라이브 → 레이업으로 통합
      const evType = ev.type === DRIVE_TO_LAYUP ? 'shot_layup' : ev.type

      if (SHOT_TYPES.includes(evType as ShotType)) {
        const sType = evType as ShotType
        const isMade = ev.result === 'made'
        const pts = isMade ? shotPoints(evType) : 0

        // 누적 집계
        if (sType !== 'free_throw') { stat.fga++; gameStat.fga++ }
        if (sType === 'shot_3p') { stat.fg3a++ }
        if (sType === 'free_throw') { stat.fta++ }
        if (isMade) {
          if (sType !== 'free_throw') { stat.fgm++; gameStat.fgm++ }
          if (sType === 'shot_3p') stat.fg3m++
          if (sType === 'free_throw') stat.ftm++
          stat.pts += pts
          gameStat.pts += pts
        }

        // Shot breakdown
        stat.shot_breakdown[sType].att++
        stat.shot_breakdown[sType].pts += pts
        if (isMade) stat.shot_breakdown[sType].made++
        teamShotBreakdown[sType].att++
        teamShotBreakdown[sType].pts += pts
        if (isMade) teamShotBreakdown[sType].made++
        gameStat.shot_breakdown[sType].att++
        if (isMade) gameStat.shot_breakdown[sType].made++
        gameStat.shot_breakdown[sType].pts += pts

      } else if (evType === 'oreb') {
        stat.oreb++
      }
    }

    gameDetails[i].players = Array.from(gamePlayerMap.values()).sort((a, b) => b.pts - a.pts)
  }

  const players = Array.from(playerMap.values())
    .filter(s => s.games.size > 0 || s.fga > 0)
    .map(s => ({
      ...s,
      games: s.games.size,
      fg_pct: s.fga > 0 ? Math.round((s.fgm / s.fga) * 1000) / 10 : 0,
      fg3_pct: s.fg3a > 0 ? Math.round((s.fg3m / s.fg3a) * 1000) / 10 : 0,
      ft_pct: s.fta > 0 ? Math.round((s.ftm / s.fta) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.pts - a.pts)

  return NextResponse.json({
    players,
    team_shot_breakdown: teamShotBreakdown,
    games: gameDetails,
    total_games: games.length,
  })
}
