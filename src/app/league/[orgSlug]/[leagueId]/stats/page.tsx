'use client'
import { useState, useEffect, useMemo, Suspense } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Trophy, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown, Crown, ChevronRight } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import TopFiveSlot, { type TopFivePlayer } from '@/components/league/stats/TopFiveSlot'

// 상호작용 트리거 후에만 필요 — 초기 번들에서 분리
const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
const PlayerCompareModal = dynamic(() => import('@/components/league/PlayerCompareModal'), { ssr: false })
import StatHeader from '@/components/league/StatHeader'
import { PercentBar } from '@/components/league/StatCell'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import { getStatsGroupTabs } from '@/components/league/statsTabs'
import SectionCard from '@/components/league/ui/SectionCard'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import type { Quarter, PlayerStat } from '@/types/league'
import StatGate from '@/components/league/auth/StatGate'

type ViewMode = 'avg' | 'total'
type StatUnit = 'round' | 'game'

// 최소 출전 자격 — 해당 기간 내 열린 라운드의 30% 이상 참여 (2026-08-03 완화)
// 이전엔 "리그 최다 출전자의 2/3" 였는데, 개근자 1명 때문에 커트라인이 과하게 올라가
// 정상 참여자까지 리더보드에서 빠지는 문제가 있었다.
const MIN_ROUND_RATIO = 0.3
type SortKey = 'ppg'|'rpg'|'orp'|'drp'|'apg'|'spg'|'bpg'|'topg'|'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'|'gp'|'pts'|'reb'|'oreb'|'dreb'|'ast'|'stl'|'blk'|'tov'|'fgm'|'fg3m'|'ftm'
type AdvKey = 'at_ratio'|'a1_total'|'a1_rate'|'trb_pct'
type ShootingKey = 'fg_pct'|'fg2_pct'|'fg3_pct'|'ft_pct'|'ts_pct'|'shot_mix'
type StatMode = 'basic'|'shooting'|'advanced'

// 시즌 최고(옛 '시즌하이' 탭) 카테고리 — GET /api/leagues/[leagueId]/season-highs 의 categoryHighs 그대로
type SeasonHighCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M' | 'FGA' | 'FGM'
interface SeasonHigh {
  category: SeasonHighCategory
  label: string
  value: number
  player: {
    player_id: string
    name: string
    number: number | null
    position: string | null
    photo_url: string | null
  }
  date: string
}

// 현재 정렬된 지표(SortKey) → 시즌 최고 카테고리. 리더보드는 basic 모드 정렬만 이 8개
// 카테고리와 개념이 겹친다(득점/리바운드/어시스트/스틸/블락/3점 성공/야투 성공).
// Shooting·Advanced 모드의 정렬 지표(%, 비율)는 대응하는 카테고리가 없어 매핑에서 뺐다 —
// 억지로 값을 끌어오면 "야투율 시즌 최고"처럼 의미가 안 맞는 줄이 생긴다. 지시대로 그 경우엔
// 줄 자체를 숨긴다.
const SORTKEY_TO_SEASON_HIGH_CATEGORY: Partial<Record<SortKey, SeasonHighCategory>> = {
  ppg: 'PTS', pts: 'PTS',
  rpg: 'REB', reb: 'REB',
  apg: 'AST', ast: 'AST',
  spg: 'STL', stl: 'STL',
  bpg: 'BLK', blk: 'BLK',
  fg3m: 'FG3M',
  fgm: 'FGM',
}

function formatSeasonHighDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// SortKey → 한글 풀네임 (TopFiveSlot 상단 라벨용)
const BASIC_FULL_LABELS: Partial<Record<SortKey, string>> = {
  gp:      '출전 경기',
  ppg:     '득점',
  rpg:     '리바운드',
  orp:     '공격 리바운드',
  drp:     '수비 리바운드',
  apg:     '어시스트',
  spg:     '스틸',
  bpg:     '블락',
  topg:    '턴오버',
  pts:     '득점 (누적)',
  reb:     '리바운드 (누적)',
  oreb:    '공격 리바운드 (누적)',
  dreb:    '수비 리바운드 (누적)',
  ast:     '어시스트 (누적)',
  stl:     '스틸 (누적)',
  blk:     '블락 (누적)',
  tov:     '턴오버 (누적)',
  fgm:     '야투 성공',
  fg3m:    '3점 성공',
  ftm:     '자유투 성공',
  fg_pct:  '야투율',
  fg3_pct: '3점 성공률',
  ft_pct:  '자유투 성공률',
  efg_pct: '유효야투율',
}

// 슛 존별 컬러 (SHOT MIX 스택 막대 · 통일 팔레트)
const SHOT_MIX_COLORS = {
  ds:    '#ef4444',  // red · 골밑 (덩크/포스트)
  lu:    '#f97316',  // orange · 레이업
  md:    '#eab308',  // yellow · 미드레인지
  three: '#3b82f6',  // blue · 3점
} as const

function ShotMixBar({ p, width, height = 12 }: { p: PlayerStat; width?: number; height?: number }) {
  const fga = p.fga
  if (fga <= 0) {
    return <span className="text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>—</span>
  }
  const ds    = ((p.ds_a ?? 0) / fga) * 100
  const lu    = ((p.lu_a ?? 0) / fga) * 100
  const md    = ((p.md_a ?? 0) / fga) * 100
  const three = ((p.fg3a  ?? 0) / fga) * 100
  const segments = [
    { key: 'ds',    label: 'DS',  pct: ds,    color: SHOT_MIX_COLORS.ds },
    { key: 'lu',    label: 'LU',  pct: lu,    color: SHOT_MIX_COLORS.lu },
    { key: 'md',    label: 'MD',  pct: md,    color: SHOT_MIX_COLORS.md },
    { key: 'three', label: '3P',  pct: three, color: SHOT_MIX_COLORS.three },
  ] as const
  const title = segments.filter(s => s.pct > 0).map(s => `${s.label} ${s.pct.toFixed(0)}%`).join(' · ')
  // width 미지정 = 부모 폭에 맞춰 늘어남 (모바일 카드용), 지정 시 고정 (데스크탑 셀용)
  const barStyle: React.CSSProperties = {
    height,
    borderRadius: '2px',
    border: '1px solid var(--mm-rule)',
  }
  if (width != null) barStyle.width = width
  else barStyle.width = '100%'
  return (
    <div className={width != null ? 'inline-flex items-center' : 'flex items-center'} title={title} aria-label={`슛 분포: ${title}`} style={{ width: width != null ? undefined : '100%' }}>
      <div className="flex overflow-hidden" style={barStyle}>
        {segments.map(s => s.pct > 0 && (
          <div
            key={s.key}
            style={{
              width: `${s.pct}%`,
              background: s.color,
              minWidth: s.pct > 0 ? 2 : 0,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// 순위 티어링 — 1위 골드 · 2위 실버 · 3위 브론즈 · 4-10위 에메랄드 · 11위+ 뉴트럴
// (auth/PersonalDashboard.tsx rankStyle 동일 팔레트 · 도미노 확장 통일 · 옐로우 실색상 1곳 원칙 준수)
// border: 라이트 모드에서 rank-*-bg 가 흰 행 대비 1.13~1.18 로 옅어 배지 형태가 거의 안 보이는 문제
// (2026-08-07 리뷰) → -fg 색의 얇은 테두리로 형태를 살린다. 텍스트 대비엔 영향 없음(색값 무변경).
function rankTier(rank: number): { color: string; bg: string; accent: string; border: string } {
  if (rank === 1) return { color: 'var(--rank-1-fg)', bg: 'var(--rank-1-bg)', accent: 'var(--rank-1-fg)', border: '1px solid var(--rank-1-fg)' }  // gold
  if (rank === 2) return { color: 'var(--rank-2-fg)', bg: 'var(--rank-2-bg)', accent: 'var(--rank-2-fg)', border: '1px solid var(--rank-2-fg)' }  // silver
  if (rank === 3) return { color: 'var(--rank-3-fg)', bg: 'var(--rank-3-bg)', accent: 'var(--rank-3-fg)', border: '1px solid var(--rank-3-fg)' }  // bronze
  if (rank <= 10) return { color: 'var(--rank-top-fg)', bg: 'var(--rank-top-bg)', accent: 'var(--rank-top-fg)', border: '1px solid var(--rank-top-fg)' }
  return { color: 'var(--mm-muted)', bg: 'transparent', accent: 'transparent', border: 'none' }
}

// 시즌 최고 한 줄 — TOP 5 슬롯 바로 아래. 현재 정렬 지표가 매핑되는 카테고리를 가질 때만
// 렌더된다(호출부에서 null 체크). 박스스코어 날짜가 있으면 카드 전체가 클릭 가능한 링크다
// (DESIGN.md: "카드가 뜨면 카드 전체가 링크"). orgSlug 가 없으면(이론상 발생 안 함) 링크 없이
// 텍스트만 보여준다.
function SeasonHighLine({ high, orgSlug, leagueId }: { high: SeasonHigh; orgSlug: string; leagueId: string }) {
  const dateLabel = formatSeasonHighDate(high.date)
  const content = (
    <>
      <Crown size={16} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden className="shrink-0" />
      <span className="text-[11px] font-black uppercase shrink-0" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>
        시즌 최고
      </span>
      <span className="font-bold truncate" style={{ color: 'var(--mm-ink)', fontSize: '14px' }}>
        {high.player.name}
      </span>
      <span className="font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)', fontSize: '16px' }}>
        {high.value}
      </span>
      <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: 'var(--mm-muted)' }}>
        ({dateLabel})
      </span>
      <ChevronRight size={16} className="ml-auto shrink-0" style={{ color: 'var(--mm-muted)' }} aria-hidden />
    </>
  )
  const className = "flex items-center gap-2 px-3 min-h-[44px] transition-colors"
  const style = { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }
  if (!orgSlug || !high.date) {
    return <div className={className} style={style}>{content}</div>
  }
  return (
    <Link
      href={`/league/${orgSlug}/${leagueId}/boxscore/${high.date}`}
      className={`${className} cursor-pointer hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1`}
      style={style}
      aria-label={`시즌 최고 ${high.label} — ${high.player.name} ${high.value}, ${dateLabel} 박스스코어 보기`}
    >
      {content}
    </Link>
  )
}

function LeagueStatsPageInner() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  // ?tab=seasonHigh 옛 링크(흡수 전 시즌하이 서브탭) 는 리더보드로 그대로 폴백된다 — 이 페이지는
  // 더 이상 ?tab 쿼리를 읽지 않으므로(자체 상태만으로 basic 진입) 자연히 폴백된다.

  const [quarters, setQuarters] = useState<Quarter[]>([])
  // 페이지 간 분기 선택 공유 (LeagueQuarterContext)
  const { selectedQuarterId, setSelectedQuarterId } = useLeagueQuarter()
  const [players, setPlayers] = useState<PlayerStat[]>([])
  const [totalRounds, setTotalRounds] = useState(0)  // 기간 내 열린 라운드 수 (자격 커트라인 분모)
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)  // 401 — 회원 전용
  const [sortKey, setSortKey] = useState<SortKey>('ppg')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [statMode, setStatMode] = useState<StatMode>('basic')
  const [advSortKey, setAdvSortKey] = useState<AdvKey>('at_ratio')
  const [advSortDir, setAdvSortDir] = useState<'asc'|'desc'>('desc')
  const [shootSortKey, setShootSortKey] = useState<ShootingKey>('ts_pct')
  const [shootSortDir, setShootSortDir] = useState<'asc'|'desc'>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  const [quickViewPlayer, setQuickViewPlayer] = useState<{ id: string; name: string } | null>(null)
  // 최소 출전 임계값 — 자동으로 리그 최다 출전의 2/3 로 고정 (사용자 수동 조작 제거 · 2026-07-15)
  // 이전엔 수동 입력 + '전체 선수' 토글이 있어 "왜 내 값이 안 먹지" 혼란 유발 → 자동 임계값 하나만 유지
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  // TopFiveSlot 활성화 플래그 — 기본 true 로 두어 진입 즉시 기본 정렬(득점 PPG) TOP 5 를 노출.
  // 이후 컬럼 헤더 클릭으로 지표 전환 (2026-07-27: 기본 안내 화면 → 득점 TOP5 기본 표시로 변경)
  const [topFiveActive, setTopFiveActive] = useState(true)
  const [statUnit, setStatUnit] = useState<StatUnit>('round')
  // 시즌 최고(옛 시즌하이 탭 흡수) — 카테고리별 라운드 최고 기록. 리더보드와 같은 데이터 소스,
  // 새 API 없음(GET /api/leagues/[leagueId]/season-highs — 삭제된 시즌하이 탭 컴포넌트가 쓰던 것 그대로).
  const [categoryHighs, setCategoryHighs] = useState<SeasonHigh[]>([])

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
    const url = selectedQuarterId === 'all'
      ? `/api/leagues/${leagueId}/stats?unit=${statUnit}`
      : `/api/leagues/${leagueId}/stats?quarterId=${selectedQuarterId}&unit=${statUnit}`

    fetch(url)
      .then(r => {
        if (r.status === 401) { setGated(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setPlayers(d.players ?? []); setTotalRounds(d.total_rounds ?? 0); setLoading(false) } })
      .catch(() => setLoading(false))
  }, [leagueId, selectedQuarterId, statUnit])

  // 시즌 최고 — 분기 변경 시 함께 다시 조회. 8개 카테고리뿐이라 페이로드가 작아
  // statMode 와 무관하게 항상 가져온다(Basic 모드로 돌아왔을 때 재요청 없이 바로 보이도록).
  useEffect(() => {
    const qs = selectedQuarterId !== 'all' ? `?quarterId=${selectedQuarterId}` : ''
    fetch(`/api/leagues/${leagueId}/season-highs${qs}`)
      .then(r => r.ok ? r.json() : { categoryHighs: [] })
      .then(d => setCategoryHighs(d.categoryHighs ?? []))
      .catch(() => setCategoryHighs([]))
  }, [leagueId, selectedQuarterId])

  function handleSort(key: SortKey) {
    if (!topFiveActive) setTopFiveActive(true)
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // 자동 임계값: 해당 기간 내 열린 라운드(경기일)의 30% 이상 참여.
  // total_rounds 를 못 받은 경우(구 캐시 응답 등)만 최다 출전자 기준으로 폴백.
  const maxPlayerGP = useMemo(() => players.reduce((m, p) => Math.max(m, p.gp), 0), [players])
  const roundBase = totalRounds > 0 ? totalRounds : maxPlayerGP
  const autoMinGP = Math.max(1, Math.ceil(roundBase * MIN_ROUND_RATIO))
  const effectiveMinGP = autoMinGP

  const filtered = players
    .filter(p => p.gp >= effectiveMinGP)
    .sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'desc' ? -diff : diff
    })

  // 평균 컬럼 — 정렬용 숫자값
  function avg(p: PlayerStat, key: keyof PlayerStat) {
    return +((p[key] as number) ?? 0).toFixed(1)
  }
  // 표기 통일: 소수점 첫째 자리를 항상 노출 (23 → 23.0)
  const fmt1 = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(1)

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
  // SHOOTING 컬럼 (2026-07-19 재개편)
  //   · 개별 % 지표는 텍스트만 (바 그래프 삭제 · 100% 만점 척도가 의미 약함)
  //   · 야투 존별 비중 (DS/LU/MD/3P) 4개 컬럼 → SHOT MIX 스택 막대 단일 컬럼으로 통합
  //     한 선수의 슛 성향을 한눈에 파악
  const SHOOTING_COLS: { key: ShootingKey; label: string; desc: string }[] = [
    { key: 'fg_pct',   label: 'FG%',      desc: '전체 야투 성공률 · FGM/FGA' },
    { key: 'fg2_pct',  label: '2P%',      desc: '2점 야투 성공률 · (FGM-3PM)/(FGA-3PA)' },
    { key: 'fg3_pct',  label: '3P%',      desc: '3점 야투 성공률 · 3PM/3PA' },
    { key: 'ft_pct',   label: 'FT%',      desc: '자유투 성공률 · FTM/FTA' },
    { key: 'ts_pct',   label: 'TS%',      desc: '진실야투율 · PTS/(2×(FGA+0.44×FTA))' },
    { key: 'shot_mix', label: 'SHOT MIX', desc: '슛 분포 · 골밑(DS) · 레이업(LU) · 미들(MD) · 3점 시도 비중 스택 바' },
  ]

  // Advanced stats 컬럼 (Shooting 제외 — 효율/볼소유/리바운드 비중)
  const ADV_COLS: { key: AdvKey; label: string; desc: string }[] = [
    { key: 'at_ratio',  label: 'A/T',   desc: '어시스트/턴오버 비율' },
    { key: 'a1_total',  label: 'A1',    desc: '성공한 앤드원(And-One) 횟수 (누적)' },
    { key: 'a1_rate',   label: 'A1%',   desc: '야투 성공 중 앤드원 비율 · A1/FGM' },
    { key: 'trb_pct',   label: 'TRB%',  desc: '본인 출전 경기에서 팀 리바운드 대비 본인 비중 · REB/팀 REB' },
  ]

  function calcAdv(p: PlayerStat): Record<AdvKey, number> {
    const a1 = p.and_one ?? 0
    const teamReb = p.team_reb_in_games ?? 0
    return {
      at_ratio:  p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : (p.ast > 0 ? 99 : 0),
      a1_total:  a1,
      a1_rate:   p.fgm > 0 ? +(a1 / p.fgm * 100).toFixed(1) : 0,
      trb_pct:   teamReb > 0 ? +(p.reb / teamReb * 100).toFixed(1) : 0,
    }
  }

  function calcShoot(p: PlayerStat): Record<ShootingKey, number> {
    return {
      fg_pct:      p.fg_pct ?? 0,
      fg2_pct:     p.fg2_pct ?? 0,
      fg3_pct:     p.fg3_pct ?? 0,
      ft_pct:      p.ft_pct ?? 0,
      ts_pct:      (p.fga + 0.44 * p.fta) > 0 ? +(p.pts / (2 * (p.fga + 0.44 * p.fta)) * 100).toFixed(1) : 0,
      // shot_mix 정렬용 프록시 = 3점 비중 (내부적으로 스택 막대는 DS/LU/MD/3P 모두 렌더)
      shot_mix:    p.fga > 0 ? +(p.fg3a / p.fga * 100).toFixed(1) : 0,
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
    if (!topFiveActive) setTopFiveActive(true)
    if (key === advSortKey) setAdvSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setAdvSortKey(key); setAdvSortDir('desc') }
  }
  function handleShootSort(key: ShootingKey) {
    if (!topFiveActive) setTopFiveActive(true)
    if (key === shootSortKey) setShootSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setShootSortKey(key); setShootSortDir('desc') }
  }

  const COLS = viewMode === 'avg' ? AVG_COLS : TOTAL_COLS

  function cellVal(p: PlayerStat, key: SortKey): string {
    if (viewMode === 'avg') {
      if (key === 'gp') return String(p.gp)
      if (key === 'fg_pct')  return p.fga  > 0 ? `${fmt1(p.fg_pct)}%`  : '—'
      if (key === 'fg3_pct') return p.fg3a > 0 ? `${fmt1(p.fg3_pct)}%` : '—'
      if (key === 'ft_pct')  return p.fta  > 0 ? `${fmt1(p.ft_pct)}%`  : '—'
      if (key === 'efg_pct') return p.fga  > 0 ? `${fmt1(p.efg_pct)}%` : '—'
      return fmt1(avg(p, key as keyof PlayerStat))
    } else {
      if (key === 'fg_pct')  return p.fga  > 0 ? `${fmt1(p.fg_pct)}%`  : '—'
      if (key === 'fg3_pct') return p.fg3a > 0 ? `${fmt1(p.fg3_pct)}%` : '—'
      if (key === 'ft_pct')  return p.fta  > 0 ? `${fmt1(p.ft_pct)}%`  : '—'
      if (key === 'efg_pct') return p.fga  > 0 ? `${fmt1(p.efg_pct)}%` : '—'
      // 누적 뷰: 야투는 메이드/시도 형식
      if (key === 'fgm')  return `${p.fgm}/${p.fga}`
      if (key === 'fg3m') return `${p.fg3m}/${p.fg3a}`
      if (key === 'ftm')  return `${p.ftm}/${p.fta}`
      return String((p as unknown as Record<string, number>)[key] ?? 0)
    }
  }

  // TOP 5 슬롯용 데이터 — 현재 statMode + 해당 모드의 sortKey 로 상위 5명 산출
  // 리더는 항상 값이 큰 순 (사용자 sortDir 무시)
  const topFive = useMemo<{ key: string | null; label: string | null; fullLabel: string | null; players: TopFivePlayer[] }>(() => {
    if (!topFiveActive || players.length === 0) {
      return { key: null, label: null, fullLabel: null, players: [] }
    }
    const eligibleBase = players.filter(p => p.gp >= effectiveMinGP)

    if (statMode === 'basic') {
      const col = (viewMode === 'avg' ? AVG_COLS : TOTAL_COLS).find(c => c.key === sortKey)
      const label = col?.label ?? String(sortKey)
      const fullLabel = BASIC_FULL_LABELS[sortKey] ?? label
      const isPct = String(sortKey).includes('_pct')
      let pool = eligibleBase
      if (isPct) {
        pool = pool.filter(p => {
          if (sortKey === 'fg3_pct') return p.fg3a >= 5
          if (sortKey === 'ft_pct')  return p.fta  >= 5
          return p.fga >= 5
        })
      }
      const sorted = [...pool].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number)).slice(0, 5)
      return {
        key: `basic:${sortKey}:${viewMode}:${statUnit}`,
        label,
        fullLabel,
        players: sorted.map(p => ({
          id: p.player_id,
          name: p.name,
          photo_url: p.photo_url,
          value: cellVal(p, sortKey),
        })),
      }
    }

    if (statMode === 'shooting') {
      const col = SHOOTING_COLS.find(c => c.key === shootSortKey)
      const label = col?.label ?? shootSortKey
      const fullLabel = (col?.desc ?? label).split('·')[0].trim() || label
      // 슛 관련 성공률은 시도 5개 이상 자격
      const pool = eligibleBase.filter(p => {
        if (shootSortKey === 'fg3_pct') return p.fg3a >= 5
        if (shootSortKey === 'ft_pct')  return p.fta  >= 5
        // 그 외는 fga>0 만 요구
        return p.fga > 0
      })
      const withVals = pool.map(p => ({ p, val: calcShoot(p)[shootSortKey] }))
      const sorted = withVals.sort((a, b) => b.val - a.val).slice(0, 5)
      // shot_mix 는 3P 비중 프록시로 정렬 · 값은 "3P {n}%" 표기 (혼동 방지)
      const isMix = shootSortKey === 'shot_mix'
      return {
        key: `shooting:${shootSortKey}`,
        label,
        fullLabel,
        players: sorted.map(({ p, val }) => ({
          id: p.player_id,
          name: p.name,
          photo_url: p.photo_url,
          value: isMix ? `3P ${fmt1(val)}%` : `${fmt1(val)}%`,
        })),
      }
    }

    // advanced
    const col = ADV_COLS.find(c => c.key === advSortKey)
    const label = col?.label ?? advSortKey
    const fullLabel = (col?.desc ?? label).split('·')[0].trim() || label
    const withVals = eligibleBase.map(p => ({ p, val: calcAdv(p)[advSortKey] }))
    const sorted = withVals.sort((a, b) => b.val - a.val).slice(0, 5)
    const isRatio = advSortKey === 'at_ratio'
    const isCount = advSortKey === 'a1_total'
    return {
      key: `advanced:${advSortKey}`,
      label,
      fullLabel,
      players: sorted.map(({ p, val }) => ({
        id: p.player_id,
        name: p.name,
        photo_url: p.photo_url,
        value: isCount ? String(val) : isRatio ? val.toFixed(2) : `${fmt1(val)}%`,
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFiveActive, statMode, sortKey, shootSortKey, advSortKey, players, effectiveMinGP, viewMode, statUnit])

  // 현재 정렬 지표(리더보드 = basic 모드일 때만) → 시즌 최고 카테고리 매핑.
  // shooting/advanced 모드거나 매핑 없는 지표(각종 %, TOPG 등)면 null → TopFiveSlot 아래 줄이 숨는다.
  const matchedSeasonHigh = useMemo<SeasonHigh | null>(() => {
    if (statMode !== 'basic') return null
    const category = SORTKEY_TO_SEASON_HIGH_CATEGORY[sortKey]
    if (!category) return null
    return categoryHighs.find(h => h.category === category) ?? null
  }, [statMode, sortKey, categoryHighs])

  const base = `/league/${orgSlug}/${leagueId}`
  // 리더보드·어워즈·선수 명단·팀 순위 4개 서브탭 (2026-08-08 — 플레이 맵 삭제, 어워즈 승격 /
  // 선수 명단·팀 순위를 스탯 우산으로 이동. 2026-08-09 — 시즌하이 탭을 리더보드에 흡수).
  // 배열은 공유 헬퍼(statsTabs.ts)에서 가져온다 — stats/awards/roster/teams 4곳에 배열이
  // 복제되면 한 곳이 빠질 때 그 화면만 탭이 달라지는 사고가 난다.
  const groupTabs = getStatsGroupTabs(base, 'leaderboard')

  if (gated) {
    return <StatGate fullPage title="스탯은 회원 전용" description="시즌 스탯·리더보드·어워즈는 가입 승인된 회원만 볼 수 있어요." />
  }

  return (
    <div className="mm-brand space-y-5">
      {/* 스탯 우산 서브탭 — 리더보드 · 어워즈 · 선수 명단 · 팀 순위 */}
      <LeagueGroupTabs tabs={groupTabs} />

      {/* 헤더 + 필터 — 모바일 2줄 / PC 가로 정렬 */}
      <div className="space-y-3">
        <h2 className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em' }}>리그 스탯</h2>
        {/* 1줄: 분기 선택 */}
        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          <button onClick={() => setSelectedQuarterId('all')}
            className="shrink-0 px-3 py-2 text-sm font-black uppercase transition-colors cursor-pointer btn-press min-h-[44px]"
            style={selectedQuarterId === 'all'
              ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)' }
              : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
            }>전체</button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQuarterId(q.id)}
              className="shrink-0 px-3 py-2 text-sm font-black uppercase transition-colors cursor-pointer btn-press min-h-[44px]"
              style={selectedQuarterId === q.id
                ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)' }
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
          {/* TOP 5 슬롯 — 테이블 컬럼 헤더 클릭 시 해당 지표 TOP 5 표시 */}
          <TopFiveSlot
            metricKey={topFive.key}
            metricLabel={topFive.label}
            metricFullLabel={topFive.fullLabel}
            players={topFive.players}
            onPlayerClick={(id, name) => setQuickViewPlayer({ id, name })}
          />

          {/* 시즌 최고 한 줄 (옛 시즌하이 탭 흡수) — 정렬 지표가 매핑되는 카테고리를 가질 때만 표시 */}
          {matchedSeasonHigh && (
            <SeasonHighLine high={matchedSeasonHigh} orgSlug={orgSlug} leagueId={leagueId} />
          )}

          {/* 비교하기 버튼 */}
          {compareIds.size > 0 && (
            <div className="flex items-center gap-2 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--color-hoop-orange-500)' }}>
              <span className="text-xs font-black uppercase" style={{ color: 'var(--mm-ink)', letterSpacing: '0.08em' }}>선택: {compareList.map(id => compareNamesById[id]).filter(Boolean).join(' vs ')}</span>
              <button
                onClick={() => setCompareModalOpen(true)}
                disabled={compareIds.size !== 2}
                className="ml-auto px-3 py-1 text-xs font-black uppercase cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', letterSpacing: '0.08em' }}
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

          {/* 전체 스탯 테이블 */}
          <SectionCard variant="standalone">
            {/* 테이블 컨트롤 — 모바일 2줄 / PC 1줄 */}
            <div className="px-4 py-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex items-center gap-2 shrink-0">
                <TrendingUp size={14} style={{ color: 'var(--mm-ink-soft)' }} />
                <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '15px' }}>전체 스탯</span>
              </div>
              {/* 컨트롤 그룹 — 모바일에서 스크롤 가능한 가로 행 */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-hide sm:ml-auto sm:flex-wrap">
                {/* Basic / Shooting / Advanced 토글 */}
                <div className="flex overflow-hidden shrink-0" style={{ border: '1px solid var(--mm-rule)' }}>
                  {([
                    { k: 'basic'      as StatMode, label: 'Basic' },
                    { k: 'shooting'   as StatMode, label: 'Shooting' },
                    { k: 'advanced'   as StatMode, label: 'Advanced' },
                  ]).map(({ k, label }) => (
                    <button key={k} onClick={() => setStatMode(k)}
                      className="px-3 py-2 text-xs font-black uppercase cursor-pointer transition-colors btn-press min-h-[40px]"
                      style={statMode === k
                        ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', letterSpacing: '0.08em' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', letterSpacing: '0.08em' }
                      }>
                      {label}
                    </button>
                  ))}
                </div>
                {/* 누적/평균 토글 (Basic 모드에서만 의미 있음) */}
                <div className={`flex overflow-hidden shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`} style={{ border: '1px solid var(--mm-rule)' }}>
                  {(['avg','total'] as ViewMode[]).map(m => (
                    <button key={m} onClick={() => setViewMode(m)}
                      className="px-3 py-2 text-xs font-black uppercase cursor-pointer transition-colors btn-press min-h-[40px]"
                      style={viewMode === m
                        ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', letterSpacing: '0.08em' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', letterSpacing: '0.08em' }
                      }>
                      {m === 'avg' ? '평균' : '누적'}
                    </button>
                  ))}
                </div>
                {/* 단위 토글 (라운드 / 경기 슬롯) */}
                <div className="flex items-center gap-1 p-0.5 shrink-0" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                  {(['round','game'] as const).map(u => (
                    <button key={u} onClick={() => setStatUnit(u)}
                      title={u === 'round' ? '라운드(경기일)당' : '경기 슬롯당'}
                      className="px-3 py-1.5 text-xs font-black uppercase cursor-pointer transition-colors"
                      style={statUnit === u
                        ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', letterSpacing: '0.08em' }
                        : { background: 'transparent', color: 'var(--mm-ink-soft)', letterSpacing: '0.08em' }
                      }>
                      {u === 'round' ? 'R' : 'G'}
                    </button>
                  ))}
                </div>
                {/* 자동 임계값 뱃지 · 정규 참여자 필터 (수동 컨트롤 제거) */}
                <span
                  className="shrink-0 text-[11px] font-bold uppercase"
                  style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}
                  title={`이 기간에 열린 ${roundBase}라운드의 30% 이상 참여 · 정규 참여자 자동 필터`}
                >
                  최소 {autoMinGP}R 자격 · 전체 {roundBase}R
                </span>
              </div>
            </div>

            {statMode === 'basic' ? (<>
            {/* Basic — 모바일 정렬 칩 */}
            <div className="md:hidden px-3 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex gap-1.5 whitespace-nowrap">
                {COLS.map(({ key, label }) => (
                  <button key={key} onClick={() => handleSort(key)}
                    className="px-2.5 py-1 text-xs font-black uppercase transition-colors shrink-0"
                    style={sortKey === key
                      ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', letterSpacing: '0.08em' }
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
                const rt = rankTier(i + 1)
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--mm-rule)', borderLeft: `3px solid ${rt.accent}` }}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-jersey font-black tabular-nums w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full"
                        style={{ color: rt.color, background: rt.bg, border: rt.border, fontSize: '13px' }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold break-keep" style={{ color: 'var(--mm-ink)', fontSize: '16px', letterSpacing: '-0.005em', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.name}</div>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? '—'}{p.number ? ` · #${p.number}` : ''} · {p.gp}{statUnit === 'round' ? 'R' : 'G'}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-jersey font-black tabular-nums leading-none" style={{ color: 'var(--mm-ink)', fontSize: '30px', letterSpacing: '-0.015em' }}>{sortVal}</div>
                        <div className="text-[11px] font-black uppercase mt-1" style={{ color: 'var(--mm-ink)', letterSpacing: '0.16em' }}>{sortLabel}</div>
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
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-ink)' }}>
                    <th className="py-2 pl-2 pr-1 text-xs font-black uppercase text-right w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>#</th>
                    <th className="px-2 py-3 text-center text-xs font-black uppercase w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>비교</th>
                    <th className="text-left px-4 py-3 sticky left-0 font-bold min-w-[130px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', fontSize: '14px' }}>선수</th>
                    {COLS.map(({ key, label }) => {
                      const term = key === 'gp' ? (statUnit === 'round' ? 'R' : 'G') : label
                      return (
                        <th key={key} onClick={() => handleSort(key)}
                          className="px-3 py-3 text-center font-bold cursor-pointer select-none whitespace-nowrap transition-colors"
                          style={{
                            color: sortKey === key ? 'var(--mm-panel)' : 'var(--mm-ink)',
                            background: sortKey === key ? 'var(--mm-ink)' : 'transparent',
                            fontSize: '15px',
                          }}>
                          <StatHeader term={term} />
                          {sortKey === key
                            ? (sortDir === 'desc' ? <ChevronDown size={13} className="inline ml-0.5" /> : <ChevronUp size={13} className="inline ml-0.5" />)
                            : <ChevronsUpDown size={13} className="inline ml-0.5 opacity-50" />}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr key={p.player_id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                      <td className="py-2 pl-2 pr-1 text-right">
                        <span className="inline-flex items-center justify-center rounded-full font-jersey font-black tabular-nums w-6 h-6"
                          style={{ color: rankTier(i + 1).color, background: rankTier(i + 1).bg, border: rankTier(i + 1).border, fontSize: '13px' }}>{i+1}</span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <input type="checkbox" checked={compareIds.has(p.player_id)}
                          disabled={!compareIds.has(p.player_id) && compareIds.size >= 2}
                          onChange={() => toggleCompare(p)} aria-label={`${p.name} 비교 선택`}
                          className="cursor-pointer w-4 h-4 disabled:cursor-not-allowed disabled:opacity-30"
                          style={{ accentColor: 'var(--color-hoop-orange-500)' }} />
                      </td>
                      <td className="px-4 py-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      {COLS.map(({ key }) => {
                        const leader = isLeader(p, key as string)
                        const cellColor = sortKey === key
                          ? 'var(--mm-ink)'
                          : leader
                            ? 'var(--mm-ink)'
                            : 'var(--mm-ink-soft)'
                        const cellWeight = sortKey === key ? 900 : leader ? 900 : 600
                        return (
                          <td key={key}
                              className="px-3 py-3 text-center font-jersey tabular-nums"
                              style={{ color: cellColor, fontWeight: cellWeight, fontSize: '15px' }}
                              title={leader ? '리그 리더' : undefined}>
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
                      if (key === 'gp') return fmt1(avgOf('gp'))
                      if (key === 'fg_pct')  return `${fmt1(leagueFgPct)}%`
                      if (key === 'fg3_pct') return `${fmt1(leagueFg3Pct)}%`
                      if (key === 'ft_pct')  return `${fmt1(leagueFtPct)}%`
                      if (key === 'efg_pct') return `${fmt1(leagueEfgPct)}%`
                      const AVG_MAP: Partial<Record<SortKey, keyof PlayerStat>> = {
                        ppg: 'ppg', rpg: 'rpg', orp: 'orp', drp: 'drp',
                        apg: 'apg', spg: 'spg', bpg: 'bpg', topg: 'topg',
                      }
                      const src = AVG_MAP[key]
                      if (src) return fmt1(avgOf(src))
                      return '—'
                    }
                    // 누적 모드
                    if (key === 'gp') return String(totalOf('gp'))
                    if (key === 'fg_pct')  return `${fmt1(leagueFgPct)}%`
                    if (key === 'fg3_pct') return `${fmt1(leagueFg3Pct)}%`
                    if (key === 'ft_pct')  return `${fmt1(leagueFtPct)}%`
                    if (key === 'efg_pct') return `${fmt1(leagueEfgPct)}%`
                    if (key === 'fgm')  return `${totalFgm}/${totalFga}`
                    if (key === 'fg3m') return `${totalFg3m}/${totalFg3a}`
                    if (key === 'ftm')  return `${totalFtm}/${totalFta}`
                    const totKey = key as keyof PlayerStat
                    return String(totalOf(totKey))
                  }
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--mm-ink)', background: 'var(--mm-panel-alt)' }}>
                        <td className="py-3 pl-2 pr-1"></td>
                        <td className="px-2 py-3"></td>
                        <td className="px-4 py-3 sticky left-0" style={{ background: 'var(--mm-panel-alt)' }}>
                          <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '14px' }}>
                            {viewMode === 'avg' ? '리그 평균' : '리그 총합'}
                          </span>
                          <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>자격자 {filtered.length}명</div>
                        </td>
                        {COLS.map(({ key }) => (
                          <td key={key} className="px-3 py-3 text-center font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)', fontSize: '15px' }}>
                            {fmtCell(key)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>
              {/* 범례 — 특정 분기 뷰에서만 노출 */}
              {selectedQuarterId !== 'all' && (
                <div className="px-4 py-2 text-[11px] flex flex-wrap gap-x-4 gap-y-1" style={{ borderTop: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}>
                  <span><span className="font-jersey font-black" style={{ color: 'var(--mm-ink)' }}>굵게</span> = 리그 리더</span>
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
                      ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', letterSpacing: '0.08em' }
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
                const rt = rankTier(i + 1)
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--mm-rule)', borderLeft: `3px solid ${rt.accent}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-jersey font-black tabular-nums w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full"
                        style={{ color: rt.color, background: rt.bg, border: rt.border, fontSize: '11px' }}>{i+1}</span>
                      <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '-0.005em' }}>{p.name}</span>
                      <span className="text-[11px] font-bold uppercase ml-auto" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.gp}{statUnit === 'round' ? 'R' : 'G'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                      {SHOOTING_COLS.slice(0, 7).map(({ key, label }) => {
                        const active = shootSortKey === key
                        return (
                          <div key={key} className="text-center">
                            <div className="text-[11px] font-bold uppercase" style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-muted)', letterSpacing: '0.10em' }}>{label}</div>
                            <div className="font-jersey font-black tabular-nums mt-0.5" style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-ink)', fontSize: '15px' }}>{fmt1(sh[key])}%</div>
                          </div>
                        )
                      })}
                    </div>
                    {/* 슛 분포 스택 막대 (모바일 · 전체 폭) */}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[10px] font-bold uppercase tracking-[0.10em] shrink-0" style={{ color: shootSortKey === 'shot_mix' ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>SHOT MIX</span>
                      <div className="flex-1"><ShotMixBar p={p} height={10} /></div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Shooting — 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-ink)' }}>
                    <th className="py-2 pl-2 pr-1 text-xs font-black uppercase text-right w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>#</th>
                    <th className="text-left px-4 py-3 sticky left-0 font-bold min-w-[130px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', fontSize: '14px' }}>선수</th>
                    <th className="px-3 py-3 text-center text-xs font-black uppercase" style={{ color: 'var(--mm-ink-soft)', letterSpacing: '0.10em' }}>{statUnit === 'round' ? 'R' : 'G'}</th>
                    {SHOOTING_COLS.map(({ key, label, desc }, idx) => {
                      // 구분선: 슈팅 효율(0-6) | 야투 분포(7-10)
                      const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-ink)' } : {}
                      return (
                        <th key={key} onClick={() => handleShootSort(key)} title={desc}
                          className="px-3 py-3 text-center font-bold whitespace-nowrap cursor-pointer select-none transition-colors"
                          style={{
                            color: shootSortKey === key ? 'var(--mm-panel)' : 'var(--mm-ink)',
                            background: shootSortKey === key ? 'var(--mm-ink)' : 'transparent',
                            fontSize: '15px',
                            ...dividerStyle,
                          }}>
                          <StatHeader term={label} />
                          {shootSortKey === key
                            ? (shootSortDir === 'desc' ? <ChevronDown size={13} className="inline ml-0.5" /> : <ChevronUp size={13} className="inline ml-0.5" />)
                            : <ChevronsUpDown size={13} className="inline ml-0.5 opacity-50" />}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filteredShoot.map(({ p, sh }, i) => (
                    <tr key={p.player_id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                      <td className="py-2 pl-2 pr-1 text-right">
                        <span className="inline-flex items-center justify-center rounded-full font-jersey font-black tabular-nums w-6 h-6"
                          style={{ color: rankTier(i + 1).color, background: rankTier(i + 1).bg, border: rankTier(i + 1).border, fontSize: '13px' }}>{i+1}</span>
                      </td>
                      <td className="px-4 py-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-xs font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </td>
                      <td className="px-3 py-3 text-center font-jersey tabular-nums" style={{ color: 'var(--mm-muted)', fontSize: '14px' }}>{p.gp}</td>
                      {SHOOTING_COLS.map(({ key }, idx) => {
                        const val = sh[key]
                        const active = shootSortKey === key
                        // 구분선: 슈팅 효율(0-6) | 슛 분포(7 · SHOT MIX)
                        const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-rule)' } : {}
                        return (
                          <td key={key}
                              className="px-3 py-3 text-center font-jersey tabular-nums"
                              style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', fontWeight: active ? 900 : 600, fontSize: '15px', ...dividerStyle }}>
                            {key === 'shot_mix' ? <ShotMixBar p={p} /> : `${fmt1(val)}%`}
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
                      ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', letterSpacing: '0.08em' }
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
                const rt = rankTier(i + 1)
                return (
                  <button key={p.player_id} onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                    className="w-full text-left px-4 py-3 transition-colors"
                    style={{ borderTop: i === 0 ? 'none' : '1px solid var(--mm-rule)', borderLeft: `3px solid ${rt.accent}` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-jersey font-black tabular-nums w-5 h-5 shrink-0 inline-flex items-center justify-center rounded-full"
                        style={{ color: rt.color, background: rt.bg, border: rt.border, fontSize: '11px' }}>{i+1}</span>
                      <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '-0.005em' }}>{p.name}</span>
                      <span className="text-[11px] font-bold uppercase ml-auto" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>{p.gp}{statUnit === 'round' ? 'R' : 'G'}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                      {ADV_COLS.map(({ key, label }) => {
                        const isRatio = key === 'at_ratio'
                        const isCount = key === 'a1_total'
                        const active = advSortKey === key
                        return (
                          <div key={key} className="text-center">
                            <div className="text-[11px] font-bold uppercase" style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-muted)', letterSpacing: '0.10em' }}>{label}</div>
                            <div className="font-jersey font-black tabular-nums mt-0.5" style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-ink)', fontSize: '15px' }}>{isCount ? adv[key] : isRatio ? adv[key].toFixed(2) : `${fmt1(adv[key])}%`}</div>
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
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-ink)' }}>
                    <th className="py-2 pl-2 pr-1 text-xs font-black uppercase text-right w-8" style={{ color: 'var(--mm-ink)', letterSpacing: '0.10em' }}>#</th>
                    <th className="text-left px-4 py-3 sticky left-0 font-bold min-w-[130px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', fontSize: '14px' }}>선수</th>
                    <th className="px-3 py-3 text-center text-xs font-black uppercase" style={{ color: 'var(--mm-ink-soft)', letterSpacing: '0.10em' }}>{statUnit === 'round' ? 'R' : 'G'}</th>
                    {ADV_COLS.map(({ key, label, desc }) => (
                      <th key={key} onClick={() => handleAdvSort(key)} title={desc}
                        className="px-3 py-3 text-center font-bold whitespace-nowrap cursor-pointer select-none transition-colors"
                        style={{
                          color: advSortKey === key ? 'var(--mm-panel)' : 'var(--mm-ink)',
                          background: advSortKey === key ? 'var(--mm-ink)' : 'transparent',
                          fontSize: '15px',
                        }}>
                        <StatHeader term={label} />
                        {advSortKey === key
                          ? (advSortDir === 'desc' ? <ChevronDown size={13} className="inline ml-0.5" /> : <ChevronUp size={13} className="inline ml-0.5" />)
                          : <ChevronsUpDown size={13} className="inline ml-0.5 opacity-50" />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredAdv.map(({ p, adv }, i) => (
                    <tr key={p.player_id}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                      <td className="py-2 pl-2 pr-1 text-right">
                        <span className="inline-flex items-center justify-center rounded-full font-jersey font-black tabular-nums w-6 h-6"
                          style={{ color: rankTier(i + 1).color, background: rankTier(i + 1).bg, border: rankTier(i + 1).border, fontSize: '13px' }}>{i+1}</span>
                      </td>
                      <td className="px-4 py-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                        <button onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
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
                            style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', fontWeight: active ? 900 : 600, fontSize: '15px' }}>
                            {isCount ? val : isRatio ? val.toFixed(2) : `${fmt1(val)}%`}
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
          </SectionCard>
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

// useSearchParams 는 Suspense 경계 내에서 호출해야 하므로 default export 에서 감싼다.
export default function LeagueStatsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-16"><BasketballLoader size={32} /></div>}>
      <LeagueStatsPageInner />
    </Suspense>
  )
}
