'use client'
import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'
import { Trophy, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import PlayerCompareModal from '@/components/league/PlayerCompareModal'
import LeagueDuoPanel from '@/components/league/LeagueDuoPanel'
import NbaSeasonHighs from '@/components/league/nba/NbaSeasonHighs'
import StatHeader from '@/components/league/StatHeader'
import { PercentBar } from '@/components/league/StatCell'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import type { Quarter, PlayerStat } from '@/types/league'

// Recharts (~90KB gz) 는 페이지 렌더 이후 lazy 로 로드 — 초기 번들 감량
// ssr:false 로 hydration 오류 방지
const TopScorersChart = dynamic(
  () => import('@/components/league/charts/LeagueStatsCharts').then(m => m.TopScorersChart),
  { ssr: false, loading: () => <div className="p-4" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', height: 232 }} /> },
)
const FGPctTop8Chart = dynamic(
  () => import('@/components/league/charts/LeagueStatsCharts').then(m => m.FGPctTop8Chart),
  { ssr: false, loading: () => <div className="p-4" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', height: 232 }} /> },
)

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

type ViewMode = 'avg' | 'total'
type StatUnit = 'round' | 'game' | 'per40'
type SortKey = 'ppg'|'rpg'|'orp'|'drp'|'apg'|'spg'|'bpg'|'topg'|'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'|'gp'|'pts'|'reb'|'oreb'|'dreb'|'ast'|'stl'|'blk'|'tov'|'fgm'|'fg3m'|'ftm'
type AdvKey = 'at_ratio'|'ast_pct'|'tov_pct'|'usg_pct'|'a1_total'|'a1_rate'|'orb_pct'|'drb_pct'|'trb_pct'
type ShootingKey = 'fg_pct'|'fg2_pct'|'fg3_pct'|'efg_pct'|'ft_pct'|'ts_pct'|'ft_rate'|'ds_pct'|'lu_pct'|'md_pct'|'three_share'
type StatMode = 'basic'|'shooting'|'advanced'|'seasonHigh'

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
  // 페이지 간 분기 선택 공유 (LeagueQuarterContext)
  const { selectedQuarterId, setSelectedQuarterId } = useLeagueQuarter()
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
  // Personal highs: 각 선수의 stat 별 최고 분기 — italic 표시용
  // 리그 전체 로드 후 캐시. 특정 분기 뷰에서 그 분기가 선수의 최고 분기면 italic.
  type PersonalHighKey = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fg_pct' | 'fg3_pct'
  type PersonalHigh = { value: number; quarterId: string; gp: number }
  const [personalHighs, setPersonalHighs] = useState<Record<string, Partial<Record<PersonalHighKey, PersonalHigh>>>>({})
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [selectedChartStat, setSelectedChartStat] = useState<ChartStatKey>('ppg')
  const [statUnit, setStatUnit] = useState<StatUnit>('round')

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
        // 사용자가 이전에 선택한 분기 (localStorage) 가 없을 때만 현재 분기로 자동 설정
        // selectedQuarterId 가 이미 'all' 이 아닌 값이면 context 로부터 복원된 것 → 유지
        if (selectedQuarterId === 'all') {
          const current = qs.find(q => q.is_current)
          if (current) setSelectedQuarterId(current.id)
        }
      })
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  useEffect(() => {
    setLoading(true)
    // Per-40 모드는 서버 집계 단위는 'game' 을 사용 (분수 계산은 클라이언트에서 minutes_played 로 수행)
    const serverUnit = statUnit === 'per40' ? 'game' : statUnit
    const url = selectedQuarterId === 'all'
      ? `/api/leagues/${leagueId}/stats?unit=${serverUnit}`
      : `/api/leagues/${leagueId}/stats?quarterId=${selectedQuarterId}&unit=${serverUnit}`

    fetch(url)
      .then(r => r.json())
      .then(d => { setPlayers(d.players ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leagueId, selectedQuarterId, statUnit])

  // round 또는 per40 모드일 때 ×5 환산 비활성 → 자동 해제
  useEffect(() => {
    if ((statUnit === 'round' || statUnit === 'per40') && projection) setProjection(false)
  }, [statUnit, projection])

  // Personal highs 페치 — 리그 진입 시 1회 로드 (분기 선택 변경과 무관)
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/personal-highs`)
      .then(r => r.json())
      .then(d => { setPersonalHighs(d.highs ?? {}) })
      .catch(() => setPersonalHighs({}))
  }, [leagueId])

  // 특정 분기 뷰에서 해당 셀이 그 선수의 최고 분기인지 판정
  // — 분기가 'all' 이면 italic 없음 (누적이라 personal-high 개념 무의미)
  // — statUnit === 'per40' 는 italic 미적용 (계산 방식 다름)
  const isPersonalHighCell = (playerId: string, statKey: string): boolean => {
    if (selectedQuarterId === 'all' || statUnit === 'per40') return false
    const mapping: Partial<Record<string, PersonalHighKey>> = {
      ppg: 'ppg', rpg: 'rpg', apg: 'apg', spg: 'spg', bpg: 'bpg',
      fg_pct: 'fg_pct', fg3_pct: 'fg3_pct',
    }
    const hk = mapping[statKey]
    if (!hk) return false
    const high = personalHighs[playerId]?.[hk]
    return Boolean(high && high.quarterId === selectedQuarterId)
  }

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

  // 평균 컬럼 (×5 환산 포함) — Per-40 모드는 별도 계산
  const MULT = (projection && viewMode === 'avg') ? 5 : 1
  const PER40_TARGET = 40
  function avg(p: PlayerStat, key: keyof PlayerStat) {
    if (statUnit === 'per40') {
      // Per-40 min: 카운팅 스탯을 총 분수로 나눈 뒤 40 곱
      const mins = p.minutes_played ?? 0
      if (mins <= 0) return 0
      // 누적 스탯만 per-40 대상 (percentage/rate 제외)
      const COUNTING = new Set<keyof PlayerStat>(['pts','reb','oreb','dreb','ast','stl','blk','tov','fgm','fga','fg3m','fg3a','ftm','fta'])
      const AVG_TO_TOTAL: Partial<Record<keyof PlayerStat, keyof PlayerStat>> = {
        ppg: 'pts', rpg: 'reb', orp: 'oreb', drp: 'dreb',
        apg: 'ast', spg: 'stl', bpg: 'blk', topg: 'tov',
      }
      const totalKey = (AVG_TO_TOTAL[key] ?? key) as keyof PlayerStat
      if (!COUNTING.has(totalKey)) return +(p[key] as number).toFixed(1)
      const total = p[totalKey] as number
      return +((total / mins) * PER40_TARGET).toFixed(1)
    }
    return +((p[key] as number) * MULT).toFixed(1)
  }

  // 시즌 리더 (bold 강조용) — 각 스탯의 최대값 보유 선수 id set
  // 자격자(effectiveMinGP) 만 리더 후보
  const seasonLeaders = useMemo(() => {
    const leaders: Record<string, Set<string>> = {}
    const pool = players.filter(p => p.gp >= effectiveMinGP)
    const STAT_KEYS: (keyof PlayerStat)[] = [
      'ppg','rpg','orp','drp','apg','spg','bpg','topg','pts','reb','oreb','dreb','ast','stl','blk','tov',
      'fgm','fga','fg3m','fg3a','ftm','fta','fg_pct','fg2_pct','fg3_pct','ft_pct','efg_pct','gp','minutes_played',
    ]
    for (const key of STAT_KEYS) {
      let best = -Infinity
      let ids = new Set<string>()
      const isPct = String(key).includes('_pct')
      for (const p of pool) {
        // 성공률 리더는 시도 수 최소 5회 이상만 인정 (fluke 방지)
        if (isPct) {
          const attempts = key === 'fg3_pct' ? p.fg3a : key === 'ft_pct' ? p.fta : p.fga
          if ((attempts ?? 0) < 5) continue
        }
        const v = p[key] as number ?? 0
        if (v > best) { best = v; ids = new Set([p.player_id]) }
        else if (v === best) ids.add(p.player_id)
      }
      leaders[String(key)] = ids
    }
    return leaders
  }, [players, effectiveMinGP])

  const isLeader = (p: PlayerStat, key: string) => seasonLeaders[key]?.has(p.player_id) ?? false

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
    { key: 'usg_pct',   label: 'USG%',  desc: '사용률 · 팀 소유권 대비 본인 마무리 비중' },
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
    const teamPoss = p.team_poss_in_games ?? 0
    return {
      at_ratio:  p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : (p.ast > 0 ? 99 : 0),
      ast_pct:   (poss + p.ast) > 0 ? +(p.ast / (poss + p.ast) * 100).toFixed(1) : 0,
      tov_pct:   poss > 0 ? +(p.tov / poss * 100).toFixed(1) : 0,
      usg_pct:   teamPoss > 0 ? +(poss / teamPoss * 100).toFixed(1) : 0,
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
    <div className="mm-brand space-y-5">
      {/* 헤더 + 필터 — 모바일 2줄 / PC 가로 정렬 */}
      <div className="space-y-3">
        <h2 className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em' }}>리그 스탯</h2>
        {/* 1줄: 분기 선택 */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button onClick={() => setSelectedQuarterId('all')}
            className="shrink-0 px-3 py-2 text-sm font-black uppercase transition-colors cursor-pointer btn-press min-h-[44px]"
            style={selectedQuarterId === 'all'
              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
              : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
            }>전체</button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQuarterId(q.id)}
              className="shrink-0 px-3 py-2 text-sm font-black uppercase transition-colors cursor-pointer btn-press min-h-[44px]"
              style={selectedQuarterId === q.id
                ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
                : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
              }>
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && <span className="ml-1 w-1.5 h-1.5 rounded-full inline-block" style={{ background: 'var(--mm-live)' }} />}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
      ) : players.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--mm-muted)' }}>
          <Trophy size={32} className="mx-auto mb-3" style={{ color: 'var(--mm-muted)' }} />
          <p>아직 완료된 경기 데이터가 없습니다</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>경기를 기록하고 완료 처리하면 스탯이 집계됩니다</p>
        </div>
      ) : (
        <>
          {/* 차트 필터 칩 */}
          <div className="flex gap-1.5 flex-wrap">
            {CHART_STATS.map(s => (
              <button key={s.key}
                onClick={() => setSelectedChartStat(s.key)}
                className="px-2.5 py-1 text-xs font-black uppercase transition-colors cursor-pointer"
                style={selectedChartStat === s.key
                  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', letterSpacing: '0.08em' }
                  : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }
                }>{s.label}</button>
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
              return <FGPctTop8Chart data={fgData} />
            })()}
          </div>

          {/* 비교하기 버튼 */}
          {compareIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)' }}>
              <span className="text-xs font-black uppercase" style={{ color: 'var(--mm-ink)', letterSpacing: '0.08em' }}>선택: {compareList.map(id => compareNamesById[id]).filter(Boolean).join(' vs ')}</span>
              <button
                onClick={() => setCompareModalOpen(true)}
                disabled={compareIds.size !== 2}
                className="ml-auto px-3 py-1 text-xs font-black uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', letterSpacing: '0.08em' }}
              >
                비교하기 ({compareIds.size}/2)
              </button>
              <button
                onClick={() => setCompareIds(new Set())}
                className="px-2 py-1 text-xs font-black uppercase cursor-pointer transition-colors"
                style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }}
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
                <div key={key} className="p-4 transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)]"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
                  <div className="flex items-center gap-1.5 mb-3">
                    <Trophy size={13} style={{ color: 'var(--mm-yellow-strong)' }} />
                    <p className="text-[11px] font-black uppercase" style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.16em' }}>{label}</p>
                  </div>
                  <button onClick={() => setQuickViewPlayer({ id: top.player_id, name: top.name })}
                    className="font-jersey font-black uppercase break-keep cursor-pointer text-left w-full block hover:underline underline-offset-2"
                    style={{ color: 'var(--mm-ink)', fontSize: 'clamp(17px, 4.5vw, 22px)', letterSpacing: '-0.005em', lineHeight: '1.15', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {top.name}
                  </button>
                  <p className="font-jersey font-black tabular-nums leading-none mt-1.5" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(26px, 7vw, 36px)', letterSpacing: '-0.015em' }}>{fmt(top)}</p>
                  <p className="text-[11px] font-bold uppercase mt-1" style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}>{unit} · {top.gp}R</p>
                  {leaders.slice(1).map((p, i) => (
                    <div key={p.player_id} className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                      <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                        className="text-xs font-bold cursor-pointer text-left hover:underline underline-offset-2"
                        style={{ color: 'var(--mm-ink-soft)' }}>
                        {i + 2}위 {p.name}
                      </button>
                      <span className="text-xs font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{fmt(p)}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* 듀오 분석: 어시스트 관계 + 스틸-턴오버 관계 */}
          <LeagueDuoPanel leagueId={leagueId} quarterId={selectedQuarterId} />

          {/* 전체 스탯 테이블 */}
          <div className="overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
            {/* 테이블 컨트롤 — 모바일 2줄 / PC 1줄 */}
            <div className="px-4 py-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex items-center gap-2 shrink-0">
                <TrendingUp size={14} style={{ color: 'var(--mm-yellow-strong)' }} />
                <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '0.02em' }}>전체 스탯</span>
              </div>
              {/* 컨트롤 그룹 — 모바일에서 스크롤 가능한 가로 행 */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide sm:ml-auto sm:flex-wrap">
                {/* Basic / Shooting / Advanced / 시즌하이 토글 */}
                <div className="flex overflow-hidden shrink-0" style={{ border: '1px solid var(--mm-rule)' }}>
                  {([
                    { k: 'basic'      as StatMode, label: 'Basic' },
                    { k: 'shooting'   as StatMode, label: 'Shooting' },
                    { k: 'advanced'   as StatMode, label: 'Advanced' },
                    { k: 'seasonHigh' as StatMode, label: '시즌하이' },
                  ]).map(({ k, label }) => (
                    <button key={k} onClick={() => setStatMode(k)}
                      className="px-3 py-2 text-xs font-black uppercase cursor-pointer transition-colors btn-press min-h-[40px]"
                      style={statMode === k
                        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', letterSpacing: '0.08em' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', letterSpacing: '0.08em' }
                      }>
                      {label}
                    </button>
                  ))}
                </div>
                {/* 누적/평균 토글 (Basic 모드에서만 의미 있음) */}
                <div className={`flex overflow-hidden shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`} style={{ border: '1px solid var(--mm-rule)' }}>
                  {(['avg','total'] as ViewMode[]).map(m => (
                    <button key={m} onClick={() => { setViewMode(m); if (m === 'total') setProjection(false) }}
                      className="px-3 py-2 text-xs font-black uppercase cursor-pointer transition-colors btn-press min-h-[40px]"
                      style={viewMode === m
                        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', letterSpacing: '0.08em' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', letterSpacing: '0.08em' }
                      }>
                      {m === 'avg' ? '평균' : '누적'}
                    </button>
                  ))}
                </div>
                {/* 단위 토글 (라운드 / GP / Per-40) */}
                <div className="flex items-center gap-1 p-0.5 shrink-0" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                  {(['round','game','per40'] as const).map(u => (
                    <button key={u} onClick={() => setStatUnit(u)}
                      title={u === 'round' ? '라운드(경기일)당' : u === 'game' ? '경기 슬롯당' : '40분당 환산 (실제 출전 시간 기반)'}
                      className="px-3 py-1.5 text-xs font-black uppercase cursor-pointer transition-colors"
                      style={statUnit === u
                        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', letterSpacing: '0.08em' }
                        : { background: 'transparent', color: 'var(--mm-ink-soft)', letterSpacing: '0.08em' }
                      }>
                      {u === 'round' ? 'R' : u === 'game' ? 'G' : 'Per-40'}
                    </button>
                  ))}
                </div>
                {/* x5 환산 (per40 및 round 에서는 의미 없음 → 비활성) */}
                {viewMode === 'avg' && (
                  <button onClick={() => setProjection(v => !v)} disabled={statUnit === 'round' || statUnit === 'per40'}
                    className="shrink-0 px-3 py-2 text-xs font-black uppercase transition-colors btn-press min-h-[40px]"
                    style={(statUnit === 'round' || statUnit === 'per40')
                      ? { background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', opacity: 0.4, cursor: 'not-allowed', letterSpacing: '0.08em' }
                      : projection
                        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', cursor: 'pointer', letterSpacing: '0.08em' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', cursor: 'pointer', letterSpacing: '0.08em' }
                    }>
                    ×5 환산
                  </button>
                )}
                <div className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--mm-muted)' }} title={`자동 임계값 ${autoMinGP}경기 (리그 최다 출전 ${maxPlayerGP}경기의 2/3)`}>
                  <span className="font-bold uppercase" style={{ letterSpacing: '0.10em' }}>최소</span>
                  <input type="number" min={1} max={200} value={minGP}
                    onChange={e => setMinGP(Number(e.target.value))}
                    className="w-14 px-1.5 py-2 text-center text-xs min-h-[40px] font-jersey tabular-nums"
                    style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }} />
                  <span className="font-bold uppercase" style={{ letterSpacing: '0.10em' }}>경기</span>
                  {!showAll && effectiveMinGP > minGP && (
                    <span className="text-xs font-black uppercase ml-1" style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.08em' }}>→ {effectiveMinGP} 적용 (G·2/3)</span>
                  )}
                </div>
                <button onClick={() => setShowAll(v => !v)}
                  title="활동량 임계값(2/3) 무시하고 전체 선수 표시"
                  className="shrink-0 px-3 py-2 text-xs font-black uppercase transition-colors btn-press min-h-[40px] cursor-pointer"
                  style={showAll
                    ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', letterSpacing: '0.08em' }
                    : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }
                  }>
                  전체 선수
                </button>
              </div>
            </div>

            {statMode === 'seasonHigh' ? (
              <div className="p-3 md:p-4">
                <NbaSeasonHighs
                  leagueId={leagueId}
                  quarterId={selectedQuarterId === 'all' ? null : selectedQuarterId}
                />
              </div>
            ) : statMode === 'basic' ? (<>
            {/* Basic — 모바일 정렬 칩 */}
            <div className="md:hidden px-3 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex gap-1.5 whitespace-nowrap">
                {COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleSort(key)}
                    className="px-2.5 py-1 text-xs font-black uppercase transition-colors shrink-0"
                    style={sortKey === key
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', letterSpacing: '0.08em' }
                      : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }
                    }>
                    {key === 'gp' ? (statUnit === 'round' ? 'R' : 'G') : label}
                    {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* Basic — 모바일 카드뷰 */}
            <div className="md:hidden">
              {filtered.map((p, i) => {
                const sortLabel = sortKey === 'gp'
                  ? (statUnit === 'round' ? 'R' : 'G')
                  : (COLS.find(c => c.key === sortKey)?.label ?? '')
                const sortVal = cellVal(p, sortKey)
                const subCols = COLS.filter(c => c.key !== sortKey).slice(0, 4)
                const rankAccent = i === 0 ? 'var(--mm-yellow)' : i === 1 ? 'var(--mm-muted)' : i === 2 ? 'var(--mm-yellow-strong)' : 'transparent'
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--mm-rule)', borderLeft: `3px solid ${rankAccent}` }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-jersey font-black tabular-nums w-6 shrink-0"
                        style={{ color: i === 0 ? 'var(--mm-yellow-strong)' : i === 1 ? 'var(--mm-muted)' : i === 2 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', fontSize: '20px' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-jersey font-black uppercase break-keep" style={{ color: 'var(--mm-ink)', fontSize: '16px', letterSpacing: '-0.005em', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.name}</div>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? '—'}{p.number ? ` · #${p.number}` : ''} · {p.gp}{statUnit === 'round' ? 'R' : 'G'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-jersey font-black tabular-nums leading-none" style={{ color: 'var(--mm-ink)', fontSize: '30px', letterSpacing: '-0.015em' }}>{sortVal}</div>
                        <div className="text-[11px] font-black uppercase mt-1" style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.16em' }}>{sortLabel}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-2" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                      {subCols.map(({ key, label }) => (
                        <div key={key} className="text-center">
                          <div className="text-[11px] font-bold uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{key === 'gp' ? (statUnit === 'round' ? 'R' : 'G') : label}</div>
                          <div className="font-jersey font-black tabular-nums mt-0.5" style={{ color: 'var(--mm-ink)', fontSize: '15px' }}>{cellVal(p, key)}</div>
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
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-black)' }}>
                    <th className="py-2 pl-2 pr-1 text-xs font-black uppercase text-right w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>#</th>
                    <th className="px-2 py-3 text-center text-xs font-black uppercase w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>비교</th>
                    <th className="text-left px-4 py-3 sticky left-0 font-jersey font-black uppercase min-w-[130px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '0.05em' }}>선수</th>
                    {COLS.map(({ key, label }) => {
                      const term = key === 'gp' ? (statUnit === 'round' ? 'R' : statUnit === 'game' ? 'G' : 'GP') : label
                      return (
                        <th key={key} onClick={() => handleSort(key)}
                          className="px-3 py-3 text-center font-jersey font-black uppercase cursor-pointer select-none whitespace-nowrap transition-colors"
                          style={{ color: sortKey === key ? 'var(--mm-black)' : 'var(--mm-ink-soft)', fontSize: '13px', letterSpacing: '0.05em' }}>
                          <StatHeader term={term} />
                          {sortKey === key
                            ? (sortDir === 'desc' ? <ChevronDown size={10} className="inline ml-0.5" /> : <ChevronUp size={10} className="inline ml-0.5" />)
                            : <ChevronsUpDown size={10} className="inline ml-0.5 opacity-30" />}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.player_id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--mm-rule)', background: i === 0 ? 'rgba(234,179,8,0.06)' : i === 2 ? 'rgba(161,98,7,0.05)' : 'transparent' }}>
                      <td className="py-2 pl-2 pr-1 text-right font-jersey font-black tabular-nums"
                        style={{ color: i === 0 ? 'var(--mm-yellow-strong)' : i === 2 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', fontSize: '15px' }}>{i+1}</td>
                      <td className="px-2 py-3 text-center">
                        <input type="checkbox" checked={compareIds.has(p.player_id)}
                          disabled={!compareIds.has(p.player_id) && compareIds.size >= 2}
                          onChange={() => toggleCompare(p)} aria-label={`${p.name} 비교 선택`}
                          className="cursor-pointer w-4 h-4 disabled:cursor-not-allowed disabled:opacity-30"
                          style={{ accentColor: 'var(--mm-yellow)' }} />
                      </td>
                      <td className="px-4 py-3 sticky left-0" style={{ background: i === 0 ? 'rgba(234,179,8,0.06)' : i === 2 ? 'rgba(161,98,7,0.05)' : 'var(--mm-panel)' }}>
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-jersey font-black uppercase transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      {COLS.map(({ key }) => {
                        // Per-40 모드에서는 실제 사용된 stat key 로 리더 체크 (예: ppg 대신 pts)
                        const AVG_TO_TOTAL: Partial<Record<string, string>> = {
                          ppg: 'pts', rpg: 'reb', orp: 'oreb', drp: 'dreb', apg: 'ast', spg: 'stl', bpg: 'blk', topg: 'tov',
                        }
                        const leaderKey = statUnit === 'per40' ? (AVG_TO_TOTAL[key as string] ?? (key as string)) : (key as string)
                        const leader = isLeader(p, leaderKey)
                        // 개인 최고 분기 = italic (선수의 여러 분기 중 이 분기가 최고 값)
                        const personalHigh = isPersonalHighCell(p.player_id, key as string)
                        const italicCls = personalHigh ? 'italic' : ''
                        const titleText = leader
                          ? (personalHigh ? '리그 리더 · 개인 최고 분기' : '리그 리더')
                          : (personalHigh ? '개인 최고 분기' : undefined)
                        const cellColor = sortKey === key
                          ? 'var(--mm-yellow-strong)'
                          : leader
                            ? 'var(--mm-ink)'
                            : 'var(--mm-ink-soft)'
                        const cellWeight = sortKey === key ? 900 : leader ? 900 : 600
                        return (
                          <td key={key}
                              className={`px-3 py-3 text-center font-jersey tabular-nums ${italicCls}`}
                              style={{ color: cellColor, fontWeight: cellWeight, fontSize: '15px' }}
                              title={titleText}>
                            {cellVal(p, key)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
                {/* Career Totals Footer — 자격자 대상 리그 총합/평균 */}
                {filtered.length > 0 && (() => {
                  const totalOf = (k: keyof PlayerStat) => filtered.reduce((s, p) => s + ((p[k] as number) ?? 0), 0)
                  const avgOf = (k: keyof PlayerStat) => filtered.length > 0 ? totalOf(k) / filtered.length : 0
                  const totalFgm  = totalOf('fgm')
                  const totalFga  = totalOf('fga')
                  const totalFg3m = totalOf('fg3m')
                  const totalFg3a = totalOf('fg3a')
                  const totalFtm  = totalOf('ftm')
                  const totalFta  = totalOf('fta')
                  const leagueFgPct  = totalFga  > 0 ? +(totalFgm  / totalFga  * 100).toFixed(1) : 0
                  const leagueFg3Pct = totalFg3a > 0 ? +(totalFg3m / totalFg3a * 100).toFixed(1) : 0
                  const leagueFtPct  = totalFta  > 0 ? +(totalFtm  / totalFta  * 100).toFixed(1) : 0
                  const leagueEfgPct = totalFga  > 0 ? +((totalFgm + 0.5 * totalFg3m) / totalFga * 100).toFixed(1) : 0
                  const fmtCell = (key: SortKey): string => {
                    if (viewMode === 'avg') {
                      // 평균 모드: 리그 자격자 평균값
                      if (key === 'gp') return String(Math.round(avgOf('gp') * 10) / 10)
                      if (key === 'fg_pct')  return `${leagueFgPct}%`
                      if (key === 'fg3_pct') return `${leagueFg3Pct}%`
                      if (key === 'ft_pct')  return `${leagueFtPct}%`
                      if (key === 'efg_pct') return `${leagueEfgPct}%`
                      const AVG_MAP: Partial<Record<SortKey, keyof PlayerStat>> = {
                        ppg: 'ppg', rpg: 'rpg', orp: 'orp', drp: 'drp',
                        apg: 'apg', spg: 'spg', bpg: 'bpg', topg: 'topg',
                      }
                      const src = AVG_MAP[key]
                      if (src) return (Math.round(avgOf(src) * 10) / 10).toFixed(1)
                      return '—'
                    }
                    // 누적 모드
                    if (key === 'gp') return String(totalOf('gp'))
                    if (key === 'fg_pct')  return `${leagueFgPct}%`
                    if (key === 'fg3_pct') return `${leagueFg3Pct}%`
                    if (key === 'ft_pct')  return `${leagueFtPct}%`
                    if (key === 'efg_pct') return `${leagueEfgPct}%`
                    if (key === 'fgm')  return `${totalFgm}/${totalFga}`
                    if (key === 'fg3m') return `${totalFg3m}/${totalFg3a}`
                    if (key === 'ftm')  return `${totalFtm}/${totalFta}`
                    const totKey = key as keyof PlayerStat
                    return String(totalOf(totKey))
                  }
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--mm-black)', background: 'var(--mm-panel-alt)' }}>
                        <td className="py-3 pl-2 pr-1"></td>
                        <td className="px-2 py-3"></td>
                        <td className="px-4 py-3 sticky left-0" style={{ background: 'var(--mm-panel-alt)' }}>
                          <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '0.16em' }}>
                            {viewMode === 'avg' ? '리그 평균' : '리그 총합'}
                          </span>
                          <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>자격자 {filtered.length}명</div>
                        </td>
                        {COLS.map(({ key }) => (
                          <td key={key} className="px-3 py-3 text-center font-jersey font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)', fontSize: '15px' }}>
                            {fmtCell(key)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>
              {/* Bold / Italic 범례 — 특정 분기 뷰에서만 노출 */}
              {selectedQuarterId !== 'all' && (
                <div className="px-4 py-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1" style={{ borderTop: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}>
                  <span><span className="font-jersey font-black" style={{ color: 'var(--mm-ink)' }}>굵게</span> = 리그 리더</span>
                  <span><span className="italic font-jersey" style={{ color: 'var(--mm-ink-soft)' }}>기울임</span> = 이 선수의 최고 분기 (전 분기 대비 개인 최고)</span>
                </div>
              )}
            </div>
            </>) : statMode === 'shooting' ? (<>
            {/* Shooting — 모바일 정렬 칩 */}
            <div className="md:hidden px-3 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex gap-1.5 whitespace-nowrap">
                {SHOOTING_COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleShootSort(key)}
                    className="px-2.5 py-1 text-xs font-black uppercase transition-colors shrink-0"
                    style={shootSortKey === key
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', letterSpacing: '0.08em' }
                      : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }
                    }>
                    {label}{shootSortKey === key && (shootSortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* Shooting — 모바일 카드뷰 */}
            <div className="md:hidden">
              {filteredShoot.map(({ p, sh }, i) => {
                const rankAccent = i === 0 ? 'var(--mm-yellow)' : i === 1 ? 'var(--mm-muted)' : i === 2 ? 'var(--mm-yellow-strong)' : 'transparent'
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--mm-rule)', borderLeft: `3px solid ${rankAccent}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-jersey font-black tabular-nums w-5 shrink-0"
                        style={{ color: i === 0 ? 'var(--mm-yellow-strong)' : i === 1 ? 'var(--mm-muted)' : i === 2 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', fontSize: '18px' }}>{i+1}</span>
                      <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '-0.005em' }}>{p.name}</span>
                      <span className="text-[11px] font-bold uppercase ml-auto" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.gp}{statUnit === 'round' ? 'R' : 'G'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                      {SHOOTING_COLS.slice(0, 8).map(({ key, label }) => {
                        const active = shootSortKey === key
                        return (
                          <div key={key} className="text-center">
                            <div className="text-[11px] font-bold uppercase" style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', letterSpacing: '0.10em' }}>{label}</div>
                            <div className="font-jersey font-black tabular-nums mt-0.5" style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)', fontSize: '15px' }}>{sh[key]}%</div>
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
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-black)' }}>
                    <th className="py-2 pl-2 pr-1 text-xs font-black uppercase text-right w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>#</th>
                    <th className="text-left px-4 py-3 sticky left-0 font-jersey font-black uppercase min-w-[130px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '0.05em' }}>선수</th>
                    <th className="px-3 py-3 text-center text-xs font-black uppercase" style={{ color: 'var(--mm-ink-soft)', letterSpacing: '0.10em' }}>{statUnit === 'round' ? 'R' : 'G'}</th>
                    {SHOOTING_COLS.map(({ key, label, desc }, idx) => {
                      // 구분선: 슈팅 효율(0-6) | 야투 분포(7-10)
                      const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-black)' } : {}
                      return (
                        <th key={key} onClick={() => handleShootSort(key)} title={desc}
                          className="px-3 py-3 text-center font-jersey font-black uppercase whitespace-nowrap cursor-pointer select-none transition-colors"
                          style={{ color: shootSortKey === key ? 'var(--mm-black)' : 'var(--mm-ink-soft)', fontSize: '13px', letterSpacing: '0.05em', ...dividerStyle }}>
                          <StatHeader term={label} />
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
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--mm-rule)', background: i === 0 ? 'rgba(234,179,8,0.06)' : i === 2 ? 'rgba(161,98,7,0.05)' : 'transparent' }}>
                      <td className="py-2 pl-2 pr-1 text-right font-jersey font-black tabular-nums"
                        style={{ color: i === 0 ? 'var(--mm-yellow-strong)' : i === 2 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', fontSize: '15px' }}>{i+1}</td>
                      <td className="px-4 py-3 sticky left-0" style={{ background: i === 0 ? 'rgba(234,179,8,0.06)' : i === 2 ? 'rgba(161,98,7,0.05)' : 'var(--mm-panel)' }}>
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-jersey font-black uppercase transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      <td className="px-3 py-3 text-center font-jersey tabular-nums" style={{ color: 'var(--mm-muted)', fontSize: '14px' }}>{p.gp}</td>
                      {SHOOTING_COLS.map(({ key, barColor }, idx) => {
                        const val = sh[key]
                        const active = shootSortKey === key
                        const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-rule)' } : {}
                        // FTr 은 100% 넘을 수 있어 max=80(시각 척도용)으로 자름
                        const barMax = key === 'ft_rate' ? 80 : 100
                        const personalHigh = isPersonalHighCell(p.player_id, key as string)
                        const italicCls = personalHigh ? 'italic' : ''
                        return (
                          <td key={key}
                              className={`relative px-3 py-3 text-center font-jersey tabular-nums ${italicCls}`}
                              style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-ink-soft)', fontWeight: active ? 900 : 600, fontSize: '15px', ...dividerStyle }}
                              title={personalHigh ? '개인 최고 분기' : undefined}>
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
              <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                {SHOOTING_COLS.map(({ key, label, desc }) => (
                  <span key={key} className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                    <span className="font-black uppercase" style={{ color: 'var(--mm-ink-soft)', letterSpacing: '0.06em' }}>{label}</span> {desc}
                  </span>
                ))}
              </div>
            </div>
            </>) : (<>
            {/* Advanced — 모바일 정렬 칩 */}
            <div className="md:hidden px-3 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex gap-1.5 whitespace-nowrap">
                {ADV_COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleAdvSort(key)}
                    className="px-2.5 py-1 text-xs font-black uppercase transition-colors shrink-0"
                    style={advSortKey === key
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', letterSpacing: '0.08em' }
                      : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }
                    }>
                    {label}{advSortKey === key && (advSortDir === 'desc' ? ' ↓' : ' ↑')}
                  </button>
                ))}
              </div>
            </div>

            {/* Advanced — 모바일 카드뷰 */}
            <div className="md:hidden">
              {filteredAdv.map(({ p, adv }, i) => {
                const rankAccent = i === 0 ? 'var(--mm-yellow)' : i === 1 ? 'var(--mm-muted)' : i === 2 ? 'var(--mm-yellow-strong)' : 'transparent'
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--mm-rule)', borderLeft: `3px solid ${rankAccent}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-jersey font-black tabular-nums w-5 shrink-0"
                        style={{ color: i === 0 ? 'var(--mm-yellow-strong)' : i === 1 ? 'var(--mm-muted)' : i === 2 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', fontSize: '18px' }}>{i+1}</span>
                      <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '-0.005em' }}>{p.name}</span>
                      <span className="text-[11px] font-bold uppercase ml-auto" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.gp}{statUnit === 'round' ? 'R' : 'G'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                      {ADV_COLS.map(({ key, label }) => {
                        const isRatio = key === 'at_ratio'
                        const isCount = key === 'a1_total'
                        const active = advSortKey === key
                        return (
                          <div key={key} className="text-center">
                            <div className="text-[11px] font-bold uppercase" style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', letterSpacing: '0.10em' }}>{label}</div>
                            <div className="font-jersey font-black tabular-nums mt-0.5" style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)', fontSize: '15px' }}>{isRatio || isCount ? adv[key] : `${adv[key]}%`}</div>
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
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-black)' }}>
                    <th className="py-2 pl-2 pr-1 text-xs font-black uppercase text-right w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>#</th>
                    <th className="text-left px-4 py-3 sticky left-0 font-jersey font-black uppercase min-w-[130px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '0.05em' }}>선수</th>
                    <th className="px-3 py-3 text-center text-xs font-black uppercase" style={{ color: 'var(--mm-ink-soft)', letterSpacing: '0.10em' }}>{statUnit === 'round' ? 'R' : 'G'}</th>
                    {ADV_COLS.map(({ key, label, desc }) => (
                      <th key={key} onClick={() => handleAdvSort(key)} title={desc}
                        className="px-3 py-3 text-center font-jersey font-black uppercase whitespace-nowrap cursor-pointer select-none transition-colors"
                        style={{ color: advSortKey === key ? 'var(--mm-black)' : 'var(--mm-ink-soft)', fontSize: '13px', letterSpacing: '0.05em' }}>
                        <StatHeader term={label} />
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
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--mm-rule)', background: i === 0 ? 'rgba(234,179,8,0.06)' : i === 2 ? 'rgba(161,98,7,0.05)' : 'transparent' }}>
                      <td className="py-2 pl-2 pr-1 text-right font-jersey font-black tabular-nums"
                        style={{ color: i === 0 ? 'var(--mm-yellow-strong)' : i === 2 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', fontSize: '15px' }}>{i+1}</td>
                      <td className="px-4 py-3 sticky left-0" style={{ background: i === 0 ? 'rgba(234,179,8,0.06)' : i === 2 ? 'rgba(161,98,7,0.05)' : 'var(--mm-panel)' }}>
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-jersey font-black uppercase transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      <td className="px-3 py-3 text-center font-jersey tabular-nums" style={{ color: 'var(--mm-muted)', fontSize: '14px' }}>{p.gp}</td>
                      {ADV_COLS.map(({ key }) => {
                        const val = adv[key]
                        const isRatio = key === 'at_ratio'
                        const isCount = key === 'a1_total'
                        const active = advSortKey === key
                        return (
                          <td key={key} className="px-3 py-3 text-center font-jersey tabular-nums"
                            style={{ color: active ? 'var(--mm-yellow-strong)' : 'var(--mm-ink-soft)', fontWeight: active ? 900 : 600, fontSize: '15px' }}>
                            {isRatio || isCount ? val : `${val}%`}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* 지표 설명 범례 */}
              <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                {ADV_COLS.map(({ key, label, desc }) => (
                  <span key={key} className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                    <span className="font-black uppercase" style={{ color: 'var(--mm-ink-soft)', letterSpacing: '0.06em' }}>{label}</span> {desc}
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
