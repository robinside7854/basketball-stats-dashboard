// 리그의 모든 분기 팀 override 목록 반환.
// 클라이언트가 여러 분기의 팀 표시를 동시에 그릴 때 사용 (roster 페이지 등).
//
// GET /api/leagues/[id]/team-overrides
//   → Array<{ quarter_id, team_id, name, color }>

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_team_quarter_overrides')
    .select('quarter_id, team_id, name, color')
    .eq('league_id', leagueId)
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/**
 * PUT — 한 분기의 한 팀 이름을 저장한다.
 *   { quarter_id, team_id, name }
 *   name 이 비면 그 분기의 override 를 **지운다** → league_teams.name(기본 이름)으로 돌아간다.
 *
 * 왜 이 창구가 필요한가 (2026-09-17)
 *   미라클은 분기마다 팀을 새로 짜고 이름도 바뀐다(1·2분기 락다운 → 3분기 굿모닝 → 4분기 락다운).
 *   그런데 이 표에 **넣을 화면이 없어서** 3분기 행이 통째로 비어 있었다. 그 결과 3분기 내내
 *   순위표·박스스코어가 옛 이름으로 나왔고, 영상 제목의 `굿모닝` 도 아는 팀이 없어 연동이 끊겼다.
 *   에러는 한 번도 안 났다 — 빈 표는 그냥 "기본 이름"으로 조용히 떨어지기 때문이다.
 *
 * ⚠ 이름을 바꿔도 **과거 경기는 그 분기 이름 그대로 남는다.** 팀 정체성은 (team_id, quarter_id)
 *   로만 푼다(src/lib/stats/teamIdentity.ts). league_teams.name 을 고쳐서 해결하려 들면
 *   1월 경기에 3분기 이름이 붙는다.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { quarter_id?: string; team_id?: string; name?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'request body 파싱 실패' }, { status: 400 }) }

  const quarterId = (body.quarter_id ?? '').trim()
  const teamId = (body.team_id ?? '').trim()
  // 제목·입력에서 온 한글은 NFD(자모 분리형)일 수 있다 — 보이는 건 같은데 저장값이 달라 영영 안 맞는다.
  const name = (body.name ?? '').normalize('NFC').trim()
  if (!quarterId || !teamId) return NextResponse.json({ error: '분기와 팀이 필요합니다' }, { status: 400 })
  if (name.length > 40) return NextResponse.json({ error: '팀 이름이 너무 깁니다' }, { status: 400 })

  const supabase = createClient()

  // 남의 리그 팀·분기에 쓰는 것을 막는다 — id 하나만 믿으면 리그 경계가 뚫린다.
  const [{ data: team }, { data: quarter }] = await Promise.all([
    supabase.from('league_teams').select('id').eq('id', teamId).eq('league_id', leagueId).maybeSingle(),
    supabase.from('league_quarters').select('id').eq('id', quarterId).eq('league_id', leagueId).maybeSingle(),
  ])
  if (!team) return NextResponse.json({ error: '이 리그의 팀이 아닙니다' }, { status: 404 })
  if (!quarter) return NextResponse.json({ error: '이 리그의 분기가 아닙니다' }, { status: 404 })

  if (!name) {
    // 성공 판정은 반환 행 수로 — PostgREST 는 아무것도 못 지워도 204 를 준다.
    const { error } = await supabase
      .from('league_team_quarter_overrides')
      .delete()
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId)
      .eq('team_id', teamId)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidateTag(`league-${leagueId}`, 'max')
    return NextResponse.json({ ok: true, cleared: true })
  }

  // color 는 payload 에 넣지 않는다 — 넣으면 기존 분기 색이 덮인다.
  const { data, error } = await supabase
    .from('league_team_quarter_overrides')
    .upsert(
      { league_id: leagueId, quarter_id: quarterId, team_id: teamId, name, updated_at: new Date().toISOString() },
      { onConflict: 'quarter_id,team_id' },
    )
    .select('quarter_id, team_id, name, color')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json(data)
}
