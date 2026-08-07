'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { LeagueQuarterProvider } from '@/contexts/LeagueQuarterContext'
import { LeagueAuthProvider, useCurrentUser } from '@/contexts/LeagueAuthContext'
import { Lock, Unlock, Sun, Moon, Home, Users, BarChart2, Calendar, MoreHorizontal, X, ClipboardList, Settings, Newspaper, HelpCircle, LogIn, LogOut, User as UserIcon } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

const LoginModal = dynamic(() => import('@/components/league/auth/LoginModal'), { ssr: false })
import PresenceIndicator from '@/components/league/auth/PresenceIndicator'
import CompetitionSwitcher from '@/components/league/CompetitionSwitcher'

// 미들웨어가 slug URL(/league/miracle/2026)을 UUID 경로로 internal rewrite 하므로
// useParams()/props 의 leagueId 는 UUID 지만, usePathname() 은 브라우저의 slug URL 을 반환한다.
// 둘을 그대로 비교하면(base=UUID vs pathname=slug) 활성 탭 판정이 '항상 false' → 인디케이터가 전혀 안 뜬다.
// → base 를 브라우저 경로에서 직접 추출해 href·활성판정을 같은 기준(slug)으로 맞춘다.
function deriveLeagueBase(pathname: string, orgSlug: string, leagueId: string): string {
  const seg = pathname.split('/')  // ['', 'league', orgSlug, idOrSlug, ...]
  if (seg[1] === 'league' && seg[2] && seg[3]) return `/${seg[1]}/${seg[2]}/${seg[3]}`
  return `/league/${orgSlug}/${leagueId}`
}

function TabNav({ orgSlug, leagueId, onOpenLogin, showDraft }: { orgSlug: string; leagueId: string; onOpenLogin: () => void; showDraft: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isEditMode, isAdminSession, openPinModal, exitEditMode } = useLeagueEditMode()
  const { theme, setTheme } = useTheme()
  const { user, loading: authLoading, logout } = useCurrentUser()

  // #5 가입 승인 대기 배지 — 가입 접수 시 저장한 플래그(로그인되면 해제)
  const [signupPending, setSignupPending] = useState(false)
  useEffect(() => {
    try {
      if (user) { localStorage.removeItem(`mm_signup_pending:${leagueId}`); setSignupPending(false) }
      else setSignupPending(!!localStorage.getItem(`mm_signup_pending:${leagueId}`))
    } catch { /* 무시 */ }
  }, [user, leagueId])

  const base = deriveLeagueBase(pathname, orgSlug, leagueId)

  // 상위 메뉴 6개(+드래프트 조건부) — 스탯 우산에 어워즈, 하이라이트 우산에 공지 아카이브 통합.
  // URL 은 그대로 유지(SEO/기존 링크 보존) — 상위 나비게이션에서만 그룹핑.
  // 설정 탭은 편집 모드일 때만 나비게이션에 노출(어드민 은닉) —
  //   URL 직접 접근은 여전히 가능하므로, 진짜 어드민 전용화가 필요하면 별도 이슈로 서버 가드 필요.
  // Stathead 는 2026-07-19 삭제 (사용 미미).
  const tabs = [
    { href: base, label: '홈', match: [] as string[] },
    { href: `${base}/roster`, label: '라커룸', match: [`${base}/roster`, `${base}/teams`] },
    { href: `${base}/schedule`, label: '경기', match: [`${base}/schedule`, `${base}/record`] },
    { href: `${base}/stats`, label: '스탯', match: [`${base}/stats`, `${base}/awards`] },
    { href: `${base}/highlights`, label: '하이라이트', match: [`${base}/highlights`] },
    ...(showDraft ? [{ href: `${base}/draft`, label: '드래프트', match: [`${base}/draft`] }] : []),
    ...(isEditMode ? [{ href: `${base}/settings`, label: '설정', match: [`${base}/settings`] }] : []),
  ]
  // 공지 아카이브(/archive)는 홈 우산 소속(영상이 아니라 소식) — 홈 탭은 완전일치가 아니라
  // /archive 로 시작하는 경로도 활성으로 잡아야 아카이브에서 인디케이터가 꺼지지 않는다.
  const tabActive = (tab: { href: string; match: string[] }) =>
    tab.href === base
      ? (pathname === base || pathname.startsWith(`${base}/archive`))
      : (tab.match.length ? tab.match.some(m => pathname.startsWith(m)) : pathname.startsWith(tab.href))

  return (
    <div data-tour="top-nav" className="sticky top-0 z-10 bg-[color:var(--mm-panel)] border-b border-[color:var(--mm-rule)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center">
          {/* 탭 영역 — 모바일에서는 숨김 (하단 탭바 사용), PC에서만 표시.
              self-stretch + items-stretch 로 탭을 행 전체 높이로 늘려, 활성 밑줄(하단 3px 바)이
              우측 액션 버튼 높이에 밀려 붕 뜨지 않고 네비 하단 구분선에 정확히 붙게 한다. */}
          <div className="relative flex-1 min-w-0 hidden lg:flex lg:items-stretch self-stretch">
            <div className="flex items-stretch gap-1 overflow-x-auto scrollbar-hide w-full">
              {tabs.map(tab => {
                const isActive = tabActive(tab)
                // 튜어 target — 스탯 탭에만 data-tour 부여
                const tourAttr = tab.href === `${base}/stats` ? 'stats-tab' : undefined
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    data-tour={tourAttr}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative shrink-0 flex items-center px-3 lg:px-4 py-3.5 lg:py-4 text-sm lg:text-base rounded-t-md transition-colors duration-200 ${
                      isActive
                        ? 'text-[color:var(--mm-ink)] font-bold bg-[color:var(--mm-panel-alt)]'
                        : 'text-[color:var(--mm-muted)] font-medium hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)]'
                    }`}
                  >
                    {tab.label}
                    {/* 활성 인디케이터 — 다중 신호: 굵은 글자 + 배경 + 하단 전체폭 3px 주황 바.
                        절대배치 바로 클리핑·정렬 문제 제거, 배경/굵기까지 겹쳐 밑줄 하나에 의존하지 않음. */}
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-x-0 bottom-0 h-[3px] bg-[color:var(--color-hoop-orange-500)]"
                      />
                    )}
                  </Link>
                )
              })}
            </div>
          </div>

          {/* 모바일: 현재 페이지 제목 표시 */}
          <div className="flex-1 min-w-0 lg:hidden px-1 py-2">
            {(() => {
              const current = tabs.find(tabActive)
              return <span className="text-sm font-semibold text-[color:var(--mm-ink)]">{current?.label ?? ''}</span>
            })()}
          </div>

          {/* 우측: 로그인 + 검색 + 테마 토글 + 편집 모드 버튼 */}
          <div className="flex items-center gap-1.5 pl-2 sm:pl-3 py-2 shrink-0">
            {/* 로그인 상태: 유저 칩 + 로그아웃 · 미로그인: 로그인 버튼 */}
            {!authLoading && (user ? (
              <>
                {/* 데스크톱: 유저 칩 + 로그아웃 */}
                <div className="hidden sm:flex items-center gap-1">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] text-xs font-bold min-h-[44px]"
                    title={`로그인: ${user.login_id}`}
                  >
                    <UserIcon size={13} />
                    <span className="max-w-[80px] truncate">{user.name ?? user.login_id}</span>
                  </span>
                  <button
                    onClick={logout}
                    aria-label="로그아웃"
                    title="로그아웃"
                    className="p-2 rounded-md border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center btn-press"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
                {/* 모바일: 아바타 표시(로그인 상태 인지) + 로그아웃 (2026-07-27 · hidden sm:flex 로 사라지던 문제 해결) */}
                <div className="flex sm:hidden items-center gap-1">
                  <span
                    className="inline-flex items-center justify-center w-9 h-9 rounded-full overflow-hidden bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)]"
                    title={`로그인: ${user.login_id}`}
                  >
                    {user.photo_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
                      : <UserIcon size={15} className="text-[color:var(--mm-muted)]" />}
                  </span>
                  <button
                    onClick={logout}
                    aria-label="로그아웃"
                    className="p-2 rounded-md border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] min-h-[44px] min-w-[44px] flex items-center justify-center btn-press"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={onOpenLogin}
                aria-label={signupPending ? '가입 승인 대기중 — 로그인' : '로그인'}
                className="relative flex items-center gap-1.5 px-2.5 py-2 rounded-md bg-[color:var(--mm-panel-alt)] hover:bg-[color:var(--mm-yellow-soft)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] text-xs font-medium cursor-pointer transition-colors min-h-[44px]"
              >
                <LogIn size={16} />
                <span className="hidden sm:inline">{signupPending ? '승인 대기중' : '로그인'}</span>
                {signupPending && <span aria-hidden className="sm:hidden absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[color:var(--color-hoop-orange-500)]" />}
              </button>
            ))}
            {/* 접속 현황 인디케이터 — 모든 페이지 상시 노출 (전체 공개) */}
            <PresenceIndicator leagueId={leagueId} />
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              title="라이트/다크 전환"
              className="p-2 rounded-md border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center btn-press">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              data-tour="tour-reopen"
              onClick={() => {
                // 홈 페이지에서만 튜어 요소 (POTW/순위/라운드) 가 존재하므로
                // 다른 페이지에서는 홈으로 이동 후 자동 실행 (?tour=1 쿼리)
                const base = deriveLeagueBase(pathname, orgSlug, leagueId)
                if (pathname === base) {
                  window.dispatchEvent(new CustomEvent('mm-tour-open'))
                } else {
                  router.push(`${base}?tour=1`)
                }
              }}
              aria-label="둘러보기 다시 실행"
              title="둘러보기"
              className="p-2 rounded-md border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center btn-press">
              <HelpCircle size={16} />
            </button>
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
          </div>
        </div>
      </div>
    </div>
  )
}

function BottomNav({ orgSlug, leagueId, showDraft }: { orgSlug: string; leagueId: string; showDraft: boolean }) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const { isEditMode } = useLeagueEditMode()
  const base = deriveLeagueBase(pathname, orgSlug, leagueId)

  // 모바일 4대 주요 탭 — 어워즈는 스탯 우산, 공지 아카이브는 하이라이트 우산으로 통합됨
  // Stathead 는 2026-07-19 삭제 (사용 미미).
  const mainTabs = [
    { href: base,            label: '홈',    Icon: Home },
    { href: `${base}/roster`, label: '라커룸', Icon: Users },
    { href: `${base}/schedule`, label: '경기', Icon: Calendar },
    { href: `${base}/stats`, label: '스탯',  Icon: BarChart2 },
  ]
  // 설정은 편집 모드일 때만 더보기에 노출 (어드민 은닉)
  const moreTabs = [
    { href: `${base}/highlights`, label: '하이라이트', Icon: Newspaper },
    ...(showDraft ? [{ href: `${base}/draft`, label: '드래프트', Icon: ClipboardList }] : []),
    ...(isEditMode ? [{ href: `${base}/settings`, label: '설정', Icon: Settings }] : []),
  ]

  // 스탯 우산 매칭 — /stats 이면서 /awards 도 스탯 탭 활성.
  // 홈 우산 매칭 — /archive(공지 아카이브)는 하이라이트가 아니라 홈 소속.
  const isActive = (href: string) => {
    if (href === base) return pathname === base || pathname.startsWith(`${base}/archive`)
    if (href === `${base}/stats`) return pathname.startsWith(`${base}/stats`) || pathname.startsWith(`${base}/awards`)
    return pathname.startsWith(href)
  }
  // 더보기 그룹 중 하나가 현재 페이지면 더보기 버튼도 활성화 표시
  const moreGroupActive = moreTabs.some(t => isActive(t.href))

  return (
    <>
      {/* 더보기 오버레이 */}
      {moreOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="lg:hidden fixed bottom-14 inset-x-0 z-50 bg-[color:var(--mm-panel)] border-t border-[color:var(--mm-rule)] shadow-[0_-10px_36px_-8px_rgba(0,0,0,0.20)]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--mm-rule)]">
              <span className="text-sm font-bold text-[color:var(--mm-ink)]">더보기</span>
              <button onClick={() => setMoreOpen(false)} aria-label="더보기 닫기" className="text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] p-1.5 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-3">
              {moreTabs.map(({ href, label, Icon }) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded transition-colors min-h-[64px] ${
                    isActive(href)
                      ? 'bg-[color:var(--mm-yellow-soft)] text-[color:var(--mm-ink)] ring-1 ring-[color:var(--color-hoop-orange-500)]'
                      : 'text-[color:var(--mm-ink-soft)] hover:bg-[color:var(--mm-panel-alt)] hover:text-[color:var(--mm-ink)]'
                  }`}>
                  <Icon size={22} strokeWidth={isActive(href) ? 2.25 : 1.75} />
                  <span className="text-xs font-semibold">{label}</span>
                </Link>
              ))}
            </div>
            <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
          </div>
        </>
      )}

      {/* 하단 탭바 — 편집 모드 시 상단 얇은 노랑 라인으로 상태 힌트 */}
      <nav
        aria-label="주요 메뉴"
        data-tour="bottom-nav"
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[color:var(--mm-panel)]/95 backdrop-blur-md border-t ${isEditMode ? 'border-[color:var(--color-hoop-orange-500)]' : 'border-[color:var(--mm-rule)]'}`}
      >
        <div className="flex items-stretch justify-around h-14">
          {mainTabs.map(({ href, label, Icon }) => {
            const active = isActive(href)
            const isStatsTab = href === `${base}/stats`
            return (
              <Link
                key={href}
                href={href}
                data-tour={isStatsTab ? 'stats-tab-mobile' : undefined}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 px-2 min-h-[56px] transition-colors ${
                  active ? 'text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-muted)] active:text-[color:var(--mm-ink)]'
                }`}
              >
                {/* 액티브 인디케이터 — 상단 짧은 노랑 라인 */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-[color:var(--color-hoop-orange-500)]"
                  />
                )}
                <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
                <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
              </Link>
            )
          })}
          <button
            onClick={() => setMoreOpen(v => !v)}
            aria-label="더보기 메뉴 열기"
            aria-expanded={moreOpen}
            aria-current={moreGroupActive && !moreOpen ? 'page' : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 px-2 min-h-[56px] transition-colors cursor-pointer ${
              moreOpen || moreGroupActive ? 'text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-muted)] active:text-[color:var(--mm-ink)]'
            }`}
          >
            {(moreOpen || moreGroupActive) && (
              <span
                aria-hidden
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-[color:var(--color-hoop-orange-500)]"
              />
            )}
            <MoreHorizontal size={22} strokeWidth={moreOpen || moreGroupActive ? 2.25 : 1.75} />
            <span className={`text-[11px] ${moreOpen || moreGroupActive ? 'font-bold' : 'font-medium'}`}>더보기</span>
          </button>
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
  // 경기기록은 더 촘촘하게, 나머지는 전체 너비
  if (isRecord) {
    return <div className="px-3 py-3">{children}</div>
  }
  return <div className="max-w-[1600px] mx-auto px-4 lg:px-4 py-6">{children}</div>
}

function LeagueLayout({
  orgSlug,
  leagueId,
  children,
}: {
  orgSlug: string
  leagueId: string
  children: React.ReactNode
}) {
  const { theme } = useTheme()
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
          onOpenLogin={() => setLoginOpen(true)}
          showDraft={showDraft}
        />
        {/* 모바일 하단 탭바(56px) + iOS safe-area 만큼 여백 확보 */}
        <div className="pb-[calc(56px+env(safe-area-inset-bottom,0px))] lg:pb-0">
          <RecordAwareContainer orgSlug={orgSlug} leagueId={leagueId}>
            {children}
          </RecordAwareContainer>
        </div>
        <BottomNav orgSlug={orgSlug} leagueId={leagueId} showDraft={showDraft} />
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
  children,
}: {
  orgSlug: string
  leagueId: string
  children: React.ReactNode
}) {
  return <LeagueLayout orgSlug={orgSlug} leagueId={leagueId}>{children}</LeagueLayout>
}
