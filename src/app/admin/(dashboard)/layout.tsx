import { auth, signOut } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, LogOut, Medal } from 'lucide-react'
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

          {/* 조직(org)과 팀은 더 이상 구분되지 않는다 — 팀이 최상위 단위이고 그 아래
              리그·대회가 있을 뿐이다 (2026-08-06). 예전엔 "조직" 섹션(Org 관리)과
              "운영" 섹션(팀 관리)이 나뉘어 있었지만, 이제 실제로 가리키는 대상이
              하나(팀)라 섹션을 나눌 근거가 없다 — 링크 하나로 합친다. */}
          <div className="mt-4 mb-1 px-3">
            <p className="text-xs font-semibold text-[var(--mm-muted)] uppercase tracking-wider">관리</p>
          </div>
          <Link href="/admin/leagues" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm cursor-pointer min-h-11">
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
