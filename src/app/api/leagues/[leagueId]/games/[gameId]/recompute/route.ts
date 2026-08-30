import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { scorePoints, fetchScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'
import { resolveTeamId } from '@/lib/league/teamScope'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

// POST /api/leagues/[leagueId]/games/[gameId]/recompute
// 이벤트 기반으로 home_score/away_score 강제 재계산
export async function POST(
  req: Request,
  { params }: Ctx
) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  // 이 파일에도 득점 계산이 있었다 — 공용 룰 하나로 통일
  const scoringRules = await fetchScoringRules(supabase, leagueId)

  const [{ data: game, error: gErr }, { data: leaguePlayers }] = await Promise.all([
    supabase.from('league_games').select('home_team_id, away_team_id, quarter_id, plus_one_player_id, plus_one_extra_ids, plus_one_quarters, opponent_score_manual').eq('id', gameId).eq('league_id', leagueId).single(),
    // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 대회 묶음에서 0명이 나와
    //   plus_one 맵이 비고, 가산점이 에러 없이 조용히 빠진다.
    supabase.from('league_players').select('id, plus_one').eq('team_id', await resolveTeamId(leagueId)),
  ])

  if (gErr || !game) return NextResponse.json({ error: '게임을 찾을 수 없습니다' }, { status: 404 })

  // +1 판정은 scoring.ts 단일 진실에 위임한다. 예전에는 여기서 plusOneSet 을 직접 좁혀
  //   (배타 지정이면 그 한 명만 담기) 만들었는데, 규칙이 늘 때마다 이런 지역 구현이 갈린다.
  const leaguePlusOne = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  const gamePlusOne = game as GamePlusOne

  // ⚠ 쿼터를 함께 받는다 — 전/후반 +1 이 다른 경기(113)는 같은 선수·같은 슛도 쿼터에 따라
  //   점수가 다르다. 여기서 빠뜨리면 저장 스코어와 화면 집계가 갈린다.
  function calcPts(type: string, result: string, playerId: string, quarter: number | null): number {
    return scorePoints(type, result, isPlusOneFor(playerId, gamePlusOne, leaguePlusOne, quarter), scoringRules)
  }

  // 이벤트 조회 (team_id + 이벤트 타입/결과)
  //   ⚠ 예전에는 `.not('league_player_id','is',null)` 로 선수 없는 이벤트를 걸렀다.
  //     대회의 **상대 득점**은 선수 없이 팀에만 붙으므로(우리는 상대 선수를 기록하지 않는다)
  //     그 필터가 남아 있으면 상대 점수가 항상 0이 된다 — 화면은 멀쩡하고 스코어만 한쪽이 빈다.
  //     선수 없는 이벤트는 아래에서 team_id 로만 가산한다.
  const { data: events } = await supabase
    .from('league_game_events')
    .select('id, team_id, type, result, league_player_id, points, quarter')
    .eq('league_game_id', gameId)

  let homeScore = 0
  let awayScore = 0

  // team_id 없는 이벤트를 위한 팀 역추적 — **선수가 있는 것만** 역추적할 수 있다.
  //   (선수도 팀도 없는 이벤트는 어느 쪽 점수인지 알 방법이 없어 아래 루프에서 버려진다)
  const eventsWithoutTeam = (events ?? []).filter(e => !e.team_id && e.league_player_id)
  const playerTeamMap: Record<string, string> = {}

  if (eventsWithoutTeam.length > 0) {
    const playerIds = [...new Set(eventsWithoutTeam.map(e => e.league_player_id).filter(Boolean))] as string[]

    // 1차: league_game_players (이 경기 전용 배정 — 비정규/타팀 임시 출전)
    // 비정규 출전 선수가 정규 팀으로 잘못 잡히지 않도록 게임별 배정을 먼저 확인
    const { data: gameMemberships } = await supabase
      .from('league_game_players')
      .select('league_player_id, team_id')
      .eq('league_game_id', gameId)
      .in('league_player_id', playerIds)
    for (const m of gameMemberships ?? []) {
      if (m.team_id) playerTeamMap[m.league_player_id] = m.team_id
    }

    // 2차: league_player_quarters (정규 분기 소속 — 1차에서 못 찾은 경우만)
    const stillMissing = playerIds.filter(id => !playerTeamMap[id])
    if (stillMissing.length > 0 && game.quarter_id) {
      const { data: memberships } = await supabase
        .from('league_player_quarters')
        .select('league_player_id, team_id')
        .eq('quarter_id', game.quarter_id)
        .in('league_player_id', stillMissing)
      for (const m of memberships ?? []) {
        if (m.team_id) playerTeamMap[m.league_player_id] = m.team_id
      }
    }
  }

  for (const e of events ?? []) {
    // 선수 있는 이벤트는 종전대로(+1 판정 포함). 선수 없는 이벤트는 대회의 상대 득점뿐이고,
    //   플러스원 개념이 없으므로 룰 표만으로 채점한다.
    const pts = e.league_player_id
      ? calcPts(e.type, e.result ?? '', e.league_player_id, e.quarter ?? null)
      : scorePoints(e.type, e.result ?? '', false, scoringRules)
    if (pts === 0) continue
    // 선수가 없으면 team_id 가 유일한 근거다 — 없으면 어느 쪽 점수인지 알 수 없어 버린다.
    const teamId = e.team_id ?? (e.league_player_id ? playerTeamMap[e.league_player_id] : null) ?? null
    if (teamId === game.home_team_id) homeScore += pts
    else if (teamId === game.away_team_id) awayScore += pts
  }

  // ── 대회: 손으로 넣은 상대 최종 점수 ───────────────────────────────
  //   대회는 상대 선수를 기록하지 않으므로 상대 점수는 이벤트에서 나올 수 없다(우리 이벤트뿐).
  //   마감할 때 넣은 값이 있으면 **외부(상대) 팀 쪽 점수를 그 값으로 덮는다.**
  //   ⚠ 우리 팀 점수는 절대 덮지 않는다 — 그건 기록에서 나오는 값이고 이 도구의 존재 이유다.
  //   값이 없으면(리그 경기 전부, 아직 마감 안 한 대회 경기) 위에서 계산한 이벤트 합을 그대로 쓴다.
  const manualOpp = (game as { opponent_score_manual?: number | null }).opponent_score_manual
  if (manualOpp != null) {
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]
    if (teamIds.length > 0) {
      const { data: teamRows, error: tErr } = await supabase
        .from('league_teams').select('id, is_external').in('id', teamIds)
      // 조용히 넘기면 상대 점수가 이벤트 합(=0)으로 남아 항상 우리가 이긴 것으로 보인다.
      if (tErr) return NextResponse.json({ error: `팀을 확인하지 못했습니다 — ${tErr.message}` }, { status: 500 })
      const externalId = (teamRows ?? []).find(t => t.is_external === true)?.id ?? null
      if (externalId === game.home_team_id) homeScore = manualOpp
      else if (externalId === game.away_team_id) awayScore = manualOpp
      // 외부 팀이 없으면(리그 경기에 값이 잘못 들어간 경우) 아무것도 덮지 않는다.
    }
  }

  // ── 이벤트 저장 점수 재동기화 ──────────────────────────────────────
  //   `league_game_events.points` 는 **기록 시점의** 룰·플러스원으로 굳어 있다.
  //   나중에 +1 지정을 바꾸면(경기 한정 +1 등) 그 이전에 남긴 이벤트의 저장값만 옛 점수로 남는다.
  //   화면 집계는 전부 scorePoints() 로 재계산해서 표시는 맞지만, 저장값을 쓰는 경로가
  //   하나라도 있으면 거기서만 틀린 점수가 나온다(예전에 실제로 6건 어긋난 적이 있다).
  //   2026-08-23 에 허승용 이벤트 1건이 이 상태로 남아 verify-scoring 이 잡아냈다.
  //   같은 값끼리 묶어 update 한다 — 이벤트가 수십 건이라 한 건씩 왕복할 이유가 없다.
  const byPoints = new Map<number, string[]>()
  for (const e of events ?? []) {
    const want = e.league_player_id
      ? calcPts(e.type, e.result ?? '', e.league_player_id, e.quarter ?? null)
      : scorePoints(e.type, e.result ?? '', false, scoringRules)
    if ((e.points ?? 0) === want) continue
    const list = byPoints.get(want) ?? []
    list.push(e.id as string)
    byPoints.set(want, list)
  }
  let resynced = 0
  for (const [want, ids] of byPoints) {
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200)
      // 성공 판정은 반환 행 수로만 — PostgREST 는 RLS 에 막혀도 204 를 준다(감사 04 ②)
      const { data: upd, error } = await supabase
        .from('league_game_events')
        .update({ points: want })
        .in('id', chunk)
        .select('id')
      if (error || !upd || upd.length !== chunk.length) {
        return NextResponse.json(
          { error: `이벤트 점수 재동기화 실패 — ${error?.message ?? `${chunk.length}건 중 ${upd?.length ?? 0}건만 반영`}` },
          { status: 500 },
        )
      }
      resynced += upd.length
    }
  }

  // DB 점수 업데이트
  const { error: updateErr } = await supabase
    .from('league_games')
    .update({ home_score: homeScore, away_score: awayScore })
    .eq('id', gameId)
    .eq('league_id', leagueId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ home_score: homeScore, away_score: awayScore, resynced_events: resynced })
}
