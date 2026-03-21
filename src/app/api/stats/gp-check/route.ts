import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  try {
    const supabase = createClient()
    const { searchParams } = new URL(req.url)
    const playerName = searchParams.get('player') // 선수 이름 검색용

    const { data: games, error: gamesError } = await supabase
      .from('games').select('id, date, opponent, round')
    if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 })

    const { data: players, error: playersError } = await supabase
      .from('players').select('id, name, number').eq('is_active', true).order('number')
    if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 })

    if (!games || !players) return NextResponse.json({ error: 'no data' }, { status: 500 })

    // 특정 선수 필터
    const targetPlayers = playerName
      ? players.filter(p => p.name.includes(playerName))
      : players

    const gameIds = games.map(g => g.id)

    const eventsResults = await Promise.all(
      gameIds.map(gid => supabase.from('game_events').select('game_id, player_id, type').eq('game_id', gid))
    )
    const minutesResults = await Promise.all(
      gameIds.map(gid => supabase.from('player_minutes').select('id, game_id, player_id, in_time, out_time, quarter').eq('game_id', gid))
    )

    const allEvents = eventsResults.flatMap(r => r.data ?? [])
    const allMinutes = minutesResults.flatMap(r => r.data ?? [])

    const STAT_TYPES = ['shot_3p','shot_2p_mid','shot_2p_drive','shot_layup','shot_post','free_throw','oreb','dreb','steal','block','turnover','foul']

    const result = targetPlayers.map(p => {
      const gameDetails = games.map(g => {
        const mins = allMinutes.filter(m => m.game_id === g.id && m.player_id === p.id)
        const events = allEvents.filter(e => e.game_id === g.id && e.player_id === p.id && STAT_TYPES.includes(e.type))
        const totalSec = mins.reduce((sum, m) => sum + Math.max(0, (m.out_time ?? m.in_time) - m.in_time), 0)
        const totalMin = Math.round(totalSec / 60 * 10) / 10
        const counted = mins.length > 0

        if (!counted && events.length === 0) return null // 관련 없는 경기 제외

        return {
          game: `${g.date} vs ${g.opponent}` + (g.round ? ` (${g.round})` : ''),
          game_id: g.id,
          minuteRecords: mins.map(m => ({
            id: m.id,
            quarter: m.quarter,
            in_sec: m.in_time,
            out_sec: m.out_time,
            played_sec: Math.max(0, (m.out_time ?? m.in_time) - m.in_time),
          })),
          totalMin,
          eventCount: events.length,
          counted_in_gp: counted,
        }
      }).filter(Boolean)

      return { number: p.number, name: p.name, games: gameDetails }
    })

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
