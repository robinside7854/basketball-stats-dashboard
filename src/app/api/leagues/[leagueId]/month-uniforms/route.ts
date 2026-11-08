// 그 달 팀 유니폼 색 (마이그레이션 121, 2026-11-08 운영진)
//   GET  ?month=YYYY-MM-01           → [{ team_id, uniform }]
//   PUT  { month, team_id, uniform } → 저장(운영진). 이번 달이면 선수 프로필 사진을 바로 그 색으로 맞춘다.
//   PUT  { month, team_id, uniform: null } → 그 달 지정 지우기(기본 노랑으로)
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'
import { monthOf } from '@/lib/league/monthlyRoster'
import { applyMonthlyPhotos, isUniform, todayKst } from '@/lib/league/uniformPhoto'

type Ctx = { params: Promise<{ leagueId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const month = monthOf(new URL(req.url).searchParams.get('month'))
  if (!month) return NextResponse.json({ error: 'month 필수' }, { status: 400 })
  const { data, error } = await createClient().from('league_team_month_uniforms')
    .select('team_id, uniform').eq('league_id', leagueId).eq('month', month)
  if (error) return NextResponse.json([])  // 표가 아직 없을 때도 화면은 열린다
  return NextResponse.json(data ?? [])
}

export async function PUT(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json() as { month?: string; team_id?: string; uniform?: string | null }
  const month = monthOf(body.month)
  if (!month || !body.team_id) return NextResponse.json({ error: 'month · team_id 필수' }, { status: 400 })
  const sb = createClient()
  if (body.uniform == null) {
    const { error } = await sb.from('league_team_month_uniforms').delete()
      .eq('league_id', leagueId).eq('month', month).eq('team_id', body.team_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (!isUniform(body.uniform)) return NextResponse.json({ error: 'uniform 은 yellow·white·black' }, { status: 400 })
    const { error } = await sb.from('league_team_month_uniforms').upsert({
      league_id: leagueId, month, team_id: body.team_id, uniform: body.uniform, updated_at: new Date().toISOString(),
    }, { onConflict: 'league_id,month,team_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  let applied = null
  if (month === monthOf(todayKst())) {
    applied = await applyMonthlyPhotos(sb, leagueId)
    revalidateTag(`league-${leagueId}`, 'max')
  }
  return NextResponse.json({ ok: true, applied })
}
