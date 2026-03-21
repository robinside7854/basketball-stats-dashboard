import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()

  const { data: games } = await supabase.from('games').select('id, date, opponent')
  const { data: players } = await supabase.from('players').select('id, name, number').eq('is_active', true).order('number')
  if (!games || !players) return NextResponse.json({ error: 'fetch failed' }, { status: 500 })

  const gameIds = games.map(g => g.id)
  const [eventsRes, minutesRes] = await Promise.all([
    Promise.all(gameIds.map(gid => supabase.from('game_events').select('game_id, player_id, type').eq('game_id', gid))),
    Promise.all(gameIds.map(gid => supabase.from('player_minutes').select('game_id, player_id, in_time, out_time').eq('game_id', gid))),
  ])

  const allEvents = eventsRes.flatMap(r => r.data ?? [])
  const allMinutes = minutesRes.flatMap(r => r.data ?? [])

  const STAT_TYPES = ['shot_3p','shot_2p_mid','shot_2p_drive','shot_layup','shot_post','free_throw','oreb','dreb','steal','block','turnover','foul']

  const result = players.map(p => {
    // 현재 기준: player_minutes 레코드가 있는 경기 수
    const currentGames = new Set(allMinutes.filter(m => m.player_id === p.id).map(m => m.game_id))
    const currentGP = currentGames.size

    // 새 기준: 실제 출전 시간(minutes>0) OR 스탯 이벤트가 있는 경기만
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
      // 제외될 경기 목록
      removedGames: [...currentGames].filter(gid => !newGames.has(gid)).map(gid => {
        const g = games.find(x => x.id === gid)
        return g ? `${g.date} vs ${g.opponent}` : gid
      }),
    }
  })

  const changed = result.filter(r => r.diff !== 0)
  const unchanged = result.filter(r => r.diff === 0)

  return NextResponse.json({ changed, unchanged })
}
