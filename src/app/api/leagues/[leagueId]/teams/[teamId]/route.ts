import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { isDraftManager } from '@/lib/draftManagerAuth'
import { logAudit } from '@/lib/audit'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const { leagueId, teamId } = await params
  // 어드민 세션 또는 X-League-Pin 둘 중 하나면 허용 — 어드민 드래프트 관리
  // 페이지에서 팀명·색상을 인라인 수정할 수 있게 하기 위함.
  if (!await isDraftManager(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()

  // 허용 컬럼만 통과시킨다. 받은 객체를 그대로 update 에 넘기면 요청 하나로 league_id 를
  // 바꿔 팀을 다른 클럽으로 옮길 수 있다(대량 할당). 화면은 name·color 만 보낸다.
  const ALLOWED = new Set(['name', 'color'])
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED.has(k)) patch[k] = v
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 수 있는 항목이 없습니다' }, { status: 400 })
  }

  const supabase = createClient()
  // isDraftManager 는 leagueId 를 인가했을 뿐 teamId 는 URL 로 들어온 값이다 —
  // league_id 로 함께 스코프해 다른 클럽의 팀명·색상이 바뀌는 것을 막는다.
  const { data, error } = await supabase
    .from('league_teams')
    .update(patch)
    .eq('id', teamId)
    .eq('league_id', leagueId)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 이 리그 소속이 아니면 갱신된 행이 없다. 존재 여부를 알려주지 않기 위해 404 로 답한다.
  if (!data) return NextResponse.json({ error: '팀을 찾을 수 없습니다' }, { status: 404 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; teamId: string }> }
) {
  const { leagueId, teamId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // teamId 는 아래 `.or()` 에 문자열로 그대로 들어간다 — PostgREST 필터 문법이라
  //   임의 문자열을 넣으면 필터를 갈아끼울 수 있다. 형식부터 못 박는다.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(teamId)) {
    return NextResponse.json({ error: '팀을 찾을 수 없습니다' }, { status: 404 })
  }
  const supabase = createClient()

  // 경기에 물린 팀은 지우지 않는다 — league_games 의 FK 는 CASCADE 가 아니라 RESTRICT 라
  //   어차피 DB 가 막지만, 그대로 두면 화면에는 23503 원문이 뜬다. 무엇이 막았는지 알려준다.
  //   (친선전 임시팀을 잘못 만들었을 때 지우는 경로가 이 라우트다)
  const { count: usedCount, error: usedError } = await supabase
    .from('league_games')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
  if (usedError) {
    return NextResponse.json({ error: '팀 사용 여부를 확인하지 못했습니다' }, { status: 500 })
  }
  if ((usedCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `이 팀이 배정된 경기가 ${usedCount}개 있습니다. 경기에서 팀을 먼저 바꾼 뒤 삭제하세요.` },
      { status: 409 },
    )
  }

  // canEditLeague 는 leagueId 를 인가했을 뿐 teamId 는 URL 로 들어온 값이다.
  // league_id 를 함께 걸지 않으면 A 리그 권한으로 다른 클럽의 팀이 지워진다.
  // 지워진 행이 있는지는 select 로 확인한다 — 상태코드만 보면 "안 지워졌는데 성공"이 된다.
  const { data: deleted, error } = await supabase
    .from('league_teams')
    .delete()
    .eq('id', teamId)
    .eq('league_id', leagueId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 이 리그 소속이 아니면 지워진 행이 0 이다. 존재 여부를 알려주지 않기 위해 404 로 답한다.
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: '팀을 찾을 수 없습니다' }, { status: 404 })
  }

  await logAudit({
    req, action: 'league_team.delete', targetTable: 'league_teams', targetId: teamId, leagueId,
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ success: true })
}
