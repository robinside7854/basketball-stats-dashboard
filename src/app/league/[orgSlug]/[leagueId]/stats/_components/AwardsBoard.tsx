'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { Trophy, Crown, Flame, Shield, Zap, Target, Sparkles, Award, Hand, Crosshair, Heart, Users, Layers, ChevronDown } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import { accentOrInk } from '@/lib/util/contrastColor'
import { ProgressBar } from '@/components/league/ui/viz'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'

// gsap · PlayerQuickView · AwardDetail 은 카드 클릭 후 실행되는 인터랙션 — 초기 번들에서 분리
// gsap 3.15 은 ~70KB, PlayerQuickView 는 1400줄 넘는 모달
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

// 부문 톤 — 리뉴얼 1단계(2026-10-12): 부문마다 따로 박혀 있던 Tailwind 팔레트(amber/cyan/pink…)와
// hex 를 globals.css 의 다계열 팔레트(--mm-series-1..6)로 옮겼다. 원래 색 계열을 그대로 따랐다 —
// 1 앰버(득점) · 2 주황(리바) · 3 청록(어시·효율·미들) · 4 초록(수비·공리) · 5 빨강(클러치·철인) · 6 보라(3점·더블더블·듀오).
// ⚠ Tailwind 가 소스에서 클래스명을 그대로 찾아야 생성하므로 아래 문자열은 템플릿으로 조립하지 말 것.
// (종전 text-amber-200 류는 라이트 모드 흰 패널에서 거의 안 보였다 — 토큰은 두 테마 모두 4.5:1↑)
type SeriesN = 1 | 2 | 3 | 4 | 5 | 6
const SERIES_TONE: Record<SeriesN, { bg: string; border: string; text: string; chipBg: string; ribbon: string }> = {
  1: {
    bg: 'from-[color:var(--mm-series-1)]/10 to-transparent',
    border: 'border-[color:var(--mm-series-1)]/50',
    text: 'text-[color:var(--mm-series-1)]',
    chipBg: 'bg-[color:var(--mm-series-1)]/15',
    ribbon: 'from-[color:var(--mm-series-1)] to-[color:var(--mm-series-1)]',
  },
  2: {
    bg: 'from-[color:var(--mm-series-2)]/10 to-transparent',
    border: 'border-[color:var(--mm-series-2)]/50',
    text: 'text-[color:var(--mm-series-2)]',
    chipBg: 'bg-[color:var(--mm-series-2)]/15',
    ribbon: 'from-[color:var(--mm-series-2)] to-[color:var(--mm-series-2)]',
  },
  3: {
    bg: 'from-[color:var(--mm-series-3)]/10 to-transparent',
    border: 'border-[color:var(--mm-series-3)]/50',
    text: 'text-[color:var(--mm-series-3)]',
    chipBg: 'bg-[color:var(--mm-series-3)]/15',
    ribbon: 'from-[color:var(--mm-series-3)] to-[color:var(--mm-series-3)]',
  },
  4: {
    bg: 'from-[color:var(--mm-series-4)]/10 to-transparent',
    border: 'border-[color:var(--mm-series-4)]/50',
    text: 'text-[color:var(--mm-series-4)]',
    chipBg: 'bg-[color:var(--mm-series-4)]/15',
    ribbon: 'from-[color:var(--mm-series-4)] to-[color:var(--mm-series-4)]',
  },
  5: {
    bg: 'from-[color:var(--mm-series-5)]/10 to-transparent',
    border: 'border-[color:var(--mm-series-5)]/50',
    text: 'text-[color:var(--mm-series-5)]',
    chipBg: 'bg-[color:var(--mm-series-5)]/15',
    ribbon: 'from-[color:var(--mm-series-5)] to-[color:var(--mm-series-5)]',
  },
  6: {
    bg: 'from-[color:var(--mm-series-6)]/10 to-transparent',
    border: 'border-[color:var(--mm-series-6)]/50',
    text: 'text-[color:var(--mm-series-6)]',
    chipBg: 'bg-[color:var(--mm-series-6)]/15',
    ribbon: 'from-[color:var(--mm-series-6)] to-[color:var(--mm-series-6)]',
  },
}
const CATEGORY_SERIES: Record<AwardCategory, SeriesN> = {
  SCORING:       1,
  REBOUND:       2,
  ASSIST:        3,
  DPOY:          4,
  THREE:         6,
  EFFICIENCY:    3,
  CLUTCH:        5,
  IRON_MAN:      5,
  DOUBLE_DOUBLE: 6,
  OREB_KING:     4,
  MID_RANGE:     3,
  BEST_DUO:      6,
}

// AwardDetailModal 이 참조하므로 시그니처/필드 보존. 페이지 자체는 mm-brand 로 렌더.
const CATEGORY_ICON: Record<AwardCategory, typeof Trophy> = {
  SCORING:       Trophy,
  REBOUND:       Shield,
  ASSIST:        Sparkles,
  DPOY:          Zap,
  THREE:         Target,
  EFFICIENCY:    Award,
  CLUTCH:        Flame,
  IRON_MAN:      Heart,
  DOUBLE_DOUBLE: Layers,
  OREB_KING:     Hand,
  MID_RANGE:     Crosshair,
  BEST_DUO:      Users,
}
const CATEGORY_STYLE = Object.fromEntries(
  (Object.keys(CATEGORY_SERIES) as AwardCategory[]).map(c => [c, { Icon: CATEGORY_ICON[c], ...SERIES_TONE[CATEGORY_SERIES[c]] }]),
) as Record<AwardCategory, { Icon: typeof Trophy; bg: string; border: string; text: string; chipBg: string; ribbon: string }>

// 부문별 accent — Option B: gradient 걷어내고 순색 accent 만.
// 카드 상단 스트라이프 · 아이콘 · 러너 값 컬러에 사용. Winner 배경은 항상 mm-yellow.
// var() 문자열이라 accentOrInk() 는 늘 ink 를 돌려준다 — 종전 hex 도 대부분 AA 미달이라 ink 였다(동작 동일).
const CATEGORY_ACCENT = Object.fromEntries(
  (Object.keys(CATEGORY_SERIES) as AwardCategory[]).map(c => [c, `var(--mm-series-${CATEGORY_SERIES[c]})`]),
) as Record<AwardCategory, string>

interface AttendanceInfo {
  totalRounds: number
  requiredRounds: number
  threshold: number
}

// 옛 /awards 페이지 본문 — 리더보드의 4번째 모드로 흡수됐다. 헤더·서브탭·분기 칩은 stats 페이지가 가진다.
export default function AwardsBoard({ leagueId, quarterId }: { leagueId: string; quarterId: string }) {
  const selectedQuarterId = quarterId

  const [awards, setAwards] = useState<AwardEntry[]>([])
  const [attendance, setAttendance] = useState<AttendanceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  const [openAward, setOpenAward] = useState<AwardEntry | null>(null)
  // 자격 요건 박스의 분기 라벨(「26.3Q」)용 — 분기 목록은 LeagueQuarterContext 하나에서 받는다
  //   (2026-10-12 리뉴얼 5단계 — 종전엔 여기서 `/quarters` 를 또 불렀다).
  const { quarters } = useLeagueQuarter()

  // 펼쳐 둔 부문 — 12개 카드를 전부 펼쳐 세로로 잇지 않는다.
  // 기본값은 **첫 부문 하나만 펼침**이다. 전부 접으면 요약 줄 11개만 남아 빈 화면처럼 보이고
  // "이 안에 뭐가 들어 있는지" 를 한 번은 눌러 봐야 알게 된다 — 첫 장을 펴 둬서 본문 생김새를
  // 먼저 보여주고 나머지는 접는다. 사용자가 편 상태는 localStorage 로 다음 방문까지 유지한다.
  const [openCats, setOpenCats] = useState<string[]>([])
  const seededRef = useRef(false)
  useEffect(() => { seededRef.current = false }, [leagueId])
  useEffect(() => {
    if (seededRef.current || awards.length === 0) return
    seededRef.current = true
    try {
      const raw = localStorage.getItem(`awards:openCats:${leagueId}`)
      if (raw !== null) { setOpenCats(JSON.parse(raw) as string[]); return }
    } catch { /* SSR·접근 실패 무시 */ }
    setOpenCats([awards[0].category])
  }, [awards, leagueId])

  // 저장은 토글 시점에만 한다 — effect 로 쓰면 시드되기 전 빈 배열이 먼저 덮어써 버린다.
  function toggleCat(category: string, open: boolean) {
    setOpenCats(prev => {
      const next = open
        ? (prev.includes(category) ? prev : [...prev, category])
        : prev.filter(c => c !== category)
      try { localStorage.setItem(`awards:openCats:${leagueId}`, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // 어워즈 로드 (분기 변경 시 재조회)
  useEffect(() => {
    setLoading(true)
    // stats 페이지는 진입 직후 'all' → 현재 분기로 바꾼다. 먼저 보낸 'all' 응답이 늦게 오면
    // 분기 라벨 아래 시즌 데이터가 뜨므로, 뒤에 시작된 요청만 반영한다.
    let stale = false
    const url = selectedQuarterId === 'all'
      ? `/api/leagues/${leagueId}/awards`
      : `/api/leagues/${leagueId}/awards?quarterId=${selectedQuarterId}`
    fetch(url)
      .then(r => {
        // 401 은 stats 페이지가 같은 canViewStats 가드의 stats API 로 이미 전체 StatGate 를 띄운다 — 여기서 또 게이트하면 이중 표시.
        if (stale) return null
        if (r.status === 401) { setLoading(false); return null }
        return r.json()
      })
      .then(d => {
        if (!d || stale) return
        setAwards(d.awards ?? [])
        setAttendance(d.attendance ?? null)
        setLoading(false)
      })
      .catch(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
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

  return (
    <div className="space-y-4 lg:space-y-5" style={{ color: 'var(--mm-ink)' }}>
      {/* 요약 패널 — 페이지 제목은 stats 의 「리그 스탯」(h2)이 맡으므로 여기선 h3 · 글자도 그보다 작게 */}
      <div
        className="relative px-5 py-5 lg:px-6 lg:py-6"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Trophy size={24} style={{ color: 'var(--mm-yellow-strong)' }} />
            <div>
              <h3
                className="font-black"
                style={{
                  color: 'var(--mm-ink)',
                  fontSize: '20px',
                  letterSpacing: '-0.005em',
                  lineHeight: 1.1,
                }}
              >
                시즌 어워즈
              </h3>
              <p
                className="text-xs font-bold mt-1.5"
                style={{ color: 'var(--mm-muted)' }}
              >
                Season Awards · 코어 9 + 특수 3
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
                className="text-xs font-semibold"
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
                <span className="t-num font-bold" style={{ color: 'var(--mm-ink)' }}>
                  {attendance.totalRounds}
                </span>
                일 중{' '}
                <span className="t-num font-bold" style={{ color: 'var(--mm-ink)' }}>
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

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={24} /></div>
      ) : (() => {
        const coreAwards = awards.filter(a => a.section === 'core')
        const specialAwards = awards.filter(a => a.section === 'special')

        // 카드 렌더러 — 코어/특수 두 그리드에서 재사용
        const renderCard = (a: AwardEntry) => {
          const style = CATEGORY_STYLE[a.category]
          const accent = CATEGORY_ACCENT[a.category]
          const isDuo = a.category === 'BEST_DUO' && !!a.winner?.partner
          const isOpen = openCats.includes(a.category)
          // 접힌 상태에 남길 정보 — 수상자 이름(듀오는 두 명) + 기록값. 수상자가 없으면 그 사실을
          // 그대로 적는다. 요약 줄이 라벨만 남으면 접는 순간 화면에서 정보가 사라진다.
          const winnerLine = a.winner
            ? `${a.winner.name}${isDuo && a.winner.partner ? ` × ${a.winner.partner.name}` : ''} · ${a.winner.displayValue}`
            : '수상자 없음'
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

              {/* 부문 접이식 — 요약 줄(summary)이 곧 카드 헤더다. 선수 명단(roster)의 게스트
                  접이식과 같은 관례: min-h-44 · list-none · ChevronDown 회전 · localStorage 유지. */}
              {/* ⚠ details 에 display:flex/grid 를 주지 않는다 — 닫힘 상태에서 본문을 감추는 건
                  UA 기본 렌더링이라 display 를 갈아끼우면 브라우저별로 어긋난다. flex-1 은
                  display 를 바꾸지 않으므로(부모 flex-col 안의 크기 배분만) 안전하다. */}
              <details
                className="flex-1"
                open={isOpen}
                onToggle={e => toggleCat(a.category, (e.currentTarget as HTMLDetailsElement).open)}
              >
                <summary
                  className="flex items-center gap-2.5 px-3 py-2.5 md:px-4 md:py-3 min-h-11 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ borderBottom: '1px solid var(--mm-rule)' }}
                >
                  <div
                    className="w-9 h-9 lg:w-10 lg:h-10 flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      border: `2px solid ${accent}`,
                    }}
                  >
                    <style.Icon size={20} style={{ color: accent }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3
                      className="font-black truncate"
                      style={{
                        color: 'var(--mm-ink)',
                        fontSize: '16px',
                        letterSpacing: '0.02em',
                        lineHeight: 1.2,
                      }}
                    >
                      {a.label}
                    </h3>
                    {/* 접힌 상태에서 남는 정보 — 수상자 이름 · 기록값 */}
                    <p
                      className="text-xs truncate mt-0.5"
                      style={{ color: a.winner ? 'var(--mm-ink-soft)' : 'var(--mm-muted)', lineHeight: 1.3 }}
                    >
                      {winnerLine}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-xs font-bold tabular-nums"
                    style={{ color: 'var(--mm-muted)' }}
                    title={`후보 ${a.allCandidates.length}명`}
                  >
                    {a.allCandidates.length}명
                  </span>
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className="shrink-0"
                    style={{
                      color: 'var(--mm-muted)',
                      transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                      transition: 'transform var(--mm-motion-fast) var(--mm-ease-out)',
                    }}
                  />
                </summary>

                {/* 부문 설명 — 요약 줄은 수상자 이름에 자리를 내주고, 설명은 본문 맨 위로 내렸다 */}
                <p
                  className="px-3 md:px-4 py-2.5 text-xs break-keep"
                  style={{ color: 'var(--mm-muted)', lineHeight: 1.4, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {a.description}
                </p>

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
                        border: '3px solid color-mix(in srgb, var(--mm-black) 15%, transparent)',
                      }}
                    >
                      {isDuo ? (
                        <Users size={20} style={{ color: 'var(--mm-yellow)' }} />
                      ) : (
                        <Crown size={20} style={{ color: 'var(--mm-yellow)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-xs font-semibold"
                        style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)' }}
                      >
                        {isDuo ? 'Winner Duo' : 'Winner'}
                      </p>
                      <p
                        data-award-winner-name
                        className="break-keep group-hover:underline underline-offset-4 decoration-[3px]"
                        style={{
                          color: 'var(--mm-black)',
                          fontSize: isDuo ? 'clamp(17px, 4.6vw, 24px)' : 'clamp(20px, 5.5vw, 28px)',
                          fontWeight: 700,
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
                            style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)', fontSize: '0.5em' }}
                          >
                            #{a.winner.number}
                          </span>
                        )}
                        {isDuo && a.winner.partner && (
                          <>
                            <span
                              className="mx-2 align-middle"
                              style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)', fontSize: '0.75em', fontWeight: 700 }}
                            >
                              ×
                            </span>
                            {a.winner.partner.name}
                            {a.winner.partner.number != null && (
                              <span
                                className="font-sans font-black ml-2 align-baseline tabular-nums"
                                style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)', fontSize: '0.5em' }}
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
                        className="text-xs font-bold mt-1.5 break-keep"
                        style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)', lineHeight: 1.3, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
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
                      className="mt-3 pt-3 flex flex-wrap gap-1.5"
                      style={{ borderTop: '1.5px solid color-mix(in srgb, var(--mm-black) 18%, transparent)' }}
                    >
                      {/* 보조 지표 — 「키: 값」 글줄 대신 칩. 값이 먼저 눈에 들어오게 크게, 키는 작게 */}
                      {Object.entries(a.winner.supportingStats).map(([key, val]) => (
                        <span
                          key={key}
                          className="inline-flex items-baseline gap-1 px-2 py-1 min-w-0"
                          style={{ background: 'color-mix(in srgb, var(--mm-black) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--mm-black) 14%, transparent)', borderRadius: 'var(--mm-radius-chip)' }}
                        >
                          <span className="text-[11px] font-bold" style={{ color: 'color-mix(in srgb, var(--mm-black) 72%, transparent)' }}>{key}</span>
                          <span className="text-sm font-black tabular-nums leading-none" style={{ color: 'var(--mm-black)' }}>{val}</span>
                        </span>
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
                    className="text-xs font-bold mb-2"
                    style={{ color: 'var(--mm-muted)' }}
                  >
                    후보
                  </p>
                  <div className="space-y-1">
                    {a.runners.map((r, idx) => (
                      <button
                        key={`${r.player_id}-${idx}`}
                        onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                        className="w-full flex items-center justify-between gap-2 px-2 py-1.5 md:px-2.5 md:py-2 min-h-11 transition-colors cursor-pointer group"
                        style={{ background: 'transparent' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mm-yellow-soft)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <div className="flex items-center gap-2 md:gap-2.5 min-w-0 max-w-[60%]">
                          <span
                            className="t-num font-bold w-4 md:w-5 shrink-0 text-right"
                            style={{ color: 'var(--mm-muted)', fontSize: '16px', lineHeight: 1 }}
                          >
                            {idx + 2}
                          </span>
                          <span
                            className="text-sm md:text-base font-bold break-keep min-w-0"
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
                                    className="ml-1.5 text-xs font-mono tabular-nums"
                                    style={{ color: 'var(--mm-muted)' }}
                                  >
                                    #{r.number}
                                  </span>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                        {/* 1위 대비 길이 — 숫자만으로는 「얼마나 차이 나는지」가 안 읽힌다 */}
                        {a.winner && a.winner.value > 0 && (
                          <ProgressBar
                            value={r.value}
                            max={a.winner.value}
                            color={accentOrInk(accent)}
                            height={6}
                            className="flex-1 min-w-[32px] max-w-[160px] ml-auto"
                            label={`1위 ${a.winner.displayValue} 대비 ${r.displayValue}`}
                          />
                        )}
                        <span
                          className="t-num font-bold shrink-0 text-base"
                          style={{ color: accentOrInk(accent), lineHeight: 1 }}
                        >
                          {r.displayValue}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 전체 순위 — 원래는 카드 헤더 클릭이 이 모달을 열었다. 헤더가 접이식 토글이 되면서
                  진입점을 본문 하단으로 옮겼다. 요약 줄 안에 버튼을 겹쳐 두면 탭 한 번에 "접기"와
                  "모달 열기"가 얽혀 어느 쪽이 실행됐는지 알 수 없게 된다. */}
              <div className="px-3 md:px-4 pb-3">
                <button
                  type="button"
                  onClick={() => setOpenAward(a)}
                  className="w-full inline-flex items-center justify-center gap-1.5 min-h-11 px-4 text-xs font-bold cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                >
                  전체 순위 {a.allCandidates.length}명 보기
                  <span aria-hidden className="text-base leading-none" style={{ color: 'var(--mm-ink)' }}>→</span>
                </button>
              </div>

              {a.minRequirement && a.winner && (
                <div
                  className="mt-auto px-4 md:px-5 py-2"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    borderTop: '1px solid var(--mm-rule)',
                  }}
                >
                  <p
                    className="text-xs font-bold"
                    style={{ color: 'var(--mm-muted)' }}
                  >
                    {a.minRequirement}
                  </p>
                </div>
              )}
              </details>
            </div>
          )
        }

        return (
          <div ref={gridRef} className="space-y-4 lg:space-y-5">
            {/* 코어 9부문 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
              {coreAwards.map(renderCard)}
            </div>

            {/* 특수 부문 구분자 + 헤더 */}
            {specialAwards.length > 0 && (
              <>
                <div className="flex items-center gap-3 pt-1">
                  <div aria-hidden style={{ flex: 1, height: '1px', background: 'var(--mm-rule)' }} />
                  <p className="t-label whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
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
