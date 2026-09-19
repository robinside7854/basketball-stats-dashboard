import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { getTeamId } from '@/lib/supabase/get-team-id'
import { verifyTeamPinForTeam } from '@/lib/teamPinAuth'
import { normalizeTournamentName } from '@/lib/tournament/name'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const team = searchParams.get('team')   // 'youth' | 'senior'
  const org  = searchParams.get('org') ?? 'paranalgae'
  let query = supabase.from('tournaments').select('*').order('year', { ascending: false })
  if (team) {
    const teamId = await getTeamId(org, team)
    if (!teamId) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    query = query.eq('team_id', teamId)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const team = searchParams.get('team')
  const org  = searchParams.get('org') ?? 'paranalgae'
  const body = await req.json()
  if (team && !body.team_id) {
    const teamId = await getTeamId(org, team)
    if (!teamId) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    body.team_id = teamId
  }
  if (!(await verifyTeamPinForTeam(req, body.team_id ?? null))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // ── 중복 방어(findOrCreate) ─────────────────────────────────────────────
  //   DB 에 UNIQUE 제약이 없고 YouTube 일괄 가져오기가 매번 새로 만들던 탓에, 운영 DB 에
  //   「2026 바다배」가 두 개 생겼다. 같은 팀 + 같은 연도 + **정규화한 이름이 같으면**
  //   새로 만들지 않고 그 행을 그대로 돌려준다.
  //   ⚠ 정규화 함수는 youtube/import 의 자동 매칭과 **같은 것**을 쓴다. 두 벌로 갈라지면
  //     "한쪽은 같은 대회로 보고 한쪽은 새로 만드는" 상태가 되어 이 버그가 되살아난다.
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const year = Number(body.year)
  if (body.team_id && name && Number.isFinite(year)) {
    const { data: siblings } = await supabase
      .from('tournaments')
      .select('*')
      .eq('team_id', body.team_id)
      .eq('year', year)
    const norm = normalizeTournamentName(name)
    const dup = (siblings ?? []).find(t => normalizeTournamentName(t.name as string) === norm)
    if (dup) return NextResponse.json(dup, { status: 200 })
  }

  const { data, error } = await supabase.from('tournaments').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
