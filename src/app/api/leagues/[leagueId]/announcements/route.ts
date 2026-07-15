// GET  /api/leagues/[leagueId]/announcements — 공지 목록 (핀 우선 · 최신순)
// POST /api/leagues/[leagueId]/announcements — 공지 생성 (X-League-Pin 필요)
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

const MAX_TITLE = 200
const MAX_BODY = 20_000
const MAX_CREATED_BY = 40

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sb = createClient()
  const { data, error } = await sb
    .from('league_announcements')
    .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
    .eq('league_id', leagueId)
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcements: data ?? [] })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { title?: unknown; body_markdown?: unknown; pinned?: unknown; created_by?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : ''
  const body_markdown = typeof body.body_markdown === 'string' ? body.body_markdown.slice(0, MAX_BODY) : ''
  const pinned = body.pinned === true
  const created_by = typeof body.created_by === 'string' ? body.created_by.trim().slice(0, MAX_CREATED_BY) || null : null

  if (!title) return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })

  const sb = createClient()
  const { data, error } = await sb
    .from('league_announcements')
    .insert({ league_id: leagueId, title, body_markdown, pinned, created_by })
    .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}-announcements`, 'max')
  return NextResponse.json({ announcement: data })
}
