'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Lock, Unlock, Sun, Moon } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

function TabNav({ orgSlug, leagueId }: { orgSlug: string; leagueId: string }) {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useLeagueEditMode()
  const { theme, setTheme } = useTheme()

  const base = `/league/${orgSlug}/${leagueId}`
  const isRecord = pathname.startsWith(`${base}/record`)

  const tabs = [
    { href: base, label: '홈' },
    { href: `${base}/roster`, label: '선수단' },
    { href: `${base}/teams`, label: '팀 구성' },
    { href: `${base}/schedule`, label: '일정' },
    { href: `${base}/record`, label: '경기기록' },
    { href: `${base}/stats`, label: '스탯' },
    { href: `${base}/settings`, label: '설정' },
  ]

  return (
    <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 lg:px-6">
        <div className="flex items-center">
          {/* 가운데: 스크롤되는 탭 영역 + 우측 fade */}
          <div className="relative flex-1 min-w-0">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pr-6 sm:pr-0">
              {tabs.map(tab => {
                const isActive = tab.href === base
                  ? pathname === base
                  : pathname.startsWith(tab.href)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`shrink-0 px-3 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                      isActive
                        ? 'border-blue-500 text-white'
                        : 'border-transparent text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </div>
            {/* 우측 fade — 모바일 전용 (스크롤 가능 시각화) */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-gray-950 to-transparent pointer-events-none sm:hidden" />
          </div>

          {/* 우측: 테마 토글 + 편집 모드 버튼 (항상 고정) */}
          <div className="flex items-center gap-1.5 pl-2 sm:pl-3 py-2 shrink-0">
            {/* 라이트/다크 토글 */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
              className="p-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors duration-200 cursor-pointer"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>

            {isEditMode ? (
              <button
                onClick={exitEditMode}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors cursor-pointer"
              >
                <Unlock size={12} />
                <span className="hidden sm:inline">편집 중</span>
              </button>
            ) : (
              <button
                onClick={openPinModal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
              >
                <Lock size={12} />
                <span className="hidden sm:inline">편집</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
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
  return (
    <LeagueEditModeProvider leagueId={leagueId}>
      <div className="min-h-screen bg-gray-950 text-gray-300">
        <TabNav orgSlug={orgSlug} leagueId={leagueId} />
        <RecordAwareContainer orgSlug={orgSlug} leagueId={leagueId}>
          {children}
        </RecordAwareContainer>
      </div>
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
