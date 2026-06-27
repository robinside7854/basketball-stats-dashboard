// 어드민 — 드래프트 공유 토큰 발급/재발급/해제
//
// POST   : 토큰 신규 발급 (또는 재발급 — 기존 토큰 폐기). 어드민 전용.
// DELETE : 토큰 폐기 — 기존 공유 링크 무효화.

import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { isDraftManager } from '@/lib/draftManagerAuth'

function newToken(): string {
  return randomBytes(12).toString('base64url') // 16자, URL-safe
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!await isDraftManager(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createClient()
  const token = newToken()
  const { data, error } = await supabase
    .from('league_drafts')
    .update({ share_token: token })
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .select('id, share_token')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ share_token: data.share_token, draft_id: data.id })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!await isDraftManager(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createClient()
  const { error } = await supabase
    .from('league_drafts')
    .update({ share_token: null })
    .eq('id', draftId)
    .eq('league_id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
