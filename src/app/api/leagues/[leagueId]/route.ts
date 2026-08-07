import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import { canViewLeague } from '@/lib/auth/guard'

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
      'id, org_slug, name, season_year, start_date, match_day, total_rounds, status, created_at, season_type, games_per_round, youtube_channel, plus_one_age, slug, team_id, mode, rules'
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
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('leagues')
    .update(body)
    .eq('id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(data)
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const supabase = createClient()
  const { error } = await supabase.from('leagues').delete().eq('id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ success: true })
}
