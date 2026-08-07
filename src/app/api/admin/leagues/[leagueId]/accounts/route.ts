// GET /api/admin/leagues/[leagueId]/accounts
//   어드민 대시보드 · 리그 회원 계정 목록 (편집 권한 부여 화면용)
//   인가: NextAuth 어드민 세션 (/api/admin/** 공통 패턴)
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { listLeagueAccounts } from '@/lib/auth/setAccountRole'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { leagueId } = await params
  const { accounts, error } = await listLeagueAccounts(leagueId)
  if (error) return NextResponse.json({ error }, { status: 500 })
  return NextResponse.json({ accounts })
}
