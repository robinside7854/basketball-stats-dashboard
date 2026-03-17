'use client'
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { PlayerBoxScore } from '@/types/database'

interface GameInfo {
  game_id: string
  date: string
  opponent: string
  our_score: number
  opponent_score: number
  round?: string | null
  tournament_name?: string | null
}

interface Props {
  gameInfo: GameInfo
  onClose: () => void
  onPlayerClick?: (playerId: string) => void
}

function Pct({ val }: { val: number }) {
  return <span className={val >= 50 ? 'text-green-400' : val > 0 ? 'text-yellow-400' : 'text-gray-600'}>{val > 0 ? `${val.toFixed(1)}%` : '-'}</span>
}

export default function GameBoxScoreModal({ gameInfo, onClose, onPlayerClick }: Props) {
  const [boxScores, setBoxScores] = useState<PlayerBoxScore[]>([])
  const [teamTotals, setTeamTotals] = useState<Partial<PlayerBoxScore>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/stats/${gameInfo.game_id}`)
      .then(r => r.json())
      .then(d => {
        setBoxScores(d.boxScores || [])
        setTeamTotals(d.teamTotals || {})
        setLoading(false)
      })
  }, [gameInfo.game_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const isWin = gameInfo.our_score > gameInfo.opponent_score

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] bg-gray-950 border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isWin ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
              {isWin ? '승' : '패'}
            </span>
            <div>
              <span className="text-white font-bold">
                {gameInfo.our_score}
                <span className="text-gray-500 mx-2 font-normal">vs</span>
                {gameInfo.opponent_score}
              </span>
              <span className="ml-2 text-gray-400 text-sm">vs {gameInfo.opponent}</span>
            </div>
            <div className="text-xs text-gray-600">
              {gameInfo.date}
              {gameInfo.round && ` · ${gameInfo.round}`}
              {gameInfo.tournament_name && ` · ${gameInfo.tournament_name}`}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-auto flex-1 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <div className="text-center"><div className="text-3xl mb-3">🏀</div><p>로딩 중...</p></div>
            </div>
          ) : boxScores.length === 0 ? (
            <div className="text-center py-16 text-gray-500">기록된 데이터가 없습니다</div>
          ) : (
            <table className="w-full text-xs text-center border-collapse">
              <thead>
                <tr className="bg-gray-800 text-gray-400">
                  <th className="px-2 py-2 text-left">#</th>
                  <th className="px-2 py-2 text-left">이름</th>
                  <th className="px-2 py-2">PTS</th>
                  <th className="px-2 py-2">REB</th>
                  <th className="px-2 py-2">AST</th>
                  <th className="px-2 py-2">STL</th>
                  <th className="px-2 py-2">BLK</th>
                  <th className="px-2 py-2">TOV</th>
                  <th className="px-2 py-2">FG</th>
                  <th className="px-2 py-2">FG%</th>
                  <th className="px-2 py-2">3P</th>
                  <th className="px-2 py-2">3P%</th>
                  <th className="px-2 py-2">FT</th>
                  <th className="px-2 py-2">FT%</th>
                </tr>
              </thead>
              <tbody>
                {boxScores.map(s => (
                  <tr
                    key={s.player_id}
                    className={`border-b border-gray-800 transition-colors ${onPlayerClick ? 'cursor-pointer hover:bg-blue-900/20' : 'hover:bg-gray-900'}`}
                    onClick={() => onPlayerClick?.(s.player_id)}
                  >
                    <td className="px-2 py-2 font-bold text-blue-400 text-left">{s.player_number}</td>
                    <td className="px-2 py-2 text-left font-medium whitespace-nowrap">
                      {s.player_name}
                      {s.double_double && <span className="ml-1 text-xs bg-yellow-600 px-1 rounded">DD</span>}
                      {s.triple_double && <span className="ml-1 text-xs bg-blue-600 px-1 rounded">TD</span>}
                    </td>
                    <td className="px-2 py-2 font-bold text-white">{s.pts}</td>
                    <td className="px-2 py-2">{s.reb}</td>
                    <td className="px-2 py-2 text-blue-400">{s.ast}</td>
                    <td className="px-2 py-2 text-green-400">{s.stl}</td>
                    <td className="px-2 py-2 text-purple-400">{s.blk}</td>
                    <td className="px-2 py-2 text-red-400">{s.tov}</td>
                    <td className="px-2 py-2 text-gray-300">{s.fgm}-{s.fga}</td>
                    <td className="px-2 py-2"><Pct val={s.fg_pct} /></td>
                    <td className="px-2 py-2 text-gray-300">{s.fg3m}-{s.fg3a}</td>
                    <td className="px-2 py-2"><Pct val={s.fg3_pct} /></td>
                    <td className="px-2 py-2 text-gray-300">{s.ftm}-{s.fta}</td>
                    <td className="px-2 py-2"><Pct val={s.ft_pct} /></td>
                  </tr>
                ))}
                {/* 팀 합계 */}
                <tr className="bg-gray-800/60 font-bold border-t-2 border-blue-500/50">
                  <td colSpan={2} className="px-2 py-2 text-left text-blue-400">팀 합계</td>
                  <td className="px-2 py-2 text-gray-400">-</td>
                  <td className="px-2 py-2 text-white">{teamTotals.pts ?? 0}</td>
                  <td className="px-2 py-2">{teamTotals.reb ?? 0}</td>
                  <td className="px-2 py-2 text-blue-400">{teamTotals.ast ?? 0}</td>
                  <td className="px-2 py-2 text-green-400">{teamTotals.stl ?? 0}</td>
                  <td className="px-2 py-2 text-purple-400">{teamTotals.blk ?? 0}</td>
                  <td className="px-2 py-2 text-red-400">{teamTotals.tov ?? 0}</td>
                  <td className="px-2 py-2 text-gray-300">{teamTotals.fgm ?? 0}-{teamTotals.fga ?? 0}</td>
                  <td className="px-2 py-2"><Pct val={teamTotals.fga ? Math.round((teamTotals.fgm! / teamTotals.fga) * 1000) / 10 : 0} /></td>
                  <td className="px-2 py-2 text-gray-300">{teamTotals.fg3m ?? 0}-{teamTotals.fg3a ?? 0}</td>
                  <td className="px-2 py-2"><Pct val={teamTotals.fg3a ? Math.round((teamTotals.fg3m! / teamTotals.fg3a) * 1000) / 10 : 0} /></td>
                  <td className="px-2 py-2 text-gray-300">{teamTotals.ftm ?? 0}-{teamTotals.fta ?? 0}</td>
                  <td className="px-2 py-2"><Pct val={teamTotals.fta ? Math.round((teamTotals.ftm! / teamTotals.fta) * 1000) / 10 : 0} /></td>
                </tr>
              </tbody>
            </table>
          )}
          {onPlayerClick && !loading && boxScores.length > 0 && (
            <p className="text-xs text-gray-600 mt-3 text-center">선수 행을 클릭하면 플레이어 카드가 열립니다</p>
          )}
        </div>
      </div>
    </div>
  )
}
