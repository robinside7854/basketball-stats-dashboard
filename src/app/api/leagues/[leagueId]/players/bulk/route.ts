import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { resolveTeamId } from '@/lib/league/teamScope'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { players } = await req.json()
  if (!Array.isArray(players) || players.length === 0) {
    return NextResponse.json({ error: '선수 목록이 비어 있습니다' }, { status: 400 })
  }

  // team_id 를 채운다 — 대량 등록도 단건 등록(players/route.ts)과 같은 팀 명단으로 들어가야 한다.
  const teamId = await resolveTeamId(leagueId)
  const rows = players
    .filter((p: { name?: string }) => p.name?.trim())
    .map((p: { name: string; number?: number | null; position?: string | null }) => ({
      league_id: leagueId,
      team_id: teamId,
      name: p.name.trim(),
      number: p.number ?? null,
      position: p.position?.trim() || null,
    }))

  if (rows.length === 0) return NextResponse.json({ error: '유효한 선수가 없습니다' }, { status: 400 })

  const supabase = createClient()
  const { data, error } = await supabase.from('league_players').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 })
}

// PATCH { heights: [{ id, height_cm }] } — 키 일괄 입력(2026-11-13, 미라클 후프스 캐릭터용). 빈 값(null)이면 지운다.
//   한 명씩 「선수 정보 수정」을 여는 게 오래 걸려서 명단 화면에서 한 번에 저장한다.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { heights } = await req.json()
  if (!Array.isArray(heights) || heights.length === 0) return NextResponse.json({ error: '바꿀 키가 없습니다' }, { status: 400 })
  const rows: { id: string; h: number | null }[] = []
  for (const r of heights as { id?: unknown; height_cm?: unknown }[]) {
    if (typeof r.id !== 'string') return NextResponse.json({ error: '선수 id 가 없습니다' }, { status: 400 })
    const h = r.height_cm === null || r.height_cm === '' ? null : Math.round(Number(r.height_cm))
    if (h !== null && !(h >= 120 && h <= 230)) return NextResponse.json({ error: '키는 120~230cm 로 넣어 주세요' }, { status: 400 })
    rows.push({ id: r.id, h })
  }
  const teamId = await resolveTeamId(leagueId)
  const supabase = createClient()
  // 같은 팀 명단만 고친다(다른 팀 선수 id 는 조용히 빠진다)
  const results = await Promise.all(rows.map(r =>
    supabase.from('league_players').update({ height_cm: r.h }).eq('id', r.id).eq('team_id', teamId).select('id'),
  ))
  const failed = results.find(x => x.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })
  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ updated: results.reduce((n, x) => n + (x.data?.length ?? 0), 0) })
}
