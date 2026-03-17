'use client'
import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Tournament, PlayerBoxScore } from '@/types/database'

interface SeasonPlayer extends PlayerBoxScore {
  pts_avg: number; reb_avg: number; ast_avg: number; games_played: number
  usg_pct: number
}

export default function StatsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTId, setSelectedTId] = useState('all')
  const [players, setPlayers] = useState<SeasonPlayer[]>([])
  const [sortKey, setSortKey] = useState<keyof SeasonPlayer>('pts')

  useEffect(() => { fetch('/api/tournaments').then(r => r.json()).then(setTournaments) }, [])
  useEffect(() => {
    const url = selectedTId === 'all' ? '/api/stats/season' : `/api/stats/season?tournamentId=${selectedTId}`
    fetch(url).then(r => r.json()).then(d => setPlayers(d.players || []))
  }, [selectedTId])

  const sorted = [...players].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0))

  const leaders = [
    { label: '득점왕', key: 'pts_avg', unit: 'PPG', icon: '🏀' },
    { label: '리바운드왕', key: 'reb_avg', unit: 'RPG', icon: '💪' },
    { label: '어시스트왕', key: 'ast_avg', unit: 'APG', icon: '🤝' },
    { label: 'FG%', key: 'fg_pct', unit: '%', icon: '🎯' },
    { label: '3P%', key: 'fg3_pct', unit: '%', icon: '3️⃣' },
    { label: 'TS%', key: 'ts_pct', unit: '%', icon: '📊' },
  ] as const

  return (
    <div className="space-y-8">
      {/* 대회 선택 */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">시즌 통계</h1>
        <Select value={selectedTId} onValueChange={v => setSelectedTId(v ?? '')}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            <SelectItem value="all">전체 경기</SelectItem>
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 리더보드 */}
      {players.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-300">부문별 리더</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {leaders.map(({ label, key, unit, icon }) => {
              const leader = [...players].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))[0]
              if (!leader) return null
              return (
                <div key={key} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-xs text-gray-400 mb-1">{label}</div>
                  <div className="font-bold text-blue-400">{leader.player_name}</div>
                  <div className="text-xl font-black text-white mt-1">{Number(leader[key]).toFixed(1)}<span className="text-xs text-gray-400 ml-1">{unit}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 시즌 통계 테이블 */}
      {players.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-300">선수별 통계</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr className="bg-gray-800 text-gray-400">
                  {[
                    { key: 'player_number', label: '#' },
                    { key: 'player_name', label: '이름' },
                    { key: 'games_played', label: 'GP' },
                    { key: 'pts_avg', label: 'PPG' },
                    { key: 'reb_avg', label: 'RPG' },
                    { key: 'ast_avg', label: 'APG' },
                    { key: 'usg_pct', label: 'USG%' },
                    { key: 'fg_pct', label: 'FG%' },
                    { key: 'fg3_pct', label: '3P%' },
                    { key: 'ft_pct', label: 'FT%' },
                    { key: 'efg_pct', label: 'eFG%' },
                    { key: 'ts_pct', label: 'TS%' },
                    { key: 'ast_tov', label: 'A/T' },
                    { key: 'stl', label: 'STL' },
                    { key: 'blk', label: 'BLK' },
                  ].map(col => (
                    <th key={col.key} onClick={() => setSortKey(col.key as keyof SeasonPlayer)}
                      className={`px-2 py-2 border-b border-gray-700 font-medium cursor-pointer hover:text-white whitespace-nowrap ${sortKey === col.key ? 'text-blue-400' : ''}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((s) => (
                  <tr key={s.player_id} className="border-b border-gray-800 hover:bg-gray-900">
                    <td className="px-2 py-2 font-bold text-blue-400">{s.player_number}</td>
                    <td className="px-2 py-2 text-left font-medium whitespace-nowrap">{s.player_name}</td>
                    <td className="px-2 py-2 text-gray-400">{s.games_played}</td>
                    <td className="px-2 py-2 font-bold text-white">{s.pts_avg.toFixed(1)}</td>
                    <td className="px-2 py-2">{s.reb_avg.toFixed(1)}</td>
                    <td className="px-2 py-2 text-blue-400">{s.ast_avg.toFixed(1)}</td>
                    <td className="px-2 py-2 text-purple-400">{s.usg_pct != null ? s.usg_pct.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2">{s.fg_pct > 0 ? s.fg_pct.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2">{s.fg3_pct > 0 ? s.fg3_pct.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2">{s.ft_pct > 0 ? s.ft_pct.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2">{s.efg_pct > 0 ? s.efg_pct.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2">{s.ts_pct > 0 ? s.ts_pct.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2">{s.ast_tov > 0 ? s.ast_tov.toFixed(1) : '-'}</td>
                    <td className="px-2 py-2 text-green-400">{s.stl}</td>
                    <td className="px-2 py-2 text-indigo-400">{s.blk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            <p className="text-xs text-gray-500">* 컬럼 클릭 시 정렬 변경</p>
            <p className="text-xs text-gray-500">* USG%: 팀 전체 공격 점유 중 해당 선수 비율</p>
          </div>
        </div>
      )}

      {players.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <p>경기 기록 데이터가 없습니다</p>
          <p className="text-sm mt-2">경기 기록 탭에서 스탯을 입력하면 자동으로 집계됩니다</p>
        </div>
      )}
    </div>
  )
}
