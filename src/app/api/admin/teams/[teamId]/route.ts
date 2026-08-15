import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { logAudit } from '@/lib/audit'

// ⚠️ 이전엔 /api/admin/orgs/[orgSlug] 가 .eq('org_slug', orgSlug) 만으로 PATCH/DELETE 를
// 걸었다. org_slug 는 팀의 유일 키가 아니다 — 파란날개(paranalgae)는 청년부·장년부 두 팀이
// org_slug 를 공유하므로, 그 경로의 DELETE 는 한 팀을 지우려다 두 팀을 동시에 지우는
// 사고를 낼 수 있었다(명단이 서로 다른데 되돌릴 수 없음). 조직=팀 개념이 사라진 지금은
// teams.id 하나로만 대상을 특정한다 — 모호할 여지가 없다.
export async function PATCH(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamId } = await params
  const body = await req.json()
  // id/org_slug/sub_slug 는 URL 이 이미 정한 대상이다 — 바디에 섞여 들어와도 갱신 대상에서 제외
  const { id: _id, org_slug: _orgSlug, sub_slug: _subSlug, ...fields } = body

  const supabase = createClient()
  const { data, error } = await supabase.from('teams').update(fields).eq('id', teamId).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 이 라우트는 edit_pin·is_public 도 바꿀 수 있다(PIN 재발급·공개 전환의 실제 경로).
  // ⚠ 값은 남기지 않는다 — 필드 '이름' 만 남겨야 PIN 원문이 로그로 새지 않는다.
  await logAudit({
    req, action: 'team.update', targetTable: 'teams', targetId: teamId,
    teamId, detail: { fields: Object.keys(fields ?? {}) },
  })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { teamId } = await params
  const supabase = createClient()

  // 이름·슬러그를 미리 읽어둔다 — 팀이 사라지면 로그의 id 만으로는 어느 팀이었는지 모른다.
  const { data: team } = await supabase
    .from('teams').select('id, name, org_slug, sub_slug').eq('id', teamId).maybeSingle()
  if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('teams').delete().eq('id', teamId)
  if (error) {
    await logAudit({
      req, action: 'team.delete', targetTable: 'teams', targetId: teamId, teamId,
      result: 'failure', detail: { name: team.name, slug: `${team.org_slug}/${team.sub_slug}` },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await logAudit({
    req, action: 'team.delete', targetTable: 'teams', targetId: teamId, teamId,
    detail: { name: team.name, slug: `${team.org_slug}/${team.sub_slug}` },
  })
  return NextResponse.json({ ok: true })
}
