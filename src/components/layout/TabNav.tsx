'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, PenLine, ClipboardList, BarChart3, Users, Trophy, ScrollText, Lock, Unlock, Swords, ChevronLeft } from 'lucide-react'
import { useEditMode } from '@/contexts/EditModeContext'
import { TEAM_LABELS, type TeamType } from '@/contexts/TeamContext'

const TAB_DEFS = [
  { path: '',           label: '홈',        icon: Home,          exact: true },
  { path: '/boxscore',  label: '박스스코어', icon: ClipboardList, exact: false },
  { path: '/gamelog',   label: '게임 로그',  icon: ScrollText,    exact: false },
  { path: '/stats',     label: '시즌 통계',  icon: BarChart3,     exact: false },
  { path: '/roster',    label: '선수 명단',  icon: Users,         exact: false },
  { path: '/tournaments', label: '대회 관리', icon: Trophy,       exact: false },
  { path: '/opponent',  label: '상대 분석',  icon: Swords,        exact: false },
]

const EDIT_ONLY_PATH = '/record'

const TEAM_COLORS: Record<TeamType, string> = {
  youth: 'text-blue-400',
  senior: 'text-orange-400',
}

export default function TabNav() {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useEditMode()

  // Extract team from pathname: /youth/... or /senior/...
  const segments = pathname.split('/').filter(Boolean)
  const team = (segments[0] === 'youth' || segments[0] === 'senior') ? segments[0] as TeamType : null
  const prefix = team ? `/${team}` : ''

  const tabs = TAB_DEFS.map(t => ({
    href: prefix + t.path || prefix || '/',
    label: t.label,
    icon: t.icon,
    exact: t.exact,
  }))

  const editTab = {
    href: `${prefix}${EDIT_ONLY_PATH}`,
    label: '경기 기록',
    icon: PenLine,
    exact: false,
  }

  const allTabs = isEditMode ? [...tabs, editTab] : tabs

  return (
    <nav className="bg-gray-950 border-b border-blue-600/40 sticky top-0 z-50 shadow-lg" style={{ boxShadow: '0 4px 24px rgba(59,130,246,0.12)' }}>
      <div className="container mx-auto px-4 max-w-[1600px]">
        <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex items-center gap-1.5 mr-3 sm:mr-5 py-3 shrink-0">
            {team ? (
              <Link href="/" className="flex items-center gap-1.5 group">
                <ChevronLeft size={14} className="text-gray-500 group-hover:text-gray-300 transition-colors" />
                <span className="text-xl sm:text-2xl">🏀</span>
                <div className="flex flex-col leading-none">
                  <span className="text-white font-bold text-sm sm:text-base tracking-tight whitespace-nowrap">
                    파란날개
                  </span>
                  <span className={`text-xs font-semibold ${TEAM_COLORS[team]}`}>
                    {TEAM_LABELS[team]}
                  </span>
                </div>
              </Link>
            ) : (
              <>
                <span className="text-xl sm:text-2xl">🏀</span>
                <span className="text-white font-bold text-sm sm:text-base tracking-tight whitespace-nowrap">
                  파란날개 <span className="text-blue-400 hidden sm:inline">게임로그</span>
                </span>
              </>
            )}
          </div>
          <div className="w-px h-5 bg-gray-700 mr-2 shrink-0" />
          {allTabs.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
                )}
              >
                <Icon size={14} />
                {label}
              </Link>
            )
          })}

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
