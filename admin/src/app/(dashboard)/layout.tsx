import Link from 'next/link'
import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { LayoutDashboard, Users, LogOut } from 'lucide-react'

const NAV = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  { href: '/orgs', label: 'Org 관리', icon: Users },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen">
      {/* 사이드바 */}
      <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏀</span>
            <div>
              <p className="text-sm font-bold text-white leading-tight">Stats Admin</p>
              <p className="text-xs text-gray-500">관리자 콘솔</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <Icon size={15} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-gray-800">
          <p className="text-xs text-gray-600 px-3 mb-2 truncate">{session.user?.email}</p>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <button
              type="submit"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors w-full"
            >
              <LogOut size={15} />
              로그아웃
            </button>
          </form>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 overflow-auto bg-gray-950">
        <div className="max-w-5xl mx-auto p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
