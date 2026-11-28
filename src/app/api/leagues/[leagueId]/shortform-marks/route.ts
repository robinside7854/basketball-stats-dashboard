// 숏폼 후보 장면 (2026-11-24 운영진) — 하이라이트 탭에서 운영진이 클립마다 켜고 끈다.
// 한 장면 = 기록(이벤트) 하나. 숏폼 제작 때 이 표(league_game_marks)를 날짜·경기로 꺼내 쓴다.
import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

type Ctx = { params: Promise<{ leagueId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await createClient().from('league_game_marks')
    .select('league_game_event_id, league_games(date)').eq('league_id', leagueId).not('league_game_event_id', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 담긴 장면마다 경기 날짜를 같이 준다 — 화면은 그 날짜 것만 센다(2026-11-28 운영진)
  const rows = (data ?? []) as unknown as Array<{ league_game_event_id: string; league_games: { date: string | null } | null }>
  return NextResponse.json({
    event_ids: rows.map(r => r.league_game_event_id),
    marks: rows.map(r => ({ event_id: r.league_game_event_id, date: r.league_games?.date ?? null })),
  })
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { event_id?: string; youtube_url?: string }
  if (!body.event_id) return NextResponse.json({ error: 'event_id 필요' }, { status: 400 })
  const sb = createClient()
  const { data: ev } = await sb.from('league_game_events')
    .select('id, quarter, video_timestamp, league_game_id, league_games!inner(league_id)')
    .eq('id', body.event_id).eq('league_games.league_id', leagueId).maybeSingle()
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // 이미 담긴 장면이면 그대로(유일 인덱스가 부분 인덱스라 upsert 의 onConflict 를 못 쓴다)
  const { data: had } = await sb.from('league_game_marks').select('id').eq('league_game_event_id', ev.id).maybeSingle()
  if (had) return NextResponse.json({ ok: true })
  const { error } = await sb.from('league_game_marks').insert({
    league_id: leagueId, league_game_id: ev.league_game_id, league_game_event_id: ev.id,
    quarter: ev.quarter, video_timestamp: ev.video_timestamp,
    youtube_url: typeof body.youtube_url === 'string' ? body.youtube_url.slice(0, 300) : null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const eventId = new URL(req.url).searchParams.get('eventId')
  if (!eventId) return NextResponse.json({ error: 'eventId 필요' }, { status: 400 })
  const { error } = await createClient().from('league_game_marks').delete()
    .eq('league_id', leagueId).eq('league_game_event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
