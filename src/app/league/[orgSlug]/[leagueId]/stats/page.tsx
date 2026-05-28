'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Trophy, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import PlayerCompareModal from '@/components/league/PlayerCompareModal'
import LeagueDuoPanel from '@/components/league/LeagueDuoPanel'
import { PercentBar } from '@/components/league/StatCell'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
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
  // 이름 길이에 따라 YAxis 폭 조정 (이름 잘림 방지)
  const maxNameLen = top5.reduce((m, p) => Math.max(m, p.name.length), 0)
  const yAxisWidth = Math.max(56, Math.min(120, maxNameLen * 14 + 8))
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">{statLabel} TOP 5</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={top5} layout="vertical" margin={{ left: 0, right: 48, top: 4, bottom: 0 }}>
          <XAxis type="number" domain={[0,'auto']} tick={{fill:'#6b7280',fontSize:10}} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={{fill:'#d1d5db',fontSize:11,fontWeight:600}} axisLine={false} tickLine={false} width={yAxisWidth} interval={0} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
            contentStyle={{background:'#1f2937',border:'1px solid #374151',borderRadius:8,fontSize:12}}
            formatter={(v) => [`${Number(v).toFixed(1)}${isPct ? '%' : ''} ${statUnit}`]}
            labelStyle={{color:'#f9fafb',fontWeight:600}}
            itemStyle={{color:'#f9fafb'}}
          />
          <Bar dataKey={statKey} radius={[0,4,4,0]}>
            {top5.map((_,i) => <Cell key={i} fill={i===0?'#f59e0b':i===1?'#9ca3af':i===2?'#b45309': barColor} fillOpacity={i<3?1:0.7} />)}
            <LabelList
              dataKey={statKey}
              position="right"
              formatter={(v: unknown) => `${Number(v).toFixed(1)}${isPct ? '%' : ''}`}
              style={{ fill: '#f9fafb', fontSize: 12, fontWeight: 700 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

type ViewMode = 'avg' | 'total'
type SortKey = 'ppg'|'rpg'|'orp'|'drp'|'apg'|'spg'|'bpg'|'topg'|'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'|'gp'|'pts'|'reb'|'oreb'|'dreb'|'ast'|'stl'|'blk'|'tov'|'fgm'|'fg3m'|'ftm'
type AdvKey = 'at_ratio'|'ast_pct'|'tov_pct'|'a1_total'|'a1_rate'|'orb_pct'|'drb_pct'|'trb_pct'
type ShootingKey = 'fg_pct'|'fg2_pct'|'fg3_pct'|'efg_pct'|'ft_pct'|'ts_pct'|'ft_rate'|'ds_pct'|'lu_pct'|'md_pct'|'three_share'
type StatMode = 'basic'|'shooting'|'advanced'

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
  const [statMode, setStatMode] = useState<StatMode>('basic')
  const [advSortKey, setAdvSortKey] = useState<AdvKey>('at_ratio')
  const [advSortDir, setAdvSortDir] = useState<'asc'|'desc'>('desc')
  const [shootSortKey, setShootSortKey] = useState<ShootingKey>('efg_pct')
  const [shootSortDir, setShootSortDir] = useState<'asc'|'desc'>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  const [projection, setProjection] = useState(false)  // ×5 환산
  const [quickViewPlayer, setQuickViewPlayer] = useState<{ id: string; name: string } | null>(null)
  const [minGP, setMinGP] = useState(1)
  const [showAll, setShowAll] = useState(false)  // 자동 임계값(2/3) 무시하고 전체 표시
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [selectedChartStat, setSelectedChartStat] = useState<ChartStatKey>('ppg')
  const [statUnit, setStatUnit] = useState<'round'|'game'>('round')

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
      ? `/api/leagues/${leagueId}/stats?unit=${statUnit}`
      : `/api/leagues/${leagueId}/stats?quarterId=${selectedQuarterId}&unit=${statUnit}`

    fetch(url)
      .then(r => r.json())
      .then(d => { setPlayers(d.players ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leagueId, selectedQuarterId, statUnit])

  // round 모드일 때 ×5 환산 비활성 → 자동 해제
  useEffect(() => {
    if (statUnit === 'round' && projection) setProjection(false)
  }, [statUnit, projection])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // 자동 임계값: 가장 많이 뛴 선수의 GP 기준 2/3 (리그 활동량 G의 2/3 근사)
  // 리더보드/차트의 최소 출전 기준 — 사용자 수동 입력보다 큰 값이 적용됨
  // showAll=true 면 자동 임계값을 무시하고 사용자 입력만 사용 (전체 선수 보기)
  const maxPlayerGP = useMemo(() => players.reduce((m, p) => Math.max(m, p.gp), 0), [players])
  const autoMinGP = Math.max(1, Math.ceil(maxPlayerGP * 2 / 3))
  const effectiveMinGP = showAll ? minGP : Math.max(minGP, autoMinGP)

  const filtered = players
    .filter(p => p.gp >= effectiveMinGP)
    .sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'desc' ? -diff : diff
    })

  const top3 = (key: SortKey) =>
    [...players].filter(p => p.gp >= effectiveMinGP).sort((a, b) => (b[key] as number) - (a[key] as number)).slice(0, 3)

  // 평균 컬럼 (×5 환산 포함)
  const MULT = (projection && viewMode === 'avg') ? 5 : 1
  function avg(p: PlayerStat, key: keyof PlayerStat) {
    return +((p[key] as number) * MULT).toFixed(1)
  }

  // 테이블 컬럼 정의
  const AVG_COLS: { key: SortKey; label: string }[] = [
    { key: 'gp', label: 'R' }, { key: 'ppg', label: 'PPG' },
    { key: 'rpg', label: 'RPG' }, { key: 'orp', label: 'ORpg' }, { key: 'drp', label: 'DRpg' },
    { key: 'apg', label: 'APG' }, { key: 'spg', label: 'SPG' }, { key: 'bpg', label: 'BPG' },
    { key: 'topg', label: 'TOPG' }, { key: 'fg_pct', label: 'FG%' }, { key: 'fg3_pct', label: '3P%' },
    { key: 'ft_pct', label: 'FT%' }, { key: 'efg_pct', label: 'eFG%' },
  ]
  const TOTAL_COLS: { key: SortKey; label: string }[] = [
    { key: 'gp', label: 'R' }, { key: 'pts', label: 'PTS' },
    { key: 'reb', label: 'REB' }, { key: 'oreb', label: 'OR' }, { key: 'dreb', label: 'DR' },
    { key: 'ast', label: 'AST' }, { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' },
    { key: 'tov', label: 'TOV' },
    { key: 'fgm', label: 'FG' }, { key: 'fg3m', label: '3P' }, { key: 'ftm', label: 'FT' },
    { key: 'fg_pct', label: 'FG%' }, { key: 'fg3_pct', label: '3P%' }, { key: 'ft_pct', label: 'FT%' },
  ]

  // Shooting stats 컬럼 — 슈팅 정확도 + 야투 분포
  const SHOOTING_COLS: { key: ShootingKey; label: string; desc: string; barColor: string }[] = [
    { key: 'fg_pct',      label: 'FG%',   desc: '전체 야투 성공률 · FGM/FGA',                          barColor: '#34d399' },
    { key: 'fg2_pct',     label: '2P%',   desc: '2점 야투 성공률 · (FGM-3PM)/(FGA-3PA)',               barColor: '#fb923c' },
    { key: 'fg3_pct',     label: '3P%',   desc: '3점 야투 성공률 · 3PM/3PA',                            barColor: '#eab308' },
    { key: 'efg_pct',     label: 'eFG%',  desc: '유효야투율 · (FGM+0.5×3PM)/FGA',                       barColor: '#14b8a6' },
    { key: 'ft_pct',      label: 'FT%',   desc: '자유투 성공률 · FTM/FTA',                              barColor: '#06b6d4' },
    { key: 'ts_pct',      label: 'TS%',   desc: '진실야투율 · PTS/(2×(FGA+0.44×FTA))',                  barColor: '#2dd4bf' },
    { key: 'ft_rate',     label: 'FTr',   desc: '야투 대비 자유투 시도 · FTA/FGA',                       barColor: '#0891b2' },
    { key: 'ds_pct',      label: 'DS',    desc: '골밑슛 비중 · 골밑슛시도/전체야투시도',                  barColor: '#ef4444' },
    { key: 'lu_pct',      label: 'LU',    desc: '레이업 비중 · (레이업+드라이브) 시도/전체야투시도',     barColor: '#f97316' },
    { key: 'md_pct',      label: 'MD',    desc: '미드레인지 비중 · 미들시도/전체야투시도',               barColor: '#eab308' },
    { key: 'three_share', label: '3P',    desc: '3점 비중 · 3PA/FGA',                                   barColor: '#3b82f6' },
  ]

  // Advanced stats 컬럼 (Shooting 제외 — 효율/볼소유/리바운드 비중)
  const ADV_COLS: { key: AdvKey; label: string; desc: string }[] = [
    { key: 'at_ratio',  label: 'A/T',   desc: '어시스트/턴오버 비율' },
    { key: 'ast_pct',   label: 'AST%',  desc: '볼소유 중 어시스트 비중' },
    { key: 'tov_pct',   label: 'TOV%',  desc: '볼소유 중 턴오버 비중' },
    { key: 'a1_total',  label: 'A1',    desc: '성공한 앤드원(And-One) 횟수 (누적)' },
    { key: 'a1_rate',   label: 'A1%',   desc: '야투 성공 중 앤드원 비율 · A1/FGM' },
    { key: 'orb_pct',   label: 'ORB%',  desc: '본인 리바운드 중 공격 리바운드 비중 · OREB/REB' },
    { key: 'drb_pct',   label: 'DRB%',  desc: '본인 리바운드 중 수비 리바운드 비중 · DREB/REB' },
    { key: 'trb_pct',   label: 'TRB%',  desc: '본인 출전 경기에서 팀 리바운드 대비 본인 비중 · REB/팀 REB' },
  ]

  function calcAdv(p: PlayerStat): Record<AdvKey, number> {
    const poss = p.fga + 0.44 * p.fta + p.tov
    const a1 = p.and_one ?? 0
    const teamReb = p.team_reb_in_games ?? 0
    return {
      at_ratio:  p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : (p.ast > 0 ? 99 : 0),
      ast_pct:   (poss + p.ast) > 0 ? +(p.ast / (poss + p.ast) * 100).toFixed(1) : 0,
      tov_pct:   poss > 0 ? +(p.tov / poss * 100).toFixed(1) : 0,
      a1_total:  a1,
      a1_rate:   p.fgm > 0 ? +(a1 / p.fgm * 100).toFixed(1) : 0,
      orb_pct:   p.reb > 0 ? +(p.oreb / p.reb * 100).toFixed(1) : 0,
      drb_pct:   p.reb > 0 ? +(p.dreb / p.reb * 100).toFixed(1) : 0,
      trb_pct:   teamReb > 0 ? +(p.reb / teamReb * 100).toFixed(1) : 0,
    }
  }

  function calcShoot(p: PlayerStat): Record<ShootingKey, number> {
    return {
      fg_pct:      p.fg_pct ?? 0,
      fg2_pct:     p.fg2_pct ?? 0,
      fg3_pct:     p.fg3_pct ?? 0,
      efg_pct:     p.efg_pct ?? 0,
      ft_pct:      p.ft_pct ?? 0,
      ts_pct:      (p.fga + 0.44 * p.fta) > 0 ? +(p.pts / (2 * (p.fga + 0.44 * p.fta)) * 100).toFixed(1) : 0,
      ft_rate:     p.fga > 0 ? +(p.fta / p.fga * 100).toFixed(1) : 0,
      ds_pct:      p.fga > 0 ? +((p.ds_a ?? 0) / p.fga * 100).toFixed(1) : 0,
      lu_pct:      p.fga > 0 ? +((p.lu_a ?? 0) / p.fga * 100).toFixed(1) : 0,
      md_pct:      p.fga > 0 ? +((p.md_a ?? 0) / p.fga * 100).toFixed(1) : 0,
      three_share: p.fga > 0 ? +(p.fg3a / p.fga * 100).toFixed(1) : 0,
    }
  }

  // Advanced 정렬된 리스트
  const filteredAdv = [...filtered]
    .map(p => ({ p, adv: calcAdv(p) }))
    .sort((a, b) => {
      const diff = a.adv[advSortKey] - b.adv[advSortKey]
      return advSortDir === 'desc' ? -diff : diff
    })

  // Shooting 정렬된 리스트
  const filteredShoot = [...filtered]
    .map(p => ({ p, sh: calcShoot(p) }))
    .sort((a, b) => {
      const diff = a.sh[shootSortKey] - b.sh[shootSortKey]
      return shootSortDir === 'desc' ? -diff : diff
    })

  function handleAdvSort(key: AdvKey) {
    if (key === advSortKey) setAdvSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setAdvSortKey(key); setAdvSortDir('desc') }
  }
  function handleShootSort(key: ShootingKey) {
    if (key === shootSortKey) setShootSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setShootSortKey(key); setShootSortDir('desc') }
  }

  const COLS = viewMode === 'avg' ? AVG_COLS : TOTAL_COLS

  const PCT_KEYS = new Set<SortKey>(['fg_pct', 'fg3_pct', 'ft_pct', 'efg_pct'])

  function cellVal(p: PlayerStat, key: SortKey): string {
    if (viewMode === 'avg') {
      if (key === 'gp') return String(p.gp)
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
      // 누적 뷰: 야투는 메이드/시도 형식
      if (key === 'fgm')  return `${p.fgm}/${p.fga}`
      if (key === 'fg3m') return `${p.fg3m}/${p.fg3a}`
      if (key === 'ftm')  return `${p.ftm}/${p.fta}`
      return String((p as unknown as Record<string, number>)[key] ?? 0)
    }
  }

  return (
    <div className="space-y-5">
      {/* 헤더 + 필터 — 모바일 2줄 / PC 가로 정렬 */}
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-white">리그 스탯</h2>
        {/* 1줄: 분기 선택 */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button onClick={() => setSelectedQuarterId('all')}
            className={`shrink-0 px-3 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer btn-press min-h-[44px] ${
              selectedQuarterId === 'all' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}>전체</button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQuarterId(q.id)}
              className={`shrink-0 px-3 py-2 rounded-xl text-sm font-bold border transition-all cursor-pointer btn-press min-h-[44px] ${
                selectedQuarterId === q.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}>
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
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
                  players={players.filter(p => p.gp >= effectiveMinGP)}
                  statKey={cur.key}
                  statLabel={cur.label}
                  statUnit={cur.unit}
                />
              )
            })()}
            {selectedQuarterId !== 'all' && (() => {
              // FG% TOP 8 — minGP / 최소 5개 시도
              const fgData = [...players]
                .filter(p => p.gp >= effectiveMinGP && p.fga >= 5)
                .sort((a, b) => b.fg_pct - a.fg_pct)
                .slice(0, 8)
                .map(p => ({ name: p.name, fg_pct: p.fg_pct }))
              // 가장 긴 이름 길이에 비례한 YAxis 폭 (한글 1자 ≈ 12-14px @ 11px bold)
              const maxNameLen = fgData.reduce((m, d) => Math.max(m, d.name.length), 0)
              const yAxisWidth = Math.max(72, Math.min(140, maxNameLen * 14 + 12))
              return (
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">FG% Top 8</p>
                  <ResponsiveContainer width="100%" height={Math.max(160, fgData.length * 22)}>
                    <BarChart data={fgData} layout="vertical" margin={{ left: 0, right: 32, top: 0, bottom: 0 }}>
                      <XAxis type="number" domain={[0,'auto']} tick={{fill:'#6b7280',fontSize:10}} axisLine={false} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{fill:'#d1d5db',fontSize:11,fontWeight:600}}
                        axisLine={false}
                        tickLine={false}
                        width={yAxisWidth}
                        interval={0}
                      />
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
                ? players.filter(p => p.gp >= effectiveMinGP && (key === 'fg3_pct' ? p.fg3a > 0 : p.fga > 0))
                : players.filter(p => p.gp >= effectiveMinGP)
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
                  <p className="text-xs text-gray-600 mt-0.5">{unit} · {top.gp}R</p>
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

          {/* 듀오 분석: 어시스트 관계 + 스틸-턴오버 관계 */}
          <LeagueDuoPanel leagueId={leagueId} quarterId={selectedQuarterId} />

          {/* 전체 스탯 테이블 */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            {/* 테이블 컨트롤 — 모바일 2줄 / PC 1줄 */}
            <div className="px-4 py-3 border-b border-gray-800 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <TrendingUp size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-white">전체 스탯</span>
              </div>
              {/* 컨트롤 그룹 — 모바일에서 스크롤 가능한 가로 행 */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide sm:ml-auto sm:flex-wrap">
                {/* Basic / Shooting / Advanced 토글 */}
                <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
                  {([
                    { k: 'basic'    as StatMode, label: 'Basic' },
                    { k: 'shooting' as StatMode, label: 'Shooting' },
                    { k: 'advanced' as StatMode, label: 'Advanced' },
                  ]).map(({ k, label }) => (
                    <button key={k} onClick={() => setStatMode(k)}
                      className={`px-3 py-2 text-xs font-bold cursor-pointer transition-colors btn-press min-h-[40px] ${statMode === k ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {/* 누적/평균 토글 (Basic 모드에서만 의미 있음) */}
                <div className={`flex rounded-lg overflow-hidden border border-gray-700 shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`}>
                  {(['avg','total'] as ViewMode[]).map(m => (
                    <button key={m} onClick={() => { setViewMode(m); if (m === 'total') setProjection(false) }}
                      className={`px-3 py-2 text-xs font-bold cursor-pointer transition-colors btn-press min-h-[40px] ${viewMode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                      {m === 'avg' ? '평균' : '누적'}
                    </button>
                  ))}
                </div>
                {/* 단위 토글 (라운드/GP) */}
                <div className="flex items-center gap-1 bg-gray-800/60 rounded-lg p-0.5 shrink-0">
                  {(['round','game'] as const).map(u => (
                    <button key={u} onClick={() => setStatUnit(u)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md cursor-pointer transition-colors ${
                        statUnit === u ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
                      }`}>
                      {u === 'round' ? 'R' : 'G'}
                    </button>
                  ))}
                </div>
                {/* x5 환산 */}
                {viewMode === 'avg' && (
                  <button onClick={() => setProjection(v => !v)} disabled={statUnit === 'round'}
                    className={`shrink-0 px-3 py-2 text-xs font-bold rounded-lg border transition-all btn-press min-h-[40px] ${
                      statUnit === 'round'
                        ? 'bg-gray-800 border-gray-700 text-gray-400 opacity-30 cursor-not-allowed'
                        : projection
                          ? 'bg-amber-600/30 border-amber-500/60 text-amber-300 cursor-pointer'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white cursor-pointer'
                    }`}>
                    ×5 환산
                  </button>
                )}
                <div className="flex items-center gap-1 text-xs text-gray-500 shrink-0" title={`자동 임계값 ${autoMinGP}경기 (리그 최다 출전 ${maxPlayerGP}경기의 2/3)`}>
                  <span>최소</span>
                  <input type="number" min={1} max={200} value={minGP}
                    onChange={e => setMinGP(Number(e.target.value))}
                    className="w-14 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-2 text-center text-xs min-h-[40px]" />
                  <span>경기</span>
                  {!showAll && effectiveMinGP > minGP && (
                    <span className="text-[10px] text-amber-400 font-bold ml-1">→ {effectiveMinGP} 적용 (G·2/3)</span>
                  )}
                </div>
                <button onClick={() => setShowAll(v => !v)}
                  title="활동량 임계값(2/3) 무시하고 전체 선수 표시"
                  className={`shrink-0 px-3 py-2 text-xs font-bold rounded-lg border transition-all btn-press min-h-[40px] cursor-pointer ${
                    showAll
                      ? 'bg-emerald-600/30 border-emerald-500/60 text-emerald-300'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                  }`}>
                  전체 선수
                </button>
              </div>
            </div>

            {statMode === 'basic' ? (<>
            {/* Basic — 모바일 정렬 칩 */}
            <div className="md:hidden border-b border-gray-800 px-3 py-2.5 overflow-x-auto">
              <div className="flex gap-1.5 whitespace-nowrap">
                {COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleSort(key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                      sortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}>
                    {key === 'gp' ? (statUnit === 'round' ? 'R' : 'G') : label}
                    {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* Basic — 모바일 카드뷰 */}
            <div className="md:hidden divide-y divide-gray-800/60">
              {filtered.map((p, i) => {
                const sortLabel = sortKey === 'gp'
                  ? (statUnit === 'round' ? 'R' : 'G')
                  : (COLS.find(c => c.key === sortKey)?.label ?? '')
                const sortVal = cellVal(p, sortKey)
                const subCols = COLS.filter(c => c.key !== sortKey).slice(0, 4)
                const rankBorder = i === 0 ? 'border-l-2 border-l-yellow-500/60' : i === 1 ? 'border-l-2 border-l-gray-400/40' : i === 2 ? 'border-l-2 border-l-orange-500/40' : ''
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60 ${rankBorder}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-base font-black font-mono w-6 shrink-0 ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-500':'text-gray-500'}`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm truncate">{p.name}</div>
                        <div className="text-gray-600 text-xs">{p.position ?? '—'}{p.number ? ` · #${p.number}` : ''} · {p.gp}{statUnit === 'round' ? 'R' : 'G'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-3xl font-black text-yellow-400 leading-none">{sortVal}</div>
                        <div className="text-[11px] text-gray-500 font-bold mt-0.5">{sortLabel}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-gray-800/60">
                      {subCols.map(({ key, label }) => (
                        <div key={key} className="text-center">
                          <div className="text-xs text-gray-500">{key === 'gp' ? (statUnit === 'round' ? 'R' : 'G') : label}</div>
                          <div className="text-sm font-bold text-gray-200">{cellVal(p, key)}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Basic — 데스크탑 테이블 */}
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
                        {key === 'gp' ? (statUnit === 'round' ? 'R' : 'G') : label}
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
                      <td className={`py-2 pl-2 pr-1 text-right font-black text-sm ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-600':'text-gray-600'}`}>{i+1}</td>
                      <td className="px-2 py-3 text-center">
                        <input type="checkbox" checked={compareIds.has(p.player_id)}
                          disabled={!compareIds.has(p.player_id) && compareIds.size >= 2}
                          onChange={() => toggleCompare(p)} aria-label={`${p.name} 비교 선택`}
                          className="cursor-pointer accent-blue-500 w-4 h-4 disabled:cursor-not-allowed disabled:opacity-30" />
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
            </>) : statMode === 'shooting' ? (<>
            {/* Shooting — 모바일 정렬 칩 */}
            <div className="md:hidden border-b border-gray-800 px-3 py-2.5 overflow-x-auto">
              <div className="flex gap-1.5 whitespace-nowrap">
                {SHOOTING_COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleShootSort(key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                      shootSortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}>
                    {label}{shootSortKey === key && (shootSortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* Shooting — 모바일 카드뷰 */}
            <div className="md:hidden divide-y divide-gray-800/60">
              {filteredShoot.map(({ p, sh }, i) => {
                const rankBorder = i === 0 ? 'border-l-2 border-l-yellow-500/60' : i === 1 ? 'border-l-2 border-l-gray-400/40' : i === 2 ? 'border-l-2 border-l-orange-500/40' : ''
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60 ${rankBorder}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-black font-mono w-5 shrink-0 ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-500':'text-gray-500'}`}>{i+1}</span>
                      <span className="font-bold text-white text-sm">{p.name}</span>
                      <span className="text-gray-600 text-xs ml-auto">{p.gp}{statUnit === 'round' ? 'R' : 'G'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-gray-800/60">
                      {SHOOTING_COLS.slice(0, 8).map(({ key, label }) => {
                        const active = shootSortKey === key
                        return (
                          <div key={key} className="text-center">
                            <div className={`text-[10px] font-bold ${active ? 'text-blue-400' : 'text-gray-500'}`}>{label}</div>
                            <div className={`text-sm font-bold ${active ? 'text-yellow-400' : 'text-blue-300'}`}>{sh[key]}%</div>
                          </div>
                        )
                      })}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Shooting — 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="py-2 pl-2 pr-1 text-xs text-gray-600 font-bold text-right w-8">#</th>
                    <th className="text-left px-4 py-3 sticky left-0 bg-gray-900 text-sm text-gray-500 font-bold min-w-[130px]">선수</th>
                    <th className="px-3 py-3 text-center text-xs text-gray-500 font-bold">{statUnit === 'round' ? 'R' : 'G'}</th>
                    {SHOOTING_COLS.map(({ key, label, desc }, idx) => {
                      // 구분선: 슈팅 효율(0-6) | 야투 분포(7-10)
                      const divider = idx === 7 ? 'border-l border-gray-800' : ''
                      return (
                        <th key={key} onClick={() => handleShootSort(key)} title={desc}
                          className={`px-3 py-3 text-center text-xs font-bold whitespace-nowrap cursor-pointer select-none transition-colors ${divider} ${shootSortKey === key ? 'text-yellow-400' : 'text-blue-400 hover:text-blue-200'}`}>
                          {label}
                          {shootSortKey === key
                            ? (shootSortDir === 'desc' ? <ChevronDown size={10} className="inline ml-0.5" /> : <ChevronUp size={10} className="inline ml-0.5" />)
                            : <ChevronsUpDown size={10} className="inline ml-0.5 opacity-30" />}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredShoot.map(({ p, sh }, i) => (
                    <tr key={p.player_id}
                      className={`border-b border-gray-800/50 ${
                        i === 0 ? 'bg-yellow-400/3 hover:bg-yellow-400/5' :
                        i === 2 ? 'bg-orange-400/3 hover:bg-orange-400/5' :
                        i % 2 === 0 ? 'hover:bg-gray-800/30' : 'bg-gray-900/50 hover:bg-gray-800/30'
                      } transition-colors`}>
                      <td className={`py-2 pl-2 pr-1 text-right font-black text-sm ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-600':'text-gray-600'}`}>{i+1}</td>
                      <td className="px-4 py-3 sticky left-0 bg-inherit">
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold text-white hover:text-blue-300 transition-colors cursor-pointer text-left hover:underline underline-offset-1 truncate max-w-[120px] block text-base">
                          {p.name}
                        </button>
                        <div className="text-gray-600 text-xs">{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-gray-500">{p.gp}</td>
                      {SHOOTING_COLS.map(({ key, barColor }, idx) => {
                        const val = sh[key]
                        const active = shootSortKey === key
                        const divider = idx === 7 ? 'border-l border-gray-800' : ''
                        // FTr 은 100% 넘을 수 있어 max=80(시각 척도용)으로 자름
                        const barMax = key === 'ft_rate' ? 80 : 100
                        return (
                          <td key={key} className={`relative px-3 py-3 text-center text-sm tabular-nums font-medium ${divider} ${active ? 'text-yellow-400 font-bold' : 'text-blue-300'}`}>
                            {val}%
                            <PercentBar value={val} max={barMax} color={barColor} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 지표 설명 범례 */}
              <div className="px-4 py-3 border-t border-gray-800 flex flex-wrap gap-x-4 gap-y-1">
                {SHOOTING_COLS.map(({ key, label, desc }) => (
                  <span key={key} className="text-[10px] text-gray-600">
                    <span className="font-bold text-gray-500">{label}</span> {desc}
                  </span>
                ))}
              </div>
            </div>
            </>) : (<>
            {/* Advanced — 모바일 정렬 칩 */}
            <div className="md:hidden border-b border-gray-800 px-3 py-2.5 overflow-x-auto">
              <div className="flex gap-1.5 whitespace-nowrap">
                {ADV_COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleAdvSort(key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                      advSortKey === key ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}>
                    {label}{advSortKey === key && (advSortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced — 모바일 카드뷰 */}
            <div className="md:hidden divide-y divide-gray-800/60">
              {filteredAdv.map(({ p, adv }, i) => {
                const rankBorder = i === 0 ? 'border-l-2 border-l-yellow-500/60' : i === 1 ? 'border-l-2 border-l-gray-400/40' : i === 2 ? 'border-l-2 border-l-orange-500/40' : ''
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60 ${rankBorder}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-sm font-black font-mono w-5 shrink-0 ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-500':'text-gray-500'}`}>{i+1}</span>
                      <span className="font-bold text-white text-sm">{p.name}</span>
                      <span className="text-gray-600 text-xs ml-auto">{p.gp}{statUnit === 'round' ? 'R' : 'G'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1 border-t border-gray-800/60">
                      {ADV_COLS.map(({ key, label }) => {
                        const isRatio = key === 'at_ratio'
                        const isCount = key === 'a1_total'
                        const active = advSortKey === key
                        return (
                          <div key={key} className="text-center">
                            <div className={`text-[10px] font-bold ${active ? 'text-violet-400' : 'text-gray-500'}`}>{label}</div>
                            <div className={`text-sm font-bold ${active ? 'text-yellow-400' : 'text-violet-300'}`}>{isRatio || isCount ? adv[key] : `${adv[key]}%`}</div>
                          </div>
                        )
                      })}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Advanced — 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="py-2 pl-2 pr-1 text-xs text-gray-600 font-bold text-right w-8">#</th>
                    <th className="text-left px-4 py-3 sticky left-0 bg-gray-900 text-sm text-gray-500 font-bold min-w-[130px]">선수</th>
                    <th className="px-3 py-3 text-center text-xs text-gray-500 font-bold">{statUnit === 'round' ? 'R' : 'G'}</th>
                    {ADV_COLS.map(({ key, label, desc }) => (
                      <th key={key} onClick={() => handleAdvSort(key)} title={desc}
                        className={`px-3 py-3 text-center text-xs font-bold whitespace-nowrap cursor-pointer select-none transition-colors ${advSortKey === key ? 'text-yellow-400' : 'text-violet-400 hover:text-violet-200'}`}>
                        {label}
                        {advSortKey === key
                          ? (advSortDir === 'desc' ? <ChevronDown size={10} className="inline ml-0.5" /> : <ChevronUp size={10} className="inline ml-0.5" />)
                          : <ChevronsUpDown size={10} className="inline ml-0.5 opacity-30" />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAdv.map(({ p, adv }, i) => (
                    <tr key={p.player_id}
                      className={`border-b border-gray-800/50 ${
                        i === 0 ? 'bg-yellow-400/3 hover:bg-yellow-400/5' :
                        i === 2 ? 'bg-orange-400/3 hover:bg-orange-400/5' :
                        i % 2 === 0 ? 'hover:bg-gray-800/30' : 'bg-gray-900/50 hover:bg-gray-800/30'
                      } transition-colors`}>
                      <td className={`py-2 pl-2 pr-1 text-right font-black text-sm ${i===0?'text-yellow-400':i===1?'text-gray-400':i===2?'text-orange-600':'text-gray-600'}`}>{i+1}</td>
                      <td className="px-4 py-3 sticky left-0 bg-inherit">
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold text-white hover:text-blue-300 transition-colors cursor-pointer text-left hover:underline underline-offset-1 truncate max-w-[120px] block text-base">
                          {p.name}
                        </button>
                        <div className="text-gray-600 text-xs">{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-gray-500">{p.gp}</td>
                      {ADV_COLS.map(({ key }) => {
                        const val = adv[key]
                        const isRatio = key === 'at_ratio'
                        const isCount = key === 'a1_total'
                        const active = advSortKey === key
                        return (
                          <td key={key} className={`px-3 py-3 text-center text-sm tabular-nums font-medium ${active ? 'text-yellow-400 font-bold' : 'text-violet-300'}`}>
                            {isRatio || isCount ? val : `${val}%`}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 지표 설명 범례 */}
              <div className="px-4 py-3 border-t border-gray-800 flex flex-wrap gap-x-4 gap-y-1">
                {ADV_COLS.map(({ key, label, desc }) => (
                  <span key={key} className="text-[10px] text-gray-600">
                    <span className="font-bold text-gray-500">{label}</span> {desc}
                  </span>
                ))}
              </div>
            </div>
            </>)}
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
