// 드래프트 현재 상태 — 공개 (인증 불필요, 시청용)
//
// GET ?quarterId=X
// 반환:
//   {
//     draft: { id, status, draft_order, current_pick_index, current_round, total_picks, method, started_at, completed_at } | null
//     current_team_id: string | null   (현재 차례 팀; setup/completed 면 null)
//     picks: [{ pick_number, round_number, team_id, player_id, player_name, player_number, picked_at }]
//     available_players: [{ id, name, number, position, plus_one }]
//     teams: [{ id, name, color }]
//   }
//
// 클라이언트가 폴링하거나 Realtime 구독 (Phase 3 옵션) 으로 갱신.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

interface DraftRow {
  id: string
  status: string
  draft_order: string[]
  current_pick_index: number
  current_round: number
  total_picks: number
  method: 'snake' | 'linear'
  started_at: string | null
  completed_at: string | null
  ready_state: Record<string, boolean>
  lottery_odds: Record<string, number> | null
  lottery_done: boolean
  pick_deadline: string | null
  extensions_used: Record<string, number>
}

function computeCurrentTeam(d: DraftRow): string | null {
  if (d.status !== 'in_progress') return null
  const order = d.draft_order ?? []
  if (order.length === 0) return null
  const idx = d.current_pick_index
  if (idx < 0 || idx >= order.length) return null
  if (d.method === 'snake' && d.current_round % 2 === 0) {
    return order[order.length - 1 - idx]
  }
  return order[idx]
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')
  if (!quarterId) return NextResponse.json({ error: 'quarterId 필요' }, { status: 400 })

  const supabase = createClient()

  // 병렬: draft, teams, all players, 팀장, 감독관 코드 존재여부
  const [{ data: draft }, { data: teams }, { data: players }, { data: leaders }, { data: supCode }] = await Promise.all([
    supabase
      .from('league_drafts')
      .select('id, status, draft_order, current_pick_index, current_round, total_picks, method, started_at, completed_at, ready_state, lottery_odds, lottery_done, pick_deadline, extensions_used')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId)
      .maybeSingle(),
    supabase
      .from('league_teams')
      .select('id, name, color')
      .eq('league_id', leagueId),
    supabase
      .from('league_players')
      .select('id, name, number, position, plus_one')
      .eq('league_id', leagueId)
      .order('name'),
    supabase
      .from('league_team_quarter_leaders')
      .select('team_id, leader_player_id')
      .eq('quarter_id', quarterId),
    supabase
      .from('league_draft_codes')
      .select('id')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId)
      .eq('role', 'supervisor')
      .eq('is_active', true)
      .maybeSingle(),
  ])

  const leaderList = (leaders ?? []) as { team_id: string; leader_player_id: string | null }[]
  const supervisorExists = !!supCode

  if (!draft) {
    return NextResponse.json({
      draft: null,
      current_team_id: null,
      picks: [],
      available_players: [],
      teams: teams ?? [],
      leaders: leaderList,
      supervisor_exists: supervisorExists,
    })
  }
  const d = draft as DraftRow

  // 픽 + 풀 병렬 조회
  const [{ data: picksRaw }, { data: poolRaw }] = await Promise.all([
    supabase
      .from('league_draft_picks')
      .select('pick_number, round_number, team_id, league_player_id, picked_at')
      .eq('draft_id', d.id)
      .order('pick_number', { ascending: true }),
    supabase
      .from('league_draft_pool')
      .select('league_player_id')
      .eq('draft_id', d.id),
  ])
  const playerMap = Object.fromEntries((players ?? []).map(p => [p.id, p]))
  const picks = (picksRaw ?? []).map(p => ({
    pick_number: p.pick_number,
    round_number: p.round_number,
    team_id: p.team_id,
    player_id: p.league_player_id,
    player_name: playerMap[p.league_player_id]?.name ?? '?',
    player_number: playerMap[p.league_player_id]?.number ?? null,
    player_position: playerMap[p.league_player_id]?.position ?? null,
    picked_at: p.picked_at,
  }))

  const pickedPlayerIds = new Set(picks.map(p => p.player_id))
  const poolIds = new Set((poolRaw ?? []).map(p => p.league_player_id))
  // 풀에 속하면서 아직 안 픽된 선수만
  const available = (players ?? []).filter(p => poolIds.has(p.id) && !pickedPlayerIds.has(p.id))

  return NextResponse.json({
    draft: d,
    current_team_id: computeCurrentTeam(d),
    picks,
    available_players: available,
    pool_size: poolIds.size,
    pool_player_ids: Array.from(poolIds),
    teams: teams ?? [],
    leaders: leaderList,
    supervisor_exists: supervisorExists,
  })
}
