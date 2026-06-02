'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Lock, Unlock, Sun, Moon, Search, Home, Users, BarChart2, Calendar, MoreHorizontal, X, ClipboardList, Settings } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import GlobalSearchModal from '@/components/league/GlobalSearchModal'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'

function TabNav({ orgSlug, leagueId, onOpenSearch }: { orgSlug: string; leagueId: string; onOpenSearch: () => void }) {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useLeagueEditMode()
  const { theme, setTheme } = useTheme()

  const base = `/league/${orgSlug}/${leagueId}`

  const tabs = [
    { href: base, label: '홈' },
    { href: `${base}/roster`, label: '선수단' },
    { href: `${base}/teams`, label: '팀 구성' },
    { href: `${base}/draft`, label: '드래프트' },
    { href: `${base}/schedule`, label: '일정' },
    { href: `${base}/record`, label: '경기기록' },
    { href: `${base}/stats`, label: '스탯' },
    { href: `${base}/settings`, label: '설정' },
  ]

  return (
    <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center">
          {/* 탭 영역 — 모바일에서는 숨김 (하단 탭바 사용), PC에서만 표시 */}
          <div className="relative flex-1 min-w-0 hidden lg:block">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {tabs.map(tab => {
                const isActive = tab.href === base
                  ? pathname === base
                  : pathname.startsWith(tab.href)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`shrink-0 px-3 py-3.5 text-sm border-b-2 transition-all duration-200 ${
                      isActive
                        ? 'border-blue-500 text-white font-semibold'
                        : 'border-transparent text-gray-400 font-medium hover:text-white'
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
              const current = tabs.find(t => t.href === base ? pathname === base : pathname.startsWith(t.href))
              return <span className="text-sm font-semibold text-white">{current?.label ?? ''}</span>
            })()}
          </div>

          {/* 우측: 검색 + 테마 토글 + 편집 모드 버튼 */}
          <div className="flex items-center gap-1.5 pl-2 sm:pl-3 py-2 shrink-0">
            <button onClick={onOpenSearch} aria-label="선수 검색"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs font-medium cursor-pointer transition-colors min-h-[44px]">
              <Search size={13} />
              <span className="hidden sm:inline">검색</span>
              <kbd className="hidden md:inline text-[10px] text-gray-600 bg-gray-900 border border-gray-700 rounded px-1">⌘K</kbd>
            </button>
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center btn-press">
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {isEditMode ? (
              <button onClick={exitEditMode}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors cursor-pointer btn-press">
                <Unlock size={12} /><span className="hidden sm:inline">편집 중</span>
              </button>
            ) : (
              <button onClick={openPinModal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer btn-press">
                <Lock size={12} /><span className="hidden sm:inline">편집</span>
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
  const [moreOpen, setMoreOpen] = useState(false)
  const base = `/league/${orgSlug}/${leagueId}`

  const mainTabs = [
    { href: base,            label: '홈',    Icon: Home },
    { href: `${base}/teams`, label: '팀구성', Icon: Users },
    { href: `${base}/stats`, label: '스탯',  Icon: BarChart2 },
    { href: `${base}/schedule`, label: '일정', Icon: Calendar },
  ]
  const moreTabs = [
    { href: `${base}/roster`, label: '선수단',   Icon: Users },
    { href: `${base}/record`, label: '경기기록', Icon: ClipboardList },
    { href: `${base}/settings`, label: '설정',   Icon: Settings },
  ]

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href)

  return (
    <>
      {/* 더보기 오버레이 */}
      {moreOpen && (
        <>
          <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="lg:hidden fixed bottom-14 inset-x-0 z-50 bg-gray-900 border-t border-gray-800 shadow-2xl rounded-t-2xl">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
              <span className="text-sm font-bold text-white">더보기</span>
              <button onClick={() => setMoreOpen(false)} className="text-gray-500 hover:text-white p-1 cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1 p-3">
              {moreTabs.map(({ href, label, Icon }) => (
                <Link key={href} href={href} onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl transition-colors ${
                    isActive(href) ? 'bg-blue-600/20 text-blue-400' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}>
                  <Icon size={22} />
                  <span className="text-[11px] font-semibold">{label}</span>
                </Link>
              ))}
            </div>
            <div style={{ height: 'env(safe-area-inset-bottom, 8px)' }} />
          </div>
        </>
      )}

      {/* 하단 탭바 */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-gray-900/95 backdrop-blur-md border-t border-gray-800">
        <div className="flex items-center justify-around h-14">
          {mainTabs.map(({ href, label, Icon }) => (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors ${
                isActive(href) ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
              }`}>
              <Icon size={21} />
              <span className="text-[10px] font-semibold">{label}</span>
            </Link>
          ))}
          <button onClick={() => setMoreOpen(v => !v)}
            className={`flex flex-col items-center gap-0.5 px-4 py-1 transition-colors cursor-pointer ${
              moreOpen ? 'text-blue-400' : 'text-gray-500 hover:text-gray-300'
            }`}>
            <MoreHorizontal size={21} />
            <span className="text-[10px] font-semibold">더보기</span>
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
  return <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6">{children}</div>
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
      <div className="min-h-screen bg-gray-950 text-gray-300">
        <TabNav orgSlug={orgSlug} leagueId={leagueId} onOpenSearch={() => setSearchOpen(true)} />
        {/* pb-16 lg:pb-0: 모바일 하단 탭바 높이만큼 여백 */}
        <div className="pb-16 lg:pb-0">
          <RecordAwareContainer orgSlug={orgSlug} leagueId={leagueId}>
            {children}
          </RecordAwareContainer>
        </div>
        <BottomNav orgSlug={orgSlug} leagueId={leagueId} />
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
      <Toaster richColors theme={theme === 'light' ? 'light' : 'dark'} />
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
