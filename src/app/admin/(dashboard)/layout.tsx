import { signOut } from '@/lib/auth'
import { requireCeoSession } from '@/lib/auth/ceo'
import { createClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, LogOut, Medal, UserCog } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Basketball } from '@/components/league/BasketballIcons'

// 대기 중인 접근 요청 개수 — 사이드바 배지용.
// 요청을 남긴 사람은 아무 알림도 못 받고 기다리는 처지라, 콘솔을 열 때마다 눈에 띄어야 한다.
// 조회가 실패해도 콘솔 전체를 막지 않는다 — 배지는 부가 정보다.
async function pendingRequestCount(): Promise<number> {
  try {
    const { count } = await createClient()
      .from('platform_access_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  } catch {
    return 0
  }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireCeoSession()
  if (!session) redirect('/admin/login')

  const pending = await pendingRequestCount()

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-[var(--mm-panel)] border-r border-[var(--mm-rule)] flex flex-col">
        <div className="px-5 py-5 border-b border-[var(--mm-rule)]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[var(--mm-ink)] rounded-lg flex items-center justify-center text-sm">
              <Basketball size={18} className="text-[var(--mm-yellow-strong)]" />
            </div>
            {/* 이 콘솔은 온볼 자체를 운영하는 자리다(CEO). 각 동호회를 운영하는 사람은
                '어드민'이라 부르는데, 그들은 여기가 아니라 자기 팀 화면의 편집 모드로 들어간다.
                둘 다 'Admin' 이라고 쓰면 어느 쪽 권한인지 화면만 보고 알 수 없다. */}
            <div>
              <p className="text-sm font-bold text-[var(--mm-ink)]">온볼 운영</p>
              <p className="text-xs text-[var(--mm-muted)]">플랫폼 콘솔 · CEO</p>
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
          <Link href="/admin/admins" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm cursor-pointer min-h-11">
            <UserCog size={16} />
            <span className="flex-1">공동관리자</span>
            {pending > 0 && (
              <span
                className="text-xs px-1.5 min-w-5 text-center rounded-full bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] font-semibold"
                aria-label={`대기 중 접근 요청 ${pending}건`}
              >
                {pending}
              </span>
            )}
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
