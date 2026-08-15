import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { requireCeoSession } from '@/lib/auth/ceo'
import { canViewLeague } from '@/lib/auth/guard'
import { logAudit } from '@/lib/audit'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()
  // select('*') 금지 — edit_pin 은 이 공개 응답에 실으면 안 된다(전용 GET .../edit-pin 으로 분리).
  const { data, error } = await supabase
    .from('leagues')
    .select(
      'id, org_slug, name, season_year, start_date, match_day, total_rounds, status, created_at, season_type, games_per_round, youtube_channel, plus_one_age, slug, team_id, mode, rules, default_start_time, default_place, default_capacity'
    )
    .eq('id', leagueId)
    .maybeSingle()
  // 쿼리 자체가 실패한 경우(장애)와 행이 없는 경우(없음)를 구분한다. DB 원문 메시지는 노출하지 않는다.
  if (error) return NextResponse.json({ error: '리그 조회 실패' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const body = await req.json()

  // 허용 컬럼만 통과시킨다. 받은 객체를 그대로 update 에 넘기면 요청 하나로 edit_pin·slug·
  // team_id 같은 걸 바꿀 수 있다(대량 할당). 화면이 그런 요청을 안 보낼 뿐, 막혀 있진 않았다.
  const ALLOWED = new Set([
    'name', 'season_year', 'start_date', 'match_day', 'total_rounds', 'status',
    'season_type', 'games_per_round', 'youtube_channel', 'plus_one_age', 'rules',
    'default_start_time', 'default_place', 'default_capacity',
  ])
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED.has(k)) patch[k] = v
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 수 있는 항목이 없습니다' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('leagues')
    .update(patch)
    .eq('id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 시즌 설정 변경은 삭제만큼 눈에 띄지 않지만 rules/status 를 바꾸면 스탯 해석이 통째로
  // 달라진다 — 값이 아니라 "어떤 항목을 건드렸나" 를 남긴다.
  await logAudit({
    req, action: 'league.update', targetTable: 'leagues', targetId: leagueId,
    leagueId, detail: { fields: Object.keys(patch) },
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const supabase = createClient()
  // 지우기 전에 이름을 확보한다 — 삭제 후에는 id 밖에 남지 않아 로그만 봐서는
  // 어느 리그였는지 알 수 없다(감사 로그에 FK 를 걸지 않는 이유와 같은 맥락).
  const { data: before } = await supabase.from('leagues').select('name').eq('id', leagueId).maybeSingle()
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId)
  if (error) {
    await logAudit({
      req, action: 'league.delete', targetTable: 'leagues', targetId: leagueId,
      leagueId, result: 'failure', detail: { name: before?.name ?? null },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await logAudit({
    req, action: 'league.delete', targetTable: 'leagues', targetId: leagueId,
    leagueId, detail: { name: before?.name ?? null },
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ success: true })
}
