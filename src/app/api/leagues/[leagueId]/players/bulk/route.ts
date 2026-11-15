import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { cleanProfile } from '@/lib/game/profile'

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

// PUT { profiles: [{ id, height_cm?, appearance? }] } — 후프스 게임 설정 화면(settings/hoops) 저장(2026-11-16).
//   appearance = 외모·체형·스피드·운동능력(lib/game/profile.ts 표에 있는 값만 남긴다). 보낸 칸만 바꾼다.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { profiles } = await req.json()
  if (!Array.isArray(profiles) || profiles.length === 0) return NextResponse.json({ error: '바꿀 선수가 없습니다' }, { status: 400 })
  const rows: { id: string; patch: Record<string, unknown> }[] = []
  for (const r of profiles as { id?: unknown; height_cm?: unknown; appearance?: unknown }[]) {
    if (typeof r.id !== 'string') return NextResponse.json({ error: '선수 id 가 없습니다' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (r.height_cm !== undefined) {
      const h = r.height_cm === null || r.height_cm === '' ? null : Math.round(Number(r.height_cm))
      if (h !== null && !(h >= 120 && h <= 230)) return NextResponse.json({ error: '키는 120~230cm 로 넣어 주세요' }, { status: 400 })
      patch.height_cm = h
    }
    if (r.appearance !== undefined) patch.appearance = cleanProfile(r.appearance)
    if (Object.keys(patch).length) rows.push({ id: r.id, patch })
  }
  const teamId = await resolveTeamId(leagueId)
  const supabase = createClient()
  const results = await Promise.all(rows.map(r =>
    supabase.from('league_players').update(r.patch).eq('id', r.id).eq('team_id', teamId).select('id'),
  ))
  const failed = results.find(x => x.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })
  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ updated: results.reduce((n, x) => n + (x.data?.length ?? 0), 0) })
}
