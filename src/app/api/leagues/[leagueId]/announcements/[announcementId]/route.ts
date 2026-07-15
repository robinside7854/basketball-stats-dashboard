// PATCH  /api/leagues/[leagueId]/announcements/[announcementId] — 공지 수정 (PIN 필요)
// DELETE /api/leagues/[leagueId]/announcements/[announcementId] — 공지 삭제 (PIN 필요)
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

const MAX_TITLE = 200
const MAX_BODY = 20_000
const MAX_CREATED_BY = 40

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; announcementId: string }> },
) {
  const { leagueId, announcementId } = await params
  if (!(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { title?: unknown; body_markdown?: unknown; pinned?: unknown; created_by?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string') {
    const t = body.title.trim().slice(0, MAX_TITLE)
    if (!t) return NextResponse.json({ error: '제목은 비워둘 수 없습니다' }, { status: 400 })
    patch.title = t
  }
  if (typeof body.body_markdown === 'string') patch.body_markdown = body.body_markdown.slice(0, MAX_BODY)
  if (typeof body.pinned === 'boolean') patch.pinned = body.pinned
  if (typeof body.created_by === 'string') patch.created_by = body.created_by.trim().slice(0, MAX_CREATED_BY) || null
  patch.updated_at = new Date().toISOString()

  if (Object.keys(patch).length === 1) {   // updated_at 만 남아있으면 실질 변경 없음
    return NextResponse.json({ error: 'no changes' }, { status: 400 })
  }

  const sb = createClient()
  const { data, error } = await sb
    .from('league_announcements')
    .update(patch)
    .eq('id', announcementId)
    .eq('league_id', leagueId)
    .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}-announcements`, 'max')
  return NextResponse.json({ announcement: data })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; announcementId: string }> },
) {
  const { leagueId, announcementId } = await params
  if (!(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createClient()
  const { error } = await sb
    .from('league_announcements')
    .delete()
    .eq('id', announcementId)
    .eq('league_id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}-announcements`, 'max')
  return NextResponse.json({ ok: true })
}
