import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague, isLeaguePublic } from '@/lib/auth/guard'
import { logAudit } from '@/lib/audit'

// GET /api/leagues/[leagueId]/visibility
// 설정 화면이 현재 공개/비공개 상태를 표시하기 위해 조회한다.
// canViewLeague 로만 게이트한다(canEditLeague 아님) — 설정 페이지는 PIN 입력 전에도
// 마운트 시점에 이 값을 fetch 하는데, 그때는 아직 leagueHeaders 에 PIN 이 실리지 않는다.
// 어차피 이 페이지에 도달했다는 것 자체가 canViewLeague 를 통과했다는 뜻이라 추가 노출은 없다.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canViewLeague(req, leagueId)) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  return NextResponse.json({ is_public: await isLeaguePublic(leagueId) })
}

// PATCH /api/leagues/[leagueId]/visibility
// body: { is_public: boolean }
//
// 공개 여부는 팀에 저장된다(리그는 팀에 매달려 있다). 이 리그가 속한 팀을 찾아 바꾼다.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  if (typeof body.is_public !== 'boolean') {
    return NextResponse.json({ error: 'is_public 은 true/false 여야 합니다' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: league, error: lErr } = await supabase
    .from('leagues').select('team_id').eq('id', leagueId).maybeSingle()
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  if (!league?.team_id) {
    return NextResponse.json({ error: '이 시즌에 연결된 팀이 없습니다' }, { status: 400 })
  }

  const { error } = await supabase
    .from('teams').update({ is_public: body.is_public }).eq('id', league.team_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 공개 전환은 팀 전체(모든 리그·대회)의 노출을 한 번에 바꾼다 — 되돌릴 수는 있지만
  // 그 사이 공개된 사실은 되돌릴 수 없다.
  await logAudit({
    req, action: 'league.visibility.update', targetTable: 'teams', targetId: league.team_id,
    leagueId, teamId: league.team_id, detail: { is_public: body.is_public },
  })

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ is_public: body.is_public })
}
