// PATCH /api/admin/leagues/[leagueId]/accounts/[accountId]
//   body: { role: 'admin' | 'member' }
//   어드민 대시보드 · 리그 회원에게 편집 권한 부여/회수
//   인가: NextAuth 어드민 세션 (/api/admin/** 공통 패턴)
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { setAccountRole, type AccountRole } from '@/lib/auth/setAccountRole'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; accountId: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId, accountId } = await params
  let body: { role?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const role = body.role
  if (role !== 'admin' && role !== 'member') {
    return NextResponse.json({ error: "role 은 'admin' 또는 'member' 여야 합니다" }, { status: 400 })
  }

  const result = await setAccountRole(leagueId, accountId, role as AccountRole)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, account: result.account })
}
