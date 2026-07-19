import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifyTeamPin } from '@/lib/teamPinAuth'
import { LABEL_MAX_LEN } from '@/types/coachPin'

type TeamPinRow = {
  id: string
  game_id: string
  video_timestamp: number
  label: string
  created_at: string
  game: { id: string; date: string; opponent: string; youtube_url: string | null } | null
}

const PAGE = 1000

// 팀 전체 핀 페이지네이션 조회 (Supabase 1000행 캡 대비) — created_at desc 순서 유지.
async function fetchAllTeamPins(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamPinRow[] | null> {
  const rows: TeamPinRow[] = []
  for (let pg = 0; ; pg++) {
    const { data: chunk, error } = await supabase
      .from('coach_pins')
      .select('id, game_id, video_timestamp, label, created_at, game:games(id, date, opponent, youtube_url)')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (error) return null
    if (chunk && chunk.length > 0) rows.push(...(chunk as unknown as TeamPinRow[]))
    if (!chunk || chunk.length < PAGE) break
  }
  return rows
}

// GET /api/pins?gameId=xxx            → 해당 경기 핀 (시간순)
// GET /api/pins?org=xxx&team=youth    → 팀 전체 핀 + 경기 정보 (모아보기)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  const org = searchParams.get('org')
  const team = searchParams.get('team')
  const supabase = createClient()

  if (gameId) {
    const { data, error } = await supabase
      .from('coach_pins')
      .select('id, game_id, video_timestamp, label, created_at')
      .eq('game_id', gameId)
      .order('video_timestamp', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (org && team) {
    const { data: teamRow } = await supabase
      .from('teams').select('id').eq('org_slug', org).eq('sub_slug', team).maybeSingle()
    if (!teamRow) return NextResponse.json([])
    const data = await fetchAllTeamPins(supabase, teamRow.id)
    if (data === null) return NextResponse.json({ error: '핀 조회에 실패했습니다' }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'gameId 또는 org+team 이 필요합니다' }, { status: 400 })
}

// POST /api/pins  { org, team, gameId, videoTimestamp, label }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const { org, team, gameId, videoTimestamp, label } = body
  if (!org || !team || !gameId) {
    return NextResponse.json({ error: 'org, team, gameId 는 필수입니다' }, { status: 400 })
  }

  const teamId = await verifyTeamPin(req, org, team)
  if (!teamId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ts = Number(videoTimestamp)
  if (!Number.isFinite(ts) || ts < 0) {
    return NextResponse.json({ error: 'videoTimestamp 가 올바르지 않습니다' }, { status: 400 })
  }
  const trimmed = String(label ?? '').trim()
  if (trimmed.length < 1 || trimmed.length > LABEL_MAX_LEN) {
    return NextResponse.json({ error: `라벨은 1~${LABEL_MAX_LEN}자여야 합니다` }, { status: 400 })
  }

  const supabase = createClient()

  // 이 경기가 정말 이 팀 소속인지 확인 (다른 팀 경기에 핀을 꽂지 못하게)
  const { data: game } = await supabase
    .from('games')
    .select('id, tournament:tournaments(team_id)')
    .eq('id', gameId)
    .maybeSingle()
  const gameTeamId = (game?.tournament as { team_id?: string } | null)?.team_id
  if (!game || gameTeamId !== teamId) {
    return NextResponse.json({ error: '이 팀의 경기가 아닙니다' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('coach_pins')
    .insert({ team_id: teamId, game_id: gameId, video_timestamp: ts, label: trimmed })
    .select('id, game_id, video_timestamp, label, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
