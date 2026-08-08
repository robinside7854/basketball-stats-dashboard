import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// 조회 실패를 빈 결과로 넘기지 않기 위한 공통 응답.
//   이 라우트는 경기 중 기록 화면의 선수 명단을 만든다. 쿼리가 실패했는데 빈 배열로
//   넘어가면 기록원은 "이 선수가 명단에 없네" 라고 판단하게 된다 — 화면은 멀쩡해 보이고
//   원인은 드러나지 않는다. 실패는 실패로 보이게 한다.
function queryFailed(what: string, message: string) {
  return NextResponse.json(
    { error: `${what} 조회 실패 — ${message}` },
    { status: 500 },
  )
}

// GET /api/leagues/[leagueId]/games/[gameId]/roster
// 해당 게임의 분기 기준 홈/어웨이 팀별 선수 명단 반환
// 분기 배정이 없으면 리그 전체 선수를 unassigned로 반환 (하위 호환)
export async function GET(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, gameId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()

  // 게임 정보 조회 (date 포함 — 같은 날짜 비정규 상속용)
  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('quarter_id, home_team_id, away_team_id, date')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    // maybeSingle: single() 은 "행 없음" 도 에러로 돌려줘서, 없는 경기와 DB 장애가
    //   같은 응답이 된다. 둘을 구분해야 아래 404/500 분기가 의미를 갖는다.
    .maybeSingle()

  // 쿼리 실패를 404 로 뭉개지 않는다 — "경기가 없다" 와 "DB 가 응답하지 않았다" 는
  //   기록원이 취할 행동이 다르다(전자는 일정 확인, 후자는 재시도).
  if (gErr) return queryFailed('경기', gErr.message)
  if (!game) return NextResponse.json({ error: '게임을 찾을 수 없습니다' }, { status: 404 })

  // game.quarter_id 가 null 인 경우, game.date 로부터 quarter 를 유추 (자동 매칭 + 백필)
  // Q3 팀 정체성 변경 등 후속 분기가 도입된 이후에도 예전에 만든 game 이 quarter_id=null 로 남아
  // 로스터가 안 보이는 버그를 방지.
  let resolvedQuarterId: string | null = game.quarter_id
  if (!resolvedQuarterId && game.date) {
    const { data: quarters, error: qErr } = await supabase
      .from('league_quarters')
      .select('id, start_date, end_date, is_current, year, quarter')
      .eq('league_id', leagueId)
    // 실패를 넘기면 resolvedQuarterId 가 null 로 남아 아래 "전체 선수 unassigned" 분기로
    //   떨어진다 — 홈/어웨이 구분이 사라진 명단이 나오는데 화면상으로는 정상처럼 보인다.
    if (qErr) return queryFailed('분기', qErr.message)
    // 1) start_date/end_date 매칭 시도
    const matched = (quarters ?? []).find(q =>
      q.start_date && q.end_date && game.date >= q.start_date && game.date <= q.end_date,
    )
    if (matched) resolvedQuarterId = matched.id
    // 2) 폴백: is_current=true 인 분기
    if (!resolvedQuarterId) {
      const current = (quarters ?? []).find(q => q.is_current)
      if (current) resolvedQuarterId = current.id
    }

    // 3) 성공하면 game 에 자동 백필 (write-through, 이후 요청은 바로 이 값 사용)
    if (resolvedQuarterId) {
      const { error: bfErr } = await supabase
        .from('league_games')
        .update({ quarter_id: resolvedQuarterId })
        .eq('id', gameId)
        .eq('league_id', leagueId)
      // 다음 요청을 빠르게 하려는 캐시 성격의 쓰기다. 실패해도 이번 응답 내용은 이미
      //   메모리에서 정해졌으므로 요청을 실패시키지 않는다. 다만 조용히 넘기면 매 요청
      //   같은 실패를 반복하게 되므로 로그는 남긴다.
      if (bfErr) console.error(`[roster] quarter_id 백필 실패 game=${gameId}: ${bfErr.message}`)
    }
  }

  // 탈퇴 회원(is_active=false)은 로스터 피커에서 제외한다 — 단, 이 경기에 이미 이벤트가
  // 남아 있으면(과거에 실제로 뛴 경기) 예외로 계속 포함한다. 그래야 옛 경기를 다시 열었을 때
  // 박스스코어·게임로그에서 탈퇴 회원의 실제 기록이 사라지지 않는다.
  const { data: playedRows, error: pErr } = await supabase
    .from('league_game_events')
    .select('league_player_id')
    .eq('league_game_id', gameId)
    .not('league_player_id', 'is', null)
  // 실패를 빈 집합으로 넘기면 위 주석의 예외 규칙이 통째로 무너진다 — 탈퇴 회원이
  //   실제로 뛴 옛 경기에서 그 사람이 명단에서 사라진다. 지우면 안 되는 기록이라 막는다.
  if (pErr) return queryFailed('경기 이벤트', pErr.message)
  const playedIds = new Set((playedRows ?? []).map(r => r.league_player_id as string))

  // 분기 여전히 없거나 팀 배정 자체가 없는 경우: 전체 선수를 unassigned로 반환
  if (!resolvedQuarterId || (!game.home_team_id && !game.away_team_id)) {
    // 팀 명단 전체를 후보로 보여준다 — 대회는 참가 등록(league_player_quarters)이 아직
    // 없을 수도 있는데, 그렇다고 후보가 0명이면 기록원이 아무도 못 고른다. league_id 로
    // 좁히면 대회 분기에서 이 폴백이 항상 0명이 된다(핵심 버그와 동일한 원인).
    const teamId = await resolveTeamId(leagueId)
    const { data: players, error: plErr } = await supabase
      .from('league_players')
      .select('id, name, number, position, is_active')
      .eq('team_id', teamId)
      .order('name')
    if (plErr) return queryFailed('선수 명단', plErr.message)
    const filtered = (players ?? []).filter(p => p.is_active !== false || playedIds.has(p.id))
    return NextResponse.json({
      home: [],
      away: [],
      unassigned: filtered,
      quarter_id: null,
    })
  }

  // 분기별 팀 배정 선수 조회 (resolvedQuarterId 사용)
  const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]

  const { data: memberships, error: mErr } = await supabase
    .from('league_player_quarters')
    .select(`
      team_id,
      is_regular,
      league_player_id,
      league_players!inner(id, name, number, position, birth_date, plus_one, is_active)
    `)
    .eq('league_id', leagueId)
    .eq('quarter_id', resolvedQuarterId)
    .in('team_id', teamIds)

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  // 비정규 선수 / 타팀 임시 출전: league_game_players
  // 먼저 조회해야 quarter 배정 루프에서 override 스킵이 가능함
  // 1) 이 경기에 이미 배정된 선수 조회
  const { data: gamePlayers, error: gpErr } = await supabase
    .from('league_game_players')
    .select('league_player_id, team_id, league_players!inner(id, name, number, position, birth_date, plus_one)')
    .eq('league_game_id', gameId)
  // 실패를 빈 배열로 넘기면 비정규·타팀 임시 출전 선수가 통째로 명단에서 빠진다.
  if (gpErr) return queryFailed('경기별 배정', gpErr.message)

  // league_game_players에 per-game 배정이 있는 선수 ID 셋 (타팀 임시 출전 override 용)
  const gameOverrideIds = new Set((gamePlayers ?? []).map(gp => gp.league_player_id))

  type PlayerRow = {
    id: string
    name: string
    number: number | null
    position: string | null
    birth_date: string | null
    plus_one: boolean
    is_regular: boolean
    team_id: string
  }
  const home: PlayerRow[] = []
  const away: PlayerRow[] = []
  const includedIds = new Set<string>()

  // 정규 선수: league_player_quarters (is_regular=true or null)
  for (const m of memberships ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (Array.isArray(m.league_players) ? m.league_players[0] : m.league_players) as any
    if (!p) continue
    // 비정규 선수는 league_player_quarters에서 완전 제외 → league_game_players(per-game)로만 처리
    if (m.is_regular === false) continue
    // per-game 배정이 있는 선수는 league_game_players 기준으로 처리 (타팀 임시 출전 override)
    if (gameOverrideIds.has(m.league_player_id)) continue
    // 탈퇴 회원 — 이 경기에 실제 기록이 없으면 새 픽커에서 제외 (있으면 아래에서 유지)
    if (p.is_active === false && !playedIds.has(p.id)) continue
    const row: PlayerRow = {
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      birth_date: p.birth_date ?? null,
      plus_one: p.plus_one ?? false,
      is_regular: m.is_regular,
      team_id: m.team_id,
    }
    if (m.team_id === game.home_team_id) { home.push(row); includedIds.add(p.id) }
    else if (m.team_id === game.away_team_id) { away.push(row); includedIds.add(p.id) }
  }

  // 2) 같은 날짜 다른 경기에서 배정된 비정규 선수 상속 (이 경기에 없는 경우만)
  //   응답 전용 상속이다 — league_game_players 는 "이 경기 한정" 배정이 정의이므로
  //   여기서 DB 에 쓰면 그 정의가 깨진다. GET 은 조회일 뿐 배정을 확정하지 않는다.
  //   (2026-08-08 사고: GET 이 열람할 때마다 이 upsert 를 실행해 게스트 1경기 출전이
  //    같은 날 다른 경기로 계속 번졌다. 실제 배정은 여전히 explicit POST
  //    (irregular-players / opponent-players) 로만 확정된다 — 이 블록은 화면 편의를
  //    위해 후보를 보여줄 뿐, league_game_players 행을 만들지 않는다.)
  if (game.date) {
    const { data: sameDateGames, error: sdErr } = await supabase
      .from('league_games')
      .select('id, home_team_id, away_team_id')
      .eq('league_id', leagueId)
      .eq('date', game.date)
      .neq('id', gameId)
    if (sdErr) return queryFailed('같은 날짜 경기', sdErr.message)

    const sameTeamGameIds = (sameDateGames ?? [])
      .filter(g => g.home_team_id === game.home_team_id || g.away_team_id === game.home_team_id ||
                   g.home_team_id === game.away_team_id || g.away_team_id === game.away_team_id)
      .map(g => g.id)

    if (sameTeamGameIds.length > 0) {
      const alreadyAssigned = new Set((gamePlayers ?? []).map(gp => `${gp.league_player_id}:${gp.team_id}`))

      const { data: inheritedPlayers, error: ipErr } = await supabase
        .from('league_game_players')
        .select('league_player_id, team_id, league_players!inner(id, name, number, position, birth_date, plus_one)')
        .in('league_game_id', sameTeamGameIds)
        .in('team_id', teamIds) // 이 경기에 참여하는 팀만
      if (ipErr) return queryFailed('같은 날짜 배정 상속', ipErr.message)

      // 아직 이 경기에 없는 선수 → 응답에만 합산 (DB 삽입 없음)
      const toDisplay = (inheritedPlayers ?? []).filter(
        gp => !alreadyAssigned.has(`${gp.league_player_id}:${gp.team_id}`)
      )
      if (toDisplay.length > 0) {
        ;(gamePlayers as typeof inheritedPlayers ?? []).push(...toDisplay)
      }
    }
  }

  for (const gp of gamePlayers ?? []) {
    if (includedIds.has(gp.league_player_id)) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (Array.isArray(gp.league_players) ? gp.league_players[0] : gp.league_players) as any
    if (!p) continue
    const row: PlayerRow = {
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      birth_date: p.birth_date ?? null,
      plus_one: p.plus_one ?? false,
      is_regular: false,
      team_id: gp.team_id,
    }
    if (gp.team_id === game.home_team_id) { home.push(row); includedIds.add(p.id) }
    else if (gp.team_id === game.away_team_id) { away.push(row); includedIds.add(p.id) }
  }

  // picker 필터: 이 경기 팀에 실제 매칭된 선수만 제외 (다른 팀 배정은 picker에 계속 노출)
  const assignedIrregularIds = (gamePlayers ?? [])
    .filter(gp => gp.team_id === game.home_team_id || gp.team_id === game.away_team_id)
    .map(gp => gp.league_player_id)

  // 이름 정렬
  home.sort((a, b) => a.name.localeCompare(b.name))
  away.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    home,
    away,
    unassigned: [],
    quarter_id: resolvedQuarterId,
    assigned_irregular_ids: assignedIrregularIds,
  })
}
