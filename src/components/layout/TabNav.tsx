'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, PenLine, ClipboardList, BarChart3, Users, Trophy, Lock, Unlock, ArrowLeftRight } from 'lucide-react'
import { useEditMode } from '@/contexts/EditModeContext'
import { TEAM_LABELS, type TeamType } from '@/contexts/TeamContext'

const TAB_DEFS = [
  { path: '',             label: '홈',       icon: Home,          exact: true,  also: '' },
  { path: '/boxscore',    label: '경기',     icon: ClipboardList, exact: false, also: '/gamelog' },
  { path: '/stats',       label: '통계',     icon: BarChart3,     exact: false, also: '/opponent' },
  { path: '/roster',      label: '선수 명단', icon: Users,        exact: false, also: '' },
  { path: '/tournaments', label: '대회 관리', icon: Trophy,       exact: false, also: '' },
]

const EDIT_ONLY_PATH = '/record'

const TEAM_STYLES: Record<TeamType, { badge: string; dot: string }> = {
  youth:  { badge: 'bg-blue-500/20 border-blue-500/50 text-blue-300',   dot: 'bg-blue-400' },
  senior: { badge: 'bg-orange-500/20 border-orange-500/50 text-orange-300', dot: 'bg-orange-400' },
}

export default function TabNav() {
  const pathname = usePathname()
  const { isEditMode, openPinModal, exitEditMode } = useEditMode()

  const segments = pathname.split('/').filter(Boolean)
  // URL: /[org]/[team]/... — segments[0]=org, segments[1]=team
  const isOrgTeamPath = segments.length >= 2 && (segments[1] === 'youth' || segments[1] === 'senior')
  const org = isOrgTeamPath ? segments[0] : null
  const team = isOrgTeamPath ? segments[1] as TeamType : null
  const prefix = (org && team) ? `/${org}/${team}` : ''

  // 홈(/) 랜딩 페이지에서는 NavBar 숨김
  if (pathname === '/') return null

  const tabs = TAB_DEFS.map(t => ({
    href: prefix + t.path || prefix || '/',
    label: t.label,
    icon: t.icon,
    exact: t.exact,
    also: t.also ? `${prefix}${t.also}` : '',
  }))

  const editTab = {
    href: `${prefix}${EDIT_ONLY_PATH}`,
    label: '경기 기록',
    icon: PenLine,
    exact: false,
    also: '',
  }

  const allTabs = isEditMode ? [...tabs, editTab] : tabs

  return (
    <nav className="bg-gray-950 border-b border-blue-600/40 sticky top-0 z-50 shadow-lg" style={{ boxShadow: '0 4px 24px rgba(59,130,246,0.12)' }}>
      <div className="container mx-auto px-4 max-w-[1600px]">
        <div className="flex items-center">

          {/* 로고 + 팀 배지 (항상 좌측 고정) */}
          <div className="flex items-center gap-1 shrink-0">
            <div className="flex items-center gap-2 mr-2 sm:mr-4 py-3">
              <span className="text-xl">🏀</span>
              <span className="text-white font-bold text-sm sm:text-base tracking-tight whitespace-nowrap hidden sm:inline">
                파란날개
              </span>
            </div>

            {team && org && (
              <Link
                href="/"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold whitespace-nowrap transition-all mr-1',
                  TEAM_STYLES[team].badge,
                  'hover:opacity-70'
                )}
                title="팀 전환"
              >
                <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', TEAM_STYLES[team].dot)} />
                {TEAM_LABELS[team]}
                <ArrowLeftRight size={11} className="opacity-60 ml-0.5" />
              </Link>
            )}

            <div className="w-px h-5 bg-gray-700 mx-1" />
          </div>

          {/* 가운데: 스크롤되는 탭 영역 + 우측 fade */}
          <div className="relative flex-1 min-w-0">
            <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-6 sm:pr-0">
              {allTabs.map(({ href, label, icon: Icon, exact, also }) => {
                const isActive = exact
                  ? pathname === href
                  : pathname.startsWith(href) || (also ? pathname.startsWith(also) : false)
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
            </div>
            {/* 우측 fade — 모바일 전용 (스크롤 가능 시각화) */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-gray-950 to-transparent pointer-events-none sm:hidden" />
          </div>

          {/* 우측: 편집 모드 버튼 (항상 고정) */}
          <div className="pl-2 sm:pl-3 py-3 shrink-0">
            {isEditMode ? (
              <button
                onClick={exitEditMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 border border-blue-500/50 text-blue-400 hover:bg-red-900/30 hover:border-red-500/50 hover:text-red-400 transition-colors"
              >
                <Unlock size={13} />
                <span className="hidden sm:inline">편집 모드</span>
              </button>
            ) : (
              <button
                onClick={openPinModal}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                <Lock size={13} />
                <span className="hidden sm:inline">편집 모드</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
