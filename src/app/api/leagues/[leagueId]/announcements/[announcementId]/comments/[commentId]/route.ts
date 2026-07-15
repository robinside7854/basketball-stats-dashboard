// PATCH  /api/leagues/[leagueId]/announcements/[announcementId]/comments/[commentId] — 본인 수정 (비번)
// DELETE /api/leagues/[leagueId]/announcements/[announcementId]/comments/[commentId] — 본인(비번) 또는 어드민(PIN) 삭제
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyPassword, isValidPassword } from '@/lib/announcements/commentAuth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

async function fetchComment(commentId: string, announcementId: string) {
  const sb = createClient()
  const { data } = await sb
    .from('league_announcement_comments')
    .select('id, announcement_id, nickname, body, password_salt, password_hash, deleted_at')
    .eq('id', commentId)
    .eq('announcement_id', announcementId)
    .maybeSingle()
  return data as { id: string; announcement_id: string; nickname: string; body: string; password_salt: string; password_hash: string; deleted_at: string | null } | null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; announcementId: string; commentId: string }> },
) {
  const { announcementId, commentId } = await params
  let body: { body?: unknown; password?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const newBody = typeof body.body === 'string' ? body.body.trim().slice(0, 500) : ''
  if (!newBody) return NextResponse.json({ error: '댓글 내용을 입력하세요' }, { status: 400 })
  if (!isValidPassword(body.password)) {
    return NextResponse.json({ error: '비밀번호는 숫자 4자리' }, { status: 400 })
  }

  const c = await fetchComment(commentId, announcementId)
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (c.deleted_at) return NextResponse.json({ error: '삭제된 댓글' }, { status: 400 })
  if (!verifyPassword(body.password as string, c.password_salt, c.password_hash)) {
    return NextResponse.json({ error: '비밀번호가 다릅니다' }, { status: 403 })
  }

  const sb = createClient()
  const { data, error } = await sb
    .from('league_announcement_comments')
    .update({ body: newBody, updated_at: new Date().toISOString() })
    .eq('id', commentId)
    .select('id, nickname, body, created_at, updated_at, deleted_at, deleted_by_admin')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comment: data })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; announcementId: string; commentId: string }> },
) {
  const { leagueId, announcementId, commentId } = await params

  // 어드민(리그 PIN) 삭제인지 우선 확인 (헤더로 PIN 옴)
  const isAdmin = await verifyLeaguePin(req, leagueId)
  let usedPassword: string | null = null
  if (!isAdmin) {
    // 본인 삭제: body 에 password
    let body: { password?: unknown } = {}
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
    if (!isValidPassword(body.password)) {
      return NextResponse.json({ error: '비밀번호는 숫자 4자리' }, { status: 400 })
    }
    usedPassword = body.password as string
  }

  const c = await fetchComment(commentId, announcementId)
  if (!c) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (c.deleted_at) return NextResponse.json({ error: '이미 삭제된 댓글' }, { status: 400 })

  if (!isAdmin) {
    if (!verifyPassword(usedPassword!, c.password_salt, c.password_hash)) {
      return NextResponse.json({ error: '비밀번호가 다릅니다' }, { status: 403 })
    }
  }

  const sb = createClient()
  const { error } = await sb
    .from('league_announcement_comments')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by_admin: isAdmin,
    })
    .eq('id', commentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted_by_admin: isAdmin })
}
