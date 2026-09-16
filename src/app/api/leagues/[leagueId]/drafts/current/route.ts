// 드래프트 현재 상태 — 공개 (인증 불필요, 시청용)
//
// GET ?quarterId=X
// 반환:
//   {
//     draft: { id, status, draft_order, current_pick_index, current_round, total_picks, method, started_at, completed_at } | null
//     current_team_id: string | null   (현재 차례 팀; setup/completed 면 null)
//     picks: [{ pick_number, round_number, team_id, player_id, player_name, player_number, player_photo_url, picked_at }]
//     available_players: [{ id, name, number, position, plus_one, photo_url }]
//     teams: [{ id, name, color }]  ← 분기 override(league_team_quarter_overrides) 적용본
//   }
//
// 클라이언트가 폴링하거나 Realtime 구독 (Phase 3 옵션) 으로 갱신.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'

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
  pick_seconds: number
  ready_state: Record<string, boolean>
  lottery_odds: Record<string, number> | null
  lottery_done: boolean
  pick_deadline: string | null
  extensions_used: Record<string, number>
  /** 리허설 세션 — 분기 소속·팀장을 리그에 반영하지 않는다 (migration 115) */
  is_test: boolean
  /** 테스트 세션 전용 팀장 { team_id: league_player_id } — 실전 세션은 NULL (migration 116) */
  test_leaders: Record<string, string> | null
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
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')
  if (!quarterId) return NextResponse.json({ error: 'quarterId 필요' }, { status: 400 })

  const supabase = createClient()
  // 드래프트 풀 후보는 팀 명단 전체다 — 대회 화면에서만 추가된 선수도 리그 드래프트에서
  // 뽑을 수 있어야 "명단 공유"가 실제로 성립한다.
  const teamId = await resolveTeamId(leagueId)

  // 병렬: draft, teams, 분기 override, all players, 팀장, 감독관 코드 존재여부
  const [{ data: draft }, { data: teamsRaw }, { data: overrides }, { data: players }, { data: leaders }, { data: supCodes }] = await Promise.all([
    supabase
      .from('league_drafts')
      .select('id, status, draft_order, current_pick_index, current_round, total_picks, method, started_at, completed_at, pick_seconds, ready_state, lottery_odds, lottery_done, pick_deadline, extensions_used, is_test, test_leaders')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId)
      .maybeSingle(),
    supabase
      .from('league_teams')
      .select('id, name, color')
      .eq('league_id', leagueId)
      // 임시팀(친선전 전용)은 드래프트에 등장하지 않는다
      .is('exhibition_date', null),
    // 분기별 팀명·색상 override — teams/route.ts 와 같은 규칙.
    //   이게 없으면 새 분기 팀 이름을 지어도 드래프트 화면엔 지난 분기 명패가 뜬다.
    supabase
      .from('league_team_quarter_overrides')
      .select('team_id, name, color')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId),
    supabase
      .from('league_players')
      .select('id, name, number, position, plus_one, photo_url')
      .eq('team_id', teamId)
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
      // maybeSingle() 이면 감독관 코드가 2개 이상일 때 에러가 나서 "감독관 없음" 으로 응답했다.
      // 존재 여부만 알면 되므로 1건만 가져와 길이로 판정한다.
      .limit(1),
  ])

  const overrideMap = Object.fromEntries(
    ((overrides ?? []) as { team_id: string; name: string | null; color: string | null }[])
      .map(o => [o.team_id, { name: o.name, color: o.color }]),
  ) as Record<string, { name: string | null; color: string | null }>
  const teams = ((teamsRaw ?? []) as { id: string; name: string; color: string | null }[]).map(t => {
    const ov = overrideMap[t.id]
    return { ...t, name: ov?.name ?? t.name, color: ov?.color ?? t.color }
  })

  const playerMapFull = Object.fromEntries((players ?? []).map(p => [p.id, p]))
  // 팀장 응답에 이름/번호 enrichment — 최종 결과 화면에서 별도 조회 없이 표시 가능.
  const leaderList = ((leaders ?? []) as { team_id: string; leader_player_id: string | null }[]).map(l => ({
    team_id: l.team_id,
    leader_player_id: l.leader_player_id,
    leader_player_name: l.leader_player_id ? (playerMapFull[l.leader_player_id]?.name ?? null) : null,
    leader_player_number: l.leader_player_id ? (playerMapFull[l.leader_player_id]?.number ?? null) : null,
  }))
  const supervisorExists = (supCodes ?? []).length > 0

  if (!draft) {
    return NextResponse.json({
      draft: null,
      current_team_id: null,
      picks: [],
      available_players: [],
      teams,
      leaders: leaderList,
      supervisor_exists: supervisorExists,
      server_time_ms: Date.now(),
    })
  }
  const d = draft as DraftRow

  // 테스트 세션의 팀장은 리그 표가 아니라 세션 행(test_leaders)에 있다 (migration 116).
  // 실전 세션과 같은 모양(이름·등번호 enrichment 포함)으로 맞춰 내려보내야 화면이 갈라지지 않는다.
  const testLeaderList = Object.entries(d.test_leaders ?? {})
    .filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0)
    .map(([teamId, pid]) => ({
      team_id: teamId,
      leader_player_id: pid,
      leader_player_name: playerMapFull[pid]?.name ?? null,
      leader_player_number: playerMapFull[pid]?.number ?? null,
    }))

  // 픽 + 풀 병렬 조회
  const [{ data: picksRaw }, { data: poolRaw }] = await Promise.all([
    supabase
      .from('league_draft_picks')
      .select('pick_number, round_number, team_id, league_player_id, picked_at, picked_by_code_id')
      .eq('draft_id', d.id)
      .order('pick_number', { ascending: true }),
    supabase
      .from('league_draft_pool')
      .select('league_player_id')
      .eq('draft_id', d.id),
  ])
  const picks = (picksRaw ?? []).map(p => ({
    pick_number: p.pick_number,
    round_number: p.round_number,
    team_id: p.team_id,
    player_id: p.league_player_id,
    player_name: playerMapFull[p.league_player_id]?.name ?? '?',
    player_number: playerMapFull[p.league_player_id]?.number ?? null,
    player_position: playerMapFull[p.league_player_id]?.position ?? null,
    // 픽 공개 카드에서 선수 사진을 뒤집어 보여주기 위해 함께 내려준다
    player_photo_url: playerMapFull[p.league_player_id]?.photo_url ?? null,
    picked_at: p.picked_at,
    // 타이머 만료 자동픽은 코드 없이 들어온다(auto-pick 라우트가 picked_by_code_id=null 로 저장) —
    // 최속 픽 시상·"자동" 표시에 쓴다
    is_auto: p.picked_by_code_id == null,
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
    teams,
    // 테스트 세션은 league_team_quarter_leaders 를 쓰지 않는다 — 이 분기에 남아 있는 다른
    // 팀장 행을 "이 리허설이 정한 팀장"처럼 보여주지 않도록 섞지 않고 test_leaders 만 쓴다.
    leaders: d.is_test ? testLeaderList : leaderList,
    supervisor_exists: supervisorExists,
    // 클라이언트가 서버 시간과 자기 시간 간 오프셋을 계산해 타이머 캘리브레이션에 사용
    server_time_ms: Date.now(),
  })
}
