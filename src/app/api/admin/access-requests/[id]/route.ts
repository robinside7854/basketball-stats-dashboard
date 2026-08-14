// PATCH /api/admin/access-requests/[id]   body: { status: 'rejected' }
//   접근 요청 거절. 인가: NextAuth CEO 세션
//
// 'invited' 로의 전환은 여기서 받지 않는다 — 초대는 POST /api/admin/admins/invite 가
// 초대 행 생성과 함께 원자적으로 처리한다. 여기서도 status 를 'invited' 로 바꿀 수 있게 하면
// 실제 초대 없이 '초대함' 상태만 찍히는 경로가 생긴다.
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { createClient } from '@/lib/supabase/admin'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: { status?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  if (body.status !== 'rejected') {
    return NextResponse.json({ error: "status 는 'rejected' 만 가능합니다" }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('platform_access_requests')
    .update({
      status: 'rejected',
      handled_at: new Date().toISOString(),
      handled_by: session.user?.email ?? null,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // PostgREST 는 조건에 맞는 행이 없어도 성공을 준다 — 행 수로 판정해야 조용한 실패를 잡는다.
  if (!data || data.length === 0) {
    return NextResponse.json({ error: '이미 처리되었거나 없는 요청입니다' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
