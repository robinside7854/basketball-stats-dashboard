// 기록 중 「숏폼으로 만들 장면」 저장 (2026-11-24 운영진).
// 기록원이 기록 패드의 ★ 버튼을 누르면 지금 영상 시각을 남긴다 — 나중에 숏폼 제작 때 꺼내 쓴다.
import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createClient()
  const { data, error } = await sb.from('league_game_marks')
    .select('id, quarter, video_timestamp, youtube_url, note, created_at')
    .eq('league_id', leagueId).eq('league_game_id', gameId).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { quarter?: number; video_timestamp?: number; youtube_url?: string; note?: string }
  const sb = createClient()
  const { data: g } = await sb.from('league_games').select('id').eq('id', gameId).eq('league_id', leagueId).maybeSingle()
  if (!g) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data, error } = await sb.from('league_game_marks').insert({
    league_id: leagueId, league_game_id: gameId,
    quarter: typeof body.quarter === 'number' ? body.quarter : null,
    video_timestamp: typeof body.video_timestamp === 'number' ? body.video_timestamp : null,
    youtube_url: typeof body.youtube_url === 'string' ? body.youtube_url.slice(0, 300) : null,
    note: typeof body.note === 'string' ? body.note.slice(0, 200) : null,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
  const sb = createClient()
  const { error } = await sb.from('league_game_marks').delete().eq('id', id).eq('league_id', leagueId).eq('league_game_id', gameId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
