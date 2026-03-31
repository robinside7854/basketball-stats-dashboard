'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, PenLine, ClipboardList, BarChart3, Users, Trophy, ScrollText, Lock, Unlock, Swords } from 'lucide-react'
import { useEditMode } from '@/contexts/EditModeContext'

const publicTabs = [
  { href: '/',            label: '홈',        icon: Home,          exact: true },
  { href: '/boxscore',    label: '박스스코어', icon: ClipboardList, exact: false },
  { href: '/gamelog',     label: '게임 로그',  icon: ScrollText,    exact: false },
  { href: '/stats',       label: '시즌 통계',  icon: BarChart3,     exact: false },
  { href: '/roster',      label: '선수 명단',  icon: Users,         exact: false },
  { href: '/tournaments', label: '대회 관리',  icon: Trophy,        exact: false },
  { href: '/opponent',    label: '상대 분석',  icon: Swords,        exact: false },
]

const editOnlyTab = { href: '/record', label: '경기 기록', icon: PenLine, exact: false }

export default function TabNav() {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useEditMode()

  const tabs = isEditMode ? [...publicTabs, editOnlyTab] : publicTabs

  return (
    <nav className="bg-gray-950 border-b border-blue-700/30 sticky top-0 z-50 shadow-lg" style={{ boxShadow: '0 4px 20px rgba(26,114,217,0.08)' }}>
      <div className="container mx-auto px-4 max-w-[1600px]">
        <div className="flex items-center gap-1 overflow-x-auto">
          <div className="flex items-center gap-2 mr-5 py-3 shrink-0">
            <span className="text-2xl">🏀</span>
            <span className="text-white font-bold text-base tracking-tight whitespace-nowrap">
              파란날개 <span className="text-blue-400">게임로그</span>
            </span>
          </div>
          <div className="w-px h-5 bg-gray-700 mr-2 shrink-0" />
          {tabs.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            )
          })}

          {/* 편집 모드 버튼 — 우측 끝 */}
          <div className="ml-auto pl-4 py-3 shrink-0">
            {isEditMode ? (
              <button
                onClick={exitEditMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 border border-blue-500/50 text-blue-400 hover:bg-red-900/30 hover:border-red-500/50 hover:text-red-400 transition-colors"
              >
                <Unlock size={13} />
                편집 모드
              </button>
            ) : (
              <button
                onClick={openPinModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                <Lock size={13} />
                편집 모드
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
