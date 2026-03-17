'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, PenLine, ClipboardList, BarChart3, Users, Trophy, ScrollText } from 'lucide-react'

const tabs = [
  { href: '/',            label: '홈',        icon: Home,          exact: true },
  { href: '/record',      label: '경기 기록',  icon: PenLine,       exact: false },
  { href: '/boxscore',    label: '박스스코어', icon: ClipboardList, exact: false },
  { href: '/gamelog',     label: '게임 로그',  icon: ScrollText,    exact: false },
  { href: '/stats',       label: '시즌 통계',  icon: BarChart3,     exact: false },
  { href: '/roster',      label: '선수 명단',  icon: Users,         exact: false },
  { href: '/tournaments', label: '대회 관리',  icon: Trophy,        exact: false },
]

export default function TabNav() {
  const pathname = usePathname()
  return (
    <nav className="bg-gray-950 border-b border-blue-900/40 sticky top-0 z-50 shadow-md">
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
        </div>
      </div>
    </nav>
  )
}
