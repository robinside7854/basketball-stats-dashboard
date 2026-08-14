// DELETE /api/admin/admins/invite/[id]
//   보내둔 초대 링크를 무효화한다. 링크가 잘못된 사람에게 전달됐을 때의 회수 경로다.
//   인가: NextAuth CEO 세션
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { revokeInvite } from '@/lib/auth/platformAdmin'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: '초대 ID가 없습니다' }, { status: 400 })

  try {
    await revokeInvite(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
