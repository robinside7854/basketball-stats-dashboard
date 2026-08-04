import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'

type Ctx = { params: Promise<{ leagueId: string; quarterId: string }> }

// GET /api/leagues/[leagueId]/quarters/[quarterId]/leaders
// Returns team leaders for a quarter: [{ team_id, leader_player_id }]
export async function GET(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()

  const { data, error } = await supabase
    .from('league_team_quarter_leaders')
    .select('team_id, leader_player_id')
    .eq('quarter_id', quarterId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT /api/leagues/[leagueId]/quarters/[quarterId]/leaders
// Set leader for a team: { team_id, leader_player_id }
export async function PUT(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { team_id, leader_player_id } = await req.json()
  if (!team_id) return NextResponse.json({ error: 'team_id 필수' }, { status: 400 })

  const supabase = createClient()
  const { error } = await supabase
    .from('league_team_quarter_leaders')
    .upsert({ quarter_id: quarterId, team_id, leader_player_id: leader_player_id ?? null })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
