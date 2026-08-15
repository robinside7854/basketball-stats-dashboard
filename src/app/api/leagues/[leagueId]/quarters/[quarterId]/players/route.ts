import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'
import { canViewLeague } from '@/lib/auth/guard'
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
import { resolveTeamId } from '@/lib/league/teamScope'

type Ctx = { params: Promise<{ leagueId: string; quarterId: string }> }

// GET /api/leagues/[leagueId]/quarters/[quarterId]/players
// Returns all players with team affiliation for this quarter:
//   1) league_player_quarters (정규/분기 멤버십) — 있으면 우선. 대회(kind='tournament')에서는
//      이 멤버십이 곧 "참가 등록"이다(TournamentRosterPanel 이 씀).
//   2) league_game_players (게임별 비정규/타팀 임시 출전) — 폴백, 가장 자주 뛴 팀 사용
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
  // 명단 후보 풀은 팀 소유다 — league_id 로 조회하면 대회 분기에서 이 풀이 항상 비어
  // "등록할 사람 자체가 없다"는 화면이 된다(이번 작업의 핵심 버그와 동일한 원인).
  const teamId = await resolveTeamId(leagueId)

  const [{ data: players, error: pErr }, { data: memberships }, { data: quarterGames }] = await Promise.all([
    supabase
      .from('league_players')
      .select('id, name, number, position, birth_date, is_active')
      .eq('team_id', teamId)
      .order('name'),
    supabase
      .from('league_player_quarters')
      .select('league_player_id, team_id, is_regular')
      .eq('quarter_id', quarterId),
    supabase
      .from('league_games')
      .select('id')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId),
  ])

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const membershipMap = Object.fromEntries(
    (memberships ?? []).map(m => [m.league_player_id, m])
  )

  // 분기에 속한 게임들의 league_game_players 조회 → 플레이어별 팀 출전 횟수 집계
  const gameIds = (quarterGames ?? []).map(g => g.id)
  const playerGameTeams: Record<string, Record<string, number>> = {}
  // 이 분기(대회 포함)에 실제 기록이 남은 선수 집합 — 해제(등록 취소) 차단 판정에 쓴다.
  //   등록 취소는 league_player_quarters 행을 지우는 것인데, 기록이 이미 있는 선수를
  //   지우면 그 사람 점수가 명단에서 사라진 채로 박스스코어에 남는다.
  const playedIds = new Set<string>()
  if (gameIds.length > 0) {
    const [{ data: gameAssigns }, { data: eventRows, error: evErr }] = await Promise.all([
      supabase
        .from('league_game_players')
        .select('league_player_id, team_id')
        .in('league_game_id', gameIds),
      supabase
        .from('league_game_events')
        .select('league_player_id')
        .in('league_game_id', gameIds)
        .not('league_player_id', 'is', null),
    ])
    // 조용히 넘기면 실제로 뛴 선수의 해제 차단이 풀려 기록이 붕 뜰 수 있다 — throw.
    if (evErr) throw new Error(`league_game_events: quarterId=${quarterId} 조회 실패 — ${evErr.message}`)
    for (const a of gameAssigns ?? []) {
      if (!a.league_player_id || !a.team_id) continue
      if (!playerGameTeams[a.league_player_id]) playerGameTeams[a.league_player_id] = {}
      playerGameTeams[a.league_player_id][a.team_id] = (playerGameTeams[a.league_player_id][a.team_id] ?? 0) + 1
    }
    for (const e of (eventRows ?? []) as Array<{ league_player_id: string | null }>) {
      if (e.league_player_id) playedIds.add(e.league_player_id)
    }
  }

  function mostCommonTeam(playerId: string): string | null {
    const teams = playerGameTeams[playerId]
    if (!teams) return null
    let best: string | null = null
    let bestCount = 0
    for (const [t, c] of Object.entries(teams)) {
      if (c > bestCount) { best = t; bestCount = c }
    }
    return best
  }

  // 이 엔드포인트는 분기/비정규 로스터 배정 풀(대여 후보 포함)이다 — 상대(외부) 선수가
  // 여기 섞이면 어드민이 실수로 상대 선수를 우리 팀 경기에 "대여"할 수 있다. 기본 제외.
  const externalIds = await fetchExternalPlayerIds(supabase, leagueId)

  const result = (players ?? [])
    .filter(p => !externalIds.has(p.id))
    .map(p => {
      const m = membershipMap[p.id]
      const has_events = playedIds.has(p.id)
      // 1순위: 분기 정규 멤버십
      if (m?.team_id) {
        return { ...p, team_id: m.team_id, is_regular: m.is_regular ?? false, has_events }
      }
      // 2순위: 게임별 비정규 출전 (가장 자주 뛴 팀)
      const gameTeam = mostCommonTeam(p.id)
      if (gameTeam) {
        return { ...p, team_id: gameTeam, is_regular: false, has_events }
      }
      return { ...p, team_id: null, is_regular: null, has_events }
    })

  return NextResponse.json(result)
}

// PUT /api/leagues/[leagueId]/quarters/[quarterId]/players
// Bulk upsert player memberships: [{ league_player_id, team_id, is_regular }]
export async function PUT(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { players } = await req.json() as {
    players: { league_player_id: string; team_id: string | null; is_regular: boolean }[]
  }
  if (!Array.isArray(players)) return NextResponse.json({ error: 'players 배열 필수' }, { status: 400 })

  const supabase = createClient()
  const rows = players.map(p => ({
    league_id: leagueId,
    quarter_id: quarterId,
    league_player_id: p.league_player_id,
    team_id: p.team_id,
    is_regular: p.is_regular,
  }))

  const { error } = await supabase
    .from('league_player_quarters')
    .upsert(rows, { onConflict: 'quarter_id,league_player_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ ok: true })
}

// PATCH /api/leagues/[leagueId]/quarters/[quarterId]/players
// Single player membership update: { league_player_id, team_id, is_regular }
export async function PATCH(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, quarterId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { league_player_id, team_id, is_regular } = await req.json()
  if (!league_player_id) return NextResponse.json({ error: 'league_player_id 필수' }, { status: 400 })

  const supabase = createClient()
  const { error } = await supabase
    .from('league_player_quarters')
    .upsert({
      league_id: leagueId,
      quarter_id: quarterId,
      league_player_id,
      team_id: team_id ?? null,
      is_regular: is_regular ?? true,
    }, { onConflict: 'quarter_id,league_player_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ ok: true })
}

// DELETE /api/leagues/[leagueId]/quarters/[quarterId]/players?playerId=X
// 이 분기(대회 참가 등록 포함)에서 선수를 뺀다 — league_player_quarters 행 삭제.
//   이미 이 분기에 속한 경기에 이 선수의 기록(league_game_events)이 있으면 막는다.
//   해제하면 그 사람 점수가 명단에는 없는데 박스스코어에는 남는, 주인 없는 기록이 된다 —
//   UI 에서 체크박스를 막아도 API 를 직접 두드리면 뚫리므로 여기서도 다시 막는다.
export async function DELETE(
  req: Request,
  { params }: Ctx,
) {
  const { leagueId, quarterId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'playerId 필수' }, { status: 400 })

  const supabase = createClient()

  const { data: quarterGames, error: gErr } = await supabase
    .from('league_games')
    .select('id')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
  if (gErr) throw new Error(`league_games: quarterId=${quarterId} 조회 실패 — ${gErr.message}`)
  const gameIds = (quarterGames ?? []).map(g => g.id)

  if (gameIds.length > 0) {
    const { count, error: evErr } = await supabase
      .from('league_game_events')
      .select('id', { count: 'exact', head: true })
      .in('league_game_id', gameIds)
      .eq('league_player_id', playerId)
    // 조용히 넘기면 기록이 있는데도 차단 없이 해제될 수 있다 — throw.
    if (evErr) throw new Error(`league_game_events: quarterId=${quarterId} playerId=${playerId} 조회 실패 — ${evErr.message}`)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: '이미 경기 기록이 있는 선수는 등록을 해제할 수 없습니다. 기록을 먼저 정리해주세요.' },
        { status: 409 },
      )
    }
  }

  const { error: delErr } = await supabase
    .from('league_player_quarters')
    .delete()
    .eq('quarter_id', quarterId)
    .eq('league_player_id', playerId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // 분기 정규 소속 해제 — 팀 구성이 분기마다 바뀌는 구조라 이 한 줄이 과거 경기의
  // 팀 귀속 해석까지 바꾼다. 어느 분기의 누구를 뺐는지 남긴다.
  await logAudit({
    req, action: 'quarter_player.delete', targetTable: 'league_player_quarters',
    targetId: playerId, leagueId, quarterId, detail: { quarterId },
  })

  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ ok: true })
}
