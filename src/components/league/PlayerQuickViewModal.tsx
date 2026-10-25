'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import { Loader2, X, Crown, Pencil, Camera, Flame, Medal, Film, ShieldCheck, Lock, LogIn, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/util/imageCompress'
import { useSwipe } from '@/hooks/useSwipe'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PlayerBestShotBanner from '@/components/league/PlayerBestShotBanner'
import StatHelpTooltip from '@/components/stats/StatHelpTooltip'
import { CountUp } from '@/components/league/StatCell'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import HalfCourtShotChart from '@/components/league/HalfCourtShotChart'
import { LEAGUE_BASELINE, tierAgainst, type ShootingBaseline } from '@/lib/stats/shootingBaseline'
import PlayerMiniTabs, { PLAYER_TABS, type PlayerTabKey } from '@/components/league/player/PlayerMiniTabs'
import { useOptionalCurrentUser } from '@/contexts/LeagueAuthContext'
import DynamicDuoPanel, { type DuoEntry } from '@/components/league/player/DynamicDuoPanel'
import LastPlayedLine from '@/components/league/ui/LastPlayedLine'
import { shouldShowLastPlayed, type LastPlayedData } from '@/lib/format/lastPlayed'
import PercentileBars from '@/components/league/player/PercentileBars'
import QuarterTable from '@/components/league/player/QuarterTable'
import type { SimilarPlayersData } from '@/components/league/player/SimilarPlayers'
import PlayerTeamLine, { PlayerTeamHistory, type CurrentTeam, type TeamHistoryEntry } from '@/components/league/player/PlayerTeamLine'
import type { PercentileBarsResult } from '@/lib/stats/percentileBars'
import type { HexRadarResult } from '@/lib/stats/hexRadar'
import type { QuarterTableRow } from '@/lib/stats/quarterTable'
import MonthTable, { type MonthRow } from '@/components/league/player/MonthTable'
import PlayerFormCard from '@/components/league/player/PlayerFormCard'
import DailyLogTable from '@/components/league/player/DailyLogTable'
import NbaComps from '@/components/league/player/NbaComps'
import type { PlayerForm } from '@/lib/stats/playerForm'
import type { QuarterTotal } from '@/components/league/player/QuarterTable'
import { positionGroupOf, positionGroupLabel, POSITION_GROUPS, type PositionGroupCode } from '@/lib/league/positionGroup'

// 차트 4종 — 2026-10-12 리뉴얼 5단계에서 recharts 를 자체 인라인 SVG 로 바꿨다(수 KB).
//   더 이상 따로 쪼개 늦게 받을 이유가 없어 바로 import 한다(모달 자체가 호출부에서 lazy 로드된다).
import { MonthlyStatsChart, GameTrendChart, PlayerHexRadar, PlayerShotDonut } from '@/components/league/charts/PlayerQuickViewCharts'

type PlayerInfo = {
  id: string; name: string; number: number | null; position: string | null
  birth_date: string | null; plus_one: boolean
  photo_url?: string | null
  original_photo_url?: string | null
  has_account?: boolean  // 로그인 계정 등록·승인(인증) 회원 여부
}

type RankTotal = { rank: number; total: number }
type Rankings = {
  ppg: number; rpg: number; apg: number; spg: number; bpg: number
  total: number; win_rate_rank?: number
  // { rank, total } — 출전일은 전원(gp>=1), 성공률은 순위 자격 + 스탯 탭과 같은 최소 시도(2026-10-15)
  gp?: RankTotal; fg_pct?: RankTotal; fg3_pct?: RankTotal; ft_pct?: RankTotal
  /** 순위 자격 최소 출전일(leagueMinRounds) */
  min_rounds?: number
}
type Detail = {
  rankings: Rankings
  /** (2026-10-17) 같은 포지션(가드·포워드·센터) 안 순위 — 자격·기간·공동 순위 규칙은 rankings 와 같다. 포지션 없으면 null */
  position_ranks?: { group: 'G' | 'F' | 'C'; label: string; rankings: Rankings; percentile_bars: PercentileBarsResult } | null
  /** 진행 중 연속 기록 — /me 와 같은 판정(lib/stats/dashboardBase.ts). 분기 없는 응답에만 실린다. 단위는 「일」 */
  active_streaks?: Array<{ key: string; label: string; count: number; unit: string }>
  dynamic_duo?: DuoEntry[]
  pinned_event_ids?: string[]
  /** (2026-10-14) 마지막 출전(친선일 포함) — 분기 없는 요청에만 실린다 */
  last_played?: LastPlayedData | null
  /** (2026-10-14) 세부 능력치 백분위 막대 — 레이더와 같은 자격 집단·하루 평균 */
  percentile_bars?: PercentileBarsResult
  /** (2026-10-14) 6축 레이더 — 막대와 같은 모집단·하루 평균. 정의 lib/stats/hexRadar.ts */
  hex_radar?: HexRadarResult
  /** (2026-10-14) 비슷한 스타일 선수 — 같은 자격 집단·같은 기간 */
  similar_players?: SimilarPlayersData
  /** (2026-10-16) 현 소속팀 — 지금 분기(pickCurrentQuarter) 기준. 그 분기 소속이 없으면 null */
  current_team?: CurrentTeam | null
  /** (2026-10-16) 분기별 소속(리그 분기만, 오래된 순) */
  team_history?: TeamHistoryEntry[]
  career_high: Record<string, { value: number; extra?: string; date?: string; opponent?: string; result?: string; score?: string }>
  shot_breakdown: { layup: { m: number; a: number; dist: number; fg_pct: number }; mid: { m: number; a: number; dist: number; fg_pct: number }; post: { m: number; a: number; dist: number; fg_pct: number }; three: { m: number; a: number; dist: number; fg_pct: number }; ft: { m: number; a: number; ft_pct: number }; total_fga: number }
  // record = 그 라운드(하루)의 전 경기 합산 전적. result 는 그 합산의 종합 판정(W/L/D).
  //   예전엔 result 가 '그날 첫 경기' 결과였다 — 스탯은 하루 합산인데 승패만 한 경기라
  //   어긋났다(2026-08-09 김로빈 8/8: 실제 2승4패인데 첫 경기 승이라 W 로 표시).
  recent_games: Array<{ date?: string; opponent?: string; result?: string; score?: string; record?: { wins: number; losses: number; draws: number; games: number }; pts: number; reb: number; ast: number; stl?: number; blk?: number; fgm: number; fga: number; fg3m?: number; fg3a?: number }>
  /** 요즘 흐름(2026-10-24) — lib/stats/playerForm.ts */
  form?: PlayerForm | null
  game_log?: Array<{ date: string; games?: number; pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; fg3m: number; fg3a: number }>
  win_loss?: {
    // draws — 짧은 쿼터 경기라 동점이 실제로 난다. 예전엔 무를 패로 세서
    //   전적과 승률이 둘 다 틀렸다(2026-08-09). 승률 분모에서는 제외한다.
    wins: number; losses: number; draws?: number; win_rate: number
    pts_share: number
  }
  player_stats: {
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
    pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
    fg_pct: number; fg3_pct: number; ft_pct: number
  } | null
  /** 월별 — 하루 평균. 성공률은 최소 시도 미달이면 null. best = 「최고의 달」(하루 평균 득점) */
  monthly_stats?: MonthRow[]
}

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }

// /career 라우트 응답 — 「선수 숫자는 한 벌」(2026-10-14).
//   묶음마다 숫자는 그 묶음 스탯 탭의 그 선수 행과 같다(playerPeriodLine). 리그 통산은 리그 시즌끼리만 더하고,
//   대회는 따로(통산 미포함). 리그 시즌이 하나뿐이면 통산 = 위쪽 누적이라 화면에 안 보인다.
type CareerLine = {
  leagueId: string; slug: string; name: string; mode: 'league' | 'tournament'; seasonYear: number
  gp: number; pts: number; reb: number; ast: number; stl: number; blk: number
}
type CareerSummary = {
  leagues: CareerLine[]
  league_career: { gp: number; pts: number; reb: number; ast: number; stl: number; blk: number }
  tournaments: CareerLine[]
}

// mm-brand: 포지션 뱃지도 통일 톤 (뮤트 배경 + 잉크 라벨)
const MM_POSITION_STYLE: React.CSSProperties = {
  background: 'var(--mm-panel-alt)',
  color: 'var(--mm-ink)',
  border: '1px solid var(--mm-rule)',
}

// mm-brand: 선수별 개별 accent 대신 단일 노랑 accent 로 통일.
// 구조는 유지 (radar / spotlight 렌더 로직 안 건드림).
type AccentPalette = {
  rgb: string
  stroke: string
  fillA: string; fillB: string
  borderCls: string
  textCls: string
  ringCls: string
}
const ACCENT_DEFAULT: AccentPalette = {
  rgb: '234,179,8',            // mm-yellow (현재 소비처 없음)
  // 레이더 — 선은 yellow-strong(라이트에서 흰 패널 대비 확보), 채움은 yellow → yellow-strong 그라데이션
  stroke: 'var(--mm-yellow-strong)',
  fillA: 'var(--mm-yellow-strong)', fillB: 'var(--mm-yellow)',
  borderCls: '',                // 아래에서 style 로 처리
  textCls: '',
  ringCls: '',
}

// data emphasis (spec 5): 양수=emerald, 음수=red, muted 유지
// 성공률 색 — 50/30 절대선이 아니라 **그 항목의 리그 평균 대비**로 잰다. (2026-08-15 수정)
//   한 선으로 재면 골밑(평균 55%)·3점(평균 22%)·자유투(평균 44%)가 같은 잣대를 쓰게 돼,
//   평균 이상인 3점 슈터가 빨강, 평균 미만인 골밑 선수가 초록으로 나온다.
type PctScope = keyof ShootingBaseline['zone'] | 'ft' | 'fg'

function pctColor(pct: number, attempts: number, scope: PctScope): string {
  const avg = scope === 'ft' ? LEAGUE_BASELINE.ft
    : scope === 'fg' ? LEAGUE_BASELINE.fg
    : LEAGUE_BASELINE.zone[scope]
  const tier = tierAgainst(pct, attempts, avg)
  if (tier === 'high') return 'text-[color:var(--mm-positive)]'
  if (tier === 'low') return 'text-[color:var(--mm-negative)]'
  if (tier === 'none') return 'text-[color:var(--mm-muted)]'
  return 'text-[color:var(--mm-yellow-strong)]'
}

interface Props {
  leagueId: string
  playerId: string
  playerName: string // 로딩 전 즉시 표시용
  onClose: () => void
  isEditMode?: boolean
  leagueHeaders?: Record<string, string>
  onSaved?: () => void
  onDeleted?: () => void
  /** 처음 고른 기간(분기 id) — 카드를 연 화면의 분기. null 이면 전체 */
  initialQuarterId?: string | null
  /** 처음 열 미니 탭 — 없으면 이 리그에서 마지막으로 본 탭 */
  initialTab?: PlayerTabKey
  /** 「나와 비교」 — [나, 이 선수] 와 지금 고른 분기를 넘긴다. 없으면 버튼을 그리지 않는다(편집 전용 카드 등) */
  onCompare?: (ids: [string, string], quarterId: string | null) => void
}

// 미니 탭 기억 — 리그마다 마지막으로 본 탭 (2026-10-15). 매번 「시즌 스탯」부터 다시 누르게 하지 않으려고.
const tabStorageKey = (leagueId: string) => `player-card:${leagueId}:tab`
function readStoredTab(leagueId: string): PlayerTabKey | null {
  try {
    const v = localStorage.getItem(tabStorageKey(leagueId))
    return v && PLAYER_TABS.some(t => t.key === v) ? (v as PlayerTabKey) : null
  } catch { return null }
}

/**
 * 카드 안에서 다른 선수(「비슷한 스타일 선수」 줄)로 갈아탈 수 있게 감싼다.
 * 내부 상태(분기·탭·편집 패널 등)를 깨끗이 비우려고 key 로 통째로 다시 만든다.
 */
export default function PlayerQuickViewModal(props: Props) {
  const [current, setCurrent] = useState({ id: props.playerId, name: props.playerName })
  // 호출부가 다른 선수를 열면 그쪽을 따른다(렌더 중 동기화 — effect 로 하면 한 번 옛 선수가 그려진다)
  const [prevPropId, setPrevPropId] = useState(props.playerId)
  if (prevPropId !== props.playerId) {
    setPrevPropId(props.playerId)
    setCurrent({ id: props.playerId, name: props.playerName })
  }
  return (
    <PlayerQuickViewInner
      key={current.id}
      {...props}
      playerId={current.id}
      playerName={current.name}
      onOpenPlayer={(id, name) => setCurrent({ id, name })}
    />
  )
}

function PlayerQuickViewInner({ leagueId, playerId, playerName, onClose, isEditMode, leagueHeaders, onSaved, onDeleted, onOpenPlayer, initialQuarterId = null, initialTab, onCompare }: Props & { onOpenPlayer?: (id: string, name: string) => void }) {
  // 「나와 비교」 — 로그인 회원이 남의 카드를 볼 때만 (프로바이더 밖이면 null)
  const me = useOptionalCurrentUser()?.user ?? null

  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)  // 401 — 상세 스탯은 승인 회원 전용 (2026-07-28)
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [career, setCareer] = useState<CareerSummary | null>(null)
  // 카드를 연 화면의 분기로 시작한다(2026-10-15) — 스탯 탭 4분기에서 열면 카드도 4분기
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(initialQuarterId)
  const [quarterDetail, setQuarterDetail] = useState<Detail | null>(null)
  const [quarterLoading, setQuarterLoading] = useState(false)
  // 분기별 기록표 — 무거워서 본 응답과 따로 받는다(`detail?quarterRows=only`)
  const [quarterRows, setQuarterRows] = useState<QuarterTableRow[] | null>(null)
  // 분기별 기록표의 「전체」·「합계」 줄 — 같은 요청에 실려 온다(전체 기간 정본 한 줄)
  const [quarterTotal, setQuarterTotal] = useState<QuarterTotal | null>(null)
  // 「분기·월별」 탭 안 보기 — 분기별 | 월별
  const [periodView, setPeriodView] = useState<'quarter' | 'month'>('quarter')
  // 최근 트렌드 하위 탭 — 요즘 흐름(기본) / 일별 기록 (2026-10-24)
  const [trendView, setTrendView] = useState<'form' | 'log'>('form')
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [togglingP1, setTogglingP1] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', position: '', birth_date: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  // 사진 업로드 state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // 뷰 모드에서 아바타 클릭 시 라이트박스 확대
  const [photoLightboxOpen, setPhotoLightboxOpen] = useState(false)

  // 스와이프-투-디스미스: 헤더에서 아래로 100px+ 드래그 시 close.
  // 드래그 중에는 모달을 손가락 따라 이동시켜 자연스러운 피드백.
  const [dragY, setDragY] = useState(0)
  const swipeHandlers = useSwipe({
    threshold: 100,
    onSwipeDown: () => onClose(),
    onDrag: (_dx, dy) => {
      // 아래로만 이동 허용 (위로 드래그는 무시)
      if (dy > 0) setDragY(Math.min(dy, 300))
    },
    onDragEnd: () => setDragY(0),
    edgeGuardPx: 0,  // 헤더 영역이므로 엣지 가드 불필요
  })
  const [shotView, setShotView] = useState<'court'|'donut'>('court')
  // 미니 탭 — 세로 스크롤 과다 해소 (2026-08-03). 탭 전환 시 본문 최상단으로 스크롤 복귀.
  //   (2026-10-15) 처음 탭 = 호출부가 정한 탭 → 이 리그에서 마지막으로 본 탭 → 시즌 스탯
  const [activeTab, setActiveTab] = useState<PlayerTabKey>(() => initialTab ?? readStoredTab(leagueId) ?? 'season')
  const routeParams = useParams<{ orgSlug?: string; org?: string }>()
  const orgSlug = routeParams?.orgSlug ?? routeParams?.org ?? ''

  // Hero 가 뷰포트 밖으로 나가면 sticky top 에 미니 header (이름+등번호) 표시
  const heroRef = useRef<HTMLDivElement>(null)
  const modalScrollRef = useRef<HTMLDivElement>(null)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const [heroOutOfView, setHeroOutOfView] = useState(false)
  // 미니 탭이 sticky 액션바 밑에 정확히 붙도록 액션바 실제 높이를 측정 (safe-area 편차 대응)
  const [actionBarH, setActionBarH] = useState(52)
  useEffect(() => {
    const el = actionBarRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setActionBarH(el.offsetHeight))
    ro.observe(el)
    setActionBarH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    if (!heroRef.current || !modalScrollRef.current) return
    const io = new IntersectionObserver(
      ([entry]) => setHeroOutOfView(!entry.isIntersecting),
      { root: modalScrollRef.current, threshold: 0.1 },
    )
    io.observe(heroRef.current)
    return () => io.disconnect()
  }, [loading])

  // 네 요청을 따로 받는다 (2026-10-16 속도 개선) — 종전엔 Promise.all 로 넷(명단·상세·분기·통산)이 다
  //   끝나야 본문을 그렸다. 머리(이름·사진·팀)는 이미 아는 값으로 바로 그리고, 본문은 상세가 오는 대로 연다.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/players`)
      .then(r => (r.ok ? r.json() : null))
      .then((all: PlayerInfo[] | null) => { if (!cancelled && all) setPlayer(all.find(p => p.id === playerId) ?? null) })
      .catch(() => {})
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => (r.ok ? r.json() : null))
      .then((qs: Quarter[] | null) => { if (!cancelled && qs) setQuarters(qs) })
      .catch(() => {})
    // 리그 통산·대회 기록 — 리그 시즌이 1개뿐이면 통산은 안 보인다. 401(미승인 회원)은
    // gated 상태(상세 401)로 이미 처리되므로 여기선 실패를 조용히 무시.
    fetch(`/api/leagues/${leagueId}/players/${playerId}/career`)
      .then(r => (r.ok ? r.json() : null))
      .then((c: CareerSummary | null) => { if (!cancelled && c) setCareer(c) })
      .catch(() => {})
    fetch(`/api/leagues/${leagueId}/players/${playerId}/detail`)
      .then(async r => {
        if (cancelled) return
        if (r.status === 401) setGated(true)
        if (r.ok) { const d: Detail = await r.json(); if (!cancelled) setDetail(d) }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leagueId, playerId])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/players/${playerId}/detail?quarterRows=only`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { quarter_rows?: QuarterTableRow[]; quarter_total?: QuarterTotal | null } | null) => {
        if (cancelled) return
        setQuarterRows(d?.quarter_rows ?? [])
        setQuarterTotal(d?.quarter_total ?? null)
      })
      .catch(() => { if (!cancelled) setQuarterRows([]) })
    return () => { cancelled = true }
  }, [leagueId, playerId])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 라이트박스가 열려있으면 먼저 라이트박스만 닫고 모달은 유지
      if (photoLightboxOpen) {
        setPhotoLightboxOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, photoLightboxOpen])

  useEffect(() => {
    if (player) {
      setEditForm({ name: player.name, position: player.position ?? '', birth_date: player.birth_date ?? '' })
      setPhotoUrl(player.photo_url ?? null)
    }
  }, [player])

  // 분기 선택 시 해당 분기 detail 패치
  useEffect(() => {
    if (!selectedQuarterId) { setQuarterDetail(null); return }
    let cancelled = false
    setQuarterLoading(true)
    fetch(`/api/leagues/${leagueId}/players/${playerId}/detail?quarterId=${selectedQuarterId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setQuarterDetail(d) })
      .finally(() => { if (!cancelled) setQuarterLoading(false) })
    return () => { cancelled = true }
  }, [leagueId, playerId, selectedQuarterId])




  const activeDetail = selectedQuarterId ? (quarterDetail ?? detail) : detail

  // 순위 범위 — 「전체 | 같은 포지션」 (2026-10-17). 같은 포지션 순위는 서버가 같은 규칙으로 만든다(position_ranks).
  //   포지션이 없는 선수는 position_ranks 가 null 이라 토글이 안 보이고 늘 전체다.
  const [rankScope, setRankScope] = useState<'all' | 'pos'>('all')
  const posRanks = (activeDetail ?? detail)?.position_ranks ?? null
  const rankScopeOn = rankScope === 'pos' && !!posRanks
  const rk: Rankings | undefined = rankScopeOn ? posRanks!.rankings : (activeDetail ?? detail)?.rankings
  const shownBars = rankScopeOn ? posRanks!.percentile_bars : activeDetail?.percentile_bars

  // 데이터가 있는 탭만 노출 — 빈 탭 클릭 후 아무것도 안 나오는 상황 방지
  const availableTabs = useMemo(() => {
    const s = new Set<PlayerTabKey>(['season'])
    if ((quarterRows?.length ?? 0) > 0 || (activeDetail?.monthly_stats?.length ?? 0) > 0) s.add('quarters')
    if ((detail?.dynamic_duo?.length ?? 0) > 0) s.add('duo')
    if ((activeDetail?.shot_breakdown?.total_fga ?? 0) > 0) s.add('shot')
    if (detail?.career_high && Object.keys(detail.career_high).length > 0) s.add('career')
    if ((activeDetail?.monthly_stats?.length ?? 0) >= 2
      || (activeDetail?.game_log?.length ?? 0) >= 3
      || (detail?.recent_games?.length ?? 0) > 0) s.add('trend')
    return s
  }, [detail, activeDetail, quarterRows])

  const changeTab = (key: PlayerTabKey) => {
    setActiveTab(key)
    try { localStorage.setItem(tabStorageKey(leagueId), key) } catch { /* 저장소가 막혀 있으면 기억만 생략 */ }
    // 긴 탭 → 짧은 탭 전환 시 화면이 비어 보이지 않도록 탭 바가 상단에 오도록 스크롤 정렬.
    // (0 으로 올리면 히어로가 다시 나와 탭이 화면 밖으로 밀림)
    const scroller = modalScrollRef.current
    const tabsEl = scroller?.querySelector('[role="tablist"]') as HTMLElement | null
    if (!scroller || !tabsEl) return
    const target = Math.max(0, tabsEl.offsetTop - actionBarH)
    if (scroller.scrollTop > target) scroller.scrollTo({ top: target, behavior: 'smooth' })
  }

  // 고른 탭에 보일 것이 없으면(분기 전환 · 기억해 둔 탭의 데이터가 아직 안 옴 — 분기별 기록표는 따로 받는다)
  //   그동안 시즌 스탯을 보여 준다. activeTab 은 그대로 두어 데이터가 오면 그 탭으로 돌아간다.
  //   (종전엔 effect 로 activeTab 을 'season' 으로 덮어써, 첫 렌더에 기억해 둔 탭이 바로 지워졌다)
  const shownTab: PlayerTabKey = availableTabs.has(activeTab) ? activeTab : 'season'

  // 포지션은 세 그룹(가드·포워드·센터)으로만 보인다 — 옛 5코드(PG·SF…)로 저장된 선수도 읽을 때 묶는다(positionGroup.ts)
  const positionGroup = positionGroupOf(player?.position)
  const positionGroupName = positionGroupLabel(positionGroup)

  // 분기 탭 레이블
  const quarterLabel = (q: Quarter) => `${String(q.year).slice(2)}.${q.quarter}Q`

  const accent = ACCENT_DEFAULT

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 mm-fade-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-modal-name"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={modalScrollRef}
        className="relative border-0 sm:border rounded-none w-full max-w-lg sm:max-w-xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto z-10 mm-sheet-in"
        style={{
          background: 'var(--mm-panel)',
          borderColor: 'var(--mm-rule)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: dragY === 0 ? 'transform 200ms ease-out' : 'none',
        }}>
        {/* Sticky top action bar — 편집/닫기 + 스와이프 다운 드래그 핸들 */}
        {/* touch 이벤트를 이 영역에만 붙여 하위 스크롤과 충돌 회피 */}
        <div
          ref={actionBarRef}
          className="sticky top-0 z-20 px-3 pt-safe-or-2 pb-2 flex items-center gap-2 touch-pan-y backdrop-blur-sm"
          style={{
            background: 'color-mix(in srgb, var(--mm-panel) 95%, transparent)',
            borderBottom: '1px solid var(--mm-rule)',
          }}
          {...swipeHandlers}
        >
          {/* 스와이프 드래그 핸들 인디케이터 (모바일에서만) */}
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full sm:hidden"
            style={{ background: 'var(--mm-rule)' }}
            aria-hidden
          />

          {/* Sticky mini header — hero 가 뷰포트 밖으로 나가면 선수 identity 표시 */}
          <div
            className={`flex items-center gap-2 flex-1 min-w-0 transition-all duration-200 ${
              heroOutOfView ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 pointer-events-none'
            }`}
            aria-hidden={!heroOutOfView}
          >
            {player?.number != null && (
              <span className="font-mono text-xs shrink-0" style={{ color: 'var(--mm-muted)' }}>#{player.number}</span>
            )}
            <span className="font-jersey text-sm font-bold truncate" style={{ color: 'var(--mm-ink)' }}>
              {player?.name ?? playerName}
            </span>
          </div>

          {/* 우측 액션 (기본 상태에서는 flex-1 로 밀림) */}
          <div className={`flex items-center gap-2 shrink-0 ${heroOutOfView ? '' : 'ml-auto'}`}>
          {isEditMode && (
            <button
              onClick={() => setShowEditPanel(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-bold cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
              style={showEditPanel
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
              }
            >
              <Pencil size={14} aria-hidden /> 편집
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-sm cursor-pointer transition-colors duration-200 inline-flex items-center justify-center min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1 hover:bg-[color:var(--mm-panel-alt)]"
            style={{ color: 'var(--mm-muted)' }}
          >
            <X size={20} />
          </button>
          </div>
        </div>

        {/* Hero header — 큰 아바타 + 이름 (프로 선수 프로필 스타일) */}
        <div
          ref={heroRef}
          className="relative overflow-hidden"
          style={{
            padding: 'clamp(16px, 4vw, 24px) clamp(16px, 4vw, 24px) clamp(20px, 5vw, 28px)',
            borderBottom: '1px solid var(--mm-rule)',
          }}
        >
          {/* 저지 워터마크 등번호 — 배경에 크게 */}
          {player?.number != null && (
            <div
              aria-hidden
              className="absolute -right-2 sm:right-2 top-1 pointer-events-none select-none font-jersey font-black leading-none tracking-tighter"
              style={{ fontSize: 'clamp(120px, 40vw, 200px)', color: 'var(--mm-yellow-soft)' }}
            >
              {player.number}
            </div>
          )}
          <div className="relative flex items-start gap-4 sm:gap-5">
            {/* 아바타 (편집모드 = 호버 오버레이 업로드 · 뷰모드 = 클릭 시 라이트박스 확대) */}
            {/* 크기: 프로 선수 프로필처럼 큼 */}
            <div className="relative shrink-0 group/avatar">
              <div
                className={`relative w-40 sm:w-48 rounded-none overflow-hidden flex items-center justify-center ${!isEditMode && photoUrl ? `cursor-zoom-in hover:brightness-105 transition-all duration-200` : ''}`}
                style={{
                  aspectRatio: '4/5',
                  background: 'var(--mm-panel-alt)',
                  border: '2px solid var(--mm-black)',
                  boxShadow: '0 10px 30px -8px rgba(0,0,0,0.30)',
                }}
                onClick={() => {
                  // 뷰 모드에서 사진 있을 때만 라이트박스 오픈
                  if (!isEditMode && photoUrl) setPhotoLightboxOpen(true)
                }}
                role={!isEditMode && photoUrl ? 'button' : undefined}
                tabIndex={!isEditMode && photoUrl ? 0 : undefined}
                onKeyDown={e => {
                  if (!isEditMode && photoUrl && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault()
                    setPhotoLightboxOpen(true)
                  }
                }}
                title={!isEditMode && photoUrl ? '클릭해서 크게 보기' : undefined}
              >
                {photoUrl ? (
                  // next/image · 모달은 열림 즉시 표시 → priority (모달 자체가 클릭 후 마운트라 초기 렌더 blocker 아님)
                  // sizes = 클램프 안된 고정 폭(w-40 sm:w-48) 근사
                  <Image
                    src={photoUrl}
                    alt={player?.name ?? ''}
                    fill
                    sizes="(max-width: 640px) 160px, 192px"
                    priority
                    className="object-cover object-top"
                  />
                ) : (
                  <span className="font-jersey text-5xl sm:text-6xl font-black leading-none text-center" style={{ color: 'var(--mm-ink)' }}>
                    {(player?.name ?? playerName).length > 1
                      ? (player?.name ?? playerName).slice(1)
                      : (player?.name ?? playerName)}
                  </span>
                )}
              </div>
              {/* 편집 모드 — 아바타 호버 시 사진 업로드 오버레이 */}
              {isEditMode && (
                <label
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 cursor-pointer transition-opacity duration-200"
                  style={{ background: 'rgba(0,0,0,0.60)' }}
                >
                  {uploadingPhoto
                    ? <Loader2 size={20} className="animate-spin text-white" />
                    : <span className="text-white text-xs font-bold text-center px-2 inline-flex items-center gap-1"><Camera size={14} aria-hidden /> 사진</span>}
                  <input type="file" accept="image/*" className="hidden"
                    disabled={uploadingPhoto}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file || !leagueHeaders) return
                      setUploadingPhoto(true)
                      try {
                        // Vercel 서버리스 413 방지 — 800x600 리사이즈 + JPEG 재인코딩
                        const compressed = await compressImage(file, 600, 800, 0.82)
                        const fd = new FormData()
                        fd.append('file', compressed)
                        const res = await fetch(`/api/leagues/${leagueId}/players/${playerId}/photo`, {
                          method: 'POST', body: fd,
                        })
                        if (res.ok) {
                          const d = await res.json()
                          setPhotoUrl(d.url)
                          // 새 원본 업로드 = original_photo_url 도 갱신됨 (서버에서)
                          toast.success('사진 저장됨')
                          onSaved?.()
                        } else {
                          const err = await res.json().catch(() => ({}))
                          toast.error(`업로드 실패: ${err.error ?? res.status}`)
                        }
                      } catch (ex) {
                        const msg = ex instanceof Error ? ex.message : String(ex)
                        toast.error(`업로드 실패: ${msg}`)
                      } finally { setUploadingPhoto(false) }
                    }}
                  />
                </label>
              )}
            </div>

            {/* 이름 + 정보 (아바타 크기와 비례해 확대) — hero stagger reveal */}
            <div className="relative flex-1 min-w-0 pt-3 sm:pt-4">
              {/* 현 소속팀 (2026-10-16) — 카드 머리에서 가장 먼저. 상세가 오기 전엔 자리만 잡아 둔다 */}
              {gated ? null : !detail && loading ? (
                <div className="h-6 w-28 mb-2 rounded-sm mm-shimmer" aria-hidden />
              ) : detail?.current_team ? (
                <PlayerTeamLine team={detail.current_team} className="mb-2" />
              ) : null}
              {player?.number != null && (
                <div
                  className="text-base font-mono mb-1 leading-none mm-rise-in"
                  style={{ color: 'var(--mm-muted)', animationDelay: '80ms', animationDuration: '400ms', animationFillMode: 'backwards' }}
                >
                  #{player.number}
                </div>
              )}
              <h1
                id="player-modal-name"
                className="font-jersey text-4xl sm:text-5xl font-black leading-[0.95] tracking-tight mb-3 break-words mm-rise-in"
                style={{ color: 'var(--mm-ink)', animationDelay: '140ms', animationDuration: '500ms', animationFillMode: 'backwards' }}
              >
                {player?.name ?? playerName}
              </h1>
              <div
                className="flex items-center gap-1.5 flex-wrap mm-rise-in"
                style={{ animationDelay: '220ms', animationDuration: '400ms', animationFillMode: 'backwards' }}
              >
                {positionGroupName && (
                  <span
                    className="text-sm font-black px-2.5 py-1 rounded-sm"
                    style={MM_POSITION_STYLE}
                  >{positionGroupName}</span>
                )}
                {player?.plus_one && (
                  <span
                    className="text-sm font-black px-2.5 py-1 rounded-sm"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                  >+1</span>
                )}
                {player?.has_account && (
                  <span
                    className="inline-flex items-center gap-1 text-sm font-black px-2.5 py-1 rounded-sm"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                    title="로그인 계정을 등록·인증한 회원"
                  >
                    <ShieldCheck size={14} aria-hidden /> 인증
                  </span>
                )}
                {orgSlug && (
                  <Link
                    href={`/league/${orgSlug}/${leagueId}/highlights?player=${encodeURIComponent(playerId)}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-sm cursor-pointer transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                    style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)', border: '1px solid var(--mm-black)' }}
                    aria-label={`${player?.name ?? playerName} 하이라이트 보기`}
                  >
                    <Film size={14} aria-hidden /> 하이라이트
                  </Link>
                )}
                {/* 나와 비교 (2026-10-15) — 로그인 회원이 남의 카드를 볼 때만. 비교 시트는 카드를 닫고 프로바이더가 띄운다 */}
                {onCompare && me && me.player_id && me.player_id !== playerId && !gated && (
                  <button
                    type="button"
                    onClick={() => onCompare([me.player_id, playerId], selectedQuarterId)}
                    className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-sm cursor-pointer transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] hover:bg-[color:var(--mm-yellow-soft)]"
                    style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
                    aria-label={`나와 ${player?.name ?? playerName} 비교하기`}
                  >
                    <ArrowLeftRight size={14} aria-hidden /> 나와 비교
                  </button>
                )}
                {/* 베스트샷 재생 — 포지션 옆 · 핀 있을 때만 노출 */}
                {detail?.pinned_event_ids && detail.pinned_event_ids.length > 0 && (
                  <PlayerBestShotBanner
                    leagueId={leagueId}
                    playerName={player?.name ?? playerName}
                    pinnedEventIds={detail.pinned_event_ids}
                  />
                )}
              </div>
            </div>
          </div>
          {/* 분기별 소속 (2026-10-16) — 「26.1Q 락다운 · 26.2Q 락다운 · 26.3Q 굿모닝」. 아바타 옆 칸은 360px 에서 좁아 전체 폭에 둔다 */}
          {detail?.team_history && detail.team_history.length > 0 && (
            <PlayerTeamHistory history={detail.team_history} currentQuarterId={detail.current_team?.quarter_id ?? null} className="relative mt-3" />
          )}
          {/* 마지막 출전일 + 그 뒤 결장 경기일 (2026-10-14) — **최근 28일 안에 출전이 없을 때만** 보인다(2026-10-16).
              최근에 나온 사람에게는 의미 없는 줄이라 뺐다. detail 이 없으면(비회원 게이트·로딩) 그리지 않는다. */}
          {detail && shouldShowLastPlayed(detail.last_played) && (
            <LastPlayedLine lastPlayed={detail.last_played} className="relative mt-2" />
          )}
        </div>

        {showEditPanel && isEditMode && (() => {
          // 포지션 단일 선택 — 가드(G)·포워드(F)·센터(C). 옛 5코드로 저장된 값도 그룹으로 읽어 선택 상태를 보인다.
          //   같은 버튼을 다시 누르면 선택 해제(포지션 없음).
          const selectedGroup = positionGroupOf(editForm.position)
          const pickPosition = (code: PositionGroupCode) => {
            setEditForm(f => ({ ...f, position: selectedGroup === code ? '' : code }))
          }
          const nameId = `player-edit-name-${playerId}`
          const positionId = `player-edit-position-${playerId}`
          return (
          <div
            className="px-5 py-4 space-y-3"
            style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
          >
            <p className="text-xs font-black uppercase tracking-[0.20em]" style={{ color: 'var(--mm-yellow-strong)' }}>선수 정보 수정</p>
            <p className="text-xs -mt-1" style={{ color: 'var(--mm-muted)' }}>프로필 사진은 위 아바타에 마우스를 올려 업로드하세요.</p>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label htmlFor={nameId} className="text-xs block mb-1 font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--mm-muted)' }}>이름</label>
                <input
                  id={nameId}
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({...f, name: e.target.value}))}
                  className="w-full rounded-sm px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}
                />
              </div>
              <div>
                <label id={positionId} className="text-xs block mb-1 font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--mm-muted)' }}>포지션</label>
                <div role="group" aria-labelledby={positionId} className="flex flex-wrap gap-1.5">
                  {POSITION_GROUPS.map(({ code, label }) => {
                    const active = selectedGroup === code
                    return (
                      <button
                        key={code}
                        type="button"
                        aria-pressed={active}
                        onClick={() => pickPosition(code)}
                        className="px-3 py-1.5 rounded-sm text-xs font-bold border transition-colors duration-200 cursor-pointer min-h-11 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                        style={active
                          ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                          : { background: 'var(--mm-panel)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
                        }
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <button onClick={async () => {
                  if (!leagueHeaders) return
                  setSavingEdit(true)
                  const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, {
                    method: 'PATCH', headers: {...leagueHeaders, 'Content-Type': 'application/json'},
                    body: JSON.stringify({ name: editForm.name, position: positionGroupOf(editForm.position) ?? null }),
                  })
                  setSavingEdit(false)
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: '저장 실패' }))
                    alert(err.error || '저장 실패')
                    return
                  }
                  // 머리의 이름·포지션도 바로 바뀌게 — 명단을 다시 받기 전까지 화면이 옛 값으로 남지 않도록
                  setPlayer(p => p ? { ...p, name: editForm.name, position: positionGroupOf(editForm.position) ?? null } : p)
                  onSaved?.(); setShowEditPanel(false)
                }} disabled={savingEdit}
                  className="w-full py-2 rounded-sm text-xs font-black uppercase tracking-[0.16em] cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                >
                  {savingEdit ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
            {/* Plus_one toggle */}
            <div
              className="flex items-center justify-between py-2 px-3 rounded-sm"
              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
            >
              <span className="text-xs" style={{ color: 'var(--mm-ink-soft)' }}>+1 플러스원 선수</span>
              <button
                onClick={async () => {
                  if (!leagueHeaders || !player) return
                  setTogglingP1(true)
                  const newVal = !player.plus_one
                  await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, {
                    method: 'PATCH', headers: {...leagueHeaders, 'Content-Type': 'application/json'},
                    body: JSON.stringify({ plus_one: newVal }),
                  })
                  setTogglingP1(false); onSaved?.()
                }}
                disabled={togglingP1}
                aria-pressed={player?.plus_one ?? false}
                className="px-3 py-1 rounded-sm text-xs font-bold cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                style={player?.plus_one
                  ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', border: '1px solid var(--mm-black)', color: 'var(--mm-black)' }
                  : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }
                }
              >
                {player?.plus_one ? '+1 ON' : '+1 OFF'}
              </button>
            </div>
            {/* Delete — 지울 곳(onDeleted)을 넘긴 화면(팀 명단 편집기)에서만. 전역 카드에서는 포지션·이름 수정만 (2026-10-17) */}
            {!onDeleted ? null : !confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-2 rounded-sm text-xs font-bold uppercase tracking-[0.14em] cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-live)] focus-visible:ring-offset-1"
                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-live)' }}
              >
                선수 삭제
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={async () => {
                  if (!leagueHeaders) return
                  setDeleting(true)
                  await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, { method: 'DELETE', headers: leagueHeaders })
                  setDeleting(false); onDeleted?.(); onClose()
                }} disabled={deleting}
                  className="flex-1 py-2 rounded-sm text-xs font-black uppercase tracking-[0.14em] text-[color:var(--mm-ink)] cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-live)] focus-visible:ring-offset-1"
                  style={{ background: 'var(--mm-live-bg)', border: '1px solid var(--mm-black)' }}
                >
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-sm text-xs font-bold cursor-pointer min-h-11 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                >취소</button>
              </div>
            )}
          </div>
          )
        })()}

        <div className="h-px w-full" style={{ background: 'var(--mm-yellow)' }} />

        {loading ? (
          <DetailSkeleton />
        ) : gated ? (
          /* 스탯 게이팅 — 프로필(이름·사진)은 공개, 상세 스탯은 승인 회원 전용 */
          <div className="flex flex-col items-center text-center px-6 py-12">
            <span
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
              style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-rule)' }}
              aria-hidden
            >
              <Lock size={20} style={{ color: 'var(--mm-ink)' }} />
            </span>
            <p className="font-bold text-lg" style={{ color: 'var(--mm-ink)' }}>
              상세 스탯은 회원 전용
            </p>
            <p className="text-sm mt-1.5 leading-relaxed max-w-xs break-keep" style={{ color: 'var(--mm-muted)' }}>
              선수별 시즌 기록·차트는 가입 승인된 회원만 볼 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('mm-open-login')) }}
              className="mm-press mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-bold text-sm cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] min-h-[44px]"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
            >
              <LogIn size={16} aria-hidden />
              로그인 · 가입 요청
            </button>
          </div>
        ) : (
          <div className="space-y-0">
            {/* 분기 · 단위 필터 — 모든 탭에 공통 적용되므로 탭 바깥으로 분리 */}
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                  {quarters.length > 0 && (
                    <>
                      <button
                        onClick={() => setSelectedQuarterId(null)}
                        className="shrink-0 px-3 py-1 rounded-sm text-xs font-bold cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                        style={selectedQuarterId === null
                          ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                          : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
                        }
                      >
                        전체
                      </button>
                      {quarters.map(q => (
                        <button
                          key={q.id}
                          onClick={() => setSelectedQuarterId(q.id)}
                          className="shrink-0 px-3 py-1 rounded-sm text-xs font-bold cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                          style={selectedQuarterId === q.id
                            ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                            : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
                          }
                        >
                          {quarterLabel(q)}
                          {q.is_current && <span className="ml-1 text-xs">현재</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>
            </div>

            {/* 미니 탭 — 시즌 스탯 / 다이나믹 듀오 / 공격 스타일 / 커리어 하이 / 최근 트렌드 */}
            <PlayerMiniTabs active={shownTab} onChange={changeTab} available={availableTabs} topOffset={actionBarH} />

            {/* ── 시즌 스탯 ─────────────────────────────── */}
            {shownTab === 'season' && (activeDetail?.player_stats ? (
              <div className="px-5 py-4">
                {quarterLoading ? (
                  <div className="flex justify-center py-8"><BasketballLoader size={20} /></div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                      <p className="text-xs uppercase tracking-[0.20em] font-black" style={{ color: 'var(--mm-yellow-strong)' }}>{selectedQuarterId ? '이 분기' : '전체 기간'} · 하루 평균</p>
                      {/* 순위 범위 (2026-10-17) — 같은 포지션끼리의 순위. 포지션이 없는 선수에게는 안 보인다 */}
                      {posRanks && (
                        <div role="group" aria-label="순위 범위" className="inline-flex rounded-sm overflow-hidden" style={{ border: '1px solid var(--mm-rule)' }}>
                          {([['all', '전체'], ['pos', `같은 포지션(${posRanks.label})`]] as const).map(([key, label]) => {
                            const on = (key === 'pos') === rankScopeOn
                            return (
                              <button
                                key={key}
                                type="button"
                                aria-pressed={on}
                                onClick={() => setRankScope(key)}
                                className="px-2.5 min-h-11 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--mm-yellow-strong)]"
                                style={on
                                  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                                  : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)' }
                                }
                              >{label}</button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
                      {[
                        // 값은 하루(경기한 날) 평균. 순위도 값과 같은 기간(선택한 분기)의 순위를 쓴다 —
                        //   예전엔 분기를 골라도 순위만 전체 기간 기준이라 숫자와 순위가 어긋났다(2026-10-11).
                        { label: '출전일', value: activeDetail?.player_stats?.gp ?? 0,  decimals: 0, rank: rk?.gp?.rank ?? 0, total: rk?.gp?.total ?? 0 },
                        { label: '득점', value: activeDetail?.player_stats?.ppg ?? 0, decimals: 1, rank: rk?.ppg ?? 0, total: rk?.total ?? 0 },
                        { label: '리바', value: activeDetail?.player_stats?.rpg ?? 0, decimals: 1, rank: rk?.rpg ?? 0, total: rk?.total ?? 0 },
                        { label: '어시', value: activeDetail?.player_stats?.apg ?? 0, decimals: 1, rank: rk?.apg ?? 0, total: rk?.total ?? 0 },
                        { label: '스틸', value: activeDetail?.player_stats?.spg ?? 0, decimals: 1, rank: rk?.spg ?? 0, total: rk?.total ?? 0 },
                        { label: '블락', value: activeDetail?.player_stats?.bpg ?? 0, decimals: 1, rank: rk?.bpg ?? 0, total: rk?.total ?? 0 },
                      ].map(({ label, value, decimals, rank, total }) => {
                        const isChamp = rank === 1
                        return (
                          <div
                            key={label}
                            className="relative rounded-sm p-2.5 text-center overflow-hidden"
                            style={isChamp
                              ? { background: 'var(--mm-yellow)', border: '1px solid var(--mm-black)', color: 'var(--mm-black)' }
                              : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }
                            }
                          >
                            <p
                              className="relative font-jersey text-xs font-bold mb-1"
                              style={{ color: isChamp ? 'color-mix(in srgb, var(--mm-black) 72%, transparent)' : 'var(--mm-muted)' }}
                            >{label}</p>
                            <p
                              className="relative font-jersey font-black text-4xl leading-none tabular-nums"
                              style={{ color: isChamp ? 'var(--mm-black)' : 'var(--mm-ink)' }}
                            >
                              <CountUp value={value} decimals={decimals} />
                            </p>
                            {rank > 0 && (
                              <p
                                className="relative text-xs font-black mt-1 flex items-center justify-center gap-1 whitespace-nowrap tabular-nums"
                                style={{ color: isChamp ? 'var(--mm-black)' : rank <= 3 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}
                              >
                                {isChamp && <Crown size={14} aria-hidden strokeWidth={2.5} />}
                                {(rank === 2 || rank === 3) && <Medal size={14} aria-hidden strokeWidth={2.5} />}
                                {rank}위{total > 0 && <span className="opacity-60"> · {total}</span>}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* 순위가 비어 있는 이유를 숫자로 — 자격은 리그 공통 규칙 하나(eligibility.ts leagueMinRounds) */}
                    {(() => {
                      const r = rk
                      const gp = activeDetail?.player_stats?.gp ?? 0
                      if (!r?.min_rounds || gp <= 0 || gp >= r.min_rounds) return null
                      return (
                        <p className="text-xs font-bold -mt-1 mb-3" style={{ color: 'var(--mm-muted)' }}>
                          순위는 {selectedQuarterId ? '이 분기' : '전체 기간'} {r.min_rounds}일 이상 출전하면 보여요
                        </p>
                      )
                    })()}
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        // 슛 정확도 순위 — 순위 자격 + 스탯 탭과 같은 최소 시도(하루 평균 기준). 미달이면 순위 칸 없음
                        { label: 'FG%', pct: activeDetail?.player_stats?.fg_pct ?? 0, m: activeDetail?.player_stats?.fgm ?? 0, a: activeDetail?.player_stats?.fga ?? 0, rt: rk?.fg_pct },
                        { label: '3P%', pct: activeDetail?.player_stats?.fg3_pct ?? 0, m: activeDetail?.player_stats?.fg3m ?? 0, a: activeDetail?.player_stats?.fg3a ?? 0, rt: rk?.fg3_pct },
                        { label: 'FT%', pct: activeDetail?.player_stats?.ft_pct ?? 0, m: activeDetail?.player_stats?.ftm ?? 0, a: activeDetail?.player_stats?.fta ?? 0, rt: rk?.ft_pct },
                      ].map(({ label, pct, m, a, rt }) => {
                        const rank = rt?.rank ?? 0
                        const total = rt?.total ?? 0
                        const isChamp = rank === 1
                        return (
                          <div
                            key={label}
                            className="rounded-sm p-2.5 text-center"
                            style={isChamp
                              ? { background: 'var(--mm-yellow)', border: '1px solid var(--mm-black)', color: 'var(--mm-black)' }
                              : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }
                            }
                          >
                            <p className="text-xs mb-1 uppercase tracking-[0.16em] font-bold flex items-center justify-center" style={{ color: isChamp ? 'color-mix(in srgb, var(--mm-black) 72%, transparent)' : 'var(--mm-muted)' }}>
                              <span>{label}</span>
                              <StatHelpTooltip statKey={label} />
                            </p>
                            <p className="font-jersey text-xl font-black leading-none tabular-nums" style={{ color: isChamp ? 'var(--mm-black)' : 'var(--mm-ink)' }}>
                              {a > 0 ? <><CountUp value={pct} decimals={1} />%</> : '—'}
                            </p>
                            <p className="text-xs mt-0.5 font-mono" style={{ color: isChamp ? 'color-mix(in srgb, var(--mm-black) 72%, transparent)' : 'var(--mm-muted)' }}>{m}/{a}</p>
                            {rank > 0 && a > 0 && (
                              <p
                                className="text-xs font-black mt-1 flex items-center justify-center gap-1 whitespace-nowrap tabular-nums"
                                style={{ color: isChamp ? 'var(--mm-black)' : rank <= 3 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}
                              >
                                {isChamp && <Crown size={14} aria-hidden strokeWidth={2.5} />}
                                {(rank === 2 || rank === 3) && <Medal size={14} aria-hidden strokeWidth={2.5} />}
                                {rank}위{total > 0 && <span className="opacity-60"> · {total}</span>}
                              </p>
                            )}
                            {/* 출전은 채웠는데 시도가 적어 순위에서 빠진 경우 — 스탯 탭의 「시도 부족」과 같은 말 */}
                            {rank === 0 && a > 0 && (activeDetail?.player_stats?.gp ?? 0) >= (rk?.min_rounds ?? Infinity) && (
                              <p className="text-xs font-bold mt-1" style={{ color: isChamp ? 'var(--mm-black)' : 'var(--mm-muted)' }}>시도 부족</p>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* 능력치 6축 레이더 — 공격·수비·리바운드·슈팅·리딩·효율 (리그 백분위, 선택한 기간 · 막대와 같은 모집단) */}
                    {activeDetail?.hex_radar && (
                      <div className="mt-2">
                        <PlayerHexRadar data={activeDetail.hex_radar} accent={{ stroke: accent.stroke, fillA: accent.fillA, fillB: accent.fillB }} />
                      </div>
                    )}

                    {/* 세부 능력치 — 묶음별 백분위 막대 (선택한 기간 기준) */}
                    {shownBars && <PercentileBars data={shownBars} scopeLabel={rankScopeOn ? `${posRanks!.label} 백분위` : undefined} />}

                    {/* 리그 안 「비슷한 스타일 선수」는 2026-10-25 운영진 요청으로 뺐다 — 닮은 NBA 선수만 남긴다 */}

                    {/* 닮은 NBA 선수 — 같은 6축 값으로, 재미로 보는 비교 (lib/stats/nbaComps.ts) */}
                    {activeDetail?.hex_radar && (
                      <NbaComps
                        radar={activeDetail.hex_radar}
                        shots={activeDetail.shot_breakdown ? [activeDetail.shot_breakdown.layup.a, activeDetail.shot_breakdown.post.a, activeDetail.shot_breakdown.mid.a, activeDetail.shot_breakdown.three.a] : null}
                      />
                    )}

                    {/* 승/패/승률 row */}
                    {activeDetail?.win_loss && (activeDetail.win_loss.wins + activeDetail.win_loss.losses) > 0 && (() => {
                      const wl = activeDetail.win_loss!
                      const total = rk?.total ?? 0
                      // 최근 승패 닷은 제거(2026-08-09, 사용자 판단) — 한 라운드에 여러 경기를
                      //   하는 리그라 하루를 W/L 하나로 압축하면 "2승 4패" 같은 실제 전적이
                      //   사라져 오히려 오해를 만든다. 시즌 통산 전적과 승률만 남긴다.
                      return (
                        <div
                          className="mt-2 rounded-sm px-3 py-2.5 flex items-center justify-between flex-wrap gap-2"
                          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-jersey font-black text-base tabular-nums" style={{ color: 'var(--mm-positive)' }}>{wl.wins}W</span>
                            <span style={{ color: 'var(--mm-muted)' }}>·</span>
                            <span className="font-jersey font-black text-base tabular-nums" style={{ color: 'var(--mm-live)' }}>{wl.losses}L</span>
                            {(wl.draws ?? 0) > 0 && (
                              <>
                                <span style={{ color: 'var(--mm-muted)' }}>·</span>
                                <span className="font-jersey font-black text-base tabular-nums" style={{ color: 'var(--mm-muted)' }}>{wl.draws}D</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--mm-muted)' }}>출전 승률</span>
                            <span
                              className="font-jersey font-black text-base tabular-nums"
                              style={{ color: wl.win_rate >= 60 ? 'var(--mm-positive)' : wl.win_rate >= 40 ? 'var(--mm-yellow-strong)' : 'var(--mm-live)' }}
                            >
                              {wl.win_rate}%
                            </span>
                            {total > 0 && (() => {
                              const rank = rk?.win_rate_rank ?? 0
                              return rank > 0 ? (
                                <span
                                  className="text-xs font-bold px-1.5 py-0.5 rounded-sm"
                                  style={rank === 1
                                    ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                                    : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
                                  }
                                >{rank}위</span>
                              ) : null
                            })()}
                          </div>
                        </div>
                      )
                    })()}

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-2">
                      {([
                        ['PTS', activeDetail?.player_stats?.pts ?? 0, true ],
                        ['REB', activeDetail?.player_stats?.reb ?? 0, false],
                        ['AST', activeDetail?.player_stats?.ast ?? 0, false],
                        ['STL', activeDetail?.player_stats?.stl ?? 0, false],
                        ['BLK', activeDetail?.player_stats?.blk ?? 0, false],
                        ['TOV', activeDetail?.player_stats?.tov ?? 0, false],
                      ] as const).map(([l, v, hi]) => (
                        <div
                          key={l}
                          className="rounded-sm p-2 text-center"
                          style={hi
                            ? { background: 'var(--mm-yellow)', border: '1px solid var(--mm-black)', color: 'var(--mm-black)' }
                            : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }
                          }
                        >
                          <p
                            className="text-xs mb-0.5 uppercase tracking-[0.16em] font-bold"
                            style={{ color: hi ? 'color-mix(in srgb, var(--mm-black) 72%, transparent)' : 'var(--mm-muted)' }}
                          >{l}</p>
                          <p
                            className="font-jersey text-base font-black tabular-nums"
                            style={{ color: hi ? 'var(--mm-black)' : 'var(--mm-ink)' }}
                          >
                            <CountUp value={v} decimals={0} />
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* 팀 득점 기여 + 진행 중인 연속 기록 */}
                    {activeDetail?.win_loss && (activeDetail.win_loss.wins + activeDetail.win_loss.losses) > 0 && (
                      <div
                        className="rounded-sm px-3 py-2.5 mt-2 flex items-center justify-between gap-2"
                        style={{ background: 'var(--mm-yellow)', border: '1px solid var(--mm-black)' }}
                      >
                        <span className="text-xs uppercase tracking-[0.16em] font-bold" style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)' }}>팀 득점 기여</span>
                        <span className="font-jersey font-black text-xl leading-none tabular-nums" style={{ color: 'var(--mm-black)' }}>
                          {activeDetail.win_loss.pts_share.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {/* 진행 중 연속 기록 — /me 와 같은 판정·같은 캐시(lib/stats/dashboardBase.ts). 기간과 무관한 값이라 분기를 골라도 그대로다.
                        단위는 「일」(하루 단위 판정) — 종전 「R」 표기·자체 계산은 2026-10-15 정리했다. */}
                    {(detail?.active_streaks?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2" aria-label="진행 중 연속 기록">
                        {detail!.active_streaks!.map(c => (
                          <span
                            key={c.key}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-bold"
                            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}
                          >
                            <Flame size={14} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
                            <span>{c.label}</span>
                            <span className="font-jersey font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{c.count}{c.unit}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* ── 리그 통산 · 대회 기록 (2026-10-14 「선수 숫자는 한 벌」) ──────────────
                        위 누적은 지금 보고 있는 묶음 기준. 아래는 같은 정의(그 묶음 스탯 탭의 그 선수 행)로
                        ① 리그 시즌이 둘 이상이면 리그 시즌끼리만 더한 「리그 통산」,
                        ② 대회는 일시적인 이벤트라 통산에 **더하지 않고** 따로 「대회 기록 (통산 미포함)」. */}
                    {career && career.leagues.length >= 2 && (
                      <CareerBlock
                        title="리그 통산"
                        total={career.league_career}
                        rows={career.leagues}
                      />
                    )}
                    {career && career.tournaments.length > 0 && (
                      <CareerBlock
                        title="대회 기록 (통산 미포함)"
                        total={null}
                        rows={career.tournaments}
                      />
                    )}
                  </>
                )}
              </div>
            ) : (
              <div
                className="px-5 py-6 text-center text-sm"
                style={{ color: 'var(--mm-muted)' }}
              >아직 기록된 스탯이 없습니다</div>
            ))}

            {/* ── 다이나믹 듀오 ─────────────────────────── */}
            {shownTab === 'duo' && (
              <DynamicDuoPanel
                duos={detail?.dynamic_duo ?? []}
                playerName={player?.name ?? playerName}
                // 짝꿍을 누르면 이 카드가 그 선수로 바뀐다 — 「비슷한 스타일 선수」와 같은 동작(2026-10-14)
                onSelectPartner={onOpenPlayer}
              />
            )}

            {/* ── 공격 스타일 ─────────────────────────── */}
            {/* 시도 비중(얼마나 자주 쏘는가) 과 성공률(그중 얼마나 넣는가) 을 별도 컬럼으로 분리.
                이전엔 두 수치가 한 줄에 섞여 있어 혼동을 유발했다 (2026-08-03 개편). */}
            {shownTab === 'shot' && activeDetail?.shot_breakdown && activeDetail.shot_breakdown.total_fga > 0 && (
              <div className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-jersey text-xs font-bold" style={{ color: 'var(--mm-yellow-strong)' }}>공격 스타일</p>
                  {/* 코트 / 도넛 토글 */}
                  <div
                    className="flex rounded-sm overflow-hidden shrink-0"
                    style={{ border: '1px solid var(--mm-rule)' }}
                  >
                    {(['court', 'donut'] as const).map(v => (
                      <button key={v} onClick={() => setShotView(v)}
                        className="px-2.5 py-1 text-xs font-bold cursor-pointer min-h-11 whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                        style={shotView === v
                          ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                          : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)' }
                        }
                      >
                        {v === 'court' ? '코트' : '도넛'}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const sb = activeDetail.shot_breakdown
                  // mm-brand: 존별 색은 데이터 구분 목적이라 정보시각화 관례 유지 (spec 5 data emphasis)
                  // 토큰화(2026-10-12): 골밑 검정(#0A0A0A)은 다크 패널에서 사라졌다 → --mm-ink 로 테마 반전.
                  // 미들은 노랑 계열 두 단계가 다크에서 거의 같아져 다계열 팔레트(--mm-series-2)로 갈랐다.
                  // 시도 비중이 높은 순 = 이 선수가 실제로 자주 쓰는 공격 옵션 순서
                  // zone 키를 같이 들고 다녀야 존별 평균과 비교할 수 있다 — 라벨만으로는 판정 불가
                  const rawZones = [
                    { label: '골밑',   zone: 'post'  as const, color: 'var(--mm-ink)', data: sb.post  },
                    { label: '레이업', zone: 'layup' as const, color: 'var(--mm-yellow)', data: sb.layup },
                    { label: '미들슛', zone: 'mid'   as const, color: 'var(--mm-series-2)', data: sb.mid   },
                    { label: '3점슛',  zone: 'three' as const, color: 'var(--mm-muted)', data: sb.three },
                  ]
                    .filter(z => z.data.a > 0)
                    .sort((a, b) => b.data.dist - a.data.dist)

                  // 도넛 데이터 — 비중 0 제외, 야투 시도 4종만 (자유투는 별도)
                  const donutData = rawZones
                    .filter(z => z.data.dist > 0)
                    .map(z => ({
                      name: z.label,
                      value: +z.data.dist.toFixed(1),
                      fg_pct: z.data.fg_pct,
                      m: z.data.m,
                      a: z.data.a,
                      color: z.color,
                    }))
                  const totalFGA = sb.total_fga
                  const totalFGM = sb.layup.m + sb.mid.m + sb.post.m + sb.three.m
                  const overallFGPct = totalFGA > 0 ? +(totalFGM / totalFGA * 100).toFixed(1) : 0

                  // 코트 차트용 zones 구조 (m/a/fg_pct)
                  const courtZones = {
                    post:  { m: sb.post.m,  a: sb.post.a,  fg_pct: sb.post.fg_pct  },
                    layup: { m: sb.layup.m, a: sb.layup.a, fg_pct: sb.layup.fg_pct },
                    mid:   { m: sb.mid.m,   a: sb.mid.a,   fg_pct: sb.mid.fg_pct   },
                    three: { m: sb.three.m, a: sb.three.a, fg_pct: sb.three.fg_pct },
                  }

                  const primary = rawZones[0]
                  // 성공률 1위는 "시도 3회 이상" 존 중에서만 (1/1 100% 같은 표본 노이즈 제외)
                  const bestPct = [...rawZones].filter(z => z.data.a >= 3).sort((a, b) => b.data.fg_pct - a.data.fg_pct)[0]

                  // 그리드 컬럼: 존 | 시도 비중 | 성공률
                  const ROW_COLS = 'minmax(64px, 0.9fr) 1.5fr auto'

                  return (
                    <div className="space-y-3">
                      {/* 주 공격 옵션 요약 — "무엇을 자주 쓰는가" 와 "무엇이 잘 들어가는가" 를 분리해 제시 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {primary && (
                          <div className="px-3 py-2.5" style={{ background: 'var(--mm-yellow)', border: '1px solid var(--mm-black)' }}>
                            <p className="text-xs font-black uppercase" style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)', letterSpacing: '0.16em' }}>주 공격 옵션</p>
                            <p className="font-bold mt-0.5" style={{ color: 'var(--mm-black)', fontSize: '20px', letterSpacing: '-0.005em' }}>
                              {primary.label}
                            </p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)' }}>
                              전체 야투 시도의 {primary.data.dist.toFixed(1)}%
                            </p>
                          </div>
                        )}
                        {bestPct && (
                          <div className="px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                            <p className="text-xs font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}>가장 정확한 존</p>
                            <p className="font-bold mt-0.5" style={{ color: 'var(--mm-ink)', fontSize: '20px', letterSpacing: '-0.005em' }}>
                              {bestPct.label}
                            </p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
                              성공률 {bestPct.data.fg_pct.toFixed(1)}% ({bestPct.data.m}/{bestPct.data.a})
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 코트 또는 도넛 (토글) */}
                      {shotView === 'court' ? (
                        <div className="flex justify-center">
                          <HalfCourtShotChart zones={courtZones} size={420} />
                        </div>
                      ) : (
                        <div className="relative" style={{ height: 180 }}>
                          <PlayerShotDonut data={donutData} />
                          {/* 중앙 라벨 */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                              <p className="font-jersey font-black text-3xl leading-none tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                                <CountUp value={totalFGA} />
                              </p>
                              <p className="font-jersey text-xs font-bold mt-1" style={{ color: 'var(--mm-muted)' }}>야투 시도</p>
                              <p className={`text-xs font-bold mt-0.5 ${pctColor(overallFGPct, totalFGA, 'fg')}`}>성공률 {overallFGPct.toFixed(1)}%</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 존별 표 — 시도 비중(얼마나 자주) vs 성공률(얼마나 정확) 컬럼 분리 */}
                      <div>
                        <div
                          className="grid items-center gap-2 px-2.5 py-1.5"
                          style={{ gridTemplateColumns: ROW_COLS, borderBottom: '1px solid var(--mm-rule)' }}
                        >
                          <span className="text-xs font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>존</span>
                          <span className="text-xs font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>시도 비중</span>
                          <span className="text-xs font-black uppercase text-right" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>성공률</span>
                        </div>
                        {rawZones.map(z => (
                          <div
                            key={z.label}
                            className="grid items-center gap-2 px-2.5 py-2.5"
                            style={{ gridTemplateColumns: ROW_COLS, borderBottom: '1px solid var(--mm-rule)' }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-5 shrink-0" style={{ backgroundColor: z.color }} aria-hidden />
                              <span className="text-xs font-bold uppercase truncate" style={{ color: 'var(--mm-ink)', letterSpacing: '0.06em' }}>{z.label}</span>
                            </div>
                            {/* 시도 비중 — 막대는 전체 야투 시도 대비 점유율 */}
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex-1 h-2.5 overflow-hidden" style={{ background: 'var(--mm-rule)' }} aria-hidden>
                                <div className="h-full transition-all duration-300" style={{ width: `${Math.min(z.data.dist, 100)}%`, backgroundColor: z.color }} />
                              </div>
                              <span className="t-num text-base font-black shrink-0" style={{ color: 'var(--mm-ink)', minWidth: 44, textAlign: 'right' }}>
                                {z.data.dist.toFixed(1)}%
                              </span>
                            </div>
                            {/* 성공률 */}
                            <div className="text-right">
                              <p className={`font-jersey text-lg font-black leading-none tabular-nums ${pctColor(z.data.fg_pct, z.data.a, z.zone)}`}>{z.data.fg_pct.toFixed(1)}%</p>
                              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--mm-muted)' }}>{z.data.m}/{z.data.a}</p>
                            </div>
                          </div>
                        ))}
                        {/* 자유투 — 야투 시도 비중 집계 대상이 아님을 명시 */}
                        {sb.ft.a > 0 && (
                          <div
                            className="grid items-center gap-2 px-2.5 py-2.5"
                            style={{ gridTemplateColumns: ROW_COLS, borderBottom: '1px solid var(--mm-rule)' }}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-1.5 h-5 shrink-0" style={{ backgroundColor: 'var(--mm-rule)' }} aria-hidden />
                              <span className="text-xs font-bold uppercase truncate" style={{ color: 'var(--mm-ink)', letterSpacing: '0.06em' }}>자유투</span>
                            </div>
                            <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>야투 비중 제외</span>
                            <div className="text-right">
                              <p className={`font-jersey text-lg font-black leading-none tabular-nums ${pctColor(sb.ft.ft_pct, sb.ft.a, 'ft')}`}>{sb.ft.ft_pct.toFixed(1)}%</p>
                              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--mm-muted)' }}>{sb.ft.m}/{sb.ft.a}</p>
                            </div>
                          </div>
                        )}
                        <p className="text-xs mt-2 break-keep" style={{ color: 'var(--mm-muted)' }}>
                          시도 비중 = 전체 야투 {totalFGA}회 중 해당 존이 차지하는 비율 · 성공률 = 그 존에서 넣은 비율
                        </p>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── 분기별 기록 (분기 선택과 무관 — 전 분기를 한 표로) ── */}
            {shownTab === 'quarters' && (() => {
              const hasQ = (quarterRows?.length ?? 0) > 0
              const months = activeDetail?.monthly_stats ?? []
              const hasM = months.length > 0
              // 한쪽만 있으면 그쪽을 보인다(분기가 하나도 없는 묶음 등)
              const view = !hasQ ? 'month' : !hasM ? 'quarter' : periodView
              return (
                <>
                  {hasQ && hasM && (
                    <div className="px-5 pt-4 -mb-2">
                      <div role="group" aria-label="기록 단위" className="inline-flex rounded-sm overflow-hidden" style={{ border: '1px solid var(--mm-rule)' }}>
                        {([['quarter', '분기별'], ['month', '월별']] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={view === key}
                            onClick={() => setPeriodView(key)}
                            className="px-3 min-h-11 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--mm-yellow-strong)]"
                            style={view === key
                              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                              : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)' }
                            }
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {view === 'quarter' && quarterRows && <QuarterTable rows={quarterRows} total={quarterTotal} />}
                  {view === 'month' && <MonthTable rows={months} periodLabel={selectedQuarterId ? '이 분기' : '전체 기간'} />}
                </>
              )
            })()}

            {/* ── 커리어 하이 ───────────────────────────── */}
            {/* Career High Day — 하루(같은 날의 여러 경기 합산) 기준 최고점 */}
            {shownTab === 'career' && detail?.career_high && Object.keys(detail.career_high).length > 0 && (() => {
              const CH_LABEL: Record<string, string> = {
                pts: 'PTS', reb: 'REB', ast: 'AST', stl: 'STL', blk: 'BLK',
                fgPct: 'FG%', fg3m: '3PM',
              }
              const CH_ORDER = ['pts', 'reb', 'ast', 'stl', 'blk', 'fg3m', 'fgPct']
              const entries = CH_ORDER
                .filter(k => detail.career_high[k])
                .map(k => [k, detail.career_high[k]] as const)
              if (entries.length === 0) return null
              return (
                <div className="px-5 py-4">
                  <p className="text-xs uppercase tracking-[0.20em] font-black mb-3" style={{ color: 'var(--mm-yellow-strong)' }}>
                    Career High <span style={{ color: 'var(--mm-ink)' }}>Day</span>
                    <span className="ml-2 text-xs font-normal normal-case tracking-normal" style={{ color: 'var(--mm-muted)' }}>날짜 클릭 → 박스스코어</span>
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {entries.map(([key, ch]) => {
                      const clickable = Boolean(ch.date)
                      const inner = (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <p className="font-jersey text-3xl font-black leading-none tabular-nums" style={{ color: 'var(--mm-ink)' }}>{ch.value}</p>
                            <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--mm-muted)' }}>{CH_LABEL[key] ?? key.toUpperCase()}</p>
                          </div>
                          {ch.date && (
                            <p
                              className="text-xs mt-1.5 font-medium"
                              style={{ color: clickable ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}
                            >
                              {ch.date}{clickable && <span className="ml-1 text-xs" style={{ color: 'var(--mm-muted)' }}>→</span>}
                            </p>
                          )}
                          {ch.extra && <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>{ch.extra}</p>}
                        </>
                      )
                      return clickable ? (
                        <Link
                          key={key}
                          href={`/league/${orgSlug}/${leagueId}/boxscore/${ch.date}`}
                          onClick={onClose}
                          className="block text-left rounded-sm px-3 py-2.5 group transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1 hover:bg-[color:var(--mm-yellow-soft)]"
                          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                          title={`${ch.date} 박스스코어 보기`}
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div
                          key={key}
                          className="rounded-sm px-3 py-2.5"
                          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                        >
                          {inner}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
            {/* ── 최근 트렌드 — 하위 탭: 요즘 흐름(기본) / 일별 기록(월별 성장 + 게임 트렌드 + 일별 표) ── */}
            {shownTab === 'trend' && (() => {
              const form = activeDetail?.form ?? null
              const view = form ? trendView : 'log'
              return (
                <>
                  {form && (
                    <div className="px-5 pt-4 -mb-2">
                      <div role="group" aria-label="최근 트렌드 보기" className="inline-flex rounded-sm overflow-hidden" style={{ border: '1px solid var(--mm-rule)' }}>
                        {([['form', '요즘 흐름'], ['log', '일별 기록']] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            aria-pressed={view === key}
                            onClick={() => setTrendView(key)}
                            className="px-3 min-h-11 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--mm-yellow-strong)]"
                            style={view === key
                              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                              : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)' }
                            }
                          >{label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {view === 'form' && form && <PlayerFormCard form={form} />}
                  {view === 'log' && (
                    <>
                      {activeDetail?.monthly_stats && activeDetail.monthly_stats.length >= 2 && (
                        <MonthlyStatsChart data={activeDetail.monthly_stats} />
                      )}
                      {/* 게임별 트렌드 라인 — 최소 3경기 이상일 때만 표시 */}
                      {activeDetail?.game_log && activeDetail.game_log.length >= 3 && (
                        <GameTrendChart log={activeDetail.game_log} />
                      )}
                      {/* 일별 기록 (R = 하루, 같은 날 여러 경기는 합산) — 5일씩 쪽 넘김 */}
                      {detail && detail.recent_games.length > 0 && <DailyLogTable rows={detail.recent_games} />}
                    </>
                  )}
                </>
              )
            })()}
          </div>
        )}
      </div>
    </div>

    {/* 프로필 사진 라이트박스 — 뷰 모드에서 아바타 클릭 시 크게 표시 */}
    {photoLightboxOpen && photoUrl && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm cursor-zoom-out p-4 sm:p-8 mm-fade-in"
        style={{ background: 'rgba(0,0,0,0.90)' }}
        onClick={() => setPhotoLightboxOpen(false)}
        role="dialog"
        aria-label="프로필 사진 크게 보기"
      >
        <button
          onClick={() => setPhotoLightboxOpen(false)}
          className="absolute top-4 right-4 rounded-sm p-2 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
          style={{ background: 'rgba(0,0,0,0.60)', color: '#fff' }}
          aria-label="닫기"
        >
          <X size={20} />
        </button>
        {/* 라이트박스는 확대 원본 표시 → next/image 대신 <img> 유지, decoding 힌트 추가 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={player?.name ?? ''}
          className="max-w-full max-h-full object-contain rounded-none"
          style={{ maxWidth: 'min(90vw, 720px)', maxHeight: '90vh', border: '2px solid var(--mm-black)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}
          onClick={e => e.stopPropagation()}
          decoding="async"
        />
        {player?.name && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 backdrop-blur-sm px-4 py-2 rounded-sm text-sm font-bold"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
          >
            {player.name}
            {player.number != null && <span className="ml-2 font-mono" style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)' }}>#{player.number}</span>}
          </div>
        )}
      </div>
    )}

    </>
  )
}


// 리그 통산 · 대회 기록 블록 — 숫자는 묶음별 스탯 탭과 같은 정의(/career 라우트 머리 주석).
//   total 이 null 이면 합계 칸을 그리지 않는다(대회는 서로도 더하지 않는다 — 대회마다 따로 본다).
function CareerBlock({ title, total, rows }: {
  title: string
  total: { gp: number; pts: number; reb: number; ast: number } | null
  rows: CareerLine[]
}) {
  return (
    <div
      className="rounded-sm p-3 mt-2"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
    >
      <p className="text-xs uppercase tracking-[0.20em] font-black mb-2" style={{ color: 'var(--mm-yellow-strong)' }}>
        {title}
      </p>
      {total && (
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {([
            ['출전일', total.gp],
            ['PTS', total.pts],
            ['REB', total.reb],
            ['AST', total.ast],
          ] as const).map(([l, v]) => (
            <div
              key={l}
              className="rounded-sm p-2 text-center"
              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
            >
              <p className="text-xs mb-0.5 uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--mm-muted)' }}>{l}</p>
              <p className="font-jersey text-base font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                <CountUp value={v} decimals={0} />
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {rows.map(c => (
          <div
            key={c.leagueId}
            // 폰: 오른쪽 기록 한 줄(약 150px)이 묶음 이름을 「2026 미…」로 눌렀다 → 모자라면 기록이 아랫줄(오른쪽 정렬)로
            className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-0.5 text-xs px-2 py-1.5 rounded-sm min-h-[36px]"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="shrink-0 px-1.5 py-0.5 rounded-sm text-xs font-black uppercase"
                style={c.mode === 'tournament'
                  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                  : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }
                }
              >{c.mode === 'tournament' ? '대회' : '리그'}</span>
              <span className="truncate" style={{ color: 'var(--mm-ink-soft)' }}>{c.name}</span>
            </span>
            <span className="shrink-0 ml-auto tabular-nums font-bold" style={{ color: 'var(--mm-ink)' }}>
              {c.gp}일 · {c.pts}점 · 리바 {c.reb} · 어시 {c.ast}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 상세를 받는 동안의 자리 — 머리(이름·사진·팀)는 이미 보이고 본문 모양만 미리 잡는다 (2026-10-16) */
function DetailSkeleton() {
  return (
    <div className="px-5 py-4 space-y-4" aria-busy="true" aria-label="선수 기록 불러오는 중">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-11 w-16 rounded-sm mm-shimmer" />)}
      </div>
      <div className="h-10 w-full rounded-sm mm-shimmer" />
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 rounded-sm mm-shimmer" />)}
      </div>
      <div className="h-40 w-full rounded-sm mm-shimmer" />
    </div>
  )
}
