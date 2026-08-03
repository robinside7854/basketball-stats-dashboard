import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_game_events')
    .select('*')
    .eq('league_game_id', gameId)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_game_events')
    .insert({
      league_game_id: body.league_game_id,
      quarter: body.quarter,
      video_timestamp: body.video_timestamp ?? null,
      type: body.type,
      league_player_id: body.league_player_id ?? null,
      team_id: body.team_id ?? null,
      result: body.result ?? null,
      related_player_id: body.related_player_id ?? null,
      points: body.points ?? 0,
      shot_zone: body.shot_zone ?? null,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')
  // 하이라이트 캐시 무효화 — 새 성공 슛 이벤트가 즉시 하이라이트에 반영되도록
  revalidateTag(`league-${leagueId}-events`, 'max')

  return NextResponse.json(data, { status: 201 })
}
