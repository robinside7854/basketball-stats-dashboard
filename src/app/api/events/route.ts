import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveTeamIdForGame, verifyTeamPinForTeam } from '@/lib/teamPinAuth'
import { logAudit } from '@/lib/audit'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const { data, error } = await supabase
    .from('game_events')
    .select('*, player:players!game_events_player_id_fkey(*), related_player:players!game_events_related_player_id_fkey(*)')
    .eq('game_id', gameId)
    .order('quarter', { ascending: true })
    .order('video_timestamp', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const teamId = await resolveTeamIdForGame(gameId)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  // 몇 건이 사라졌는지를 함께 남긴다 — "초기화했다" 보다 "이벤트 147건이 사라졌다" 가
  // 사후 조사에서 훨씬 유용하다. 대회 스탯은 이 이벤트 재집계로만 만들어진다.
  // (2026-08-07·08-22 두 번의 기록 유실은 이 라우트에 흔적이 없어 지문 추적으로 찾아야 했다)
  const { data: removed, error } = await supabase
    .from('game_events')
    .delete()
    .eq('game_id', gameId)
    .select('id')
  if (error) {
    await logAudit({
      req, action: 'game.records.clear', targetTable: 'game_events', targetId: gameId,
      teamId, result: 'failure',
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const deleted = removed?.length ?? 0
  await logAudit({
    req, action: 'game.records.clear', targetTable: 'game_events', targetId: gameId,
    teamId, detail: { deletedEvents: deleted },
  })
  return NextResponse.json({ success: true, deleted })
}

export async function POST(req: Request) {
  const body = await req.json()
  const teamId = await resolveTeamIdForGame(body.game_id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()

  // 득점 이벤트 points 자동 설정
  let points = 0
  if (body.result === 'made') {
    if (body.type === 'shot_3p') points = 3
    else if (['shot_2p_mid', 'shot_layup', 'shot_post'].includes(body.type)) points = 2
    else if (body.type === 'free_throw') points = 1
  }
  if (body.type === 'opp_score') points = body.points || 2

  const { data, error } = await supabase
    .from('game_events')
    .insert({ ...body, points })
    .select('*, player:players!game_events_player_id_fkey(*), related_player:players!game_events_related_player_id_fkey(*)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
