'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { Loader2, X, Crown, Sparkles, Pencil, Camera, RefreshCw, Flame, Star, Target, CheckCircle2, Medal, Film, ShieldCheck, Lock, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { compressImage } from '@/lib/util/imageCompress'
import { useSwipe } from '@/hooks/useSwipe'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import LeaderBadgePanel, { type LeaderBadgeCounts } from '@/components/league/LeaderBadgePanel'
import PlayerBadgeStrip, { type BadgeSummary } from '@/components/league/PlayerBadgeStrip'
import PlayerBestShotBanner from '@/components/league/PlayerBestShotBanner'
import StatHelpTooltip from '@/components/stats/StatHelpTooltip'
import { CountUp } from '@/components/league/StatCell'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import HalfCourtShotChart from '@/components/league/HalfCourtShotChart'
import PlayerMiniTabs, { type PlayerTabKey } from '@/components/league/player/PlayerMiniTabs'
import DynamicDuoPanel, { type DuoEntry } from '@/components/league/player/DynamicDuoPanel'
import { type EvaluatedBadge } from '@/lib/stats/badges'

// Recharts (~90KB gz) 는 모달 열림 시점에만 로드 — 초기 번들 감량
// ssr:false 로 hydration 오류 방지 (client component 내부 chart)
const MonthlyStatsChart = dynamic(
  () => import('@/components/league/charts/PlayerQuickViewCharts').then(m => m.MonthlyStatsChart),
  { ssr: false, loading: () => <div style={{ height: 148 }} /> },
)
const GameTrendChart = dynamic(
  () => import('@/components/league/charts/PlayerQuickViewCharts').then(m => m.GameTrendChart),
  { ssr: false, loading: () => <div style={{ height: 188 }} /> },
)
const PlayerRadarChart = dynamic(
  () => import('@/components/league/charts/PlayerQuickViewCharts').then(m => m.PlayerRadarChart),
  { ssr: false, loading: () => <div style={{ height: 160 }} /> },
)
const PlayerShotDonut = dynamic(
  () => import('@/components/league/charts/PlayerQuickViewCharts').then(m => m.PlayerShotDonut),
  { ssr: false, loading: () => <div style={{ height: 180 }} /> },
)

type PlayerInfo = {
  id: string; name: string; number: number | null; position: string | null
  birth_date: string | null; plus_one: boolean
  photo_url?: string | null
  original_photo_url?: string | null
  has_account?: boolean  // 로그인 계정 등록·승인(인증) 회원 여부
}

type SeasonStats = {
  gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  fg_pct: number; fg3_pct: number; ft_pct: number; efg_pct: number
}

type RankTotal = { rank: number; total: number }
type Detail = {
  rankings: {
    ppg: number; rpg: number; apg: number; spg: number; bpg: number
    total: number; win_rate_rank?: number
    // 신규 (#5a): { rank, total } 형태 — gp>=1 자격
    gp?: RankTotal; fg_pct?: RankTotal; fg3_pct?: RankTotal; ft_pct?: RankTotal
  }
  active_streaks?: { ten: number; twenty: number; three: number; win: number }
  dynamic_duo?: DuoEntry[]
  badges: EvaluatedBadge[]
  badges_summary?: BadgeSummary
  pinned_event_ids?: string[]
  career_high: Record<string, { value: number; extra?: string; date?: string; opponent?: string; result?: string; score?: string }>
  shot_breakdown: { layup: { m: number; a: number; dist: number; fg_pct: number }; mid: { m: number; a: number; dist: number; fg_pct: number }; post: { m: number; a: number; dist: number; fg_pct: number }; three: { m: number; a: number; dist: number; fg_pct: number }; ft: { m: number; a: number; ft_pct: number }; total_fga: number }
  // record = 그 라운드(하루)의 전 경기 합산 전적. result 는 그 합산의 종합 판정(W/L/D).
  //   예전엔 result 가 '그날 첫 경기' 결과였다 — 스탯은 하루 합산인데 승패만 한 경기라
  //   어긋났다(2026-08-09 김로빈 8/8: 실제 2승4패인데 첫 경기 승이라 W 로 표시).
  recent_games: Array<{ date?: string; opponent?: string; result?: string; score?: string; record?: { wins: number; losses: number; draws: number; games: number }; pts: number; reb: number; ast: number; stl?: number; blk?: number; fgm: number; fga: number; fg3m?: number; fg3a?: number }>
  game_log?: Array<{ date: string; pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; fg3m: number; fg3a: number }>
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
  monthly_stats?: Array<{
    month: string; label: string; gp: number
    ppg: number; rpg: number; apg: number; spg: number; bpg: number; fg_pct: number
  }>
}

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }

// 팀 전체 통산(리그+대회 묶음 합산) — /career 라우트 응답.
// 묶음이 1개뿐이면(지금의 미라클) competitions 가 항상 1건이라 통산=시즌 스탯과 같아지므로
// 화면에서는 length>=2 일 때만 렌더한다(중복 표시 방지, task-4-brief 요구사항).
type CareerCompetition = {
  leagueId: string; slug: string; name: string; mode: 'league' | 'tournament'; seasonYear: number
  gp: number; pts: number; reb: number; ast: number
}
type CareerSummary = {
  competitions: CareerCompetition[]
  career: { gp: number; pts: number; reb: number; ast: number }
}

// mm-brand: 포지션 뱃지도 통일 톤 (뮤트 배경 + 잉크 라벨)
const POSITION_COLORS: Record<string, string> = {
  PG: 'mm-position-badge',
  SG: 'mm-position-badge',
  SF: 'mm-position-badge',
  PF: 'mm-position-badge',
  C:  'mm-position-badge',
}
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
  rgb: '234,179,8',            // mm-yellow
  stroke: '#EAB308',
  fillA: '#EAB308', fillB: '#FDE047',
  borderCls: '',                // 아래에서 style 로 처리
  textCls: '',
  ringCls: '',
}
function computeAccent(_rankings?: Detail['rankings']): AccentPalette {
  return ACCENT_DEFAULT
}

// data emphasis (spec 5): 양수=emerald, 음수=red, muted 유지
function pctColor(pct: number): string {
  if (pct >= 50) return 'text-[color:#059669]'
  if (pct >= 30) return 'text-[color:var(--mm-yellow-strong)]'
  return 'text-[color:#DC2626]'
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
}

export default function PlayerQuickViewModal({ leagueId, playerId, playerName, onClose, isEditMode, leagueHeaders, onSaved, onDeleted }: Props) {
  const [player, setPlayer] = useState<PlayerInfo | null>(null)
  const [stats, setStats] = useState<SeasonStats | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)  // 401 — 상세 스탯은 승인 회원 전용 (2026-07-28)
  const [leaderBadges, setLeaderBadges] = useState<LeaderBadgeCounts | null>(null)
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [career, setCareer] = useState<CareerSummary | null>(null)
  const [selectedQuarterId, setSelectedQuarterId] = useState<string | null>(null)
  const [quarterDetail, setQuarterDetail] = useState<Detail | null>(null)
  const [quarterLoading, setQuarterLoading] = useState(false)
  const [showEditPanel, setShowEditPanel] = useState(false)
  const [togglingP1, setTogglingP1] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', position: '', birth_date: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  // 사진 업로드 · AI 프로필 생성 state
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [generatingAI, setGeneratingAI] = useState(false)
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
  // 현재 photo 가 AI 생성물인지 판단 — 재생성 버튼 노출 조건
  const isAIGenerated = Boolean(originalPhotoUrl && photoUrl && originalPhotoUrl !== photoUrl)
  const [shotView, setShotView] = useState<'court'|'donut'>('court')
  // 미니 탭 — 세로 스크롤 과다 해소 (2026-08-03). 탭 전환 시 본문 최상단으로 스크롤 복귀.
  const [activeTab, setActiveTab] = useState<PlayerTabKey>('season')
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [playersRes, statsRes, detailRes, quartersRes, leaderRes, careerRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/players`),
        fetch(`/api/leagues/${leagueId}/stats?playerId=${playerId}`),
        fetch(`/api/leagues/${leagueId}/players/${playerId}/detail`),
        fetch(`/api/leagues/${leagueId}/quarters`),
        fetch(`/api/leagues/${leagueId}/leader-badges?playerId=${playerId}`),
        // 팀 전체 통산 — 묶음이 1개뿐이면 어차피 length<2 라 안 보인다. 401(미승인 회원)은
        // gated 상태(detailRes 401)로 이미 처리되므로 여기선 실패를 조용히 무시.
        fetch(`/api/leagues/${leagueId}/players/${playerId}/career`),
      ])
      if (playersRes.ok) {
        const all: PlayerInfo[] = await playersRes.json()
        setPlayer(all.find(p => p.id === playerId) ?? null)
      }
      if (statsRes.ok) {
        const d = await statsRes.json()
        setStats(d.players?.[0] ?? null)
      }
      if (detailRes.status === 401) setGated(true)
      if (detailRes.ok) setDetail(await detailRes.json())
      if (quartersRes.ok) {
        const qs: Quarter[] = await quartersRes.json()
        setQuarters(qs)
      }
      if (leaderRes.ok) {
        const lb = await leaderRes.json()
        setLeaderBadges(lb[playerId] ?? null)
      }
      if (careerRes.ok) setCareer(await careerRes.json())
    } finally { setLoading(false) }
  }, [leagueId, playerId])

  useEffect(() => { load() }, [load])
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
      setOriginalPhotoUrl(player.original_photo_url ?? null)
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

  // 데이터가 있는 탭만 노출 — 빈 탭 클릭 후 아무것도 안 나오는 상황 방지
  const availableTabs = useMemo(() => {
    const s = new Set<PlayerTabKey>(['season'])
    if (detail?.badges_summary || leaderBadges) s.add('badges')
    if ((detail?.dynamic_duo?.length ?? 0) > 0) s.add('duo')
    if ((activeDetail?.shot_breakdown?.total_fga ?? 0) > 0) s.add('shot')
    if (detail?.career_high && Object.keys(detail.career_high).length > 0) s.add('career')
    if ((activeDetail?.monthly_stats?.length ?? 0) >= 2
      || (activeDetail?.game_log?.length ?? 0) >= 3
      || (detail?.recent_games?.length ?? 0) > 0) s.add('trend')
    return s
  }, [detail, activeDetail, leaderBadges])

  // 선택된 탭이 사라지면(분기 전환 등) 시즌 스탯으로 복귀
  useEffect(() => {
    if (!availableTabs.has(activeTab)) setActiveTab('season')
  }, [availableTabs, activeTab])

  const changeTab = (key: PlayerTabKey) => {
    setActiveTab(key)
    // 긴 탭 → 짧은 탭 전환 시 화면이 비어 보이지 않도록 탭 바가 상단에 오도록 스크롤 정렬.
    // (0 으로 올리면 히어로가 다시 나와 탭이 화면 밖으로 밀림)
    const scroller = modalScrollRef.current
    const tabsEl = scroller?.querySelector('[role="tablist"]') as HTMLElement | null
    if (!scroller || !tabsEl) return
    const target = Math.max(0, tabsEl.offsetTop - actionBarH)
    if (scroller.scrollTop > target) scroller.scrollTo({ top: target, behavior: 'smooth' })
  }

  const positions = (player?.position ?? '').split(',').map(p => p.trim()).filter(Boolean)

  // 분기 탭 레이블
  const quarterLabel = (q: Quarter) => `${String(q.year).slice(2)}.${q.quarter}Q`

  const accent = computeAccent(detail?.rankings)

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4 animate-in fade-in duration-200"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-modal-name"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div
        ref={modalScrollRef}
        className="relative border-0 sm:border rounded-none w-full max-w-lg sm:max-w-xl h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-y-auto z-10 animate-in sm:zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm text-xs font-bold cursor-pointer transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={showEditPanel
                ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
              }
            >
              <Pencil size={12} aria-hidden /> 편집
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded-sm cursor-pointer transition-colors duration-200 inline-flex items-center justify-center min-h-11 min-w-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 hover:bg-[color:var(--mm-panel-alt)]"
            style={{ color: 'var(--mm-muted)' }}
          >
            <X size={18} />
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
            {/* 아바타 (편집모드 = 호버 오버레이 업로드/AI · 뷰모드 = 클릭 시 라이트박스 확대) */}
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
                    ? <Loader2 size={18} className="animate-spin text-white" />
                    : <span className="text-white text-xs font-bold text-center px-2 inline-flex items-center gap-1"><Camera size={12} aria-hidden /> 사진</span>}
                  <input type="file" accept="image/*" className="hidden"
                    disabled={uploadingPhoto || generatingAI}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file || !leagueHeaders) return
                      setUploadingPhoto(true)
                      try {
                        // Vercel 서버리스 413 방지 — 800x600 리사이즈 + JPEG 재인코딩
                        // AI 생성용 원본 품질도 이 정도로 충분 (Gemini 는 저해상도로도 잘 인식)
                        const compressed = await compressImage(file, 600, 800, 0.82)
                        const fd = new FormData()
                        fd.append('file', compressed)
                        const photoHeaders: Record<string, string> = {}
                        if (leagueHeaders['X-League-Pin']) photoHeaders['X-League-Pin'] = leagueHeaders['X-League-Pin']
                        const res = await fetch(`/api/leagues/${leagueId}/players/${playerId}/photo`, {
                          method: 'POST', headers: photoHeaders, body: fd,
                        })
                        if (res.ok) {
                          const d = await res.json()
                          setPhotoUrl(d.url)
                          // 새 원본 업로드 = original_photo_url 도 갱신됨 (서버에서)
                          setOriginalPhotoUrl(d.url)
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
              {/* 편집 모드 + 사진 있음 — 우하단 AI 프로필 생성/재생성 버튼 */}
              {isEditMode && photoUrl && (
                <button
                  type="button"
                  disabled={generatingAI || uploadingPhoto}
                  onClick={async () => {
                    if (!leagueHeaders) return
                    const promptText = isAIGenerated
                      ? 'AI 프로필을 재생성하시겠어요?\n\n원본 사진에서 새 결과를 만듭니다 (매번 조금씩 달라짐).\n\n예상 시간 10-20초 · 비용 ~$0.04'
                      // 멀티테넌트 전환(온볼): 서버 프롬프트가 노란/검정 유니폼으로 고정 생성하므로(club 무관, 별도 이슈로 보고)
                      // 다이얼로그 문구는 실제 동작과 일치하되 특정 클럽명은 노출하지 않음
                      : 'AI 로 실사 프로필을 생성하시겠어요?\n\n노란/검정 유니폼을 입은 프로필 사진으로 변환됩니다.\n원본은 별도 보관되어 재생성 가능.\n\n예상 시간 10-20초 · 비용 ~$0.04'
                    if (!window.confirm(promptText)) return
                    setGeneratingAI(true)
                    try {
                      const headers: Record<string, string> = {}
                      if (leagueHeaders['X-League-Pin']) headers['X-League-Pin'] = leagueHeaders['X-League-Pin']
                      const res = await fetch(`/api/leagues/${leagueId}/players/${playerId}/photo/generate`, {
                        method: 'POST', headers,
                      })
                      if (res.ok) {
                        const d = await res.json()
                        setPhotoUrl(d.url)
                        toast.success(isAIGenerated ? '재생성 완료' : 'AI 프로필 생성 완료')
                        onSaved?.()
                      } else {
                        const err = await res.json().catch(() => ({}))
                        toast.error(`생성 실패: ${err.error ?? res.status}`)
                      }
                    } catch { toast.error('네트워크 오류') } finally { setGeneratingAI(false) }
                  }}
                  className="absolute -bottom-2 -right-2 flex items-center gap-1 px-2 py-1 rounded-sm text-[10px] font-bold transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-wait z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{
                    background: 'var(--mm-yellow)',
                    color: 'var(--mm-black)',
                    border: '1px solid var(--mm-black)',
                  }}
                  title={isAIGenerated ? '동일 원본에서 AI 프로필 재생성' : 'Gemini 2.5 로 실사 프로필 생성'}
                >
                  {generatingAI
                    ? <><Loader2 size={10} className="animate-spin" /> 생성중</>
                    : isAIGenerated
                      ? <><RefreshCw size={10} aria-hidden /> 재생성</>
                      : <><Sparkles size={10} aria-hidden /> AI 프로필</>}
                </button>
              )}
            </div>

            {/* 이름 + 정보 (아바타 크기와 비례해 확대) — hero stagger reveal */}
            <div className="relative flex-1 min-w-0 pt-3 sm:pt-4">
              {player?.number != null && (
                <div
                  className="text-base font-mono mb-1 leading-none animate-in fade-in slide-in-from-bottom-2"
                  style={{ color: 'var(--mm-muted)', animationDelay: '80ms', animationDuration: '400ms', animationFillMode: 'backwards' }}
                >
                  #{player.number}
                </div>
              )}
              <h1
                id="player-modal-name"
                className="font-jersey text-4xl sm:text-5xl font-bold leading-[0.95] tracking-tight mb-3 break-words animate-in fade-in slide-in-from-bottom-2"
                style={{ color: 'var(--mm-ink)', animationDelay: '140ms', animationDuration: '500ms', animationFillMode: 'backwards' }}
              >
                {player?.name ?? playerName}
              </h1>
              <div
                className="flex items-center gap-1.5 flex-wrap animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: '220ms', animationDuration: '400ms', animationFillMode: 'backwards' }}
              >
                {positions.map(pos => (
                  <span
                    key={pos}
                    className="font-jersey text-sm font-black tracking-[0.16em] px-2.5 py-1 rounded-sm"
                    style={MM_POSITION_STYLE}
                  >{pos}</span>
                ))}
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
                    <ShieldCheck size={13} aria-hidden /> 인증
                  </span>
                )}
                {orgSlug && (
                  <Link
                    href={`/league/${orgSlug}/${leagueId}/highlights/player/${playerId}`}
                    onClick={onClose}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] px-2.5 py-1 rounded-sm cursor-pointer transition-colors min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                    style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)', border: '1px solid var(--mm-black)' }}
                    aria-label={`${player?.name ?? playerName} 하이라이트 보기`}
                  >
                    <Film size={12} aria-hidden /> 하이라이트
                  </Link>
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
        </div>

        {showEditPanel && isEditMode && (() => {
          const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
          const positionList = editForm.position
            ? editForm.position.split(',').map(s => s.trim()).filter(Boolean)
            : []
          const togglePosition = (p: string) => {
            const next = positionList.includes(p)
              ? positionList.filter(x => x !== p)
              : [...positionList, p]
            setEditForm(f => ({ ...f, position: next.join(',') }))
          }
          const nameId = `player-edit-name-${playerId}`
          const positionId = `player-edit-position-${playerId}`
          return (
          <div
            className="px-5 py-4 space-y-3"
            style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
          >
            <p className="text-xs font-black uppercase tracking-[0.20em]" style={{ color: 'var(--mm-yellow-strong)' }}>선수 정보 수정</p>
            <p className="text-[11px] -mt-1" style={{ color: 'var(--mm-muted)' }}>프로필 사진은 위 아바타에 마우스를 올려 업로드/AI 생성하세요.</p>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label htmlFor={nameId} className="text-xs block mb-1 font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--mm-muted)' }}>이름</label>
                <input
                  id={nameId}
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({...f, name: e.target.value}))}
                  className="w-full rounded-sm px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}
                />
              </div>
              <div>
                <label id={positionId} className="text-xs block mb-1 font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--mm-muted)' }}>포지션 (다중 선택)</label>
                <div role="group" aria-labelledby={positionId} className="flex flex-wrap gap-1.5">
                  {POSITIONS.map(p => {
                    const active = positionList.includes(p)
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={active}
                        onClick={() => togglePosition(p)}
                        className="px-3 py-1.5 rounded-sm text-xs font-bold border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                        style={active
                          ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', color: 'var(--mm-black)' }
                          : { background: 'var(--mm-panel)', borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
                        }
                      >
                        {p}
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
                    body: JSON.stringify({ name: editForm.name, position: editForm.position || null }),
                  })
                  setSavingEdit(false)
                  if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: '저장 실패' }))
                    alert(err.error || '저장 실패')
                    return
                  }
                  onSaved?.(); setShowEditPanel(false)
                }} disabled={savingEdit}
                  className="w-full py-2 rounded-sm text-xs font-black uppercase tracking-[0.16em] cursor-pointer transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
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
                className="px-3 py-1 rounded-sm text-xs font-bold cursor-pointer transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                style={player?.plus_one
                  ? { background: 'var(--mm-yellow)', borderColor: 'var(--mm-black)', border: '1px solid var(--mm-black)', color: 'var(--mm-black)' }
                  : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }
                }
              >
                {player?.plus_one ? '+1 ON' : '+1 OFF'}
              </button>
            </div>
            {/* Delete */}
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="w-full py-2 rounded-sm text-xs font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-live)] focus-visible:ring-offset-1"
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
                  className="flex-1 py-2 rounded-sm text-xs font-black uppercase tracking-[0.14em] text-white cursor-pointer transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-live)] focus-visible:ring-offset-1"
                  style={{ background: 'var(--mm-live-bg)', border: '1px solid var(--mm-black)' }}
                >
                  {deleting ? '삭제 중...' : '삭제 확인'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 py-2 rounded-sm text-xs font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                >취소</button>
              </div>
            )}
          </div>
          )
        })()}

        <div className="h-px w-full" style={{ background: 'var(--mm-yellow)' }} />

        {loading ? (
          <div className="flex justify-center py-16"><BasketballLoader size={28} /></div>
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
            <p className="text-[13px] mt-1.5 leading-relaxed max-w-xs break-keep" style={{ color: 'var(--mm-muted)' }}>
              선수별 시즌 기록·배지·차트는 가입 승인된 회원만 볼 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('mm-open-login')) }}
              className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-bold text-sm cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] min-h-[44px]"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
            >
              <LogIn size={15} aria-hidden />
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
                        className="shrink-0 px-3 py-1 rounded-sm text-xs font-bold cursor-pointer transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
                          className="shrink-0 px-3 py-1 rounded-sm text-xs font-bold cursor-pointer transition-colors duration-200 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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

            {/* 미니 탭 — 시즌 스탯 / 성과 뱃지 / 다이나믹 듀오 / 공격 스타일 / 커리어 하이 / 최근 트렌드 */}
            <PlayerMiniTabs active={activeTab} onChange={changeTab} available={availableTabs} topOffset={actionBarH} />

            {/* ── 시즌 스탯 ─────────────────────────────── */}
            {activeTab === 'season' && (activeDetail?.player_stats ? (
              <div className="px-5 py-4">
                {quarterLoading ? (
                  <div className="flex justify-center py-8"><BasketballLoader size={22} /></div>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-[0.20em] font-black mb-3" style={{ color: 'var(--mm-yellow-strong)' }}>시즌 스탯</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mb-3">
                      {[
                        // #5a: R/G 은 gp 랭킹 (신규 { rank, total } 형태)
                        { label: 'R', value: activeDetail?.player_stats?.gp ?? 0,  decimals: 0, rank: detail?.rankings.gp?.rank ?? 0, total: detail?.rankings.gp?.total ?? 0 },
                        { label: 'PPG', value: activeDetail?.player_stats?.ppg ?? 0, decimals: 1, rank: detail?.rankings.ppg ?? 0, total: detail?.rankings.total ?? 0 },
                        { label: 'RPG', value: activeDetail?.player_stats?.rpg ?? 0, decimals: 1, rank: detail?.rankings.rpg ?? 0, total: detail?.rankings.total ?? 0 },
                        { label: 'APG', value: activeDetail?.player_stats?.apg ?? 0, decimals: 1, rank: detail?.rankings.apg ?? 0, total: detail?.rankings.total ?? 0 },
                        { label: 'STL', value: activeDetail?.player_stats?.spg ?? 0, decimals: 1, rank: detail?.rankings.spg ?? 0, total: detail?.rankings.total ?? 0 },
                        { label: 'BLK', value: activeDetail?.player_stats?.bpg ?? 0, decimals: 1, rank: detail?.rankings.bpg ?? 0, total: detail?.rankings.total ?? 0 },
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
                              style={{ color: isChamp ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)' }}
                            >{label}</p>
                            <p
                              className="relative font-jersey font-black text-4xl leading-none tabular-nums"
                              style={{ color: isChamp ? 'var(--mm-black)' : 'var(--mm-ink)' }}
                            >
                              <CountUp value={value} decimals={decimals} />
                            </p>
                            {rank > 0 && (
                              <p
                                className="relative text-[11px] font-black mt-1 flex items-center justify-center gap-1 whitespace-nowrap tabular-nums"
                                style={{ color: isChamp ? 'var(--mm-black)' : rank <= 3 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}
                              >
                                {isChamp && <Crown size={11} aria-hidden strokeWidth={2.5} />}
                                {(rank === 2 || rank === 3) && <Medal size={11} aria-hidden strokeWidth={2.5} />}
                                {rank}위{total > 0 && <span className="opacity-60"> · {total}</span>}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {[
                        // #5a: 슛 정확도 랭킹 (시도>0 필요, gp>=1 자격)
                        { label: 'FG%', pct: activeDetail?.player_stats?.fg_pct ?? 0, m: activeDetail?.player_stats?.fgm ?? 0, a: activeDetail?.player_stats?.fga ?? 0, rt: detail?.rankings.fg_pct },
                        { label: '3P%', pct: activeDetail?.player_stats?.fg3_pct ?? 0, m: activeDetail?.player_stats?.fg3m ?? 0, a: activeDetail?.player_stats?.fg3a ?? 0, rt: detail?.rankings.fg3_pct },
                        { label: 'FT%', pct: activeDetail?.player_stats?.ft_pct ?? 0, m: activeDetail?.player_stats?.ftm ?? 0, a: activeDetail?.player_stats?.fta ?? 0, rt: detail?.rankings.ft_pct },
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
                            <p className="text-xs mb-1 uppercase tracking-[0.16em] font-bold flex items-center justify-center" style={{ color: isChamp ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)' }}>
                              <span>{label}</span>
                              <StatHelpTooltip statKey={label} size={11} />
                            </p>
                            <p className="font-jersey text-xl font-black leading-none tabular-nums" style={{ color: isChamp ? 'var(--mm-black)' : 'var(--mm-ink)' }}>
                              {a > 0 ? <><CountUp value={pct} decimals={1} />%</> : '—'}
                            </p>
                            <p className="text-xs mt-0.5 font-mono" style={{ color: isChamp ? 'rgba(0,0,0,0.65)' : 'var(--mm-muted)' }}>{m}/{a}</p>
                            {rank > 0 && a > 0 && (
                              <p
                                className="text-[11px] font-black mt-1 flex items-center justify-center gap-1 whitespace-nowrap tabular-nums"
                                style={{ color: isChamp ? 'var(--mm-black)' : rank <= 3 ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }}
                              >
                                {isChamp && <Crown size={11} aria-hidden strokeWidth={2.5} />}
                                {(rank === 2 || rank === 3) && <Medal size={11} aria-hidden strokeWidth={2.5} />}
                                {rank}위{total > 0 && <span className="opacity-60"> · {total}</span>}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* 능력치 레이더 — 리그 백분위 (rankings 기반) */}
                    {activeDetail?.player_stats && detail?.rankings && (() => {
                      const total = detail.rankings.total ?? 1
                      const pctile = (rank: number) => rank > 0 && total > 0
                        ? Math.round((total - rank + 1) / total * 100)
                        : 50
                      const radarData = [
                        { stat: '득점',     value: pctile(detail.rankings.ppg ?? 0) },
                        { stat: '리바운드', value: pctile(detail.rankings.rpg ?? 0) },
                        { stat: '어시스트', value: pctile(detail.rankings.apg ?? 0) },
                        { stat: '스틸',     value: pctile(detail.rankings.spg ?? 0) },
                        { stat: '블록',     value: pctile(detail.rankings.bpg ?? 0) },
                      ]
                      return (
                        <div className="mt-2">
                          <PlayerRadarChart data={radarData} accent={{ stroke: accent.stroke, fillA: accent.fillA, fillB: accent.fillB }} />
                          <p className="text-xs text-center mt-0.5 uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--mm-muted)' }}>리그 백분위 (100 = 1위)</p>
                        </div>
                      )
                    })()}

                    {/* 승/패/승률 row */}
                    {activeDetail?.win_loss && (activeDetail.win_loss.wins + activeDetail.win_loss.losses) > 0 && (() => {
                      const wl = activeDetail.win_loss!
                      const total = ranked_total(detail)
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
                              const rank = computeWinRateRank(activeDetail)
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
                            style={{ color: hi ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)' }}
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
                        <span className="text-xs uppercase tracking-[0.16em] font-bold" style={{ color: 'rgba(0,0,0,0.65)' }}>팀 득점 기여</span>
                        <span className="font-jersey font-black text-xl leading-none tabular-nums" style={{ color: 'var(--mm-black)' }}>
                          {activeDetail.win_loss.pts_share.toFixed(1)}%
                        </span>
                      </div>
                    )}
                    {(() => {
                      const streaks = detail?.active_streaks
                      const chips = streaks ? ([
                        { count: streaks.ten,    label: '두자릿수 득점', Icon: Flame },
                        { count: streaks.twenty, label: '20+ 득점',      Icon: Star },
                        { count: streaks.three,  label: '3P 메이드',     Icon: Target },
                        { count: streaks.win,    label: '출전 연승',     Icon: CheckCircle2 },
                      ]).filter(c => c.count >= 2) : []
                      if (chips.length === 0) return null
                      return (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {chips.map(c => {
                            const Icon = c.Icon
                            return (
                              <span
                                key={c.label}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-bold"
                                style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}
                              >
                                <Icon size={12} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
                                <span>{c.label}</span>
                                <span className="font-jersey font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{c.count}{'R'}</span>
                              </span>
                            )
                          })}
                        </div>
                      )
                    })()}

                    {/* ── 팀 전체 통산 — 리그+대회 묶음 합산 ──────────────────────
                        위 "시즌 스탯"은 지금 보고 있는 묶음(리그 시즌 또는 대회) 기준 그대로 둔다.
                        통산은 그 옆에 별도 블록으로 추가한다 — 기존 표시를 바꾸지 않는다.
                        묶음이 2개 미만이면 통산=시즌이라 안 보여준다(중복 표시 방지). */}
                    {career && career.competitions.length >= 2 && (
                      <div
                        className="rounded-sm p-3 mt-2"
                        style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                      >
                        <p className="text-xs uppercase tracking-[0.20em] font-black mb-2" style={{ color: 'var(--mm-yellow-strong)' }}>
                          팀 통산 (리그+대회 합산)
                        </p>
                        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
                          {([
                            ['G', career.career.gp],
                            ['PTS', career.career.pts],
                            ['REB', career.career.reb],
                            ['AST', career.career.ast],
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
                        <div className="space-y-1">
                          {career.competitions.map(c => (
                            <div
                              key={c.leagueId}
                              className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded-sm min-h-[36px]"
                              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
                            >
                              <span className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="shrink-0 px-1.5 py-0.5 rounded-sm text-[10px] font-black uppercase"
                                  style={c.mode === 'tournament'
                                    ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                                    : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }
                                  }
                                >{c.mode === 'tournament' ? '대회' : '리그'}</span>
                                <span className="truncate" style={{ color: 'var(--mm-ink-soft)' }}>{c.name}</span>
                              </span>
                              <span className="shrink-0 tabular-nums font-bold" style={{ color: 'var(--mm-ink)' }}>{c.gp}G · {c.pts}점</span>
                            </div>
                          ))}
                        </div>
                      </div>
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

            {/* ── 성과 뱃지 (스탯 리더 + 자동 배지) ────────── */}
            {activeTab === 'badges' && (
              <>
                {/* 자동 배지 — 퍼펙트/DD/TD/위닝샷 · 클릭 시 획득 게임 상세 */}
                {detail?.badges_summary && (
                  <PlayerBadgeStrip
                    leagueId={leagueId}
                    playerId={playerId}
                    summary={detail.badges_summary}
                  />
                )}

                {/* 게임 스탯 리더 — 부문별 1등 카운트 (POTM) · 클릭 시 등극 날짜 목록 */}
                {leaderBadges && (
                  <LeaderBadgePanel badges={leaderBadges} leagueId={leagueId} playerId={playerId} />
                )}
              </>
            )}

            {/* ── 다이나믹 듀오 ─────────────────────────── */}
            {activeTab === 'duo' && (
              <DynamicDuoPanel
                duos={detail?.dynamic_duo ?? []}
                playerName={player?.name ?? playerName}
              />
            )}

            {/* ── 공격 스타일 ─────────────────────────── */}
            {/* 시도 비중(얼마나 자주 쏘는가) 과 성공률(그중 얼마나 넣는가) 을 별도 컬럼으로 분리.
                이전엔 두 수치가 한 줄에 섞여 있어 혼동을 유발했다 (2026-08-03 개편). */}
            {activeTab === 'shot' && activeDetail?.shot_breakdown && activeDetail.shot_breakdown.total_fga > 0 && (
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
                        className="px-2.5 py-1 text-xs font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
                  // 시도 비중이 높은 순 = 이 선수가 실제로 자주 쓰는 공격 옵션 순서
                  const rawZones = [
                    { label: '골밑',   color: '#0A0A0A', data: sb.post  },
                    { label: '레이업', color: '#EAB308', data: sb.layup },
                    { label: '미들슛', color: '#A16207', data: sb.mid   },
                    { label: '3점슛',  color: '#6B7280', data: sb.three },
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
                            <p className="text-[11px] font-black uppercase" style={{ color: 'rgba(0,0,0,0.65)', letterSpacing: '0.16em' }}>주 공격 옵션</p>
                            <p className="font-bold mt-0.5" style={{ color: 'var(--mm-black)', fontSize: '20px', letterSpacing: '-0.005em' }}>
                              {primary.label}
                            </p>
                            <p className="text-xs font-bold mt-0.5" style={{ color: 'rgba(0,0,0,0.72)' }}>
                              전체 야투 시도의 {primary.data.dist.toFixed(1)}%
                            </p>
                          </div>
                        )}
                        {bestPct && (
                          <div className="px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                            <p className="text-[11px] font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}>가장 정확한 존</p>
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
                              <p className={`text-xs font-bold mt-0.5 ${pctColor(overallFGPct)}`}>성공률 {overallFGPct.toFixed(1)}%</p>
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
                          <span className="text-[11px] font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>존</span>
                          <span className="text-[11px] font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>시도 비중</span>
                          <span className="text-[11px] font-black uppercase text-right" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>성공률</span>
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
                              <span className="font-jersey font-black tabular-nums shrink-0" style={{ color: 'var(--mm-ink)', fontSize: '14px', minWidth: 44, textAlign: 'right' }}>
                                {z.data.dist.toFixed(1)}%
                              </span>
                            </div>
                            {/* 성공률 */}
                            <div className="text-right">
                              <p className={`font-jersey text-lg font-black leading-none tabular-nums ${pctColor(z.data.fg_pct)}`}>{z.data.fg_pct.toFixed(1)}%</p>
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
                              <span className="w-1.5 h-5 shrink-0" style={{ backgroundColor: '#D4D4D4' }} aria-hidden />
                              <span className="text-xs font-bold uppercase truncate" style={{ color: 'var(--mm-ink)', letterSpacing: '0.06em' }}>자유투</span>
                            </div>
                            <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>야투 비중 제외</span>
                            <div className="text-right">
                              <p className={`font-jersey text-lg font-black leading-none tabular-nums ${pctColor(sb.ft.ft_pct)}`}>{sb.ft.ft_pct.toFixed(1)}%</p>
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

            {/* ── 커리어 하이 ───────────────────────────── */}
            {/* Career High Day — 하루(같은 날의 여러 경기 합산) 기준 최고점 */}
            {activeTab === 'career' && detail?.career_high && Object.keys(detail.career_high).length > 0 && (() => {
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
                          className="block text-left rounded-sm px-3 py-2.5 group transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 hover:bg-[color:var(--mm-yellow-soft)]"
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
            {/* ── 최근 트렌드 (월별 성장지표 + 게임 트렌드 + 최근 5R) ── */}
            {/* 월별 성장지표 */}
            {activeTab === 'trend' && activeDetail?.monthly_stats && activeDetail.monthly_stats.length >= 2 && (
              <MonthlyStatsChart data={activeDetail.monthly_stats} />
            )}

            {/* 게임별 트렌드 라인 — 최소 3경기 이상일 때만 표시 */}
            {activeTab === 'trend' && activeDetail?.game_log && activeDetail.game_log.length >= 3 && (
              <GameTrendChart log={activeDetail.game_log} />
            )}

            {/* 최근 5R (R = 라운드 단위, 같은 날 여러 경기는 합산. 단일 상대 개념 없음) */}
            {activeTab === 'trend' && detail && detail.recent_games.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs uppercase tracking-[0.20em] font-black mb-3" style={{ color: 'var(--mm-yellow-strong)' }}>최근 5R</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                        {['날짜','PTS','REB','AST','STL','BLK','FG','FG%','3P%'].map(h => (
                          <th key={h} className="pb-1.5 text-xs font-bold uppercase tracking-[0.14em] text-right first:text-left" style={{ color: 'var(--mm-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.recent_games.map((g, i) => {
                        const r = g as typeof g & { stl?: number; blk?: number; fg3m?: number; fg3a?: number }
                        const fgPct  = g.fga > 0 ? Math.round(g.fgm / g.fga * 100) : null
                        const fg3Pct = (r.fg3a ?? 0) > 0 ? Math.round((r.fg3m ?? 0) / (r.fg3a ?? 1) * 100) : null
                        return (
                        <tr key={i} style={{ borderBottom: '1px solid var(--mm-rule)' }} className="last:border-0">
                          <td className="py-1.5 text-xs pr-2 whitespace-nowrap font-mono" style={{ color: 'var(--mm-ink-soft)' }}>{g.date?.slice(5) ?? '—'}</td>
                          <td className="py-1.5 text-right font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{g.pts}</td>
                          <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{g.reb}</td>
                          <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{g.ast}</td>
                          <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{r.stl ?? 0}</td>
                          <td className="py-1.5 text-right tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{r.blk ?? 0}</td>
                          <td className="py-1.5 text-right text-xs font-mono" style={{ color: 'var(--mm-muted)' }}>{g.fgm}/{g.fga}</td>
                          <td className="py-1.5 text-right text-xs tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{fgPct != null ? `${fgPct}%` : '—'}</td>
                          <td className="py-1.5 text-right text-xs tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{fg3Pct != null ? `${fg3Pct}%` : '—'}</td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* 프로필 사진 라이트박스 — 뷰 모드에서 아바타 클릭 시 크게 표시 */}
    {photoLightboxOpen && photoUrl && (
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm cursor-zoom-out p-4 sm:p-8 animate-in fade-in duration-200"
        style={{ background: 'rgba(0,0,0,0.90)' }}
        onClick={() => setPhotoLightboxOpen(false)}
        role="dialog"
        aria-label="프로필 사진 크게 보기"
      >
        <button
          onClick={() => setPhotoLightboxOpen(false)}
          className="absolute top-4 right-4 rounded-sm p-2 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
            {player.number != null && <span className="ml-2 font-mono" style={{ color: 'rgba(0,0,0,0.6)' }}>#{player.number}</span>}
          </div>
        )}
      </div>
    )}

    </>
  )
}

function ranked_total(detail: Detail | null): number {
  return detail?.rankings?.total ?? 0
}

function computeWinRateRank(detail: Detail | null): number {
  return detail?.rankings?.win_rate_rank ?? 0
}
