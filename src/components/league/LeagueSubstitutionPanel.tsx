'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { LeaguePlayer } from '@/types/league'

interface MinRow { id: string; league_player_id: string; league_game_id: string; out_time: number | null }

interface Props {
  leagueId: string
  gameId: string
  players: LeaguePlayer[]
  minutes: MinRow[]
  leagueHeaders: Record<string, string>
  onSubstitution: () => void
}

export default function LeagueSubstitutionPanel({ leagueId, gameId, players, minutes, leagueHeaders, onSubstitution }: Props) {
  const { currentQuarter, getCurrentTimestamp } = useGameStore()
  const { onCourt, addPlayer, removePlayer } = useLineupStore()

  const [tapMode, setTapMode] = useState(false)
  const [tapOut, setTapOut] = useState<string | null>(null)

  const onCourtPlayers = players.filter(p => onCourt.includes(p.id))
  const benchPlayers = players.filter(p => !onCourt.includes(p.id))

  async function executeSubstitution(outId: string, inId: string) {
    const ts = getCurrentTimestamp()
    const openInterval = minutes.find(m => m.league_player_id === outId && m.league_game_id === gameId && m.out_time == null)
    if (openInterval) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ id: openInterval.id, out_time: ts }),
      })
    }
    await fetch(`/api/leagues/${leagueId}/minutes`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_game_id: gameId, league_player_id: inId, quarter: currentQuarter, in_time: ts }),
    })
    await Promise.all([
      fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify({ league_game_id: gameId, quarter: currentQuarter, video_timestamp: ts, type: 'sub_out', league_player_id: outId, points: 0 }) }),
      fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify({ league_game_id: gameId, quarter: currentQuarter, video_timestamp: ts, type: 'sub_in', league_player_id: inId, points: 0 }) }),
    ])
    removePlayer(outId)
    addPlayer(inId)
    const outName = players.find(p => p.id === outId)?.name ?? ''
    const inName = players.find(p => p.id === inId)?.name ?? ''
    toast.success(`교체: ${outName} → ${inName}`)
    setTapOut(null)
    onSubstitution()
  }

  function handleTapPlayer(id: string) {
    if (!tapMode) return
    if (!tapOut) {
      if (!onCourt.includes(id)) { toast('먼저 벤치 선수를 선택하려면 코트 선수를 먼저 선택하세요'); return }
      setTapOut(id)
    } else {
      if (onCourt.includes(id)) { setTapOut(id); return }
      executeSubstitution(tapOut, id)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">선수 교체</p>
        <button
          onClick={() => { setTapMode(v => !v); setTapOut(null) }}
          className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
            tapMode ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
          }`}
        >
          {tapMode ? '탭 교체 중' : '탭 교체'}
        </button>
      </div>

      {tapMode && (
        <p className="text-xs text-blue-400 -mt-2">
          {!tapOut ? '코트에서 나갈 선수를 선택하세요' : `${players.find(p => p.id === tapOut)?.name} 교체 → 들어올 선수를 선택하세요`}
        </p>
      )}

      <div>
        <p className="text-[10px] text-gray-600 mb-1.5">코트 ({onCourtPlayers.length}명)</p>
        <div className="flex flex-wrap gap-1.5">
          {onCourtPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => handleTapPlayer(p.id)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                tapOut === p.id ? 'bg-orange-600 border-orange-500 text-white' :
                tapMode ? 'bg-gray-700 border-gray-600 text-white hover:border-orange-500' :
                'bg-gray-800 border-gray-700 text-gray-200'
              }`}
            >
              <span className="text-gray-400 font-mono mr-1 text-[10px]">{p.number ?? '—'}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] text-gray-600 mb-1.5">벤치 ({benchPlayers.length}명)</p>
        <div className="flex flex-wrap gap-1.5">
          {benchPlayers.map(p => (
            <button
              key={p.id}
              onClick={() => tapMode && tapOut ? executeSubstitution(tapOut, p.id) : undefined}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                tapMode && tapOut ? 'bg-gray-800 border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-300 cursor-pointer' :
                'bg-gray-800 border-gray-700 text-gray-500 cursor-default'
              }`}
            >
              <span className="text-gray-600 font-mono mr-1 text-[10px]">{p.number ?? '—'}</span>
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
