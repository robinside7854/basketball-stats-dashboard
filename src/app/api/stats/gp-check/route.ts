import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createClient()

    const { data: games, error: gamesError } = await supabase.from('games').select('id, date, opponent')
    if (gamesError) return NextResponse.json({ error: 'games: ' + gamesError.message }, { status: 500 })

    const { data: players, error: playersError } = await supabase.from('players').select('id, name, number').eq('is_active', true).order('number')
    if (playersError) return NextResponse.json({ error: 'players: ' + playersError.message }, { status: 500 })

    if (!games || !players) return NextResponse.json({ error: 'no data' }, { status: 500 })

    const gameIds = games.map(g => g.id)
    if (gameIds.length === 0) return NextResponse.json({ changed: [], unchanged: [] })

    // 게임별 개별 조회 (max_rows 우회)
    const eventsResults = await Promise.all(
      gameIds.map(gid => supabase.from('game_events').select('game_id, player_id, type').eq('game_id', gid))
    )
    const minutesResults = await Promise.all(
      gameIds.map(gid => supabase.from('player_minutes').select('game_id, player_id, in_time, out_time').eq('game_id', gid))
    )

    const allEvents = eventsResults.flatMap(r => r.data ?? [])
    const allMinutes = minutesResults.flatMap(r => r.data ?? [])

    const STAT_TYPES = ['shot_3p','shot_2p_mid','shot_2p_drive','shot_layup','shot_post','free_throw','oreb','dreb','steal','block','turnover','foul']

    const result = players.map(p => {
      // 현재 기준: player_minutes 레코드가 있는 경기 수
      const currentGames = new Set(allMinutes.filter(m => m.player_id === p.id).map(m => m.game_id))
      const currentGP = currentGames.size

      // 새 기준: 실제 출전 시간 > 0 OR 스탯 이벤트 있는 경기만
      const newGames = new Set<string>()
      for (const gid of gameIds) {
        const hasEvent = allEvents.some(e => e.game_id === gid && e.player_id === p.id && STAT_TYPES.includes(e.type))
        const playerMins = allMinutes.filter(m => m.game_id === gid && m.player_id === p.id)
        const totalSec = playerMins.reduce((sum, m) => sum + Math.max(0, (m.out_time ?? m.in_time) - m.in_time), 0)
        if (hasEvent || totalSec > 0) newGames.add(gid)
      }
      const newGP = newGames.size

      return {
        number: p.number,
        name: p.name,
        currentGP,
        newGP,
        diff: newGP - currentGP,
        removedGames: [...currentGames]
          .filter(gid => !newGames.has(gid))
          .map(gid => {
            const g = games.find(x => x.id === gid)
            return g ? `${g.date} vs ${g.opponent}` : gid
          }),
      }
    })

    return NextResponse.json({
      totalPlayers: players.length,
      totalGames: gameIds.length,
      changed: result.filter(r => r.diff !== 0),
      unchanged: result.filter(r => r.diff === 0).map(r => r.name),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
