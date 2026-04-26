'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Trophy, TrendingUp } from 'lucide-react'

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }

type PlayerStat = {
  player_id: string
  name: string
  number: number | null
  position: string | null
  gp: number
  pts: number; ppg: number
  reb: number; rpg: number
  ast: number; apg: number
  stl: number; blk: number
  tov: number
  fgm: number; fga: number; fg_pct: number
  fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number
  efg_pct: number
}

type SortKey = 'ppg' | 'rpg' | 'apg' | 'stl' | 'blk' | 'fg_pct' | 'fg3_pct' | 'ft_pct' | 'efg_pct'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'ppg',     label: '득점(PPG)' },
  { key: 'rpg',     label: '리바운드(RPG)' },
  { key: 'apg',     label: '어시스트(APG)' },
  { key: 'stl',     label: '스틸(STL)' },
  { key: 'blk',     label: '블락(BLK)' },
  { key: 'fg_pct',  label: 'FG%' },
  { key: 'fg3_pct', label: '3P%' },
  { key: 'ft_pct',  label: 'FT%' },
  { key: 'efg_pct', label: 'eFG%' },
]

export default function LeagueStatsPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQuarterId, setSelectedQuarterId] = useState<string>('all')
  const [players, setPlayers] = useState<PlayerStat[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('ppg')
  const [minGP, setMinGP] = useState(1)

  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.json())
      .then((qs: Quarter[]) => {
        setQuarters(qs)
        const current = qs.find(q => q.is_current)
        if (current) setSelectedQuarterId(current.id)
      })
      .catch(() => null)
  }, [leagueId])

  useEffect(() => {
    setLoading(true)
    const url = selectedQuarterId === 'all'
      ? `/api/leagues/${leagueId}/stats`
      : `/api/leagues/${leagueId}/stats?quarterId=${selectedQuarterId}`

    fetch(url)
      .then(r => r.json())
      .then(d => { setPlayers(d.players ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leagueId, selectedQuarterId])

  const filtered = players
    .filter(p => p.gp >= minGP)
    .sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number))

  const top3 = (key: SortKey) =>
    [...players].filter(p => p.gp >= minGP).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 3)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white">리그 스탯</h2>
        {/* 분기 필터 */}
        <select
          value={selectedQuarterId}
          onChange={e => setSelectedQuarterId(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm cursor-pointer"
        >
          <option value="all">전체 시즌</option>
          {quarters.map(q => (
            <option key={q.id} value={q.id}>
              {String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' (현재)' : ''}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
      ) : players.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Trophy size={32} className="mx-auto mb-3 text-gray-700" />
          <p>아직 완료된 경기 데이터가 없습니다</p>
          <p className="text-xs mt-1 text-gray-600">경기를 기록하고 완료 처리하면 스탯이 집계됩니다</p>
        </div>
      ) : (
        <>
          {/* 리더보드 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { key: 'ppg' as SortKey, label: '득점왕', unit: 'PPG' },
              { key: 'rpg' as SortKey, label: '리바운드왕', unit: 'RPG' },
              { key: 'apg' as SortKey, label: '어시스트왕', unit: 'APG' },
            ].map(({ key, label, unit }) => {
              const leaders = top3(key)
              const top = leaders[0]
              if (!top) return null
              return (
                <div key={key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Trophy size={13} className="text-yellow-400" />
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                  </div>
                  <p className="text-lg font-black text-white truncate">{top.name}</p>
                  <p className="text-2xl font-black text-yellow-400">{top[key]}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{unit} · {top.gp}경기</p>
                  {leaders.slice(1).map((p, i) => (
                    <div key={p.player_id} className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-800">
                      <span className="text-xs text-gray-500">{i + 2}위 {p.name}</span>
                      <span className="text-xs font-bold text-gray-400">{p[key]}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* 전체 스탯 테이블 */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* 테이블 컨트롤 */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-wrap">
              <div className="flex items-center gap-2">
                <TrendingUp size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">전체 스탯</span>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <select
                  value={sortKey}
                  onChange={e => setSortKey(e.target.value as SortKey)}
                  className="bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1 text-xs cursor-pointer"
                >
                  {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label} 순</option>)}
                </select>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span>최소</span>
                  <input
                    type="number" min={1} max={20} value={minGP}
                    onChange={e => setMinGP(Number(e.target.value))}
                    className="w-12 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-1 text-center"
                  />
                  <span>경기</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500">
                    <th className="text-left px-4 py-2.5 sticky left-0 bg-gray-900 min-w-[100px]">선수</th>
                    <th className="px-3 py-2.5 text-center">GP</th>
                    <th className="px-3 py-2.5 text-center font-bold text-white">PPG</th>
                    <th className="px-3 py-2.5 text-center">RPG</th>
                    <th className="px-3 py-2.5 text-center">APG</th>
                    <th className="px-3 py-2.5 text-center">STL</th>
                    <th className="px-3 py-2.5 text-center">BLK</th>
                    <th className="px-3 py-2.5 text-center">TOV</th>
                    <th className="px-3 py-2.5 text-center">FG%</th>
                    <th className="px-3 py-2.5 text-center">3P%</th>
                    <th className="px-3 py-2.5 text-center">FT%</th>
                    <th className="px-3 py-2.5 text-center">eFG%</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.player_id}
                      className={`border-b border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-900/50'} hover:bg-gray-800/30 transition-colors`}>
                      <td className="px-4 py-2.5 sticky left-0 bg-inherit">
                        <div className="font-medium text-white truncate max-w-[90px]">{p.name}</div>
                        <div className="text-gray-600 text-[10px]">{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-gray-400">{p.gp}</td>
                      <td className={`px-3 py-2.5 text-center font-bold ${sortKey === 'ppg' ? 'text-yellow-400' : 'text-white'}`}>{p.ppg}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'rpg' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>{p.rpg}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'apg' ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>{p.apg}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'stl' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{p.stl}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'blk' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{p.blk}</td>
                      <td className="px-3 py-2.5 text-center text-gray-500">{p.tov}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'fg_pct' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{p.fg_pct}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'fg3_pct' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{p.fg3_pct}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'ft_pct' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{p.ft_pct}</td>
                      <td className={`px-3 py-2.5 text-center ${sortKey === 'efg_pct' ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>{p.efg_pct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
