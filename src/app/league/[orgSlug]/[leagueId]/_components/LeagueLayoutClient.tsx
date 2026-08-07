'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { LeagueQuarterProvider } from '@/contexts/LeagueQuarterContext'
import { LeagueAuthProvider, useCurrentUser } from '@/contexts/LeagueAuthContext'
import { Lock, Unlock, Home, BarChart2, Calendar, Newspaper, LogIn, User as UserIcon } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

const LoginModal = dynamic(() => import('@/components/league/auth/LoginModal'), { ssr: false })
import CompetitionSwitcher from '@/components/league/CompetitionSwitcher'

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

  // 상위 메뉴 — 라커룸 제거(네비게이션에서만 하차, 라우트는 유지), 스탯 우산에 어워즈,
  // 하이라이트 우산에 공지 아카이브 통합. URL 은 그대로 유지(SEO/기존 링크 보존).
  // 설정 탭은 편집 모드일 때만 나비게이션에 노출(어드민 은닉) —
  //   URL 직접 접근은 여전히 가능하므로, 진짜 어드민 전용화가 필요하면 별도 이슈로 서버 가드 필요.
  // "내 기록"은 항상 맨 오른쪽 — 드래프트/설정은 기존 위치(하이라이트 다음)를 유지한다(Task 4-B).
  // Stathead 는 2026-07-19 삭제 (사용 미미).
  const tabs = [
    { href: base, label: '홈', match: [] as string[] },
    { href: `${base}/schedule`, label: '경기', match: [`${base}/schedule`, `${base}/boxscore`, `${base}/record`] },
    { href: `${base}/stats`, label: '스탯', match: [`${base}/stats`, `${base}/awards`] },
    { href: `${base}/highlights`, label: '하이라이트', match: [`${base}/highlights`] },
    ...(showDraft ? [{ href: `${base}/draft`, label: '드래프트', match: [`${base}/draft`] }] : []),
    ...(isEditMode ? [{ href: `${base}/settings`, label: '설정', match: [`${base}/settings`] }] : []),
    { href: `${base}/me`, label: '내 기록', match: [`${base}/me`] },
  ]
  // 공지 아카이브(/archive)는 홈 우산 소속(영상이 아니라 소식) — 홈 탭은 완전일치가 아니라
  // /archive 로 시작하는 경로도 활성으로 잡아야 아카이브에서 인디케이터가 꺼지지 않는다.
  // 라커룸(/roster·/teams) 은 탭에서 빠졌지만 링크는 살아있다 — 어느 탭도 안 켜지면 위치를
  // 잃으므로 홈 활성으로 흡수한다(BottomNav 와 동일 규칙, Task 4-C 근거 동일하게 데스크톱도 적용).
  const tabActive = (tab: { href: string; match: string[] }) =>
    tab.href === base
      ? (pathname === base || pathname.startsWith(`${base}/archive`) || pathname.startsWith(`${base}/roster`) || pathname.startsWith(`${base}/teams`))
      : (tab.match.length ? tab.match.some(m => pathname.startsWith(m)) : pathname.startsWith(tab.href))

  return (
    <div data-tour="top-nav" className="sticky top-0 z-10 bg-[color:var(--mm-panel)] border-b border-[color:var(--mm-rule)]">
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

          {/* 모바일: 탭 영역 대신 빈 flex 공간 — 좌측 브랜드 링크가 이미 위에서 렌더됨 */}
          <div className="flex-1 min-w-0 lg:hidden" />

          {/* 우측: 로그인 + 편집 모드 버튼 — 6개→2개로 축소(Task 4-B). 유저 칩·로그아웃·접속현황·
              테마 토글·둘러보기는 전부 /me 로 이동했다(PresenceIndicator 는 /me 상단으로). */}
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

  // 5탭 고정 — 더보기 삭제(Task 4-C). 인스타그램처럼 계정/개인 화면은 맨 오른쪽.
  // 라커룸은 탭에서 빠졌지만 라우트는 살아있다 — 홈 탭 활성 판정에 흡수(아래 isActive).
  // 드래프트·설정은 하단에서 완전히 빠지고 /me 바로가기로만 닿는다(Task 4-D 참조).
  const mainTabs = [
    { href: base,                  label: '홈',      Icon: Home },
    { href: `${base}/schedule`,    label: '경기',     Icon: Calendar },
    { href: `${base}/stats`,       label: '스탯',     Icon: BarChart2 },
    { href: `${base}/highlights`,  label: '하이라이트', Icon: Newspaper },
    { href: `${base}/me`,          label: '내 기록',   Icon: UserIcon },
  ]

  // 스탯 우산 매칭 — /stats 이면서 /awards 도 스탯 탭 활성.
  // 홈 우산 매칭 — /archive(공지 아카이브)·/roster·/teams(라커룸, 탭에서 빠졌지만 라우트는 유지)도 홈 소속.
  //   탭이 하나도 안 켜지면 위치를 잃으므로 반드시 홈으로 흡수한다.
  // 경기 우산 매칭 — /schedule 이면서 /boxscore·/record 도 경기 탭 활성 (데스크톱 TabNav match 배열과 동일 반영).
  // 내 기록 우산 매칭 — /me 자체뿐 아니라 /draft·/settings 도 여기로 흡수한다. 이 둘은 하단 탭이
  //   따로 없고 /me 의 "바로가기"로만 진입하므로, 안 그러면 그 페이지에서 하단 탭이 전부 꺼진다.
  const isActive = (href: string) => {
    if (href === base) return pathname === base || pathname.startsWith(`${base}/archive`) || pathname.startsWith(`${base}/roster`) || pathname.startsWith(`${base}/teams`)
    if (href === `${base}/stats`) return pathname.startsWith(`${base}/stats`) || pathname.startsWith(`${base}/awards`)
    if (href === `${base}/schedule`) return pathname.startsWith(`${base}/schedule`) || pathname.startsWith(`${base}/boxscore`) || pathname.startsWith(`${base}/record`)
    if (href === `${base}/me`) return pathname.startsWith(`${base}/me`) || pathname.startsWith(`${base}/draft`) || pathname.startsWith(`${base}/settings`)
    return pathname.startsWith(href)
  }

  return (
    <>
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
            const isMeTab = href === `${base}/me`
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
                {/* 내 기록 탭 — 로그인 상태면 유저 사진(있으면), 없으면 lucide User (인스타 프로필 탭과 동일 패턴) */}
                {isMeTab && user?.photo_url ? (
                  <span className="w-[22px] h-[22px] rounded-full overflow-hidden shrink-0" style={{ border: active ? '1.5px solid var(--mm-ink)' : '1.5px solid transparent' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
                  </span>
                ) : (
                  <Icon size={22} strokeWidth={active ? 2.25 : 1.75} />
                )}
                <span className={`text-[11px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
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
  // 경기기록은 더 촘촘하게, 나머지는 전체 너비
  if (isRecord) {
    return <div className="px-3 py-3">{children}</div>
  }
  return <div className="max-w-[1600px] mx-auto px-4 lg:px-4 py-6">{children}</div>
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
