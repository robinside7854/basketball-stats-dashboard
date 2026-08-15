import { signOut } from '@/lib/auth'
import { requireCeoSession } from '@/lib/auth/ceo'
import { createClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Toaster } from '@/components/ui/sonner'
import AdminShell from './AdminShell'

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

  // 셸(사이드바·드로어)은 열림 상태를 다뤄야 해서 클라이언트 컴포넌트로 분리했다.
  // 인증과 배지 조회는 여기(서버)에 남긴다 — 클라이언트로 내리면 세션 확인이 뚫린다.
  return (
    <>
      <AdminShell
        pending={pending}
        signOutAction={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}
      >
        {children}
      </AdminShell>
      <Toaster richColors theme="dark" />
    </>
  )
}
