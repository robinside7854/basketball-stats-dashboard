'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { Trophy, Crown, Flame, Shield, Zap, Target, Sparkles, Award, Hand, Crosshair, Heart, Users, Layers } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import { getStatsGroupTabs } from '@/components/league/statsTabs'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import StatGate from '@/components/league/auth/StatGate'

// gsap · PlayerQuickView · AwardDetail 은 카드 클릭 후 실행되는 인터랙션 — 초기 번들에서 분리
// gsap 3.15 은 ~70KB, PlayerQuickView 는 1441줄 (recharts 4종 내부 lazy)
const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
const AwardDetailModal = dynamic(() => import('@/components/league/AwardDetailModal'), { ssr: false })

type AwardCategory =
  | 'SCORING' | 'REBOUND' | 'ASSIST' | 'DPOY'
  | 'THREE' | 'EFFICIENCY' | 'CLUTCH' | 'IRON_MAN' | 'DOUBLE_DOUBLE'
  | 'OREB_KING' | 'MID_RANGE' | 'BEST_DUO'

interface AwardCandidate {
  player_id: string
  name: string
  number: number | null
  position: string | null
  photo_url: string | null
  value: number
  displayValue: string
  gp: number
  supportingStats?: Record<string, string>
  // BEST_DUO 전용
  partner?: {
    player_id: string
    name: string
    number: number | null
    photo_url: string | null
  }
}

interface AwardEntry {
  category: AwardCategory
  section: 'core' | 'special'
  label: string
  description: string
  metric: string
  minRequirement?: string
  winner: AwardCandidate | null
  runners: AwardCandidate[]
  allCandidates: AwardCandidate[]
}

// AwardDetailModal 이 참조하므로 시그니처/필드 보존. 페이지 자체는 mm-brand 로 렌더.
const CATEGORY_STYLE: Record<AwardCategory, {
  Icon: typeof Trophy
  bg: string
  border: string
  text: string
  chipBg: string
  ribbon: string
}> = {
  SCORING:    { Icon: Trophy,    bg: 'from-amber-950/40 to-orange-900/20',                    border: 'border-amber-500/50',  text: 'text-amber-200',    chipBg: 'bg-amber-500/20',  ribbon: 'from-amber-400 to-orange-500' },
  REBOUND:    { Icon: Shield,    bg: 'from-orange-950/40 to-red-900/20',                      border: 'border-orange-500/50', text: 'text-orange-200',   chipBg: 'bg-orange-500/20', ribbon: 'from-orange-400 to-red-500' },
  ASSIST:     { Icon: Sparkles,  bg: 'from-cyan-950/40 to-blue-900/20',                       border: 'border-cyan-500/50',   text: 'text-cyan-200',     chipBg: 'bg-cyan-500/20',   ribbon: 'from-cyan-400 to-blue-500' },
  DPOY:       { Icon: Zap,       bg: 'from-emerald-950/40 to-green-900/20',                   border: 'border-emerald-500/50',text: 'text-emerald-200',  chipBg: 'bg-emerald-500/20',ribbon: 'from-emerald-400 to-green-500' },
  THREE:      { Icon: Target,    bg: 'from-pink-950/40 to-purple-900/20',                     border: 'border-pink-500/50',   text: 'text-pink-200',     chipBg: 'bg-pink-500/20',   ribbon: 'from-pink-400 to-purple-500' },
  EFFICIENCY: { Icon: Award,     bg: 'from-teal-950/40 to-cyan-900/20',                       border: 'border-teal-500/50',   text: 'text-teal-200',     chipBg: 'bg-teal-500/20',   ribbon: 'from-teal-400 to-cyan-500' },
  CLUTCH:     { Icon: Flame,     bg: 'from-red-950/40 to-amber-900/20',                       border: 'border-red-500/50',    text: 'text-red-200',      chipBg: 'bg-red-500/20',    ribbon: 'from-red-400 to-amber-500' },
  IRON_MAN:   { Icon: Heart,     bg: 'from-rose-950/40 to-pink-900/20',                       border: 'border-rose-500/50',   text: 'text-rose-200',     chipBg: 'bg-rose-500/20',   ribbon: 'from-rose-400 to-pink-500' },
  // 더블더블 킹 — 다층 스탯 스토리라서 Layers 아이콘 + 인디고 톤 (기존 코어 8과 색 겹치지 않게)
  DOUBLE_DOUBLE: { Icon: Layers, bg: 'from-indigo-950/40 to-violet-900/20',                   border: 'border-indigo-500/50', text: 'text-indigo-200',   chipBg: 'bg-indigo-500/20', ribbon: 'from-indigo-400 to-violet-500' },
  // 특수 3부문
  //   OREB_KING 은 REBOUND(orange)와 겹치지 않게 emerald · Hand 아이콘(리바운드 "잡는다" 은유)
  OREB_KING:  { Icon: Hand,      bg: 'from-emerald-950/40 to-green-900/20',                   border: 'border-emerald-500/50',text: 'text-emerald-200',  chipBg: 'bg-emerald-500/20',ribbon: 'from-emerald-400 to-green-500' },
  MID_RANGE:  { Icon: Crosshair, bg: 'from-sky-950/40 to-indigo-900/20',                      border: 'border-sky-500/50',    text: 'text-sky-200',      chipBg: 'bg-sky-500/20',    ribbon: 'from-sky-400 to-indigo-500' },
  BEST_DUO:   { Icon: Users,     bg: 'from-violet-950/40 to-fuchsia-900/20',                  border: 'border-violet-500/50', text: 'text-violet-200',   chipBg: 'bg-violet-500/20', ribbon: 'from-violet-400 to-fuchsia-500' },
}

// 부문별 accent — Option B: gradient 걷어내고 순색 accent 만.
// 카드 상단 스트라이프 · 아이콘 · 러너 값 컬러에 사용. Winner 배경은 항상 mm-yellow.
const CATEGORY_ACCENT: Record<AwardCategory, string> = {
  SCORING:    '#F59E0B', // amber-500
  REBOUND:    '#F97316', // orange-500
  ASSIST:     '#06B6D4', // cyan-500
  DPOY:       '#10B981', // emerald-500
  THREE:      '#EC4899', // pink-500
  EFFICIENCY: '#14B8A6', // teal-500
  CLUTCH:     '#EF4444', // red-500
  IRON_MAN:   '#F43F5E', // rose-500
  DOUBLE_DOUBLE: '#6366F1', // indigo-500
  // 특수 3부문 — REBOUND(orange)와 색상 겹치지 않게
  OREB_KING:  '#059669', // emerald-600
  MID_RANGE:  '#0EA5E9', // sky-500
  BEST_DUO:   '#8B5CF6', // violet-500
}

interface AttendanceInfo {
  totalRounds: number
  requiredRounds: number
  threshold: number
}

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }

export default function AwardsPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const base = `/league/${orgSlug}/${leagueId}`

  const [awards, setAwards] = useState<AwardEntry[]>([])
  const [attendance, setAttendance] = useState<AttendanceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)  // 401 — 회원 전용
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  const [openAward, setOpenAward] = useState<AwardEntry | null>(null)
  // 분기 선택 — LeagueQuarterContext 로 페이지 간 공유
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const { selectedQuarterId, setSelectedQuarterId } = useLeagueQuarter()

  // 분기 목록 로드
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.ok ? r.json() : [])
      .then((qs: Quarter[]) => setQuarters(qs))
      .catch(() => setQuarters([]))
  }, [leagueId])

  // 어워즈 로드 (분기 변경 시 재조회)
  useEffect(() => {
    setLoading(true)
    const url = selectedQuarterId === 'all'
      ? `/api/leagues/${leagueId}/awards`
      : `/api/leagues/${leagueId}/awards?quarterId=${selectedQuarterId}`
    fetch(url)
      .then(r => {
        if (r.status === 401) { setGated(true); setLoading(false); return null }
        return r.json()
      })
      .then(d => {
        if (!d) return
        setAwards(d.awards ?? [])
        setAttendance(d.attendance ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [leagueId, selectedQuarterId])

  // 어워즈 카드 진입 애니메이션 — 마운트/재로드 시 gsap 로 stagger reveal
  // reduced-motion 사용자에게는 스킵. gsap.context 로 언마운트 시 정리
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (loading || awards.length === 0) return
    if (typeof window === 'undefined') return
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) return

    // gsap (~70KB) 을 어워즈 페이지 초기 번들에서 제외 — 카드 진입 애니메이션은 mount 후 lazy 로드
    let cleanup: (() => void) | undefined
    let cancelled = false
    import('gsap').then(({ gsap }) => {
      if (cancelled) return
      const ctx = gsap.context(() => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        // 1) 상단 리본 좌→우 확장
        tl.from('[data-award-ribbon]', {
          scaleX: 0,
          transformOrigin: 'left center',
          duration: 0.6,
          stagger: 0.06,
        })
        // 2) 카드 본체 y 슬라이드 + 페이드
        tl.from('[data-award-card]', {
          y: 28,
          autoAlpha: 0,
          duration: 0.65,
          stagger: { each: 0.07, from: 'start' },
        }, '-=0.4')
        // 3) Winner 크라운 아이콘 스케일 back-out (트로피 등장감)
        tl.from('[data-award-crown]', {
          scale: 0.35,
          rotate: -12,
          autoAlpha: 0,
          duration: 0.55,
          ease: 'back.out(1.7)',
          stagger: 0.07,
        }, '-=0.55')
        // 4) Winner 이름 y 슬라이드
        tl.from('[data-award-winner-name]', {
          y: 14,
          autoAlpha: 0,
          duration: 0.5,
          stagger: 0.06,
        }, '-=0.5')
        // 5) Winner 값 숫자 y + 페이드
        tl.from('[data-award-winner-value]', {
          y: 10,
          autoAlpha: 0,
          duration: 0.45,
          stagger: 0.06,
        }, '-=0.4')
      }, gridRef)
      cleanup = () => ctx.revert()
    })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [awards, loading])

  // 배열은 공유 헬퍼(statsTabs.ts)에서 가져온다 — stats/awards/roster/teams 4곳 복제 방지.
  const groupTabs = getStatsGroupTabs(base, 'awards')

  if (gated) {
    return <StatGate fullPage title="어워즈는 회원 전용" description="분기별 어워즈·수상 기록은 가입 승인된 회원만 볼 수 있어요." />
  }

  return (
    <div className="mm-brand space-y-5 lg:space-y-6" style={{ color: 'var(--mm-ink)' }}>
      {/* 스탯 우산 서브탭 — 리더보드 · 시즌하이 · 어워즈 · 선수 명단 · 팀 순위 */}
      <LeagueGroupTabs tabs={groupTabs} />

      {/* 헤더 — E안: 흰 패널 + 검정 잉크 */}
      <div
        className="relative px-5 py-5 lg:px-6 lg:py-6 -mx-2 sm:mx-0"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Trophy size={28} className="lg:w-9 lg:h-9" style={{ color: 'var(--mm-yellow-strong)' }} />
            <div>
              <h1
                className="font-bold"
                style={{
                  color: 'var(--mm-ink)',
                  fontSize: 'clamp(28px, 4.5vw, 40px)',
                  letterSpacing: '-0.005em',
                  lineHeight: 1,
                }}
              >
                시즌 어워즈
              </h1>
              <p
                className="text-[12px] font-bold uppercase tracking-[0.18em] mt-1.5"
                style={{ color: 'var(--mm-muted)' }}
              >
                Season Awards · 코어 8 + 특수 3
              </p>
            </div>
          </div>
          {attendance && attendance.totalRounds > 0 && (
            <div
              className="px-3 py-2 lg:px-4 lg:py-2.5"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
              }}
            >
              <p
                className="text-[11px] font-black uppercase tracking-[0.22em]"
                style={{ color: 'var(--mm-yellow-strong)' }}
              >
                자격 요건
              </p>
              <p
                className="text-sm lg:text-base font-bold mt-1"
                style={{ color: 'var(--mm-ink)' }}
              >
                {selectedQuarterId === 'all' ? '시즌' : (() => {
                  const q = quarters.find(qq => qq.id === selectedQuarterId)
                  return q ? `${String(q.year).slice(2)}.${q.quarter}Q` : '분기'
                })()}{' '}
                <span className="font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                  {attendance.totalRounds}
                </span>
                일 중{' '}
                <span className="font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                  {attendance.requiredRounds}
                </span>
                일 이상 참석
                <span className="text-xs ml-1.5" style={{ color: 'var(--mm-muted)' }}>
                  ({Math.round(attendance.threshold * 100)}%)
                </span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 분기 필터 탭 — 활성: 검정, 비활성: 흰 + 뮤트 */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setSelectedQuarterId('all')}
          className="shrink-0 px-4 py-2 text-sm font-black uppercase tracking-[0.16em] transition-colors cursor-pointer btn-press min-h-[44px]"
          style={{
            background: selectedQuarterId === 'all' ? 'var(--mm-ink)' : 'var(--mm-panel)',
            color: selectedQuarterId === 'all' ? 'var(--mm-panel)' : 'var(--mm-muted)',
            border: `1px solid ${selectedQuarterId === 'all' ? 'var(--mm-ink)' : 'var(--mm-rule)'}`,
          }}
        >
          시즌 전체
        </button>
        {quarters.map(q => {
          const active = selectedQuarterId === q.id
          return (
            <button
              key={q.id}
              onClick={() => setSelectedQuarterId(q.id)}
              className="shrink-0 px-4 py-2 text-sm font-bold transition-colors cursor-pointer btn-press min-h-[44px] font-jersey tabular-nums"
              style={{
                background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                border: `1px solid ${active ? 'var(--mm-ink)' : 'var(--mm-rule)'}`,
              }}
            >
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && (
                <span
                  className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle"
                  style={{ background: active ? 'var(--mm-yellow)' : 'var(--mm-yellow-strong)' }}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
      ) : (() => {
        const coreAwards = awards.filter(a => a.section === 'core')
        const specialAwards = awards.filter(a => a.section === 'special')

        // 카드 렌더러 — 코어/특수 두 그리드에서 재사용
        const renderCard = (a: AwardEntry) => {
          const style = CATEGORY_STYLE[a.category]
          const accent = CATEGORY_ACCENT[a.category]
          const isDuo = a.category === 'BEST_DUO' && !!a.winner?.partner
          return (
            <div
              key={a.category}
              data-award-card
              className="relative flex flex-col"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
              }}
            >
              {/* 상단 카테고리 accent 스트라이프 */}
              <div data-award-ribbon style={{ height: '4px', background: accent }} />

              {/* 카드 헤더 — 클릭하면 전체 순위 모달 */}
              <button
                onClick={() => setOpenAward(a)}
                className="w-full px-4 py-3 md:px-5 md:py-3.5 flex items-center justify-between gap-2 cursor-pointer transition-colors text-left group"
                style={{ borderBottom: '1px solid var(--mm-rule)' }}
                title={`${a.label} 전체 순위 보기`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      border: `2px solid ${accent}`,
                    }}
                  >
                    <style.Icon size={18} style={{ color: accent }} />
                  </div>
                  <div className="min-w-0">
                    <h3
                      className="font-bold"
                      style={{
                        color: 'var(--mm-ink)',
                        fontSize: '17px',
                        letterSpacing: '0.02em',
                        lineHeight: 1.1,
                      }}
                    >
                      {a.label}
                    </h3>
                    <p
                      className="text-[11px] md:text-xs mt-1 break-keep"
                      style={{ color: 'var(--mm-muted)', lineHeight: 1.35, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    >
                      {a.description}
                    </p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-1 shrink-0 text-[11px] md:text-xs font-bold uppercase tracking-[0.12em] transition-colors"
                  style={{ color: 'var(--mm-muted)' }}
                >
                  <span className="tabular-nums font-black" style={{ color: 'var(--mm-ink-soft)' }}>
                    {a.allCandidates.length}
                  </span>
                  <span className="hidden md:inline">전체</span>
                  <span className="text-base leading-none" style={{ color: 'var(--mm-ink)' }}>→</span>
                </div>
              </button>

              {/* Winner 스포트라이트 — 노랑 배경 + 검정 잉크 (E안 아이덴티티) */}
              {a.winner ? (
                <button
                  onClick={() => setQuickPlayer({ id: a.winner!.player_id, name: a.winner!.name })}
                  className="w-full px-4 py-4 md:px-5 md:py-5 cursor-pointer text-left group transition-transform"
                  style={{
                    background: 'var(--mm-yellow)',
                    color: 'var(--mm-black)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      data-award-crown
                      className="w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shrink-0"
                      style={{
                        background: 'var(--mm-black)',
                        border: '3px solid rgba(0,0,0,0.15)',
                      }}
                    >
                      {isDuo ? (
                        <Users size={22} className="md:w-7 md:h-7" style={{ color: 'var(--mm-yellow)' }} />
                      ) : (
                        <Crown size={22} className="md:w-7 md:h-7" style={{ color: 'var(--mm-yellow)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.22em]"
                        style={{ color: 'rgba(0,0,0,0.65)' }}
                      >
                        {isDuo ? 'Winner Duo' : 'Winner'}
                      </p>
                      <p
                        data-award-winner-name
                        className="font-jersey uppercase break-keep group-hover:underline underline-offset-4 decoration-[3px]"
                        style={{
                          color: 'var(--mm-black)',
                          fontSize: isDuo ? 'clamp(17px, 4.6vw, 24px)' : 'clamp(20px, 5.5vw, 28px)',
                          fontWeight: 900,
                          letterSpacing: '-0.005em',
                          lineHeight: 1.1,
                          textDecorationColor: 'var(--mm-black)',
                          marginTop: '4px',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {a.winner.name}
                        {a.winner.number != null && (
                          <span
                            className="font-sans font-black ml-2 align-baseline tabular-nums"
                            style={{ color: 'rgba(0,0,0,0.55)', fontSize: '0.5em' }}
                          >
                            #{a.winner.number}
                          </span>
                        )}
                        {isDuo && a.winner.partner && (
                          <>
                            <span
                              className="mx-2 align-middle"
                              style={{ color: 'rgba(0,0,0,0.5)', fontSize: '0.75em', fontWeight: 700 }}
                            >
                              ×
                            </span>
                            {a.winner.partner.name}
                            {a.winner.partner.number != null && (
                              <span
                                className="font-sans font-black ml-2 align-baseline tabular-nums"
                                style={{ color: 'rgba(0,0,0,0.55)', fontSize: '0.5em' }}
                              >
                                #{a.winner.partner.number}
                              </span>
                            )}
                          </>
                        )}
                      </p>
                      <p
                        data-award-winner-value
                        className="font-jersey font-black tabular-nums leading-none mt-2"
                        style={{
                          color: 'var(--mm-black)',
                          fontSize: 'clamp(28px, 4vw, 38px)',
                          letterSpacing: '-0.015em',
                        }}
                      >
                        {a.winner.displayValue}
                      </p>
                      <p
                        className="text-[11px] md:text-xs font-bold uppercase tracking-[0.12em] mt-1.5 break-keep"
                        style={{ color: 'rgba(0,0,0,0.6)', lineHeight: 1.3, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                      >
                        {isDuo ? a.metric : `${a.winner.gp}게임 · ${a.metric}`}
                      </p>
                    </div>
                    {/* 사진 영역 — 듀오면 두 프로필 겹치기, 아니면 단일 */}
                    {isDuo && a.winner.partner ? (
                      (a.winner.photo_url || a.winner.partner.photo_url) && (
                        <div className="shrink-0 relative flex items-end">
                          {a.winner.photo_url && (
                            <div
                              className="overflow-hidden relative"
                              style={{
                                width: 'clamp(52px, 14vw, 84px)',
                                aspectRatio: '3 / 4',
                                border: '2.5px solid var(--mm-black)',
                                background: 'var(--mm-black)',
                                borderRadius: '4px',
                                boxShadow: '2px 2px 0 rgba(0,0,0,0.35)',
                              }}
                            >
                              <Image
                                src={a.winner.photo_url}
                                alt={a.winner.name}
                                fill
                                sizes="(max-width: 640px) 14vw, 84px"
                                className="object-cover object-top"
                              />
                            </div>
                          )}
                          {a.winner.partner.photo_url && (
                            <div
                              className="overflow-hidden relative"
                              style={{
                                width: 'clamp(52px, 14vw, 84px)',
                                aspectRatio: '3 / 4',
                                border: '2.5px solid var(--mm-black)',
                                background: 'var(--mm-black)',
                                borderRadius: '4px',
                                boxShadow: '2px 2px 0 rgba(0,0,0,0.35)',
                                marginLeft: 'clamp(-24px, -6vw, -18px)',
                                zIndex: 1,
                              }}
                            >
                              <Image
                                src={a.winner.partner.photo_url}
                                alt={a.winner.partner.name}
                                fill
                                sizes="(max-width: 640px) 14vw, 84px"
                                className="object-cover object-top"
                              />
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      a.winner.photo_url && (
                        <div
                          className="shrink-0 overflow-hidden relative"
                          style={{
                            width: 'clamp(64px, 18vw, 108px)',
                            aspectRatio: '3 / 4',
                            border: '2.5px solid var(--mm-black)',
                            background: 'var(--mm-black)',
                            borderRadius: '4px',
                            boxShadow: '2px 2px 0 rgba(0,0,0,0.35)',
                          }}
                        >
                          {/* next/image · 어워드 위너 카드는 below-fold 다수 → 기본 lazy */}
                          <Image
                            src={a.winner.photo_url}
                            alt={a.winner.name}
                            fill
                            sizes="(max-width: 640px) 18vw, 108px"
                            className="object-cover object-top"
                          />
                        </div>
                      )
                    )}
                  </div>
                  {a.winner.supportingStats && (
                    <div
                      className={`mt-3 pt-3 grid ${isDuo ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-3'} gap-x-2 gap-y-1.5`}
                      style={{ borderTop: '1.5px solid rgba(0,0,0,0.18)' }}
                    >
                      {Object.entries(a.winner.supportingStats).map(([key, val]) => (
                        <div key={key} className="text-[11px] md:text-xs min-w-0">
                          <span className="uppercase tracking-[0.1em] font-bold" style={{ color: 'rgba(0,0,0,0.6)' }}>
                            {key}:{' '}
                          </span>
                          <span className="font-black tabular-nums" style={{ color: 'var(--mm-black)' }}>
                            {val}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              ) : (
                <div
                  className="px-4 py-6 text-center text-sm"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    color: 'var(--mm-muted)',
                    borderBottom: '1px solid var(--mm-rule)',
                  }}
                >
                  자격 요건 충족자 없음
                  {a.minRequirement && (
                    <div className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
                      {a.minRequirement}
                    </div>
                  )}
                </div>
              )}

              {/* Runners (2-3위 후보) — 흰 배경 + 뮤트 */}
              {a.runners.length > 0 && (
                <div className="px-4 py-3 md:px-5 md:py-3.5" style={{ background: 'var(--mm-panel)' }}>
                  <p
                    className="text-[11px] font-bold mb-2"
                    style={{ color: 'var(--mm-muted)' }}
                  >
                    후보
                  </p>
                  <div className="space-y-1">
                    {a.runners.map((r, idx) => (
                      <button
                        key={`${r.player_id}-${idx}`}
                        onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 md:px-2.5 md:py-2 transition-colors cursor-pointer group"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mm-yellow-soft)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
                          <span
                            className="font-jersey font-black tabular-nums w-4 md:w-5 shrink-0 text-right"
                            style={{ color: 'var(--mm-muted)', fontSize: '16px', lineHeight: 1 }}
                          >
                            {idx + 2}
                          </span>
                          <span
                            className="text-[14px] md:text-[15px] font-bold break-keep min-w-0"
                            style={{ color: 'var(--mm-ink)', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                          >
                            {r.partner ? (
                              <>
                                {r.name}
                                <span className="mx-1.5" style={{ color: 'var(--mm-muted)', fontWeight: 700 }}>×</span>
                                {r.partner.name}
                              </>
                            ) : (
                              <>
                                {r.name}
                                {r.number != null && (
                                  <span
                                    className="ml-1.5 text-[11px] font-mono tabular-nums"
                                    style={{ color: 'var(--mm-muted)' }}
                                  >
                                    #{r.number}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                        <span
                          className="font-jersey font-black tabular-nums shrink-0"
                          style={{ color: accent, fontSize: '17px', lineHeight: 1 }}
                        >
                          {r.displayValue}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {a.minRequirement && a.winner && (
                <div
                  className="mt-auto px-4 md:px-5 py-2"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    borderTop: '1px solid var(--mm-rule)',
                  }}
                >
                  <p
                    className="text-[11px] uppercase tracking-[0.12em] font-bold"
                    style={{ color: 'var(--mm-muted)' }}
                  >
                    {a.minRequirement}
                  </p>
                </div>
              )}
            </div>
          )
        }

        return (
          <div ref={gridRef} className="space-y-6 lg:space-y-8">
            {/* 코어 8부문 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {coreAwards.map(renderCard)}
            </div>

            {/* 특수 부문 구분자 + 헤더 */}
            {specialAwards.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <div aria-hidden style={{ flex: 1, height: '1px', background: 'var(--mm-rule)' }} />
                  <p
                    className="font-bold whitespace-nowrap"
                    style={{
                      color: 'var(--mm-ink)',
                      fontSize: '13px',
                      letterSpacing: '0.24em',
                    }}
                  >
                    특수 부문{' '}
                    <span style={{ color: 'var(--mm-yellow-strong)' }}>· Special</span>
                  </p>
                  <div aria-hidden style={{ flex: 1, height: '1px', background: 'var(--mm-rule)' }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
                  {specialAwards.map(renderCard)}
                </div>
              </>
            )}
          </div>
        )
      })()}

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}

      {/* 부문 상세 모달 — 전체 후보 랭킹 */}
      {openAward && (
        <AwardDetailModal
          leagueId={leagueId}
          award={{
            category: openAward.category,
            label: openAward.label,
            description: openAward.description,
            metric: openAward.metric,
            minRequirement: openAward.minRequirement,
            allCandidates: openAward.allCandidates,
          }}
          style={CATEGORY_STYLE[openAward.category]}
          onClose={() => setOpenAward(null)}
        />
      )}
    </div>
  )
}
