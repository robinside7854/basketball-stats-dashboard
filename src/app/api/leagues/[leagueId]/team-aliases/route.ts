// 영상 제목의 팀 표기 ↔ 팀 (league_team_aliases)
//
// 자동 매핑은 **사람이 등록한 별칭만** 인정한다. 유사도로 추측해서 붙이면 그럴듯하게 틀린
// 자리에 조용히 들어간다(2026-08-22 사고). 그래서 못 찾았을 때의 조치가 "여기에 등록"이고,
// 그 등록 창구가 이 라우트다. 판정 정본은 src/lib/youtube/teamNameIndex.ts.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { revalidateTag } from 'next/cache'

type Ctx = { params: Promise<{ leagueId: string }> }

// GET — 이 리그의 별칭 전부 (팀 이름과 함께)
export async function GET(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_team_aliases')
    .select('id, alias, team_id, league_teams(name)')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data ?? []).map(r => {
      const rel = (r as { league_teams?: { name?: string } | Array<{ name?: string }> }).league_teams
      const teamName = Array.isArray(rel) ? rel[0]?.name : rel?.name
      return { id: r.id, alias: r.alias, team_id: r.team_id, team_name: teamName ?? '(삭제된 팀)' }
    }),
  )
}

// POST { team_id, alias }
export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { team_id?: string; alias?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'request body 파싱 실패' }, { status: 400 }) }

  // 제목에서 온 문자열은 NFD(자모 분리형)일 수 있다 — 화면에는 똑같이 보이는데 저장값이
  //   달라 영영 안 맞는다. 저장 전에 NFC 로 굳힌다.
  const alias = (body.alias ?? '').normalize('NFC').trim()
  const teamId = (body.team_id ?? '').trim()
  if (!alias || !teamId) return NextResponse.json({ error: '팀과 별칭을 모두 입력하세요' }, { status: 400 })
  if (alias.length > 40) return NextResponse.json({ error: '별칭이 너무 깁니다' }, { status: 400 })

  const supabase = createClient()

  // 남의 리그 팀에 별칭을 다는 것을 막는다 — id 하나만 믿으면 리그 경계가 뚫린다.
  const { data: team } = await supabase
    .from('league_teams')
    .select('id')
    .eq('id', teamId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!team) return NextResponse.json({ error: '이 리그의 팀이 아닙니다' }, { status: 404 })

  const { data, error } = await supabase
    .from('league_team_aliases')
    .insert({ league_id: leagueId, team_id: teamId, alias })
    .select('id, alias, team_id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `'${alias}' 는 이미 등록된 별칭입니다` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json(data)
}

// DELETE ?id=
export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 가 필요합니다' }, { status: 400 })

  const supabase = createClient()
  // 성공 판정은 반환 행 수로 — PostgREST 는 아무것도 못 지워도 204 를 준다.
  const { data: removed, error } = await supabase
    .from('league_team_aliases')
    .delete()
    .eq('id', id)
    .eq('league_id', leagueId)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!removed || removed.length === 0) return NextResponse.json({ error: '그 별칭이 없습니다' }, { status: 404 })

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ success: true })
}
