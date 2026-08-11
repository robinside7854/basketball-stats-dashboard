// 커리어 배지 — 누적 축과 '첫 기록' 축 (게이미피케이션 Phase 1)
//
// 왜 필요한가: 기존 4종(퍼펙트게임·더블더블·트리플더블·위닝샷)은 전부 **잘하는 사람**의 배지다.
//   출전이 적거나 기록이 화려하지 않은 회원은 시즌 내내 하나도 못 받는다. 참여를 늘리자고 만든
//   장치가 이미 잘하는 사람만 더 보이게 만들고 있었다.
//   누적(계속 나오면 받는다)과 첫 기록(누구나 한 번은 겪는다)은 그 반대편 축이다.
//
// 설계에서 정한 것:
//   · **평생 1회**다. 달성한 날짜(earned_at_date)를 함께 남겨 "언제 넘었나"를 보여준다.
//     중복 방지는 마이그레이션 092 의 부분 유니크 인덱스가 담당한다.
//   · 출전 단위는 **라운드(경기일)**다. 미라클은 하루에 짧은 경기를 여러 판 치르므로
//     경기 슬롯으로 세면 "10경기 출전"이 하루 만에 달성된다. 앱 전체가 R 기준으로 통일돼 있다.
//   · 커리어하이(득점/리바/어시)는 배지로 만들지 않는다. 값이 계속 갱신되는 '기록'이라
//     평생 1회 배지와 성격이 맞지 않고(첫 경기에 무조건 달성된다), 선수 카드에 이미 표가 있다.
//   · 첫 더블더블은 새로 계산하지 않고 **이미 쌓인 double_double 배지 중 가장 이른 날**을 쓴다.
//     같은 판정을 두 곳에서 하면 언젠가 서로 어긋난다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { scorePoints, fetchScoringRules } from '../stats/scoring'
import { fetchExternalTeamIds } from '../league/externalPlayers'
import type { BadgePayload } from './computeBadges'

/** 출전 라운드 임계값 — 넘을 때마다 하나씩 */
const ROUND_TIERS = [10, 25, 50, 100] as const
/** 누적 득점 임계값 */
const PTS_TIERS = [100, 250, 500, 1000] as const
/** 3점으로 치는 이벤트 — 자유투 3점짜리(ft_3pt_*)는 슛이 아니라 제외한다 */
const THREE_TYPES = new Set(['shot_3p'])

const PAGE = 1000

export type CareerBadgeType =
  | `career_rounds_${(typeof ROUND_TIERS)[number]}`
  | `career_pts_${(typeof PTS_TIERS)[number]}`
  | 'career_first_three'
  | 'career_first_dd'

/**
 * 리그 전체를 훑어 커리어 배지를 만든다.
 *
 * 누적 배지는 정의상 과거 전체를 봐야 하므로 경기 하나만 보고 증분 계산할 수 없다.
 * 재계산 라우트에서 통째로 돌린다.
 */
export async function computeCareerBadges(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<BadgePayload[]> {
  const rules = await fetchScoringRules(supabase, leagueId)
  const externalTeamIds = await fetchExternalTeamIds(supabase, leagueId)

  // 게스트는 순위표에서 빠지듯 커리어 배지도 받지 않는다 — 정회원의 누적을 세는 축이다.
  const { data: playerRows, error: pErr } = await supabase
    .from('league_players')
    .select('id, is_guest')
    .eq('league_id', leagueId)
  if (pErr) throw new Error(`careerBadges: league_players 조회 실패 — ${pErr.message}`)
  const guestIds = new Set((playerRows ?? []).filter((p: { is_guest: boolean | null }) => p.is_guest).map((p: { id: string }) => p.id))

  // 경기 → 날짜 · 플러스원 대상
  const { data: games, error: gErr } = await supabase
    .from('league_games')
    .select('id, date, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
  if (gErr) throw new Error(`careerBadges: league_games 조회 실패 — ${gErr.message}`)

  const gameDate = new Map<string, string>()
  const gamePlusOne = new Map<string, string | null>()
  for (const g of (games ?? []) as Array<{ id: string; date: string; plus_one_player_id: string | null }>) {
    gameDate.set(g.id, g.date)
    gamePlusOne.set(g.id, g.plus_one_player_id)
  }
  if (gameDate.size === 0) return []

  // 이벤트 전량 — 1000행 페이지네이션 필수(조용히 잘리면 누적이 과소 집계된다)
  type Ev = { league_game_id: string; league_player_id: string | null; team_id: string | null; type: string; result: string | null }
  const events: Ev[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from('league_game_events')
      .select('league_game_id, league_player_id, team_id, type, result')
      .in('league_game_id', [...gameDate.keys()])
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw new Error(`careerBadges: 이벤트 조회 실패 — ${error.message}`)
    const rows = (data ?? []) as Ev[]
    events.push(...rows)
    if (rows.length < PAGE) break
  }

  // 날짜 오름차순으로 훑어야 "언제 넘었는지"가 나온다. 이벤트 자체엔 날짜가 없어 경기로 되짚는다.
  const byDate = new Map<string, Ev[]>()
  for (const e of events) {
    if (!e.league_player_id || guestIds.has(e.league_player_id)) continue
    // 상대(외부) 팀으로 뛴 이벤트는 우리 리그 누적이 아니다.
    if (e.team_id && externalTeamIds.has(e.team_id)) continue
    const d = gameDate.get(e.league_game_id)
    if (!d) continue
    const arr = byDate.get(d)
    if (arr) arr.push(e); else byDate.set(d, [e])
  }
  const dates = [...byDate.keys()].sort()

  const out: BadgePayload[] = []
  const roundCount = new Map<string, number>()
  const ptsTotal = new Map<string, number>()
  const doneTiers = new Set<string>()   // `${playerId}:${badgeType}` — 같은 배지를 두 번 내지 않는다
  const firstThreeDone = new Set<string>()

  const emit = (playerId: string, badgeType: string, date: string, meta: Record<string, unknown>) => {
    const key = `${playerId}:${badgeType}`
    if (doneTiers.has(key)) return
    doneTiers.add(key)
    out.push({ league_id: leagueId, player_id: playerId, game_id: null, badge_type: badgeType as never, earned_at_date: date, meta })
  }

  for (const date of dates) {
    const dayEvents = byDate.get(date)!
    const appeared = new Set<string>()

    for (const e of dayEvents) {
      const pid = e.league_player_id!
      appeared.add(pid)

      // 첫 3점 — 성공한 3점슛이 처음 나온 날
      if (e.result === 'made' && THREE_TYPES.has(e.type) && !firstThreeDone.has(pid)) {
        firstThreeDone.add(pid)
        emit(pid, 'career_first_three', date, { type: e.type })
      }

      const isPlusOne = gamePlusOne.get(e.league_game_id) === pid
      const pts = scorePoints(e.type, e.result, isPlusOne, rules)
      if (pts > 0) ptsTotal.set(pid, (ptsTotal.get(pid) ?? 0) + pts)
    }

    // 출전 라운드는 그날 이벤트가 하나라도 있으면 1 — 하루에 여러 판을 뛰어도 1이다.
    for (const pid of appeared) {
      roundCount.set(pid, (roundCount.get(pid) ?? 0) + 1)
    }

    // 임계값 통과 판정은 그날 집계가 끝난 뒤에 한 번만 — 이벤트마다 검사하면 같은 날 중복 판정이 난다.
    for (const pid of appeared) {
      const r = roundCount.get(pid) ?? 0
      for (const tier of ROUND_TIERS) {
        if (r >= tier) emit(pid, `career_rounds_${tier}`, date, { rounds: r })
      }
      const p = ptsTotal.get(pid) ?? 0
      for (const tier of PTS_TIERS) {
        if (p >= tier) emit(pid, `career_pts_${tier}`, date, { pts: p })
      }
    }
  }

  // 첫 더블더블 — 이미 쌓인 배지에서 가장 이른 날을 가져온다(판정을 두 번 하지 않는다).
  const { data: ddRows, error: ddErr } = await supabase
    .from('player_badges')
    .select('player_id, earned_at_date')
    .eq('league_id', leagueId)
    .eq('badge_type', 'double_double')
    .order('earned_at_date', { ascending: true })
  if (ddErr) throw new Error(`careerBadges: double_double 조회 실패 — ${ddErr.message}`)
  for (const r of (ddRows ?? []) as Array<{ player_id: string; earned_at_date: string }>) {
    if (guestIds.has(r.player_id)) continue
    emit(r.player_id, 'career_first_dd', r.earned_at_date, {})
  }

  return out
}
