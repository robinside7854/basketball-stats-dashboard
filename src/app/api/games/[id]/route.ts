import { createClient } from '@/lib/supabase/client'
import { createServerClient } from '@/lib/supabase/server'
// GET uses anon client (read-only), PUT/DELETE use server client (bypasses RLS)
import { NextResponse } from 'next/server'
import { resolveTeamIdForGame, verifyTeamPinForTeam } from '@/lib/teamPinAuth'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient()
  const { data, error } = await supabase.from('games').select('*, tournament:tournaments(*)').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGame(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServerClient()
  const body = await req.json()
  // is_complete 업데이트는 스키마 캐시 우회를 위해 RPC 사용
  if ('is_complete' in body) {
    const { error: rpcError } = await supabase.rpc('set_game_complete', {
      game_id: id,
      complete: body.is_complete,
    })
    if (rpcError) {
      console.error('[PUT /api/games/[id]] RPC error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }
  }

  // 나머지 필드 업데이트 (is_complete 제외)
  // tournament_id 는 받지 않는다 — 경기의 소유 팀이 대회를 통해 결정되므로, body 로 바꾸게 두면
  // 자기 PIN 으로 경기를 남의 팀 대회로 옮길 수 있다 (가드는 수정 전 소유 팀만 대조한다).
  const { is_complete: _ic, tournament_id: _tid, ...rest } = body
  if (Object.keys(rest).length > 0) {
    const { error } = await supabase.from('games').update(rest).eq('id', id)
    if (error) {
      console.error('[PUT /api/games/[id]] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { data, error: fetchError } = await supabase.from('games').select('*, tournament:tournaments(*)').eq('id', id).single()
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGame(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
