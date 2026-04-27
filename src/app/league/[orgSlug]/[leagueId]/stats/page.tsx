'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Trophy, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'

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
  spg: number; bpg: number; topg: number
  fgm: number; fga: number; fg_pct: number
  fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number
  efg_pct: number
}

type ViewMode = 'avg' | 'total'
type SortKey = 'ppg'|'rpg'|'apg'|'spg'|'bpg'|'topg'|'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'|'gp'|'pts'|'reb'|'ast'|'stl'|'blk'|'tov'|'fgm'|'fg3m'|'ftm'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _SORT_OPTIONS_LEGACY: { key: SortKey; label: string }[] = [
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
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  const [projection, setProjection] = useState(false)  // ×5 환산
  const [quickViewPlayer, setQuickViewPlayer] = useState<{ id: string; name: string } | null>(null)
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

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const filtered = players
    .filter(p => p.gp >= minGP)
    .sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'desc' ? -diff : diff
    })

  const top3 = (key: SortKey) =>
    [...players].filter(p => p.gp >= minGP).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 3)

  // 평균 컬럼 (×5 환산 포함)
  const MULT = (projection && viewMode === 'avg') ? 5 : 1
  function avg(p: PlayerStat, key: keyof PlayerStat) {
    return +((p[key] as number) * MULT).toFixed(1)
  }

  // 테이블 컬럼 정의
  const AVG_COLS: { key: SortKey; label: string }[] = [
    { key: 'gp', label: 'GP' }, { key: 'ppg', label: 'PPG' }, { key: 'rpg', label: 'RPG' },
    { key: 'apg', label: 'APG' }, { key: 'spg', label: 'SPG' }, { key: 'bpg', label: 'BPG' },
    { key: 'topg', label: 'TOPG' }, { key: 'fg_pct', label: 'FG%' }, { key: 'fg3_pct', label: '3P%' },
    { key: 'ft_pct', label: 'FT%' }, { key: 'efg_pct', label: 'eFG%' },
  ]
  const TOTAL_COLS: { key: SortKey; label: string }[] = [
    { key: 'gp', label: 'GP' }, { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' },
    { key: 'tov', label: 'TOV' }, { key: 'fgm', label: 'FGM' },
    { key: 'fg3m', label: '3PM' }, { key: 'ftm', label: 'FTM' },
    { key: 'fg_pct', label: 'FG%' }, { key: 'fg3_pct', label: '3P%' }, { key: 'ft_pct', label: 'FT%' },
  ]
  const COLS = viewMode === 'avg' ? AVG_COLS : TOTAL_COLS

  function cellVal(p: PlayerStat, key: SortKey): string {
    if (viewMode === 'avg') {
      if (key === 'gp') return String(p.gp)
      if (key === 'fg_pct') return p.fga > 0 ? `${avg(p,'fg_pct')}%` : '—'
      if (key === 'fg3_pct') return p.fg3a > 0 ? `${avg(p,'fg3_pct')}%` : '—'
      if (key === 'ft_pct') return p.fta > 0 ? `${avg(p,'ft_pct')}%` : '—'
      if (key === 'efg_pct') return p.fga > 0 ? `${avg(p,'efg_pct')}%` : '—'
      return String(avg(p, key as keyof PlayerStat))
    } else {
      if (key === 'fg_pct') return p.fga > 0 ? `${p.fg_pct}%` : '—'
      if (key === 'fg3_pct') return p.fg3a > 0 ? `${p.fg3_pct}%` : '—'
      if (key === 'ft_pct') return p.fta > 0 ? `${p.ft_pct}%` : '—'
      return String((p as unknown as Record<string, number>)[key] ?? 0)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white">리그 스탯</h2>
        {/* 분기 버튼 필터 */}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSelectedQuarterId('all')}
            className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
              selectedQuarterId === 'all' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}>전체</button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQuarterId(q.id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                selectedQuarterId === q.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}>
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            </button>
          ))}
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
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
                  <button onClick={() => setQuickViewPlayer({ id: top.player_id, name: top.name })}
                    className="text-lg font-black text-white truncate hover:text-blue-300 transition-colors cursor-pointer text-left w-full hover:underline underline-offset-2">
                    {top.name}
                  </button>
                  <p className="text-2xl font-black text-yellow-400">{top[key]}</p>
                  <p className="text-[10px] text-gray-600 mt-0.5">{unit} · {top.gp}경기</p>
                  {leaders.slice(1).map((p, i) => (
                    <div key={p.player_id} className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-800">
                      <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                        className="text-xs text-gray-500 hover:text-blue-300 cursor-pointer transition-colors hover:underline underline-offset-1">
                        {i + 2}위 {p.name}
                      </button>
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
                {/* 누적/평균 토글 */}
                <div className="flex rounded-lg overflow-hidden border border-gray-700">
                  {(['avg','total'] as ViewMode[]).map(m => (
                    <button key={m} onClick={() => { setViewMode(m); if (m === 'total') setProjection(false) }}
                      className={`px-3 py-1 text-xs font-bold cursor-pointer transition-colors ${viewMode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {m === 'avg' ? '평균' : '누적'}
                    </button>
                  ))}
                </div>
                {/* x5 환산 (평균 모드만) */}
                {viewMode === 'avg' && (
                  <button onClick={() => setProjection(v => !v)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg border cursor-pointer transition-all ${
                      projection ? 'bg-amber-600/30 border-amber-500/60 text-amber-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}>
                    ×5 환산
                  </button>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span>최소</span>
                  <input type="number" min={1} max={20} value={minGP}
                    onChange={e => setMinGP(Number(e.target.value))}
                    className="w-12 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-1 text-center text-xs" />
                  <span>경기</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-2.5 sticky left-0 bg-gray-900 text-[10px] text-gray-500 font-bold min-w-[110px]">선수</th>
                    {COLS.map(({ key, label }) => (
                      <th key={key} onClick={() => handleSort(key)}
                        className={`px-3 py-2.5 text-center text-[10px] font-bold cursor-pointer select-none whitespace-nowrap transition-colors hover:text-gray-200 ${sortKey === key ? 'text-blue-400' : 'text-gray-500'}`}>
                        {label}
                        {sortKey === key
                          ? (sortDir === 'desc' ? <ChevronDown size={9} className="inline ml-0.5" /> : <ChevronUp size={9} className="inline ml-0.5" />)
                          : <ChevronsUpDown size={9} className="inline ml-0.5 opacity-30" />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.player_id}
                      className={`border-b border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-900/50'} hover:bg-gray-800/30 transition-colors`}>
                      <td className="px-4 py-2.5 sticky left-0 bg-inherit">
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-medium text-white hover:text-blue-300 transition-colors cursor-pointer text-left hover:underline underline-offset-1 truncate max-w-[100px] block">
                          {p.name}
                        </button>
                        <div className="text-gray-600 text-[10px]">{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      {COLS.map(({ key }) => (
                        <td key={key} className={`px-3 py-2.5 text-center ${sortKey === key ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
                          {cellVal(p, key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {quickViewPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickViewPlayer.id}
          playerName={quickViewPlayer.name}
          onClose={() => setQuickViewPlayer(null)}
        />
      )}
    </div>
  )
}
