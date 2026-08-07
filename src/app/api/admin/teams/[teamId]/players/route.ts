import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'

// 이전 /api/admin/orgs/[orgSlug]/players 는 org_slug 로 팀을 찾아 명단을 모았다 —
// 파란날개처럼 org_slug 를 공유하는 팀이 둘이면 서로 다른 두 팀의 선수가 한 목록에
// 섞여 나왔다(청년부 화면에 장년부 선수가 뜨는 식). teamId 는 유일 키라 이 문제가 없다.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamId } = await params
  const supabase = createClient()

  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, number, position, team_type')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(players ?? [])
}
