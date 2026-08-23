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
}

export function isPlusOneFor(
  playerId: string | null | undefined,
  game: GamePlusOne | null | undefined,
  globalPlusOne: Set<string>,
): boolean {
  if (!playerId) return false
  const extra = game?.plus_one_extra_ids
  if (extra && extra.length > 0 && extra.includes(playerId)) return true
  const designated = game?.plus_one_player_id
  if (designated != null) return playerId === designated
  return globalPlusOne.has(playerId)
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
  return { event_points: r.event_points, plus_one_bonus: r.plus_one_bonus }
}
