'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Trophy, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import PlayerCompareModal from '@/components/league/PlayerCompareModal'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Quarter, PlayerStat } from '@/types/league'

const CHART_STATS = [
  { key: 'ppg',    label: '득점',    unit: 'PPG' },
  { key: 'rpg',    label: '리바운드', unit: 'RPG' },
  { key: 'apg',    label: '어시스트', unit: 'APG' },
  { key: 'spg',    label: '스틸',    unit: 'SPG' },
  { key: 'bpg',    label: '블록',    unit: 'BPG' },
  { key: 'fg_pct', label: 'FG%',    unit: '%'   },
  { key: 'fg3_pct',label: '3P%',    unit: '%'   },
] as const
type ChartStatKey = typeof CHART_STATS[number]['key']

function TopScorersChart({ players, statKey, statLabel, statUnit, color }: {
  players: PlayerStat[]
  statKey: ChartStatKey
  statLabel: string
  statUnit: string
  color?: string
}) {
  const top5 = [...players]
    .filter(p => p.gp >= 1)
    .sort((a, b) => (b[statKey] as number) - (a[statKey] as number))
    .slice(0, 5)
  const barColor = color ?? '#3b82f6'
  const isPct = statUnit === '%'
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{statLabel} TOP 5</p>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={top5} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0,'auto']} tick={{fill:'#6b7280',fontSize:10}} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{fill:'#d1d5db',fontSize:11,fontWeight:600}} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:8,fontSize:12}}
            formatter={(v) => [`${Number(v).toFixed(1)}${isPct ? '%' : ''} ${statUnit}`]}
            labelStyle={{color:'#f9fafb',fontWeight:600}}
          />
          <Bar dataKey={statKey} radius={[0,4,4,0]}>
            {top5.map((_,i) => <Cell key={i} fill={i===0?'#f59e0b':i===1?'#9ca3af':i===2?'#b45309': barColor} fillOpacity={i<3?1:0.7} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
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
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [selectedChartStat, setSelectedChartStat] = useState<ChartStatKey>('ppg')

  const toggleCompare = (player: PlayerStat) => {
    setCompareIds(prev => {
      const next = new Set(prev)
      if (next.has(player.player_id)) next.delete(player.player_id)
      else if (next.size < 2) next.add(player.player_id)
      return next
    })
  }
  const compareList = Array.from(compareIds)
  const compareNamesById: Record<string, string> = Object.fromEntries(players.map(p => [p.player_id, p.name]))

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

  const PCT_KEYS = new Set<SortKey>(['fg_pct', 'fg3_pct', 'ft_pct', 'efg_pct'])

  function cellVal(p: PlayerStat, key: SortKey): string {
    if (viewMode === 'avg') {
      if (key === 'gp') return String(p.gp)
      // % 지표는 ×5 환산 미적용 (MAX 100%)
      if (key === 'fg_pct')  return p.fga  > 0 ? `${p.fg_pct}%`  : '—'
      if (key === 'fg3_pct') return p.fg3a > 0 ? `${p.fg3_pct}%` : '—'
      if (key === 'ft_pct')  return p.fta  > 0 ? `${p.ft_pct}%`  : '—'
      if (key === 'efg_pct') return p.fga  > 0 ? `${p.efg_pct}%` : '—'
      return String(avg(p, key as keyof PlayerStat))
    } else {
      if (key === 'fg_pct')  return p.fga  > 0 ? `${p.fg_pct}%`  : '—'
      if (key === 'fg3_pct') return p.fg3a > 0 ? `${p.fg3_pct}%` : '—'
      if (key === 'ft_pct')  return p.fta  > 0 ? `${p.ft_pct}%`  : '—'
      if (key === 'efg_pct') return p.fga  > 0 ? `${p.efg_pct}%` : '—'
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
            className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer btn-press ${
              selectedQuarterId === 'all' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}>전체</button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQuarterId(q.id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer btn-press ${
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
          <Trophy size={32} className="mx-auto mb-3 text-gray-500" />
          <p>아직 완료된 경기 데이터가 없습니다</p>
          <p className="text-xs mt-1 text-gray-600">경기를 기록하고 완료 처리하면 스탯이 집계됩니다</p>
        </div>
      ) : (
        <>
          {/* 차트 필터 칩 */}
          <div className="flex gap-1.5 flex-wrap">
            {CHART_STATS.map(s => (
              <button key={s.key}
                onClick={() => setSelectedChartStat(s.key)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                  selectedChartStat === s.key
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}>{s.label}</button>
            ))}
          </div>

          {/* 차트 섹션 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(() => {
              const cur = CHART_STATS.find(s => s.key === selectedChartStat)!
              return (
                <TopScorersChart
                  players={players.filter(p => p.gp >= minGP)}
                  statKey={cur.key}
                  statLabel={cur.label}
                  statUnit={cur.unit}
                />
              )
            })()}
            {selectedQuarterId !== 'all' && (() => {
              // 팀 FG% 비교 — quarter players의 team_id로 그룹핑은 복잡하므로 간단히 선수 fg% top 8로 대체
              const fgData = [...players]
                .filter(p => p.gp >= minGP && p.fga >= 5)
                .sort((a, b) => b.fg_pct - a.fg_pct)
                .slice(0, 8)
                .map(p => ({ name: p.name, fg_pct: p.fg_pct }))
              return (
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">FG% Top 8</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={fgData} layout="vertical" margin={{ left: 8, right: 24, top: 0, bottom: 0 }}>
                      <XAxis type="number" domain={[0,'auto']} tick={{fill:'#6b7280',fontSize:10}} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{fill:'#d1d5db',fontSize:11,fontWeight:600}} axisLine={false} tickLine={false} width={48} />
                      <Tooltip
                        contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:8,fontSize:12}}
                        formatter={(v) => [`${Number(v).toFixed(1)}%`]}
                        labelStyle={{color:'#f9fafb',fontWeight:600}}
                      />
                      <Bar dataKey="fg_pct" fill="#10b981" radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            })()}
          </div>

          {/* 비교하기 버튼 */}
          {compareIds.size > 0 && (
            <div className="flex items-center gap-2 bg-blue-950/40 border border-blue-800/40 rounded-xl px-3 py-2">
              <span className="text-xs text-blue-300 font-bold">선택: {compareList.map(id => compareNamesById[id]).filter(Boolean).join(' vs ')}</span>
              <button
                onClick={() => setCompareModalOpen(true)}
                disabled={compareIds.size !== 2}
                className="ml-auto px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                비교하기 ({compareIds.size}/2)
              </button>
              <button
                onClick={() => setCompareIds(new Set())}
                className="px-2 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer transition-colors"
              >
                초기화
              </button>
            </div>
          )}

          {/* 리더보드 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {([
              { key: 'ppg'     as SortKey, label: '득점왕',      unit: 'PPG',  pct: false },
              { key: 'rpg'     as SortKey, label: '리바운드왕',  unit: 'RPG',  pct: false },
              { key: 'apg'     as SortKey, label: '어시스트왕',  unit: 'APG',  pct: false },
              { key: 'spg'     as SortKey, label: '스틸왕',      unit: 'SPG',  pct: false },
              { key: 'bpg'     as SortKey, label: '블락왕',      unit: 'BPG',  pct: false },
              { key: 'fg_pct'  as SortKey, label: '야투율 1위',  unit: 'FG%',  pct: true  },
              { key: 'fg3_pct' as SortKey, label: '3점% 1위',   unit: '3P%',  pct: true  },
            ] as { key: SortKey; label: string; unit: string; pct: boolean }[]).map(({ key, label, unit, pct }) => {
              // % 지표는 fga/fg3a > 0인 선수만 집계
              const pool = pct
                ? players.filter(p => p.gp >= minGP && (key === 'fg3_pct' ? p.fg3a > 0 : p.fga > 0))
                : players.filter(p => p.gp >= minGP)
              const leaders = [...pool].sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 3)
              const top = leaders[0]
              if (!top) return null
              const fmt = (p: PlayerStat) => pct ? `${(p[key] as number)}%` : String(p[key] as number)
              return (
                <div key={key} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 card-lift">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Trophy size={13} className="text-yellow-400" />
                    <p className="text-xs text-gray-400 font-medium">{label}</p>
                  </div>
                  <button onClick={() => setQuickViewPlayer({ id: top.player_id, name: top.name })}
                    className="text-xl font-black text-white truncate hover:text-blue-300 transition-colors cursor-pointer text-left w-full hover:underline underline-offset-2">
                    {top.name}
                  </button>
                  <p className="text-3xl font-black text-yellow-400">{fmt(top)}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{unit} · {top.gp}경기</p>
                  {leaders.slice(1).map((p, i) => (
                    <div key={p.player_id} className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-800">
                      <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                        className="text-xs text-gray-500 hover:text-blue-300 cursor-pointer transition-colors hover:underline underline-offset-1">
                        {i + 2}위 {p.name}
                      </button>
                      <span className="text-xs font-bold text-gray-400">{fmt(p)}</span>
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
                      className={`px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors btn-press ${viewMode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {m === 'avg' ? '평균' : '누적'}
                    </button>
                  ))}
                </div>
                {/* x5 환산 (평균 모드만) */}
                {viewMode === 'avg' && (
                  <button onClick={() => setProjection(v => !v)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border cursor-pointer transition-all btn-press ${
                      projection ? 'bg-amber-600/30 border-amber-500/60 text-amber-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                    }`}>
                    ×5 환산
                  </button>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span>최소</span>
                  <input type="number" min={1} max={20} value={minGP}
                    onChange={e => setMinGP(Number(e.target.value))}
                    className="w-12 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-1.5 text-center text-xs" />
                  <span>경기</span>
                </div>
              </div>
            </div>

            {/* 모바일 정렬 칩 (md 미만) */}
            <div className="md:hidden border-b border-gray-800 px-3 py-2.5 overflow-x-auto">
              <div className="flex gap-1.5 whitespace-nowrap">
                {COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleSort(key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                      sortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}>
                    {label}
                    {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* 모바일 카드뷰 (md 미만) */}
            <div className="md:hidden divide-y divide-gray-800/60">
              {filtered.map((p, i) => {
                const sortLabel = COLS.find(c => c.key === sortKey)?.label ?? ''
                const sortVal = cellVal(p, sortKey)
                // 부수 지표 4개 (현재 sort key가 아닌 것 중 앞 4개)
                const subCols = COLS.filter(c => c.key !== sortKey).slice(0, 4)
                const rankBorder = i === 0 ? 'border-l-2 border-l-yellow-500/60' : i === 1 ? 'border-l-2 border-l-gray-400/40' : i === 2 ? 'border-l-2 border-l-orange-500/40' : ''
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60 ${rankBorder}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-base font-black font-mono w-6 shrink-0 ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-500':'text-gray-500'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm truncate">{p.name}</div>
                        <div className="text-gray-600 text-xs">{p.position ?? '—'}{p.number ? ` · #${p.number}` : ''} · GP {p.gp}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-3xl font-black text-yellow-400 leading-none">{sortVal}</div>
                        <div className="text-[11px] text-gray-500 font-bold mt-0.5">{sortLabel}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-800/60">
                      {subCols.map(({ key, label }) => (
                        <div key={key} className="text-center">
                          <div className="text-xs text-gray-500">{label}</div>
                          <div className="text-sm font-bold text-gray-200">{cellVal(p, key)}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* 데스크탑 테이블 (md 이상) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="py-2 pl-2 pr-1 text-xs text-gray-600 font-bold text-right w-8">#</th>
                    <th className="px-2 py-3 text-center text-xs text-gray-600 w-8">비교</th>
                    <th className="text-left px-4 py-3 sticky left-0 bg-gray-900 text-sm text-gray-500 font-bold min-w-[130px]">선수</th>
                    {COLS.map(({ key, label }) => (
                      <th key={key} onClick={() => handleSort(key)}
                        className={`px-3 py-3 text-center text-sm font-bold cursor-pointer select-none whitespace-nowrap transition-colors hover:text-gray-200 ${sortKey === key ? 'text-blue-400' : 'text-gray-500'}`}>
                        {label}
                        {sortKey === key
                          ? (sortDir === 'desc' ? <ChevronDown size={10} className="inline ml-0.5" /> : <ChevronUp size={10} className="inline ml-0.5" />)
                          : <ChevronsUpDown size={10} className="inline ml-0.5 opacity-30" />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.player_id}
                      className={`border-b border-gray-800/50 ${
                        i === 0 ? 'bg-yellow-400/3 hover:bg-yellow-400/5' :
                        i === 1 ? 'hover:bg-gray-800/30' :
                        i === 2 ? 'bg-orange-400/3 hover:bg-orange-400/5' :
                        i % 2 === 0 ? 'hover:bg-gray-800/30' : 'bg-gray-900/50 hover:bg-gray-800/30'
                      } transition-colors`}>
                      <td className={`py-2 pl-2 pr-1 text-right font-black text-sm ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-600':'text-gray-600'}`}>
                        {i+1}
                      </td>
                      <td className="px-2 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={compareIds.has(p.player_id)}
                          disabled={!compareIds.has(p.player_id) && compareIds.size >= 2}
                          onChange={() => toggleCompare(p)}
                          aria-label={`${p.name} 비교 선택`}
                          className="cursor-pointer accent-blue-500 w-4 h-4 disabled:cursor-not-allowed disabled:opacity-30"
                        />
                      </td>
                      <td className="px-4 py-3 sticky left-0 bg-inherit">
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold text-white hover:text-blue-300 transition-colors cursor-pointer text-left hover:underline underline-offset-1 truncate max-w-[120px] block text-base">
                          {p.name}
                        </button>
                        <div className="text-gray-600 text-xs">{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      {COLS.map(({ key }) => (
                        <td key={key} className={`px-3 py-3 text-center text-sm tabular-nums font-medium ${sortKey === key ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
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

      {compareModalOpen && compareList.length === 2 && (
        <PlayerCompareModal
          leagueId={leagueId}
          player1Id={compareList[0]}
          player2Id={compareList[1]}
          player1Name={compareNamesById[compareList[0]] ?? ''}
          player2Name={compareNamesById[compareList[1]] ?? ''}
          onClose={() => setCompareModalOpen(false)}
        />
      )}
    </div>
  )
}
