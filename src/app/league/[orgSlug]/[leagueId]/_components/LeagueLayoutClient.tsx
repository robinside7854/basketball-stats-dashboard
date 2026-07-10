'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { LeagueQuarterProvider } from '@/contexts/LeagueQuarterContext'
import { Lock, Unlock, Sun, Moon, Search, Home, Users, BarChart2, Calendar, MoreHorizontal, X, ClipboardList, Settings, Trophy, Sparkles, Newspaper } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import GlobalSearchModal from '@/components/league/GlobalSearchModal'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'

function TabNav({ orgSlug, leagueId, onOpenSearch, showDraft }: { orgSlug: string; leagueId: string; onOpenSearch: () => void; showDraft: boolean }) {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useLeagueEditMode()
  const { theme, setTheme } = useTheme()

  const base = `/league/${orgSlug}/${leagueId}`

  const tabs = [
    { href: base, label: '홈', match: [] as string[] },
    { href: `${base}/roster`, label: '선수·팀', match: [`${base}/roster`, `${base}/teams`] },
    { href: `${base}/schedule`, label: '경기', match: [`${base}/schedule`, `${base}/record`] },
    { href: `${base}/stats`, label: '스탯', match: [`${base}/stats`] },
    { href: `${base}/awards`, label: '어워즈', match: [`${base}/awards`] },
    { href: `${base}/columns`, label: '매거진', match: [`${base}/columns`] },
    { href: `${base}/stathead`, label: 'Stathead', match: [`${base}/stathead`] },
    ...(showDraft ? [{ href: `${base}/draft`, label: '드래프트', match: [`${base}/draft`] }] : []),
    { href: `${base}/settings`, label: '설정', match: [`${base}/settings`] },
  ]
  const tabActive = (tab: { href: string; match: string[] }) =>
    tab.href === base ? pathname === base : (tab.match.length ? tab.match.some(m => pathname.startsWith(m)) : pathname.startsWith(tab.href))

  return (
    <div className="sticky top-0 z-10 bg-[color:var(--mm-panel)] border-b border-[color:var(--mm-rule)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center">
          {/* 탭 영역 — 모바일에서는 숨김 (하단 탭바 사용), PC에서만 표시 */}
          <div className="relative flex-1 min-w-0 hidden lg:block">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {tabs.map(tab => {
                const isActive = tabActive(tab)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`shrink-0 px-3 lg:px-4 py-3.5 lg:py-4 text-sm lg:text-base border-b-2 transition-all duration-200 ${
                      isActive
                        ? 'border-[color:var(--mm-yellow)] text-[color:var(--mm-ink)] font-semibold'
                        : 'border-transparent text-[color:var(--mm-muted)] font-medium hover:text-[color:var(--mm-ink)]'
                    }`}
                  >
                    {tab.label}
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

          {/* 우측: 검색 + 테마 토글 + 편집 모드 버튼 */}
          <div className="flex items-center gap-1.5 pl-2 sm:pl-3 py-2 shrink-0">
            <button onClick={onOpenSearch} aria-label="선수 검색"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[color:var(--mm-panel-alt)] hover:bg-[color:var(--mm-yellow-soft)] border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] text-xs font-medium cursor-pointer transition-colors min-h-[44px]">
              <Search size={13} />
              <span className="hidden sm:inline">검색</span>
              <kbd className="hidden md:inline text-xs text-[color:var(--mm-muted)] bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded px-1">⌘K</kbd>
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              className="p-1.5 rounded border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center btn-press">
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {isEditMode ? (
              <button onClick={exitEditMode}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] border border-[color:var(--mm-yellow)] hover:brightness-95 font-semibold transition-colors cursor-pointer btn-press">
                <Unlock size={12} /><span className="hidden sm:inline">편집 중</span>
              </button>
            ) : (
              <button onClick={openPinModal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] transition-colors cursor-pointer btn-press">
                <Lock size={12} /><span className="hidden sm:inline">편집</span>
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
  const base = `/league/${orgSlug}/${leagueId}`

  const mainTabs = [
    { href: base,            label: '홈',    Icon: Home },
    { href: `${base}/roster`, label: '선수·팀', Icon: Users },
    { href: `${base}/schedule`, label: '경기', Icon: Calendar },
    { href: `${base}/stats`, label: '스탯',  Icon: BarChart2 },
  ]
  const moreTabs = [
    { href: `${base}/awards`, label: '어워즈', Icon: Trophy },
    { href: `${base}/columns`, label: '매거진', Icon: Newspaper },
    { href: `${base}/stathead`, label: 'Stathead', Icon: Sparkles },
    ...(showDraft ? [{ href: `${base}/draft`, label: '드래프트', Icon: ClipboardList }] : []),
    { href: `${base}/settings`, label: '설정',   Icon: Settings },
  ]

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href)
  // 더보기 그룹 중 하나가 현재 페이지면 더보기 버튼도 활성화 표시
  const moreGroupActive = moreTabs.some(t => isActive(t.href))

  return (
    <>
      {/* 더보기 오버레이 */}
      {moreOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="lg:hidden fixed bottom-14 inset-x-0 z-50 bg-[color:var(--mm-panel)] border-t border-[color:var(--mm-rule)] shadow-2xl rounded-t-2xl">
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
                      ? 'bg-[color:var(--mm-yellow-soft)] text-[color:var(--mm-ink)] ring-1 ring-[color:var(--mm-yellow)]'
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
        className={`lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[color:var(--mm-panel)]/95 backdrop-blur-md border-t ${isEditMode ? 'border-[color:var(--mm-yellow)]' : 'border-[color:var(--mm-rule)]'}`}
      >
        <div className="flex items-stretch justify-around h-14">
          {mainTabs.map(({ href, label, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 px-2 min-h-[56px] transition-colors ${
                  active ? 'text-[color:var(--mm-ink)]' : 'text-[color:var(--mm-muted)] active:text-[color:var(--mm-ink)]'
                }`}
              >
                {/* 액티브 인디케이터 — 상단 짧은 노랑 라인 */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-[color:var(--mm-yellow)]"
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
                className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full bg-[color:var(--mm-yellow)]"
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
  const isRecord = pathname.startsWith(`/league/${orgSlug}/${leagueId}/record`)
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null)
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

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <LeagueEditModeProvider leagueId={leagueId}>
    <LeagueQuarterProvider leagueId={leagueId}>
      <div className="min-h-screen bg-[color:var(--mm-ground)] text-[color:var(--mm-ink-soft)]">
        <TabNav orgSlug={orgSlug} leagueId={leagueId} onOpenSearch={() => setSearchOpen(true)} showDraft={showDraft} />
        {/* pb-16 lg:pb-0: 모바일 하단 탭바 높이만큼 여백 */}
        <div className="pb-16 lg:pb-0">
          <RecordAwareContainer orgSlug={orgSlug} leagueId={leagueId}>
            {children}
          </RecordAwareContainer>
        </div>
        <BottomNav orgSlug={orgSlug} leagueId={leagueId} showDraft={showDraft} />
      </div>
      {searchOpen && (
        <GlobalSearchModal
          leagueId={leagueId}
          onClose={() => setSearchOpen(false)}
          onSelectPlayer={(id, name) => {
            setSelectedPlayer({ id, name })
            setSearchOpen(false)
          }}
        />
      )}
      {selectedPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      <Toaster richColors theme={theme === 'light' ? 'light' : 'dark'} position="top-center" />
    </LeagueQuarterProvider>
    </LeagueEditModeProvider>
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
