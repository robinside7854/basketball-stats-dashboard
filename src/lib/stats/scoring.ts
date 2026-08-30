/**
 * 리그 득점 채점 — 단일 진실.
 *
 * 이 파일이 생기기 전에는 득점 계산이 15곳에 흩어져 있었고, 세 갈래로 갈라져
 * 화면마다 총득점이 달랐다(타입 계산 7,114 / 저장값 7,108 · 불일치 6건).
 * 계산은 여기서만 한다. 다른 곳에 `case 'shot_3p'` 를 다시 쓰지 말 것.
 *
 * ⚠️ 값 import 금지 — 타입 import 만 허용한다.
 *    scripts/verify-scoring.mjs 가 Node 의 타입 스트리핑으로 이 파일을 직접 임포트해
 *    로직 복제 없이 검증한다. 값 import 가 생기면 그 검증이 깨진다.
 *    (`import type` 은 스트리핑에서 지워지므로 허용된다)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ScoringRules {
  /** 이벤트 타입 → 기본 득점. 여기 없는 타입은 0점(리바운드·스틸 등). */
  event_points: Record<string, number>
  /**
   * 플러스원 선수의 추가 득점.
   * applies_to 에 든 타입에만 붙는다 — 자유투·앤드원에는 붙지 않으며,
   * 그 사실을 코드가 아니라 데이터로 표현하기 위해 배열로 둔다.
   */
  plus_one_bonus: { amount: number; applies_to: string[] }
}

/**
 * 상대(외부) 팀 득점 — **대회 전용**.
 *
 * 대회는 상대 선수를 기록하지 않는다(우리 동호회 통계를 만드는 도구이고, 상대 선수 명단은
 * 알 수도 없다). 그런데 점수는 남아야 승패·전적·러닝 스코어가 성립한다. 그래서 선수 없이
 * **팀에만 붙는 득점 이벤트**를 둔다 — `league_player_id = null`, `team_id = 상대팀`.
 *
 * 왜 `opp_score` 하나에 points 를 담지 않고 1/2/3 세 타입으로 나눴는가
 *   이 파일의 채점은 "타입 → 점수" 표 하나로만 이뤄진다. 한 타입에 가변 점수를 담으면
 *   클라이언트가 보낸 points 를 믿어야 하는데(events POST 가 그 값을 통째로 무시하는 이유),
 *   그러면 저장값과 재계산값이 갈리는 이 모듈이 없애려던 바로 그 병이 돌아온다.
 *   타입으로 나누면 기존 파이프라인(scorePoints → team_id 로 홈/원정 가산)이 **그대로** 동작한다.
 *
 * ⚠ 리그 경기에는 이 타입이 쓰이지 않는다 — 양 팀 모두 우리 선수라 선수 단위로 기록한다.
 */
export const OPPONENT_SCORING: Record<string, number> = {
  opp_score_1: 1, opp_score_2: 2, opp_score_3: 3,
}

/**
 * 표준 아마추어 농구 룰. leagues.rules 컬럼 기본값(마이그레이션 080)과 같은 값.
 *
 * 자유투는 국내 동호회 자체전 관행을 따른다 — 2점슛 파울은 1구에 2점(ft_2pt),
 * 3점슛 파울은 2점 + 1점(ft_3pt_1 + ft_3pt_2). FIBA 기준(전부 1점)이 아니다.
 * 다른 방식을 쓰는 동호회는 온보딩 때 rules 로 예외를 준다.
 */
export const STANDARD_SCORING: ScoringRules = {
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 2, ft_3pt_1: 2, ft_3pt_2: 1, free_throw: 1, and_one: 1,
    ...OPPONENT_SCORING,
  },
  plus_one_bonus: { amount: 0, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
}

/**
 * 플러스원 판정 — **단일 진실**.
 *
 * 이 함수가 생기기 전에는 판정식이 28곳에 복붙돼 있었다(득점 계산이 15곳에 흩어져 있던 것과
 * 같은 병). 규칙이 하나 늘 때마다 28곳을 똑같이 고쳐야 하고, 하나만 빠뜨려도 화면마다
 * 점수가 갈린다 — 그런데 숫자는 그럴듯해서 아무도 눈치채지 못한다.
 *
 * 우선순위
 *   1. `plus_one_extra_ids` 에 있으면 +1 (**이 경기 한정 추가**, 110).
 *      다른 두 갈래를 밀어내지 않고 *더해지는* 집합이다.
 *   2. `plus_one_player_id` 가 지정돼 있으면 **그 사람만** +1 (충돌 해소용 배타 지정).
 *   3. 아무 지정도 없으면 선수 단위 전역 플래그(`league_players.plus_one`).
 *
 * ⚠ 2 번이 배타라는 점이 핵심이다. 한 팀에 +1 이 둘이라 하나를 고른 경기에서는, 고르지 않은
 *   쪽이 전역 플래그가 켜져 있어도 +1 이 아니다. "추가" 는 1 번으로만 한다.
 */
export interface GamePlusOne {
  plus_one_player_id?: string | null
  /** 이 경기에서만 +1 (110). 없거나 빈 배열이면 영향 없음. */
  plus_one_extra_ids?: string[] | null
  /**
   * 선수별 +1 유효 쿼터 (113). `{ "<playerId>": [1,2] }`
   *
   * 전반과 후반의 +1 선수가 다른 경기가 있다. 위 세 갈래는 전부 **경기 단위**라
   * 둘 중 하나만 고를 수 있었고, 어느 쪽으로 정하든 절반이 틀린 점수가 됐다.
   * 키가 없으면 전 쿼터 적용 = 기존 동작. 그래서 기존 경기의 채점은 하나도 안 바뀐다.
   */
  plus_one_quarters?: Record<string, number[]> | null
}

/**
 * @param quarter 이 이벤트의 쿼터. **명시적으로 넘긴다** — 옵셔널로 두면 안 넘긴 곳이
 *   조용히 "전 쿼터 +1" 로 계산돼 화면마다 점수가 갈린다(이 파일이 없애려는 바로 그 병).
 *   쿼터를 알 수 없는 자리(집계 단위가 경기인 곳 등)는 `null` 을 넘겨 그 사실을 드러낸다.
 */
export function isPlusOneFor(
  playerId: string | null | undefined,
  game: GamePlusOne | null | undefined,
  globalPlusOne: Set<string>,
  quarter: number | null | undefined,
): boolean {
  if (!playerId) return false

  // 1) 경기 단위 판정 — 기존 삼단논법 그대로
  let eligible: boolean
  const extra = game?.plus_one_extra_ids
  const designated = game?.plus_one_player_id
  if (extra && extra.length > 0 && extra.includes(playerId)) eligible = true
  else if (designated != null) eligible = playerId === designated
  else eligible = globalPlusOne.has(playerId)
  if (!eligible) return false

  // 2) 쿼터 제한 — 지정이 있을 때만 좁힌다.
  //    쿼터를 모르는 호출(quarter == null)은 좁히지 않는다. 좁히면 "모르니까 +1 아님" 이 되어
  //    통산 집계에서 점수가 조용히 줄어든다 — 모를 때는 기존 동작(경기 단위)을 유지하는 게 맞다.
  const limit = game?.plus_one_quarters?.[playerId]
  if (limit && limit.length > 0 && quarter != null) return limit.includes(quarter)
  return true
}

/**
 * 이벤트 하나의 득점.
 * 성공(made)이 아니면 0점 — 실패 슛·교체·파울처럼 result 가 null 인 이벤트도 여기서 걸러진다.
 */
export function scorePoints(
  type: string,
  result: string | null | undefined,
  isPlusOne: boolean,
  rules: ScoringRules,
): number {
  if (result !== 'made') return 0
  const base = rules.event_points[type]
  if (base === undefined) return 0
  const bonus = isPlusOne && rules.plus_one_bonus.applies_to.includes(type)
    ? rules.plus_one_bonus.amount
    : 0
  return base + bonus
}

/**
 * 시즌의 채점 룰을 읽는다.
 *
 * 폴백(표준 룰)은 "행은 정상적으로 조회됐지만 rules 가 비었거나 형식이 안 맞는" 경우에만
 * 쓴다 — 신규 시즌은 DB 기본값이 이미 표준 룰이라 실제로는 거의 발생하지 않는다.
 * 쿼리 자체가 실패한 경우(권한 오류·네트워크·잘못된 leagueId)는 폴백과 절대 구분 없이
 * 넘어가면 안 된다 — 커스텀 룰을 못 읽어온 리그가 조용히 표준 룰로 채점되는,
 * 이 모듈이 없애려는 바로 그 종류의 소리 없는 불일치이기 때문이다. 그래서 에러는 던진다.
 *
 * `import type` 은 Node 의 타입 스트리핑에서 지워지므로 값 import 금지 제약에 걸리지 않는다.
 * 구조적 타입을 직접 쓰면 supabase 빌더의 실제 형태와 어긋나 타입 오류가 나기 쉬워
 * 공식 타입을 그대로 쓴다.
 */
export async function fetchScoringRules(sb: SupabaseClient, leagueId: string): Promise<ScoringRules> {
  const { data, error } = await sb.from('leagues').select('rules').eq('id', leagueId).maybeSingle()
  if (error) {
    throw new Error(`fetchScoringRules: leagueId=${leagueId} 조회 실패 — ${error.message}`)
  }
  const r = data?.rules as Partial<ScoringRules> | undefined
  if (!r?.event_points || !r?.plus_one_bonus) return STANDARD_SCORING
  // 상대 득점 타입은 **룰 데이터가 아니라 구조**다 — 동호회가 정할 여지가 없고(2점은 2점),
  //   시즌 rules 에 안 적혀 있다고 상대 점수가 0이 되면 대회 스코어가 통째로 비어 버린다.
  //   그래서 밑에 깔고 시즌 룰로 덮는다(시즌 룰이 같은 키를 쓰면 그쪽이 이긴다).
  //   기존 리그에는 이 타입의 이벤트가 0건이라 채점 결과가 하나도 바뀌지 않는다.
  return { event_points: { ...OPPONENT_SCORING, ...r.event_points }, plus_one_bonus: r.plus_one_bonus }
}
