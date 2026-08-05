import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Building2, LogOut, Trophy, Medal } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Basketball } from '@/components/league/BasketballIcons'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/admin/login')

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[var(--mm-panel)] border-r border-[var(--mm-rule)] flex flex-col">
        <div className="px-5 py-5 border-b border-[var(--mm-rule)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[var(--mm-ink)] rounded-lg flex items-center justify-center text-sm">
              <Basketball size={18} className="text-[var(--mm-yellow-strong)]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[var(--mm-ink)]">Admin</p>
              <p className="text-xs text-[var(--mm-muted)]">Stats Manager</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3">
          <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm cursor-pointer">
            <LayoutDashboard size={16} />
            대시보드
          </Link>

          {/* 조직 섹션 — 팀(명단·회원의 주인)을 만들고 관리하는 곳.
              예전엔 "토너먼트" 섹션이었지만 Org 관리는 대회 종류와 무관하게
              팀 자체를 다루므로 이름이 맞지 않았다. */}
          <div className="mt-4 mb-1 px-3">
            <p className="text-xs font-semibold text-[var(--mm-muted)] uppercase tracking-wider">조직</p>
          </div>
          <Link href="/admin/orgs" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm cursor-pointer">
            <Building2 size={16} />
            Org 관리
          </Link>

          {/* 운영 섹션 — 목록의 단위가 리그가 아니라 팀이 됐다. 한 팀이 리그와 대회를
              동시에 굴리므로 "리그 관리"라는 이름은 실제로 보여주는 것과 어긋난다. */}
          <div className="mt-4 mb-1 px-3">
            <p className="text-xs font-semibold text-[var(--mm-muted)] uppercase tracking-wider">운영</p>
          </div>
          <Link href="/admin/leagues" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm cursor-pointer">
            <Medal size={16} />
            팀 관리
          </Link>
        </nav>

        <div className="p-3 border-t border-[var(--mm-rule)]">
          <form action={async () => {
            'use server'
            await signOut({ redirectTo: '/admin/login' })
          }}>
            <button type="submit" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-negative)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm w-full cursor-pointer">
              <LogOut size={16} />
              로그아웃
            </button>
          </form>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto">
        {children}
      </main>
      <Toaster richColors theme="dark" />
    </div>
  )
}
