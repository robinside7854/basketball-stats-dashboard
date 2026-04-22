'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { LeagueEditModeProvider, useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Lock, Unlock } from 'lucide-react'

function TabNav({ orgSlug, leagueId }: { orgSlug: string; leagueId: string }) {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useLeagueEditMode()

  const base = `/league/${orgSlug}/${leagueId}`
  const tabs = [
    { href: base, label: '홈' },
    { href: `${base}/roster`, label: '선수단' },
    { href: `${base}/teams`, label: '팀 구성' },
    { href: `${base}/schedule`, label: '일정' },
    { href: `${base}/record`, label: '경기기록' },
  ]

  return (
    <div className="sticky top-0 z-10 bg-gray-950 border-b border-gray-800">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
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
          <div className="ml-auto shrink-0 py-2">
            {isEditMode ? (
              <button
                onClick={exitEditMode}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 transition-colors cursor-pointer"
              >
                <Unlock size={12} />편집 중
              </button>
            ) : (
              <button
                onClick={openPinModal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
              >
                <Lock size={12} />편집
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LeagueLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  return (
    <LeagueEditModeProvider leagueId={leagueId}>
      <div className="min-h-screen bg-gray-950 text-white">
        <TabNav orgSlug={orgSlug} leagueId={leagueId} />
        <div className="max-w-2xl mx-auto px-4 py-6">
          {children}
        </div>
      </div>
    </LeagueEditModeProvider>
  )
}
