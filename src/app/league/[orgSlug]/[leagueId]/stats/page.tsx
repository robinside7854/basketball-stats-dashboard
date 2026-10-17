'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import { useState, useEffect, useMemo, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Trophy, TrendingUp, ChevronUp, ChevronDown, ChevronsUpDown, Users, ArrowLeftRight, ArrowDown, ArrowUp, RotateCw } from 'lucide-react'
import StatsSkeleton from '@/components/league/stats/StatsSkeleton'
import TopFiveSlot, { type TopFivePlayer } from '@/components/league/stats/TopFiveSlot'

// 상호작용 트리거 후에만 필요 — 초기 번들에서 분리
const PlayerCompareModal = dynamic(() => import('@/components/league/PlayerCompareModal'), { ssr: false })
import StatHeader from '@/components/league/StatHeader'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import { getStatsGroupTabs } from '@/components/league/statsTabs'
import SectionCard from '@/components/league/ui/SectionCard'
import SectionHeader from '@/components/league/ui/SectionHeader'
import { ProgressBar } from '@/components/league/ui/viz'
import Chip from '@/components/league/ui/Chip'
import EmptyState from '@/components/league/ui/EmptyState'
import Avatar from '@/components/league/ui/Avatar'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import StatsGlossarySheet from '@/components/league/stats/StatsGlossarySheet'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import { QuarterChips } from '@/components/league/QuarterChips'
import type { PlayerStat } from '@/types/league'
import StatGate from '@/components/league/auth/StatGate'
import { calcUsg } from '@/lib/stats/advanced'
import { splitEligible, leagueMinRounds, isPctStatKey, meetsAttemptMin, attemptRuleLabel, type PctStatKey } from '@/lib/stats/eligibility'

type ViewMode = 'avg' | 'total'

// 최소 출전 자격 — 해당 기간 내 열린 라운드의 30% 이상 참여 (2026-08-03 완화)
// 이전엔 "리그 최다 출전자의 2/3" 였는데, 개근자 1명 때문에 커트라인이 과하게 올라가
// 정상 참여자까지 리더보드에서 빠지는 문제가 있었다. 값은 eligibility.ts(용어 시트와 공유).

// 한 번에 보여줄 선수 행 수 — 나머지는 "더 보기" 로 점진 노출한다(schedule/page.tsx 와 같은 방식).
// 자격을 통과한 선수 전원(미라클 기준 25~35명)을 세로로 잇던 것을 자른다.
// 12 인 이유: rankTier() 가 1·2·3 위와 4~10 위(top 티어)까지만 색을 주고 11 위부터는 중립이다.
// 12 면 색이 붙은 구간(1~10)이 전부 들어오고 중립 행 2개가 뒤따라 "여기서 끝이 아니다" 가
// 눈으로 드러난다. 10 으로 자르면 티어 경계와 목록 끝이 겹쳐 전체가 10명인 것처럼 읽힌다.
const INITIAL_VISIBLE = 12
const REVEAL_STEP = 12
type SortKey = 'ppg'|'rpg'|'orp'|'drp'|'apg'|'spg'|'bpg'|'topg'|'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'|'gp'|'pts'|'reb'|'oreb'|'dreb'|'ast'|'stl'|'blk'|'tov'|'fgm'|'fg3m'|'ftm'|'minutes_est'
type AdvKey = 'at_ratio'|'a1_total'|'trb_pct'|'usg_pct'
type ShootingKey = 'fg_pct'|'fg2_pct'|'fg3_pct'|'ft_pct'|'ts_pct'|'shot_mix'
type StatMode = 'basic'|'shooting'|'advanced'

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
// 리그 차트 팔레트(--mm-series-*)만 쓴다 — 라이트·다크 값이 globals.css 에 짝으로 있다.
const SHOT_MIX_COLORS = {
  ds:    'var(--mm-series-5)',  // 빨강 · 골밑 (덩크/포스트)
  lu:    'var(--mm-series-2)',  // 주황 · 레이업
  md:    'var(--mm-series-1)',  // 앰버 · 미드레인지
  three: 'var(--mm-series-3)',  // 청록 · 3점
} as const

function ShotMixBar({ p, width, height = 12 }: { p: PlayerStat; width?: number; height?: number }) {
  const fga = p.fga
  if (fga <= 0) {
    return <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>—</span>
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
// 미달 행은 흐리게 하지 않는다(대비가 4.5:1 아래로 떨어짐) — 「자격 미달」 글자 + 왼쪽 강조 막대 없음으로 구분.
function IneligibleTag() {
  return <span className="ml-1 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>· 자격 미달</span>
}
// 성공률 정렬에서 하루 평균 최소 시도(eligibility.ts MIN_ATTEMPTS_PER_DAY)를 못 채운 선수 — 표에는 두되 순위 없음
function LowAttemptTag() {
  return <span className="ml-1 text-xs font-medium whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>· 시도 부족</span>
}
// 「야투율은 하루 평균 야투 5개 이상 시도한 선수만 순위」 — 성공률로 정렬했을 때만 보인다
function AttemptRuleCaption({ k, className = '' }: { k: PctStatKey | null; className?: string }) {
  if (!k) return null
  return <p className={`text-xs font-medium ${className}`} style={{ color: 'var(--mm-muted)' }}>{attemptRuleLabel(k)}</p>
}

// 정렬 머리 — 표 머리칸(th) 안의 진짜 버튼. 용어 툴팁(StatHelpTooltip)도 버튼이라 정렬 버튼 안에 넣지 않고
// StatHeader 의 표시 칸(children)에 정렬 버튼을 끼운다 → 버튼 두 개가 나란히, 중첩 없음.
function ariaSort(active: boolean, dir: 'asc' | 'desc'): 'ascending' | 'descending' | 'none' {
  return active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
}
function SortHeader({ term, label, active, dir, onSort }: { term: string; label: string; active: boolean; dir: 'asc' | 'desc'; onSort: () => void }) {
  return (
    <StatHeader term={term} label={label} className="w-full justify-center">
      <button
        type="button"
        onClick={onSort}
        className="inline-flex items-center justify-center w-full min-h-6 cursor-pointer select-none bg-transparent border-0 p-0 [font:inherit] text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
        style={{ borderRadius: 4 }}
      >
        {label}
        {active
          ? (dir === 'desc' ? <ChevronDown size={14} className="ml-0.5" aria-hidden /> : <ChevronUp size={14} className="ml-0.5" aria-hidden />)
          : <ChevronsUpDown size={14} className="ml-0.5 opacity-50" aria-hidden />}
      </button>
    </StatHeader>
  )
}

function rankTier(rank: number | null): { color: string; bg: string; accent: string; border: string } {
  if (rank == null) return { color: 'var(--mm-muted)', bg: 'transparent', accent: 'transparent', border: 'none' }
  if (rank === 1) return { color: 'var(--rank-1-fg)', bg: 'var(--rank-1-bg)', accent: 'var(--rank-1-fg)', border: '1px solid var(--rank-1-fg)' }  // gold
  if (rank === 2) return { color: 'var(--rank-2-fg)', bg: 'var(--rank-2-bg)', accent: 'var(--rank-2-fg)', border: '1px solid var(--rank-2-fg)' }  // silver
  if (rank === 3) return { color: 'var(--rank-3-fg)', bg: 'var(--rank-3-bg)', accent: 'var(--rank-3-fg)', border: '1px solid var(--rank-3-fg)' }  // bronze
  if (rank <= 10) return { color: 'var(--rank-top-fg)', bg: 'var(--rank-top-bg)', accent: 'var(--rank-top-fg)', border: '1px solid var(--rank-top-fg)' }
  return { color: 'var(--mm-muted)', bg: 'transparent', accent: 'transparent', border: 'none' }
}

// ─── 모바일 선수 카드 (리뉴얼 3단계, 2026-10-12) ─────────────────────────
// 폰(<md)에서는 넓은 표 대신 카드 한 장에 한 사람. 정렬 지표를 크게, 핵심 숫자 3~4개는
// 리그 1위(자격자) 대비 막대로 — 숫자만 줄지어 있으면 「이게 높은 건가」를 판단할 수 없다.
// 카드 전체가 선수 상세(퀵뷰) 열기. 안에 용어 툴팁 버튼이 있어 <button> 대신 role="button" div.
type CardItem = { key: string; label: string; value: string; ratio: number | null; mark?: number | null; active?: boolean }

function MobileStatCard({
  rank, p, ineligible, lowAttempts = false, bigLabel, bigTerm, bigValue, items, footer, onOpen,
}: {
  /** null = 순위 없음(성공률 정렬에서 시도 부족) */
  rank: number | null
  p: PlayerStat
  ineligible: boolean
  lowAttempts?: boolean
  bigLabel: string
  bigTerm: string
  bigValue: string
  items: CardItem[]
  footer?: React.ReactNode
  onOpen: () => void
}) {
  const rt = rankTier(rank)
  return (
    <div role="button" tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
      aria-label={`${rank != null ? `${rank}위` : '순위 없음(시도 부족)'} ${p.name} — 선수 상세 보기`}
      className="w-full text-left px-3 py-3 cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderRadius: 'var(--mm-radius-card)',
      }}>
      <div className="flex items-center gap-2.5">
        <span className="t-num text-xs font-black w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-full"
          style={{ color: rt.color, background: rt.bg, border: rt.border }}>{rank ?? '–'}</span>
        <Avatar src={p.photo_url} name={p.name} size={40} decorative />
        <div className="flex-1 min-w-0">
          <div className="font-bold break-keep" style={{ color: 'var(--mm-ink)', fontSize: '16px', letterSpacing: '-0.005em', lineHeight: 1.2, overflowWrap: 'anywhere' }}>{p.name}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1">
            {p.team_name && (
              <Chip size="sm" icon={<span className="inline-block rounded-full" style={{ width: 8, height: 8, background: p.team_color ?? 'var(--mm-rule)', border: '1px solid var(--mm-rule)' }} />}>
                <span className="truncate max-w-[7rem]" title={p.team_name}>{p.team_name}</span>
              </Chip>
            )}
            <span className="text-xs font-medium" style={{ color: 'var(--mm-muted)' }}>{p.gp}일 출전{ineligible && <IneligibleTag />}{lowAttempts && <LowAttemptTag />}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-jersey font-black tabular-nums leading-none" style={{ color: lowAttempts ? 'var(--mm-muted)' : 'var(--mm-ink)', fontSize: '26px', letterSpacing: '-0.015em' }}>{bigValue}</div>
          <div className="text-xs font-black mt-1 flex items-center justify-end" style={{ color: 'var(--mm-ink-soft)' }}>
            <StatHeader term={bigTerm} label={bigLabel} />
          </div>
        </div>
      </div>
      {items.length > 0 && (
        <div className="grid gap-2 mt-3 pt-2.5" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, borderTop: '1px solid var(--mm-rule)' }}>
          {items.map(it => (
            <div key={it.key} className="min-w-0 flex flex-col justify-end">
              <div className="text-xs font-medium leading-tight break-keep" style={{ color: it.active ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{it.label}</div>
              <div className="t-num text-sm font-black mt-0.5 truncate" style={{ color: 'var(--mm-ink)' }}>{it.value}</div>
              <ProgressBar
                value={it.ratio ?? 0} max={1} mark={it.mark ?? null} height={5} className="mt-1"
                label={`${it.label} ${it.value}${it.ratio != null ? ` · 1위 대비 ${Math.round(it.ratio * 100)}%` : ''}`}
              />
            </div>
          ))}
        </div>
      )}
      {footer}
    </div>
  )
}

function LeagueStatsPageInner() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  // ?tab=seasonHigh 옛 링크(흡수 전 시즌하이 서브탭) 는 리더보드로 그대로 폴백된다 — 이 페이지는
  // ?tab 쿼리를 읽지 않으므로(자체 상태만으로 basic 진입) 자연히 폴백된다.
  // ?mode=awards(옛 어워즈 · 2026-10-14 삭제)는 이제 기본 표로 열린다.
  const searchParams = useSearchParams()

  // 페이지 간 분기 선택 공유 + 분기 목록의 단일 출처 (LeagueQuarterContext).
  //   목록·기본 분기(지금 분기) 판정은 컨텍스트가 한다 — 여기서 /quarters 를 다시 부르지 않는다.
  const { selectedQuarterId, setSelectedQuarterId, quarters, ready: quarterReady } = useLeagueQuarter()
  const [players, setPlayers] = useState<PlayerStat[]>([])
  const [totalRounds, setTotalRounds] = useState(0)  // 기간 내 열린 라운드 수 (자격 커트라인 분모)
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)  // 401 — 회원 전용
  const [error, setError] = useState(false)  // 응답 실패·네트워크 오류 — 「데이터 없음」과 구분한다
  const [reloadKey, setReloadKey] = useState(0)  // 「다시 시도」 — 같은 조건으로 한 번 더 부른다
  const [sortKey, setSortKey] = useState<SortKey>('ppg')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const router = useRouter()
  // 표 모드(basic/shooting/advanced)는 로컬 상태.
  // (2026-10-16) 「기록실」은 스탯 서브탭(/records)으로 승격 — 옛 ?mode=records 링크는 그쪽으로 보낸다.
  const [statMode, setStatMode] = useState<StatMode>('basic')
  const legacyRecords = searchParams.get('mode') === 'records'
  useEffect(() => {
    if (legacyRecords) router.replace(`/league/${orgSlug}/${leagueId}/records`)
  }, [legacyRecords, router, orgSlug, leagueId])
  const [advSortKey, setAdvSortKey] = useState<AdvKey>('at_ratio')
  const [advSortDir, setAdvSortDir] = useState<'asc'|'desc'>('desc')
  const [shootSortKey, setShootSortKey] = useState<ShootingKey>('ts_pct')
  const [shootSortDir, setShootSortDir] = useState<'asc'|'desc'>('desc')
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  // 선수 카드는 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  const setQuickViewPlayer = (p: { id: string; name: string } | null) => { if (p) openPlayerCard?.({ playerId: p.id, playerName: p.name, quarterId: selectedQuarterId }) }
  // 최소 출전 임계값 — 자동으로 리그 최다 출전의 2/3 로 고정 (사용자 수동 조작 제거 · 2026-07-15)
  // 이전엔 수동 입력 + '전체 선수' 토글이 있어 "왜 내 값이 안 먹지" 혼란 유발 → 자동 임계값 하나만 유지
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  // "더 보기" 노출 상한 — 모바일 카드뷰와 데스크탑 표뷰가 **한 상태를 공유**한다.
  // 뷰마다 따로 두면 화면 폭이 바뀔 때(회전·창 크기) 보이는 인원이 튄다.
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  // 「전체 명단 보기」 — 자격 미달 선수도 표에 올린다. TOP5·1위 굵게는 계속 자격자만.
  // SSR 과 첫 렌더를 맞추려고 false 로 시작하고 저장값은 effect 에서 읽는다.
  const showAllKey = `league:${leagueId}:stats:showAll`
  const [showAll, setShowAll] = useState(false)
  useEffect(() => {
    try { setShowAll(localStorage.getItem(showAllKey) === '1') } catch { /* private mode */ }
  }, [showAllKey])
  const toggleShowAll = () => {
    const next = !showAll
    setShowAll(next)
    try { localStorage.setItem(showAllKey, next ? '1' : '0') } catch { /* private mode */ }
  }

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
  // 비교 시트의 고르기 목록 — 자격 미달 포함 전원, 가나다순(검색과 함께 쓰므로 순위순보다 찾기 쉽다)
  const compareCandidates = useMemo(() => [...players]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    .map(p => ({ id: p.player_id, name: p.name, photo_url: p.photo_url, team_name: p.team_name, team_color: p.team_color, gp: p.gp })),
  [players])

  // 선택 분기가 확정되기 전(quarterReady=false)에는 조회하지 않는다 —
  //   종전엔 첫 렌더의 'all' 로 한 번, 지금 분기로 또 한 번 불러 시즌 전체 집계가 헛돌았다.
  useEffect(() => {
    if (!quarterReady) return
    setLoading(true)
    setError(false)
    const url = selectedQuarterId === 'all'
      ? `/api/leagues/${leagueId}/stats`
      : `/api/leagues/${leagueId}/stats?quarterId=${selectedQuarterId}`

    fetch(url)
      .then(r => {
        if (r.status === 401) { setGated(true); setLoading(false); return null }
        if (!r.ok) { setError(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => { if (d) { setPlayers(d.players ?? []); setTotalRounds(d.total_rounds ?? 0); setLoading(false) } })
      .catch(() => { setError(true); setLoading(false) })
  }, [leagueId, selectedQuarterId, quarterReady, reloadKey])


  // 정렬 지표·정렬 방향·스탯 모드·평균/누적·분기를 바꾸면 늘려둔 노출 수를 초기값으로 되돌린다.
  // 안 되돌리면 "PPG 로 30명까지 펼쳐 둔 상태" 가 3P% 정렬에 그대로 남아, 보려던 상위권이 아니라
  // 엉뚱한 구간이 이어서 보인다.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE)
  }, [sortKey, sortDir, statMode, viewMode, advSortKey, advSortDir, shootSortKey, shootSortDir, selectedQuarterId, showAll])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  // 자동 임계값: 해당 기간 내 열린 라운드(경기일)의 30% 이상 참여.
  // total_rounds 를 못 받은 경우(구 캐시 응답 등)만 최다 출전자 기준으로 폴백.
  const maxPlayerGP = useMemo(() => players.reduce((m, p) => Math.max(m, p.gp), 0), [players])
  const roundBase = totalRounds > 0 ? totalRounds : maxPlayerGP
  // 순위 자격 = leagueMinRounds 한 벌(홈 리더·선수 카드와 같다, 2026-10-15)
  const autoMinGP = leagueMinRounds(totalRounds, players)
  const effectiveMinGP = autoMinGP

  const { eligible, ineligible } = splitEligible(players, effectiveMinGP)
  const isIneligible = (p: PlayerStat) => p.gp < effectiveMinGP
  // 정렬은 자격·미달 구분 없이 한 줄로 — 미달자가 늘 아래에 깔리면 「정렬」이 거짓말이 된다.
  //   단, 성공률 정렬에서 **시도 부족**은 예외로 맨 아래(순위 없음)다 — 1개 던져 1개 넣은 100% 가
  //   1위에 앉으면 그 정렬은 아무것도 말해 주지 않는다(eligibility.ts MIN_ATTEMPTS_PER_DAY).
  const basicPctKey: PctStatKey | null = isPctStatKey(sortKey) ? sortKey : null
  const lowAttempts = (p: PlayerStat, k: PctStatKey | null) => k != null && !meetsAttemptMin(p, k)
  const filtered = (showAll ? [...eligible, ...ineligible] : eligible)
    .sort((a, b) => {
      const la = lowAttempts(a, basicPctKey), lb = lowAttempts(b, basicPctKey)
      if (la !== lb) return la ? 1 : -1
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
      'fgm','fga','fg3m','fg3a','ftm','fta','fg_pct','fg2_pct','fg3_pct','ft_pct','efg_pct','gp','minutes_est',
    ]
    for (const key of STAT_KEYS) {
      let best = -Infinity
      let ids = new Set<string>()
      const isPct = String(key).includes('_pct')
      for (const p of pool) {
        // 성공률 리더는 하루 평균 최소 시도를 채운 선수만 (eligibility.ts — 표 순위·TOP 5 와 같은 기준)
        if (isPct && isPctStatKey(String(key)) && !meetsAttemptMin(p, String(key) as PctStatKey)) continue
        const v = p[key] as number ?? 0
        if (v > best) { best = v; ids = new Set([p.player_id]) }
        else if (v === best) ids.add(p.player_id)
      }
      leaders[String(key)] = ids
    }
    return leaders
  }, [players, effectiveMinGP])

  const isLeader = (p: PlayerStat, key: string) => seasonLeaders[key]?.has(p.player_id) ?? false

  // 모바일 카드 막대의 분모 = 자격자 중 1위 값. 성공률은 최소 시도를 채운 선수만 1위 후보(seasonLeaders 와 같은 기준) —
  //   1개 던져 1개 넣은 100% 가 분모가 되면 모든 막대가 바닥에 깔린다.
  const leaderPool = players.filter(p => p.gp >= effectiveMinGP)
  function leaderOf(get: (p: PlayerStat) => number | null, pctKey?: PctStatKey | null): number {
    let best = 0
    for (const p of leaderPool) {
      if (pctKey && !meetsAttemptMin(p, pctKey)) continue
      const v = get(p)
      if (v != null && Number.isFinite(v) && v > best) best = v
    }
    return best
  }
  const ratioOf = (v: number | null, leader: number) => (v == null || leader <= 0 ? null : Math.max(0, Math.min(1, v / leader)))
  const basicAttempts = (key: SortKey): ((p: PlayerStat) => number) | undefined =>
    key === 'fg3_pct' ? p => p.fg3a : key === 'ft_pct' ? p => p.fta : (key === 'fg_pct' || key === 'efg_pct') ? p => p.fga : undefined
  const pctKeyOf = (key: string): PctStatKey | null => (isPctStatKey(key) ? key : null)

  // 테이블 컬럼 정의
  // label = 화면 글자(한국어), term = 용어 사전 키(툴팁). 약어는 툴팁 안에만 남긴다(2026-10-12 리뉴얼 3단계).
  const AVG_COLS: { key: SortKey; label: string; term: string }[] = [
    { key: 'gp', label: '출전', term: 'R' }, { key: 'ppg', label: '득점', term: '득점' },
    { key: 'rpg', label: '리바', term: '리바' }, { key: 'orp', label: '공리', term: '공리' }, { key: 'drp', label: '수리', term: '수리' },
    { key: 'apg', label: '어시', term: '어시' }, { key: 'spg', label: '스틸', term: '스틸' }, { key: 'bpg', label: '블락', term: '블락' },
    { key: 'topg', label: '턴오버', term: '턴오버' }, { key: 'fg_pct', label: '야투율', term: 'FG%' }, { key: 'fg3_pct', label: '3점률', term: '3P%' },
    { key: 'ft_pct', label: '자유투율', term: 'FT%' }, { key: 'efg_pct', label: '유효야투', term: 'eFG%' },
  ]
  const TOTAL_COLS: { key: SortKey; label: string; term: string }[] = [
    { key: 'gp', label: '출전', term: 'R' }, { key: 'pts', label: '득점', term: 'PTS' },
    { key: 'reb', label: '리바', term: 'REB' }, { key: 'oreb', label: '공리', term: 'OREB' }, { key: 'dreb', label: '수리', term: 'DREB' },
    { key: 'ast', label: '어시', term: 'AST' }, { key: 'stl', label: '스틸', term: 'STL' }, { key: 'blk', label: '블락', term: 'BLK' },
    { key: 'tov', label: '턴오버', term: 'TOV' },
    { key: 'fgm', label: '야투', term: 'FGM' }, { key: 'fg3m', label: '3점', term: '3PM' }, { key: 'ftm', label: '자유투', term: 'FTM' },
    { key: 'fg_pct', label: '야투율', term: 'FG%' }, { key: 'fg3_pct', label: '3점률', term: '3P%' }, { key: 'ft_pct', label: '자유투율', term: 'FT%' },
    // MIN 은 누적 뷰에만 둔다 — 교체 기록이 거의 없어 이벤트 시각으로 추정한 값이라
    // 하루 평균까지 내면 오차가 두 번 곱해진다. 추정이 섞이면 값 옆에 * 를 붙인다.
    { key: 'minutes_est', label: '시간', term: 'MIN' },
  ]

  // Shooting stats 컬럼 — 슈팅 정확도 + 야투 분포
  // SHOOTING 컬럼 (2026-07-19 재개편)
  //   · 개별 % 지표는 텍스트 (모바일 카드는 2026-10-12 부터 숫자 아래 미니 막대 + 자격자 평균 기준선)
  //   · 야투 존별 비중 (DS/LU/MD/3P) 4개 컬럼 → SHOT MIX 스택 막대 단일 컬럼으로 통합
  //     한 선수의 슛 성향을 한눈에 파악
  const SHOOTING_COLS: { key: ShootingKey; label: string; term: string; desc: string }[] = [
    { key: 'fg_pct',   label: '야투율',   term: 'FG%', desc: '전체 야투 성공률 · FGM/FGA' },
    { key: 'fg2_pct',  label: '2점률',    term: '2P%', desc: '2점 야투 성공률 · (FGM-3PM)/(FGA-3PA)' },
    { key: 'fg3_pct',  label: '3점률',    term: '3P%', desc: '3점 야투 성공률 · 3PM/3PA' },
    { key: 'ft_pct',   label: '자유투율', term: 'FT%', desc: '자유투 성공률 · FTM/FTA' },
    { key: 'ts_pct',   label: '진실야투', term: 'TS%', desc: '진실야투율 · PTS/(2×(FGA+0.44×FTA))' },
    { key: 'shot_mix', label: '슛 분포',  term: '3P share', desc: '골밑 · 레이업 · 미들 · 3점 시도 비중 막대 (정렬은 3점 비중)' },
  ]

  // Advanced stats 컬럼 (Shooting 제외 — 효율/볼소유/리바운드 비중)
  const ADV_COLS: { key: AdvKey; label: string; term: string; desc: string }[] = [
    { key: 'at_ratio',  label: '어시/턴오버', term: 'A/T',  desc: '어시스트/턴오버 비율' },
    { key: 'a1_total',  label: '앤드원',      term: 'A1',   desc: '성공한 앤드원(And-One) 횟수 (누적)' },
    { key: 'trb_pct',   label: '리바 비중',   term: 'TRB%', desc: '본인 출전 경기에서 팀 리바운드 대비 본인 비중 · REB/팀 REB' },
    { key: 'usg_pct',   label: '공격 점유',   term: 'USG%', desc: '본인 출전 경기에서 팀 공격 점유율 · (FGA+0.44×FTA+TOV)/팀 합' },
  ]

  // usg_pct 만 null 가능(팀 분모 0) — 0% 로 찍으면 "공격을 안 했다"로 읽혀 거짓이 된다
  function calcAdv(p: PlayerStat): Record<AdvKey, number | null> {
    const a1 = p.and_one ?? 0
    const teamReb = p.team_reb_in_games ?? 0
    return {
      at_ratio:  p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : (p.ast > 0 ? 99 : 0),
      a1_total:  a1,
      trb_pct:   teamReb > 0 ? +(p.reb / teamReb * 100).toFixed(1) : 0,
      usg_pct:   calcUsg(p, p.team_poss_in_games ?? 0),
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
      // null(분모 없음)은 정렬 방향과 무관하게 맨 뒤
      const av = a.adv[advSortKey], bv = b.adv[advSortKey]
      if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1
      const diff = av - bv
      return advSortDir === 'desc' ? -diff : diff
    })

  // Shooting 정렬된 리스트 — 성공률 정렬이면 시도 부족을 맨 아래로(기본 표와 같은 규칙)
  const shootPctKey: PctStatKey | null = pctKeyOf(shootSortKey)
  const filteredShoot = [...filtered]
    .map(p => ({ p, sh: calcShoot(p) }))
    .sort((a, b) => {
      const la = lowAttempts(a.p, shootPctKey), lb = lowAttempts(b.p, shootPctKey)
      if (la !== lb) return la ? 1 : -1
      const diff = a.sh[shootSortKey] - b.sh[shootSortKey]
      return shootSortDir === 'desc' ? -diff : diff
    })

  // 노출 상한 적용 — 세 모드가 **같은 visibleCount** 를 쓴다. 모드마다 따로 두면
  // Basic → Shooting 으로 옮길 때 보이는 인원이 튄다. 셋 다 같은 자격자 목록(filtered)에서
  // 정렬만 다시 한 것이라 남은 인원 수도 항상 같다.
  const visibleBasic = filtered.slice(0, visibleCount)
  const visibleShoot = filteredShoot.slice(0, visibleCount)

  // 슈팅 카드 막대의 기준선 = 지금 목록의 자격자 평균(시도 0인 선수는 빼고 낸다 — 0% 로 끌어내리지 않게)
  const SHOOT_ATTEMPTS: Record<ShootingKey, (p: PlayerStat) => number> = {
    fg_pct: p => p.fga,
    fg2_pct: p => p.fga - p.fg3a,
    fg3_pct: p => p.fg3a,
    ft_pct: p => p.fta,
    ts_pct: p => p.fga + p.fta,
    shot_mix: p => p.fga,
  }
  const shootAvg = (key: ShootingKey): number | null => {
    const rows = filteredShoot.filter(({ p }) => !isIneligible(p) && SHOOT_ATTEMPTS[key](p) > 0)
    if (rows.length === 0) return null
    return rows.reduce((s, r) => s + r.sh[key], 0) / rows.length
  }
  const shootMarks = Object.fromEntries(
    SHOOTING_COLS.map(c => [c.key, shootAvg(c.key)])
  ) as Record<ShootingKey, number | null>
  const visibleAdv = filteredAdv.slice(0, visibleCount)
  const hiddenCount = Math.max(0, filtered.length - visibleCount)

  function handleAdvSort(key: AdvKey) {
    if (key === advSortKey) setAdvSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setAdvSortKey(key); setAdvSortDir('desc') }
  }
  function handleShootSort(key: ShootingKey) {
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
      if (key === 'minutes_est') {
        if (!p.minutes_est) return '—'
        return `${Math.round(p.minutes_est)}${p.minutes_est_used ? '*' : ''}`
      }
      return String((p as unknown as Record<string, number>)[key] ?? 0)
    }
  }

  // TOP 5 슬롯용 데이터 — 현재 statMode + 해당 모드의 sortKey 로 상위 5명 산출
  // 리더는 항상 값이 큰 순 (사용자 sortDir 무시)
  const topFive = useMemo<{ key: string | null; label: string | null; fullLabel: string | null; players: TopFivePlayer[] }>(() => {
    if (players.length === 0) {
      return { key: null, label: null, fullLabel: null, players: [] }
    }
    const eligibleBase = players.filter(p => p.gp >= effectiveMinGP)

    if (statMode === 'basic') {
      const col = (viewMode === 'avg' ? AVG_COLS : TOTAL_COLS).find(c => c.key === sortKey)
      const label = col?.label ?? String(sortKey)
      const fullLabel = BASIC_FULL_LABELS[sortKey] ?? label
      // 성공률은 하루 평균 최소 시도를 채운 선수만 (eligibility.ts — 표 순위와 같은 기준)
      const pk = pctKeyOf(sortKey)
      const pool = pk ? eligibleBase.filter(p => meetsAttemptMin(p, pk)) : eligibleBase
      const sorted = [...pool].sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number)).slice(0, 5)
      return {
        key: `basic:${sortKey}:${viewMode}`,
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
      // 성공률은 하루 평균 최소 시도를 채운 선수만 (eligibility.ts). 슛 분포(3점 비중)는 야투가 있으면 된다
      const pk = pctKeyOf(shootSortKey)
      const pool = eligibleBase.filter(p => (pk ? meetsAttemptMin(p, pk) : p.fga > 0))
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
    const withVals = eligibleBase
      .map(p => ({ p, val: calcAdv(p)[advSortKey] }))
      .filter((x): x is { p: PlayerStat; val: number } => x.val != null)
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
  }, [statMode, sortKey, shootSortKey, advSortKey, players, effectiveMinGP, viewMode])

  const base = `/league/${orgSlug}/${leagueId}`
  // 리더보드·팀·기록실 3개 서브탭 (2026-09-28 명단 → 팀 화면 · 2026-10-14 어워즈 삭제 · 2026-10-16 기록실 승격).
  // 배열은 공유 헬퍼(statsTabs.ts)에서 가져온다 — 페이지마다 배열이
  // 복제되면 한 곳이 빠질 때 그 화면만 탭이 달라지는 사고가 난다.
  const groupTabs = getStatsGroupTabs(base, 'leaderboard')

  // 기본 / 슈팅 / 고급 토글 — 헤더(분기 칩 아래)에 한 번만 둔다.
  const modeChips = (
    <SegmentedTabs<StatMode>
      items={[
        { key: 'basic',    label: '기본' },
        { key: 'shooting', label: '슈팅' },
        { key: 'advanced', label: '고급' },
      ]}
      value={statMode}
      onChange={setStatMode}
      ariaLabel="표 모드"
    />
  )

  if (gated) {
    return <StatGate fullPage title="스탯은 회원 전용" description="시즌 스탯·리더보드는 가입 승인된 회원만 볼 수 있어요." />
  }

  return (
    <div className="mm-brand space-y-5">
      {/* 스탯 우산 서브탭 — 리더보드 · 팀 · 기록실 */}
      <LeagueGroupTabs tabs={groupTabs} />

      {/* 헤더 + 필터 — 모바일 2줄 / PC 가로 정렬 */}
      {/* 제목 · 분기 · 표 모드를 한 카드에 — 배경 위에 칩만 떠 있지 않게 (2026-10-13) */}
      <SectionCard variant="standalone" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-black text-[28px] leading-[1.15] tracking-[-0.005em] text-[color:var(--mm-ink)]">리그 스탯</h2>
          {/* 「숫자 읽는 법」 — 하루 평균·+1·자유투 룰·친선 제외·최소 출전/시도 기준 (glossary.ts READING_GUIDE) */}
          <StatsGlossarySheet className="shrink-0" />
        </div>
        {/* 1줄: 분기 선택 */}
        <QuarterChips
          quarters={quarters.map(q => ({ id: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q`, isCurrent: q.is_current }))}
          value={selectedQuarterId}
          onChange={setSelectedQuarterId}
        />
        {/* 2줄: 표 모드 — 표 카드 안에 두면 375px 에서 4번째 칩이 잘려서, 모든 모드 공통 위치로 뺐다 */}
        <div className="flex">{modeChips}</div>
      </SectionCard>

      {loading ? (
        <StatsSkeleton variant="body" />
      ) : error ? (
        <EmptyState
          icon={Trophy}
          title="스탯을 불러오지 못했어요"
          description="잠시 뒤 다시 시도해 주세요."
          action={
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="mm-press inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-11 text-sm font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}
            >
              <RotateCw size={16} aria-hidden="true" />
              다시 시도
            </button>
          }
        />
      ) : players.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="아직 끝난 경기가 없어요"
          description="첫 경기가 끝나면 여기에 기록이 쌓여요"
        />
      ) : (
        <>
          {/* TOP 5 슬롯 — 테이블 컬럼 헤더 클릭 시 해당 지표 TOP 5 표시 */}
          <TopFiveSlot
            metricKey={topFive.key}
            metricLabel={topFive.label}
            metricFullLabel={topFive.fullLabel}
            players={topFive.players}
            onPlayerClick={(id, name) => setQuickViewPlayer({ id, name })}
            controls={<>
          {/* 모바일 정렬 칩 — TOP 5 카드 안, 사진 바로 위 (2026-10-11).
              종전엔 표 카드 안(비교 바·읽는 법·표 컨트롤 아래)에 있어서, 칩을 누르면 바뀌는 TOP 5 가
              화면 위로 멀리 떨어져 "무엇이 바뀌었는지"가 한눈에 안 보였다. 누르는 곳과 바뀌는 곳을 붙인다.
              세 모드(기본·슈팅·고급)의 칩 행을 하나로 합쳤다 — 지금 모드의 열·정렬 상태만 보여준다. */}
          {(() => {
            const chipRow = statMode === 'basic'
              ? { cols: COLS.map(c => ({ key: c.key as string, label: c.label })), active: sortKey as string, dir: sortDir, onPick: (k: string) => handleSort(k as SortKey) }
              : statMode === 'shooting'
              ? { cols: SHOOTING_COLS.map(c => ({ key: c.key as string, label: c.label })), active: shootSortKey as string, dir: shootSortDir, onPick: (k: string) => handleShootSort(k as typeof shootSortKey) }
              : { cols: ADV_COLS.map(c => ({ key: c.key as string, label: c.label })), active: advSortKey as string, dir: advSortDir, onPick: (k: string) => handleAdvSort(k as typeof advSortKey) }
            return (
              <div className="md:hidden -mx-1 px-1 mb-2 overflow-x-auto" role="group" aria-label="정렬 기준 (TOP 5 함께 바뀜)">
                <div className="flex gap-1.5 whitespace-nowrap pb-1">
                  {chipRow.cols.map(({ key, label }) => (
                    <Chip key={key} as="button" size="sm" onClick={() => chipRow.onPick(key)}
                      selected={chipRow.active === key}>
                      <span className="inline-flex items-center gap-0.5">{label}{chipRow.active === key && (chipRow.dir === 'desc' ? <ArrowDown size={14} aria-label="내림차순" /> : <ArrowUp size={14} aria-label="오름차순" />)}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )
          })()}
          <AttemptRuleCaption k={statMode === 'basic' ? basicPctKey : statMode === 'shooting' ? shootPctKey : null} className="mb-2" />
            </>}
          />

          {/* 비교하기 버튼 */}
          {compareIds.size > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 lg:px-6" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-card)' }}>
              <span className="text-xs font-semibold" style={{ color: 'var(--mm-ink)' }}>선택: {compareList.map(id => compareNamesById[id]).filter(Boolean).join(' vs ')}</span>
              <button
                onClick={() => setCompareModalOpen(true)}
                disabled={compareIds.size === 0}
                type="button"
                className="mm-press ml-auto sm:ml-3 px-3 py-1 min-h-11 text-xs font-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                비교하기 ({compareIds.size}/2)
              </button>
              <button
                onClick={() => setCompareIds(new Set())}
                type="button"
                className="mm-press px-3 py-1 min-h-11 text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                초기화
              </button>
            </div>
          )}

          {/* 「이 표 읽는 법」 접힘 상자는 머리의 「숫자 읽는 법」 시트로 합쳤다(2026-10-14) */}

          {/* 전체 스탯 테이블 */}
          <SectionCard variant="standalone" pad="none">
            {/* 테이블 컨트롤 — 모바일 2줄 / PC 1줄 */}
            {/* 폰: 컨트롤 묶음(actions)이 제목 아래 한 줄을 통째로 쓴다 — 버튼이 남는 폭을 나눠 채우게 */}
            <SectionHeader
              title="전체 스탯"
              icon={<TrendingUp size={18} />}
              className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
              actions={<>
                {/* 누적/평균 토글 (Basic 모드에서만 의미 있음) */}
                <div className={`flex overflow-hidden shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`} style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  {(['avg','total'] as ViewMode[]).map(m => (
                    <button key={m} type="button" onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
                      className="px-3 py-2 text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors mm-press min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--mm-yellow-strong)]"
                      style={viewMode === m
                        ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)' }
                      }>
                      {m === 'avg' ? '하루 평균' : '누적'}
                    </button>
                  ))}
                </div>
                {/* 자동 임계값 뱃지 · 정규 참여자 필터 (수동 컨트롤 제거) */}
                {/* 폰: 기준 문구는 한 줄을 통째로 쓰고(맨 위), 버튼은 남는 폭을 나눠 채운다 —
                    종전엔 토글·문구·버튼이 제각각 줄바꿈돼 줄마다 오른쪽이 들쭉날쭉 비었다 */}
                <span
                  className="shrink-0 basis-full order-first sm:basis-auto sm:order-none text-xs font-medium tabular-nums"
                  style={{ color: 'var(--mm-muted)' }}
                  title={`이 기간에 열린 ${roundBase}라운드의 30% 이상 참여 · 정규 참여자 자동 필터`}
                >
                  {showAll ? `전체 명단 · 자격 최소 ${autoMinGP}일 출전` : `최소 ${autoMinGP}일 출전 · 전체 ${roundBase}일`}
                </span>
                <button
                  type="button"
                  onClick={toggleShowAll}
                  aria-pressed={showAll}
                  className="flex-1 sm:flex-none shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors mm-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={showAll
                    ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }
                    : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
                >
                  <Users size={16} aria-hidden="true" />
                  전체 명단 보기
                </button>
                {/* 선수 비교 — 폰·PC 공통 진입점. PC 표에서 체크한 선수가 있으면 그 선수로 채워 연다 */}
                <button
                  type="button"
                  onClick={() => setCompareModalOpen(true)}
                  className="flex-1 sm:flex-none shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-11 text-sm font-black whitespace-nowrap cursor-pointer transition-colors mm-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-ctl)' }}
                >
                  <ArrowLeftRight size={16} aria-hidden="true" />
                  선수 비교
                </button>
              </>}
            />

            {(() => {
              const k = statMode === 'basic' ? basicPctKey : statMode === 'shooting' ? shootPctKey : null
              return k ? (
                <div className="px-4 py-2 lg:px-6" style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
                  <AttemptRuleCaption k={k} />
                </div>
              ) : null
            })()}

            {statMode === 'basic' ? (<>
            {/* Basic — 모바일 카드뷰 (정렬 지표 크게 + 핵심 4칸 · 1위 대비 막대) */}
            <div className="md:hidden p-2.5 space-y-2">
              {visibleBasic.map((p, i) => {
                const sortCol = COLS.find(c => c.key === sortKey)
                // 보조 4칸은 고정 우선순위로 고른다 — 표 순서대로 앞 4칸을 쓰면 득점순일 때
                //   리바운드만 세 번 나오고 어시스트가 빠졌다(2026-10-11). 출전일은 이름 아래에 있다.
                const subPref: SortKey[] = viewMode === 'avg'
                  ? ['ppg', 'rpg', 'apg', 'fg_pct', 'spg', 'fg3_pct', 'bpg']
                  : ['pts', 'reb', 'ast', 'fg_pct', 'stl', 'fg3m', 'blk']
                const items: CardItem[] = subPref
                  .filter(k => k !== sortKey)
                  .slice(0, 4)
                  .map(k => COLS.find(c => c.key === k))
                  .filter((c): c is NonNullable<typeof c> => !!c)
                  .map(c => {
                    const att = basicAttempts(c.key)
                    const raw = p[c.key] as number
                    const has = !att || att(p) > 0
                    return {
                      key: c.key, label: c.label, value: cellVal(p, c.key),
                      ratio: has ? ratioOf(raw, leaderOf(q => q[c.key] as number, pctKeyOf(c.key))) : null,
                    }
                  })
                const low = lowAttempts(p, basicPctKey)
                return (
                  <MobileStatCard key={p.player_id} rank={low ? null : i + 1} p={p} ineligible={isIneligible(p)} lowAttempts={low}
                    bigLabel={sortCol?.label ?? ''} bigTerm={sortCol?.term ?? ''} bigValue={cellVal(p, sortKey)}
                    items={items}
                    onOpen={() => setQuickViewPlayer({ id: p.player_id, name: p.name })} />
                )
              })}
            </div>

            {/* Basic — 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-ink)' }}>
                    <th scope="col" className="t-th text-right pl-2 pr-1 w-8" style={{ color: 'var(--mm-ink)' }}>#</th>
                    <th scope="col" className="t-th px-2 w-8" style={{ color: 'var(--mm-ink)' }}>비교</th>
                    <th scope="col" className="t-th text-left px-2 sticky left-0 min-w-[120px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)' }}>선수</th>
                    {COLS.map(({ key, label, term }) => {
                      return (
                        <th key={key} scope="col" aria-sort={ariaSort(sortKey === key, sortDir)}
                          className="t-th px-1.5 select-none transition-colors duration-200"
                          style={{
                            color: sortKey === key ? 'var(--mm-panel)' : 'var(--mm-ink)',
                            background: sortKey === key ? 'var(--mm-ink)' : 'transparent',
                          }}>
                          <SortHeader term={term} label={label} active={sortKey === key} dir={sortDir} onSort={() => handleSort(key)} />
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleBasic.map((p, i) => {
                    const rank = lowAttempts(p, basicPctKey) ? null : i + 1
                    return (
                    <tr key={p.player_id}
                      className="group transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                      style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                      <td className="py-2 pl-2 pr-1 text-right">
                        <span className="t-num text-base font-bold inline-flex items-center justify-center rounded-full size-7"
                          style={{ color: rankTier(rank).color, background: rankTier(rank).bg, border: rankTier(rank).border }}
                          title={rank == null ? '시도 부족 — 순위 없음' : undefined}>{rank ?? '–'}</span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <input type="checkbox" checked={compareIds.has(p.player_id)}
                          disabled={!compareIds.has(p.player_id) && compareIds.size >= 2}
                          onChange={() => toggleCompare(p)} aria-label={`${p.name} 비교 선택`}
                          className="cursor-pointer w-4 h-4 disabled:cursor-not-allowed disabled:opacity-30"
                          style={{ accentColor: 'var(--mm-yellow-strong)' }} />
                      </td>
                      <th scope="row" className="px-2 py-3 sticky left-0 text-left font-normal align-middle transition-colors bg-[color:var(--mm-panel)] group-hover:bg-[color:var(--mm-panel-alt)]">
                        <button type="button" onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--mm-muted)' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </th>
                      {COLS.map(({ key }) => {
                        const leader = isLeader(p, key as string)
                        // 성공률 칸은 시도 기준 미달이면 흐린 글자(순위 대상 아님) — 정렬 중인 칸엔 「시도 부족」도 붙인다
                        const low = lowAttempts(p, pctKeyOf(key))
                        const cellColor = low
                          ? 'var(--mm-muted)'
                          : sortKey === key || leader
                            ? 'var(--mm-ink)'
                            : 'var(--mm-ink-soft)'
                        return (
                          <td key={key}
                              className={`px-1.5 ${(sortKey === key || leader) && !low ? 't-td-key' : 't-td'}`}
                              style={{ color: cellColor }}
                              title={leader ? '리그 리더' : low ? '시도 부족 — 순위 대상 아님' : undefined}>
                            {cellVal(p, key)}
                            {key === 'gp' && isIneligible(p) && <IneligibleTag />}
                            {key === sortKey && low && <LowAttemptTag />}
                          </td>
                        )
                      })}
                    </tr>
                    )
                  })}
                </tbody>
                {/* Career Totals Footer — 자격자 대상 리그 총합/평균 */}
                {/* 푸터는 토글과 무관하게 자격자 기준 — 「리그 평균」에 1경기 뛴 선수가 섞이면 기준선이 흔들린다 */}
                {eligible.length > 0 && (() => {
                  const totalOf = (k: keyof PlayerStat) => eligible.reduce((s, p) => s + ((p[k] as number) ?? 0), 0)
                  const avgOf = (k: keyof PlayerStat) => eligible.length > 0 ? totalOf(k) / eligible.length : 0
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
                    if (key === 'minutes_est') return String(Math.round(totalOf('minutes_est')))
                    const totKey = key as keyof PlayerStat
                    return String(totalOf(totKey))
                  }
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--mm-ink)', background: 'var(--mm-panel-alt)' }}>
                        <td className="py-3 pl-2 pr-1"></td>
                        <td className="px-2 py-3"></td>
                        <td className="px-4 py-3 sticky left-0" style={{ background: 'var(--mm-panel-alt)' }}>
                          <span className="font-semibold text-base" style={{ color: 'var(--mm-ink)' }}>
                            {viewMode === 'avg' ? '리그 평균' : '리그 총합'}
                          </span>
                          <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--mm-muted)' }}>자격자 {eligible.length}명</div>
                        </td>
                        {COLS.map(({ key }) => (
                          <td key={key} className="t-td-key">
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
                <div className="px-4 py-2 text-xs flex flex-wrap gap-x-4 gap-y-1" style={{ borderTop: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}>
                  <span><span className="font-black" style={{ color: 'var(--mm-ink)' }}>굵게</span> = 리그 리더</span>
                </div>
              )}
            </div>
            </>) : statMode === 'shooting' ? (<>
            {/* Shooting — 모바일 카드뷰 (막대 = 1위 대비, 세로선 = 자격자 평균) */}
            <div className="md:hidden">
              <div className="px-4 py-1.5 text-xs flex items-center gap-1.5" style={{ color: 'var(--mm-muted)', borderBottom: '1px solid var(--mm-rule)' }}>
                <span aria-hidden className="inline-block" style={{ width: 2, height: 10, background: 'var(--mm-ink)' }} />
                막대 = 1위 대비 · 세로선 = 자격자 평균
              </div>
              <div className="p-2.5 space-y-2">
              {visibleShoot.map(({ p, sh }, i) => {
                const sortCol = SHOOTING_COLS.find(c => c.key === shootSortKey)
                const isMix = shootSortKey === 'shot_mix'
                const pref: ShootingKey[] = ['fg_pct', 'fg3_pct', 'ft_pct', 'ts_pct', 'fg2_pct']
                const items: CardItem[] = pref
                  .filter(k => k !== shootSortKey)
                  .slice(0, 4)
                  .map(k => {
                    const c = SHOOTING_COLS.find(x => x.key === k)!
                    const att = SHOOT_ATTEMPTS[k]
                    const has = att(p) > 0
                    const leader = leaderOf(q => calcShoot(q)[k], pctKeyOf(k))
                    return {
                      key: k, label: c.label, value: has ? `${fmt1(sh[k])}%` : '—',
                      ratio: has ? ratioOf(sh[k], leader) : null,
                      mark: shootMarks[k] != null && leader > 0 ? Math.min(1, shootMarks[k]! / leader) : null,
                    }
                  })
                const low = lowAttempts(p, shootPctKey)
                return (
                  <MobileStatCard key={p.player_id} rank={low ? null : i + 1} p={p} ineligible={isIneligible(p)} lowAttempts={low}
                    bigLabel={isMix ? '3점 비중' : (sortCol?.label ?? '')} bigTerm={sortCol?.term ?? ''}
                    bigValue={SHOOT_ATTEMPTS[shootSortKey](p) > 0 ? `${fmt1(sh[shootSortKey])}%` : '—'}
                    items={items}
                    footer={
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-xs font-semibold shrink-0" style={{ color: isMix ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>슛 분포</span>
                        <div className="flex-1 min-w-0"><ShotMixBar p={p} height={10} /></div>
                      </div>
                    }
                    onOpen={() => setQuickViewPlayer({ id: p.player_id, name: p.name })} />
                )
              })}
              </div>
            </div>

            {/* Shooting — 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-ink)' }}>
                    <th scope="col" className="t-th text-right pl-2 pr-1 w-8" style={{ color: 'var(--mm-ink)' }}>#</th>
                    <th scope="col" className="t-th text-left px-2 sticky left-0 min-w-[120px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)' }}>선수</th>
                    <th scope="col" className="t-th px-3"><StatHeader term="R" label="출전" /></th>
                    {SHOOTING_COLS.map(({ key, label, term, desc }, idx) => {
                      // 구분선: 슈팅 효율(0-6) | 야투 분포(7-10)
                      const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-ink)' } : {}
                      return (
                        <th key={key} scope="col" aria-sort={ariaSort(shootSortKey === key, shootSortDir)} title={desc}
                          className="t-th px-1.5 select-none transition-colors duration-200"
                          style={{
                            color: shootSortKey === key ? 'var(--mm-panel)' : 'var(--mm-ink)',
                            background: shootSortKey === key ? 'var(--mm-ink)' : 'transparent',
                            ...dividerStyle,
                          }}>
                          <SortHeader term={term} label={label} active={shootSortKey === key} dir={shootSortDir} onSort={() => handleShootSort(key)} />
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibleShoot.map(({ p, sh }, i) => {
                    const rank = lowAttempts(p, shootPctKey) ? null : i + 1
                    return (
                    <tr key={p.player_id}
                      className="group transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                      style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                      <td className="py-2 pl-2 pr-1 text-right">
                        <span className="t-num text-base font-bold inline-flex items-center justify-center rounded-full size-7"
                          style={{ color: rankTier(rank).color, background: rankTier(rank).bg, border: rankTier(rank).border }}
                          title={rank == null ? '시도 부족 — 순위 없음' : undefined}>{rank ?? '–'}</span>
                      </td>
                      <th scope="row" className="px-2 py-3 sticky left-0 text-left font-normal align-middle transition-colors bg-[color:var(--mm-panel)] group-hover:bg-[color:var(--mm-panel-alt)]">
                        <button type="button" onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--mm-muted)' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </th>
                      <td className="t-td" style={{ color: 'var(--mm-muted)' }}>{p.gp}{isIneligible(p) && <IneligibleTag />}</td>
                      {SHOOTING_COLS.map(({ key }, idx) => {
                        const val = sh[key]
                        const active = shootSortKey === key
                        const low = lowAttempts(p, pctKeyOf(key))
                        // 구분선: 슈팅 효율(0-6) | 슛 분포(7 · SHOT MIX)
                        const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-rule)' } : {}
                        return (
                          <td key={key}
                              className={active && !low ? 't-td-key' : 't-td'}
                              style={{ color: low ? 'var(--mm-muted)' : active ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', ...dividerStyle }}
                              title={low ? '시도 부족 — 순위 대상 아님' : undefined}>
                            {key === 'shot_mix' ? <ShotMixBar p={p} /> : `${fmt1(val)}%`}
                            {active && low && <LowAttemptTag />}
                          </td>
                        )
                      })}
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              {/* 지표 설명 범례 */}
              <div className="px-4 py-3 flex flex-wrap gap-x-4 gap-y-1" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                {SHOOTING_COLS.map(({ key, label, desc }) => (
                  <span key={key} className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                    <span className="font-semibold" style={{ color: 'var(--mm-ink-soft)' }}>{label}</span> {desc}
                  </span>
                ))}
              </div>
            </div>
            </>) : (<>
            {/* Advanced — 모바일 카드뷰 (정렬 지표 크게 + 나머지 4칸 · 1위 대비 막대) */}
            <div className="md:hidden p-2.5 space-y-2">
              {visibleAdv.map(({ p, adv }, i) => {
                const fmtAdv = (k: AdvKey, v: number | null) =>
                  v == null ? '—' : k === 'a1_total' ? String(v) : k === 'at_ratio' ? v.toFixed(2) : `${fmt1(v)}%`
                const sortCol = ADV_COLS.find(c => c.key === advSortKey)
                const items: CardItem[] = ADV_COLS
                  .filter(c => c.key !== advSortKey)
                  .map(c => {
                    // A/T 의 99 는 「턴오버 0」 표식이라 1위 분모에서 뺀다(막대가 전부 바닥에 깔린다)
                    const leader = leaderOf(q => {
                      const v = calcAdv(q)[c.key]
                      return c.key === 'at_ratio' && v === 99 ? null : v
                    })
                    return { key: c.key, label: c.label, value: fmtAdv(c.key, adv[c.key]), ratio: ratioOf(adv[c.key], leader) }
                  })
                return (
                  <MobileStatCard key={p.player_id} rank={i + 1} p={p} ineligible={isIneligible(p)}
                    bigLabel={sortCol?.label ?? ''} bigTerm={sortCol?.term ?? ''} bigValue={fmtAdv(advSortKey, adv[advSortKey])}
                    items={items}
                    onOpen={() => setQuickViewPlayer({ id: p.player_id, name: p.name })} />
                )
              })}
            </div>

            {/* Advanced — 데스크탑 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ background: 'var(--mm-yellow-soft)', borderBottom: '2px solid var(--mm-ink)' }}>
                    <th scope="col" className="t-th text-right pl-2 pr-1 w-8" style={{ color: 'var(--mm-ink)' }}>#</th>
                    <th scope="col" className="t-th text-left px-2 sticky left-0 min-w-[120px]" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)' }}>선수</th>
                    <th scope="col" className="t-th px-3"><StatHeader term="R" label="출전" /></th>
                    {ADV_COLS.map(({ key, label, term, desc }) => (
                      <th key={key} scope="col" aria-sort={ariaSort(advSortKey === key, advSortDir)} title={desc}
                        className="t-th px-1.5 select-none transition-colors duration-200"
                        style={{
                          color: advSortKey === key ? 'var(--mm-panel)' : 'var(--mm-ink)',
                          background: advSortKey === key ? 'var(--mm-ink)' : 'transparent',
                        }}>
                        <SortHeader term={term} label={label} active={advSortKey === key} dir={advSortDir} onSort={() => handleAdvSort(key)} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleAdv.map(({ p, adv }, i) => (
                    <tr key={p.player_id}
                      className="group transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                      style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                      <td className="py-2 pl-2 pr-1 text-right">
                        <span className="t-num text-base font-bold inline-flex items-center justify-center rounded-full size-7"
                          style={{ color: rankTier(i + 1).color, background: rankTier(i + 1).bg, border: rankTier(i + 1).border }}>{i+1}</span>
                      </td>
                      <th scope="row" className="px-2 py-3 sticky left-0 text-left font-normal align-middle transition-colors bg-[color:var(--mm-panel)] group-hover:bg-[color:var(--mm-panel-alt)]">
                        <button type="button" onClick={() => setQuickViewPlayer({ id: p.player_id, name: p.name })}
                          className="font-bold transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block"
                          style={{ color: 'var(--mm-ink)', fontSize: '17px', letterSpacing: '-0.005em', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          {p.name}
                        </button>
                        <div className="text-sm font-medium mt-0.5" style={{ color: 'var(--mm-muted)' }}>{p.position ?? ''}{p.number ? ` #${p.number}` : ''}</div>
                      </th>
                      <td className="t-td" style={{ color: 'var(--mm-muted)' }}>{p.gp}{isIneligible(p) && <IneligibleTag />}</td>
                      {ADV_COLS.map(({ key }) => {
                        const val = adv[key]
                        const isRatio = key === 'at_ratio'
                        const isCount = key === 'a1_total'
                        const active = advSortKey === key
                        return (
                          <td key={key} className={active ? 't-td-key' : 't-td'}
                            style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>
                            {val == null ? '—' : isCount ? val : isRatio ? val.toFixed(2) : `${fmt1(val)}%`}
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
                    <span className="font-semibold" style={{ color: 'var(--mm-ink-soft)' }}>{label}</span> {desc}
                  </span>
                ))}
              </div>
            </div>
            </>)}

            {/* 더 보기 — 이미 받아온 배열을 클라이언트에서 점진 노출한다(서버 재요청 없음).
                세 모드 · 두 뷰 바깥에 한 번만 둔다: 모드마다 복제하면 언젠가 한 곳만 고쳐지고,
                뷰마다 복제하면 두 상태가 갈린다. 남은 인원 수를 라벨에 적어 몇 번 눌러야
                끝인지 미리 가늠할 수 있게 한다(schedule 화면과 같은 관례). */}
            {hiddenCount > 0 && (
              <div className="flex justify-center px-4 py-3" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                <button
                  type="button"
                  onClick={() => setVisibleCount(c => c + REVEAL_STEP)}
                  className="mm-press inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-5 py-2.5 min-h-[44px] transition-colors cursor-pointer hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
                >
                  <ChevronDown size={14} aria-hidden />
                  더 보기 ({hiddenCount}명 남음)
                </button>
              </div>
            )}
          </SectionCard>
        </>
      )}


      {compareModalOpen && (
        <PlayerCompareModal
          leagueId={leagueId}
          candidates={compareCandidates}
          initialIds={compareList}
          quarterId={selectedQuarterId}
          onClose={() => setCompareModalOpen(false)}
        />
      )}
    </div>
  )
}

// useSearchParams 는 Suspense 경계 내에서 호출해야 하므로 default export 에서 감싼다.
export default function LeagueStatsPage() {
  return (
    <Suspense fallback={<StatsSkeleton />}>
      <LeagueStatsPageInner />
    </Suspense>
  )
}
