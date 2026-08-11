'use client'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { LeagueQuarterProvider } from '@/contexts/LeagueQuarterContext'
import { LeagueAuthProvider, useCurrentUser } from '@/contexts/LeagueAuthContext'
import { Lock, Unlock, Home, BarChart2, Calendar, Newspaper, LogIn, User as UserIcon, UserPlus, Settings } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

const LoginModal = dynamic(() => import('@/components/league/auth/LoginModal'), { ssr: false })
import CompetitionSwitcher from '@/components/league/CompetitionSwitcher'
import { rememberLeague } from '@/lib/lastLeague'

// 미들웨어가 slug URL(/league/miracle/2026)을 UUID 경로로 internal rewrite 하므로
// useParams()/props 의 leagueId 는 UUID 지만, usePathname() 은 브라우저의 slug URL 을 반환한다.
// 둘을 그대로 비교하면(base=UUID vs pathname=slug) 활성 탭 판정이 '항상 false' → 인디케이터가 전혀 안 뜬다.
// → base 를 브라우저 경로에서 직접 추출해 href·활성판정을 같은 기준(slug)으로 맞춘다.
export function deriveLeagueBase(pathname: string, orgSlug: string, leagueId: string): string {
  const seg = pathname.split('/')  // ['', 'league', orgSlug, idOrSlug, ...]
  if (seg[1] === 'league' && seg[2] && seg[3]) return `/${seg[1]}/${seg[2]}/${seg[3]}`
  return `/league/${orgSlug}/${leagueId}`
}

function TabNav({ orgSlug, leagueId, leagueName, onOpenLogin, showDraft }: { orgSlug: string; leagueId: string; leagueName: string | null; onOpenLogin: () => void; showDraft: boolean }) {
  const pathname = usePathname()
  const { isEditMode, isAdminSession, openPinModal, exitEditMode } = useLeagueEditMode()
  const { user, loading: authLoading } = useCurrentUser()

  // #5 가입 승인 대기 배지 — 가입 접수 시 저장한 플래그(로그인되면 해제)
  const [signupPending, setSignupPending] = useState(false)
  useEffect(() => {
    try {
      if (user) { localStorage.removeItem(`mm_signup_pending:${leagueId}`); setSignupPending(false) }
      else setSignupPending(!!localStorage.getItem(`mm_signup_pending:${leagueId}`))
    } catch { /* 무시 */ }
  }, [user, leagueId])

  const base = deriveLeagueBase(pathname, orgSlug, leagueId)

  // "내 기록" 탭 라벨 — 로그인 시 유저 이름(인스타 프로필 탭 패턴), 비로그인 시 가입 유도 문구.
  // aria-label 은 라벨이 사람 이름/문구로 바뀌어도 스크린리더가 "여기가 내 기록·계정 영역"임을
  // 읽을 수 있도록 목적지 의미를 고정으로 유지한다(Task 1-A).
  const meLabel = user ? (user.name?.trim() || user.login_id) : '가입하기'
  const meAriaLabel = user ? `내 기록 — ${meLabel}` : '내 기록 — 가입하기'

  // 상위 메뉴 — 선수 명단·팀 순위는 스탯 우산으로 이동, 경기 탭은 원래대로 경기 3개만 남는다
  // (2026-08-08, stats-umbrella-move — 직전 커밋의 '팀/경기' 통합을 되돌림). 하이라이트 우산에
  // 공지 아카이브 통합. URL 은 그대로 유지(SEO/기존 링크 보존).
  // 설정 탭은 편집 모드일 때만 나비게이션에 노출(어드민 은닉) —
  //   URL 직접 접근은 여전히 가능하므로, 진짜 어드민 전용화가 필요하면 별도 이슈로 서버 가드 필요.
  // "내 기록"은 항상 맨 오른쪽 — 드래프트/설정은 기존 위치(하이라이트 다음)를 유지한다(Task 4-B).
  // Stathead 는 2026-07-19 삭제 (사용 미미).
  const tabs: { href: string; label: string; match: string[]; ariaLabel?: string }[] = [
    { href: base, label: '홈', match: [] },
    { href: `${base}/schedule`, label: '경기', match: [`${base}/schedule`, `${base}/boxscore`, `${base}/record`] },
    { href: `${base}/stats`, label: '스탯', match: [`${base}/stats`, `${base}/awards`, `${base}/roster`, `${base}/teams`] },
    { href: `${base}/highlights`, label: '하이라이트', match: [`${base}/highlights`] },
    ...(showDraft ? [{ href: `${base}/draft`, label: '드래프트', match: [`${base}/draft`] }] : []),
    ...(isEditMode ? [{ href: `${base}/settings`, label: '설정', match: [`${base}/settings`] }] : []),
    // /social(인스타 매거진 카드 생성기)은 설정에서만 진입하는 운영자 전용 화면이라 자체 탭이 없다 —
    // '내 기록' 탭 match 에 흡수해 어느 탭도 안 켜지는 상태를 막는다(리뷰 항목 5, 2026-08-08).
    { href: `${base}/me`, label: meLabel, match: [`${base}/me`, `${base}/social`], ariaLabel: meAriaLabel },
  ]
  // 공지 아카이브(/archive)는 홈 우산 소속(영상이 아니라 소식) — 홈 탭은 완전일치가 아니라
  // /archive 로 시작하는 경로도 활성으로 잡아야 아카이브에서 인디케이터가 꺼지지 않는다.
  // 선수 명단·팀 순위(/roster·/teams)는 스탯 탭의 match 배열로 옮겨졌다(위 tabs 참조, 2026-08-08) —
  // 경기 탭 match 에서는 반드시 빠져야 두 탭이 동시에 켜지는 걸 막는다.
  const tabActive = (tab: { href: string; match: string[] }) =>
    tab.href === base
      ? (pathname === base || pathname.startsWith(`${base}/archive`))
      : (tab.match.length ? tab.match.some(m => pathname.startsWith(m)) : pathname.startsWith(tab.href))

  // 데스크톱 활성 인디케이터 — 탭마다 그리지 않고 하나를 옮긴다(모바일 하단 탭과 같은 원칙).
  //   ⚠ 모바일과 달리 인덱스 × 100% 로 계산할 수 없다. 여기 탭은 라벨 길이에 따라 폭이 제각각이고,
  //     '내 기록' 탭은 로그인하면 사용자 이름으로 바뀌어 폭이 런타임에 변한다. 그래서 실측한다.
  //   재측정 시점: 경로 변경 · 탭 목록 변경(드래프트 노출) · 컨테이너 크기 변화(창 리사이즈·폰트 로드).
  //     폰트가 늦게 로드되면 처음 잰 폭이 틀어지므로 ResizeObserver 를 반드시 건다.
  const tabsWrapRef = useRef<HTMLDivElement | null>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const wrap = tabsWrapRef.current
    if (!wrap) return
    const measure = () => {
      const el = wrap.querySelector<HTMLElement>('[data-tab-active="true"]')
      // 활성 탭이 없으면(우산에 안 걸리는 경로) 인디케이터를 숨긴다 — 엉뚱한 탭에 밑줄이 남는 것보다 낫다.
      setIndicator(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pathname, showDraft, leagueName])

  return (
    <div className="sticky top-0 z-10 bg-[color:var(--mm-panel)] border-b border-[color:var(--mm-rule)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center">
          {/* 좌측: 리그/팀 이름 — 홈 링크. 모바일에서 예전 '현재 페이지 제목' 자리를 대체하고,
              데스크톱에서도 탭 바 왼쪽 고정 위치에 둔다(Task 4-B, CompetitionSwitcher 병합은 별도 이월). */}
          <Link
            href={base}
            aria-label={`${leagueName ?? '온볼'} 홈으로`}
            className="shrink-0 flex items-center min-h-[44px] pr-2 sm:pr-3 lg:pr-4"
          >
            <span
              className="font-jersey font-black text-sm sm:text-base lg:text-lg truncate max-w-[110px] sm:max-w-[160px] lg:max-w-[220px]"
              style={{ color: 'var(--mm-ink)' }}
            >
              {leagueName ?? '온볼'}
            </span>
          </Link>

          {/* 탭 영역 — 모바일에서는 숨김 (하단 탭바 사용), PC에서만 표시.
              self-stretch + items-stretch 로 탭을 행 전체 높이로 늘려, 활성 밑줄(하단 3px 바)이
              우측 액션 버튼 높이에 밀려 붕 뜨지 않고 네비 하단 구분선에 정확히 붙게 한다. */}
          <div className="relative flex-1 min-w-0 hidden lg:flex lg:items-stretch self-stretch">
            <div ref={tabsWrapRef} className="relative flex items-stretch gap-1 overflow-x-auto scrollbar-hide w-full">
              {/* 하나짜리 인디케이터 — 탭 사이를 미끄러진다. 절대배치라 옮겨도 다른 탭이 밀리지 않는다.
                  left 대신 transform 으로 옮긴다(합성 단계에서 처리돼 레이아웃 계산이 안 일어난다).
                  width 는 탭마다 달라 어쩔 수 없이 함께 전환하지만, 이 요소 하나에만 국한된다. */}
              {indicator && (
                <span
                  aria-hidden
                  className="absolute bottom-0 left-0 h-[3px] pointer-events-none"
                  style={{
                    width: indicator.width,
                    transform: `translateX(${indicator.left}px)`,
                    background: 'var(--color-hoop-orange-500)',
                    transition: 'transform var(--mm-motion-base) var(--mm-ease-out), width var(--mm-motion-base) var(--mm-ease-out)',
                  }}
                />
              )}
              {tabs.map(tab => {
                const isActive = tabActive(tab)
                const isMeTab = tab.href === `${base}/me`
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    aria-label={tab.ariaLabel}
                    aria-current={isActive ? 'page' : undefined}
                    data-tab-active={isActive ? 'true' : 'false'}
                    className={`relative shrink-0 flex items-center min-w-0 px-3 lg:px-4 py-3.5 lg:py-4 text-sm lg:text-base rounded-t-md transition-colors duration-200 ${
                      isActive
                        ? 'text-[color:var(--mm-ink)] font-bold bg-[color:var(--mm-panel-alt)]'
                        : 'text-[color:var(--mm-muted)] font-medium hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)]'
                    }`}
                  >
                    {/* 내 기록 탭 — 라벨이 사용자 이름으로 바뀌면 길이가 가변이라, 탭 폭이
                        무한정 늘어나 옆 탭을 밀어내지 않도록 이 탭에서만 truncate 를 건다. */}
                    {isMeTab ? <span className="truncate max-w-[110px] lg:max-w-[160px]">{tab.label}</span> : tab.label}
                    {/* 밑줄은 위 컨테이너의 인디케이터 하나가 옮겨 다니며 그린다(탭별 렌더 제거) */}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* 모바일: 탭 영역 대신 빈 flex 공간 — 좌측 브랜드 링크가 이미 위에서 렌더됨 */}
          <div className="flex-1 min-w-0 lg:hidden" />

          {/* 우측: 로그인 + 편집 모드 버튼 — 6개→2개로 축소(Task 4-B). 유저 칩·로그아웃·접속현황·
              테마 토글은 전부 /me 로 이동했다(PresenceIndicator 는 /me 상단으로). 둘러보기는 삭제됐다(Task 4-A). */}
          <div className="flex items-center gap-1.5 pl-2 sm:pl-3 py-2 shrink-0">
            {!authLoading && !user && (
              <button
                onClick={onOpenLogin}
                aria-label={signupPending ? '가입 승인 대기중 — 로그인' : '로그인'}
                className="relative flex items-center gap-1.5 px-2.5 py-2 rounded-md bg-[color:var(--mm-panel-alt)] hover:bg-[color:var(--mm-yellow-soft)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] text-xs font-medium cursor-pointer transition-colors min-h-[44px]"
              >
                <LogIn size={16} />
                <span className="hidden sm:inline">{signupPending ? '승인 대기중' : '로그인'}</span>
                {signupPending && <span aria-hidden className="sm:hidden absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[color:var(--color-hoop-orange-500)]" />}
              </button>
            )}
            {isAdminSession ? (
              /* 어드민 role 로 켜진 편집 모드는 계정 권한이라 클라이언트에서 끌 수 없다 →
                 해제 버튼 대신 상태 표시. (PIN 폴백일 때만 아래 '편집 중' 버튼으로 해제) */
              <span
                title="어드민 권한으로 편집 모드가 켜져 있습니다"
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-md min-h-[44px] bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] border border-[color:var(--mm-yellow)] font-semibold">
                <Unlock size={16} /><span className="hidden sm:inline">어드민</span>
              </span>
            ) : isEditMode ? (
              <button onClick={exitEditMode}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-md min-h-[44px] bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] border border-[color:var(--mm-yellow)] hover:brightness-95 font-semibold transition-colors cursor-pointer btn-press">
                <Unlock size={16} /><span className="hidden sm:inline">편집 중</span>
              </button>
            ) : (
              <button onClick={openPinModal}
                className="flex items-center gap-1.5 text-xs px-2.5 py-2 rounded-md min-h-[44px] border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] transition-colors cursor-pointer btn-press">
                <Lock size={16} /><span className="hidden sm:inline">편집</span>
              </button>
            )}
            {/* 어드민 설정 진입점(컨트롤러 자율 판단 1) — 설정이 /me 바로가기에서 빠지면서
                모바일 어드민이 설정에 닿을 길이 없어진다. 편집/어드민 칩 옆에 아이콘 버튼으로
                복원한다. 데스크톱 상단 탭의 '설정' 항목은 중복이 아니라 데스크톱 편의로 그대로 둔다. */}
            {isEditMode && (
              <Link
                href={`${base}/settings`}
                aria-label="리그 설정"
                className="flex items-center justify-center w-11 h-11 rounded-md text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)] transition-colors cursor-pointer btn-press"
              >
                <Settings size={18} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function BottomNav({ orgSlug, leagueId }: { orgSlug: string; leagueId: string }) {
  const pathname = usePathname()
  const { isEditMode } = useLeagueEditMode()
  const { user } = useCurrentUser()
  const base = deriveLeagueBase(pathname, orgSlug, leagueId)

  // "내 기록" 탭 라벨 — 로그인 시 유저 이름(인스타 프로필 탭 패턴), 비로그인 시 가입 유도 문구.
  // aria-label 은 라벨이 사람 이름/문구로 바뀌어도 스크린리더가 목적지(내 기록·계정 영역)를
  // 읽을 수 있도록 고정 의미를 유지한다(Task 1-A, TabNav 와 동일 문구).
  const meLabel = user ? (user.name?.trim() || user.login_id) : '가입하기'
  const meAriaLabel = user ? `내 기록 — ${meLabel}` : '내 기록 — 가입하기'

  // 5탭 고정 — 더보기 삭제(Task 4-C). 인스타그램처럼 계정/개인 화면은 맨 오른쪽.
  // 선수 명단·팀 순위는 스탯 탭으로 이동(2026-08-08, 아래 isActive 참조) — 경기 탭은 원래대로 경기만.
  // 드래프트·설정은 하단에서 완전히 빠지고 /me 바로가기로만 닿는다(Task 4-D 참조).
  const mainTabs: { href: string; label: string; Icon: typeof Home; ariaLabel?: string }[] = [
    { href: base,                  label: '홈',      Icon: Home },
    { href: `${base}/schedule`,    label: '경기',     Icon: Calendar },
    { href: `${base}/stats`,       label: '스탯',     Icon: BarChart2 },
    { href: `${base}/highlights`,  label: '하이라이트', Icon: Newspaper },
    { href: `${base}/me`,          label: meLabel,   Icon: user ? UserIcon : UserPlus, ariaLabel: meAriaLabel },
  ]

  // 스탯 우산 매칭 — /stats·/awards 뿐 아니라 /roster·/teams(선수 명단·팀 순위)도 스탯 탭 활성
  //   (2026-08-08, 데스크톱 TabNav match 배열과 동일 반영). 안 옮기면 /roster·/teams 에서
  //   홈과 스탯 두 탭이 동시에 켜지거나, 반대로 어느 탭도 안 켜지는 문제가 생긴다.
  // 홈 우산 매칭 — /archive(공지 아카이브)도 홈 소속. 탭이 하나도 안 켜지면 위치를 잃으므로
  //   반드시 홈으로 흡수한다.
  // 경기 우산 매칭 — /schedule 이면서 /boxscore·/record 도 경기 탭 활성.
  // 내 기록 우산 매칭 — /me 자체뿐 아니라 /draft·/settings·/social 도 여기로 흡수한다. 셋 다 하단 탭이
  //   따로 없고 /me 의 "바로가기"(또는 설정)로만 진입하므로, 안 그러면 그 페이지에서 하단 탭이 전부
  //   꺼진다. /social(인스타 매거진 카드 생성기)은 설정에서만 진입하는 운영자 전용 화면(리뷰 항목 5).
  const isActive = (href: string) => {
    if (href === base) return pathname === base || pathname.startsWith(`${base}/archive`)
    if (href === `${base}/stats`) return pathname.startsWith(`${base}/stats`) || pathname.startsWith(`${base}/awards`) || pathname.startsWith(`${base}/roster`) || pathname.startsWith(`${base}/teams`)
    if (href === `${base}/schedule`) return pathname.startsWith(`${base}/schedule`) || pathname.startsWith(`${base}/boxscore`) || pathname.startsWith(`${base}/record`)
    if (href === `${base}/me`) return pathname.startsWith(`${base}/me`) || pathname.startsWith(`${base}/draft`) || pathname.startsWith(`${base}/settings`) || pathname.startsWith(`${base}/social`)
    return pathname.startsWith(href)
  }

  // 인디케이터를 하나만 그려 옮기려면 '몇 번째 탭인가'가 필요하다. -1 이면 인디케이터를 숨긴다
  // (우산 매칭에 걸리지 않는 경로 — 예: 하단 탭이 없는 화면).
  const activeTabIdx = mainTabs.findIndex(({ href }) => isActive(href))

  return (
    <>
      {/* 하단 탭바 — 편집 모드 시 상단 얇은 노랑 라인으로 상태 힌트 */}
      <nav
        aria-label="주요 메뉴"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[color:var(--mm-panel)]/95 backdrop-blur-md border-t ${isEditMode ? 'border-[color:var(--color-hoop-orange-500)]' : 'border-[color:var(--mm-rule)]'}`}
      >
        <div className="relative flex items-stretch justify-around h-14">
          {/* 활성 인디케이터 — 탭마다 따로 그리지 않고 하나를 옮긴다.
              따로 그리면 탭을 바꿀 때 한쪽이 사라지고 다른 쪽이 나타나 '점프'로 보인다.
              하나를 미끄러뜨리면 "어디에서 어디로 왔는지"가 남는다(연속성).
              5개 탭이 flex-1 로 동일 폭이라 인덱스 × 100% 만으로 정확히 맞는다 —
              탭 개수가 바뀌면 이 계산도 같이 봐야 한다. */}
          {activeTabIdx >= 0 && (
            <span
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 flex justify-center"
              style={{
                width: `${100 / mainTabs.length}%`,
                transform: `translateX(${activeTabIdx * 100}%)`,
                transition: 'transform var(--mm-motion-base) var(--mm-ease-out)',
              }}
            >
              <span className="block w-8 h-0.5 rounded-b-full" style={{ background: 'var(--color-hoop-orange-500)' }} />
            </span>
          )}
          {mainTabs.map(({ href, label, Icon, ariaLabel }) => {
            const active = isActive(href)
            const isMeTab = href === `${base}/me`
            return (
              <Link
                key={href}
                href={href}
                aria-label={ariaLabel}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 min-h-[56px] transition-colors ${
                  active ? 'text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-muted)] active:text-[color:var(--mm-ink)]'
                }`}
              >
                {/* 인디케이터는 위 컨테이너에서 하나만 그려 옮긴다(탭별 렌더 제거) */}
                {/* 내 기록 탭 — 로그인 상태면 유저 사진(있으면 사진, 없으면 lucide User),
                    비로그인이면 lucide UserPlus(가입 유도, mainTabs 에서 이미 Icon 을 분기함).
                    인스타 프로필 탭과 동일 패턴. */}
                {isMeTab && user?.photo_url ? (
                  <span className="w-[22px] h-[22px] rounded-full overflow-hidden shrink-0" style={{ border: active ? '1.5px solid var(--mm-ink)' : '1.5px solid transparent' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
                )}
                {/* 긴 이름이 5분할 탭(375px÷5=75px)을 깨뜨리지 않도록 내 기록 탭 라벨만 truncate.
                    나머지 탭은 고정 짧은 한글 라벨이라 그대로 둔다. */}
                <span className={`text-[11px] leading-tight max-w-full ${isMeTab ? 'truncate px-0.5' : ''} ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
              </Link>
            )
          })}
        </div>
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </nav>
    </>
  )
}

function RecordAwareContainer({
  orgSlug, leagueId, children,
}: { orgSlug: string; leagueId: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const isRecord = pathname.startsWith(`${deriveLeagueBase(pathname, orgSlug, leagueId)}/record`)

  // 화면 진입 모션 — 하단 5탭은 탭 색만 바뀌고 본문은 즉시 교체돼서, 빠르게 오갈 때
  //   무엇이 바뀌었는지 인지가 안 됐다. key 를 경로로 두면 라우트가 바뀔 때마다 다시 마운트되고,
  //   .mm-view-enter 가 8px 올라오며 페이드인한다.
  //   ⚠ key 는 pathname 만 본다. 쿼리스트링은 경로에 안 들어가므로 같은 화면 안의 필터 변경으로는
  //     리마운트되지 않는다 — 기록 입력 중 상태가 날아가지 않는다.
  //   ⚠ 애니메이션 중 200ms 동안은 transform 이 걸려 있어, 그 사이 열리는 fixed 요소는
  //     화면이 아니라 이 컨테이너를 기준으로 잡힌다. fill-mode 를 주지 않아 종료 즉시 해제된다.
  const enter = 'mm-view-enter'

  // 경기기록은 더 촘촘하게, 나머지는 전체 너비
  if (isRecord) {
    return <div key={pathname} className={`px-3 py-3 ${enter}`}>{children}</div>
  }
  return <div key={pathname} className={`max-w-[1600px] mx-auto px-4 lg:px-4 py-6 ${enter}`}>{children}</div>
}

function LeagueLayout({
  orgSlug,
  leagueId,
  leagueName,
  children,
}: {
  orgSlug: string
  leagueId: string
  leagueName: string | null
  children: React.ReactNode
}) {
  const { theme } = useTheme()
  const pathname = usePathname()
  const [loginOpen, setLoginOpen] = useState(false)
  // 드래프트 메뉴 조건부 표시 — 현재 분기에 진행 중(미완료) 세션이 있을 때만
  const [showDraft, setShowDraft] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const qs = await fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json())
        const cur = (qs ?? []).find((q: { is_current?: boolean }) => q.is_current) ?? (qs ?? [])[qs.length - 1]
        if (!cur) return
        const d = await fetch(`/api/leagues/${leagueId}/drafts/current?quarterId=${cur.id}`).then(r => r.json())
        if (!cancelled) setShowDraft(!!d.draft && d.draft.status !== 'completed')
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [leagueId])

  // #1 비로그인 티저 등에서 로그인 모달 열기 요청 (mm-open-login 이벤트)
  useEffect(() => {
    const open = () => setLoginOpen(true)
    window.addEventListener('mm-open-login', open)
    return () => window.removeEventListener('mm-open-login', open)
  }, [])

  // 이 기기에서 마지막으로 본 동호회를 기억한다 — 설치형 앱이 대문(막다른 길)에서 멈추지 않도록.
  //   매니페스트 start_url 은 오리진당 하나(`/`)라, 미라클 페이지에서 설치해도 앱은 대문으로 열린다.
  //   pathname 기준으로 base 를 뽑는다(UUID 아님) — 미들웨어 slug→UUID rewrite 때문에
  //   leagueId prop 은 UUID 이고, 그걸 저장하면 주소가 사람에게 읽히지 않는다.
  useEffect(() => {
    rememberLeague(deriveLeagueBase(pathname, orgSlug, leagueId), leagueName)
  }, [pathname, orgSlug, leagueId, leagueName])

  // LeagueAuthProvider 가 최외곽 — LeagueEditModeProvider 가 로그인 유저의 role 로
  // 편집 모드를 켜므로 auth 컨텍스트가 상위에 있어야 한다 (2026-08-04 순서 교체).
  return (
    <LeagueAuthProvider leagueId={leagueId}>
    <LeagueEditModeProvider leagueId={leagueId}>
    <LeagueQuarterProvider leagueId={leagueId}>
      <div className="min-h-screen bg-[color:var(--mm-ground)] text-[color:var(--mm-ink-soft)]">
        {/* 경기묶음 전환 — 탭 위 계층이라 탭 바(TabNav/BottomNav)보다 먼저 배치.
            데스크톱·모바일 어느 쪽에서 보든 이 지점이 공통이라 양쪽에서 닿는다.
            묶음이 1개뿐이면(현재 미라클 일반 회원) 컴포넌트가 null 을 반환해 화면이 지금과 동일하다. */}
        <CompetitionSwitcher orgSlug={orgSlug} leagueId={leagueId} />
        <TabNav
          orgSlug={orgSlug}
          leagueId={leagueId}
          leagueName={leagueName}
          onOpenLogin={() => setLoginOpen(true)}
          showDraft={showDraft}
        />
        {/* 모바일 하단 탭바(56px) + iOS safe-area 만큼 여백 확보 */}
        <div className="pb-[calc(56px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <RecordAwareContainer orgSlug={orgSlug} leagueId={leagueId}>
            {children}
          </RecordAwareContainer>
        </div>
        <BottomNav orgSlug={orgSlug} leagueId={leagueId} />
      </div>
      {loginOpen && (
        <LoginModal leagueId={leagueId} onClose={() => setLoginOpen(false)} />
      )}
      <Toaster richColors theme={theme === 'light' ? 'light' : 'dark'} position="top-center" />
    </LeagueQuarterProvider>
    </LeagueEditModeProvider>
    </LeagueAuthProvider>
  )
}

export default function LeagueLayoutClient({
  orgSlug,
  leagueId,
  leagueName,
  children,
}: {
  orgSlug: string
  leagueId: string
  leagueName: string | null
  children: React.ReactNode
}) {
  return <LeagueLayout orgSlug={orgSlug} leagueId={leagueId} leagueName={leagueName}>{children}</LeagueLayout>
}
