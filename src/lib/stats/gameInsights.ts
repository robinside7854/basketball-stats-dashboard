// 어시스트 연결 · 공격 유형 · "이 경기에서 이 선수는 어느 팀" 판정 — 날짜별 박스스코어(daily-boxscore)와
// 팀 탭 「시즌 어시스트 · 공격 유형」(team-insights)이 같이 쓴다 (2026-10-12 리뉴얼 3단계).
//
// ⚠ 판정을 라우트 안에 다시 쓰지 말 것. 두 벌로 갈라지면 하루 화면과 시즌 화면의 숫자가 어긋난다
//   (`isPlusOneFor()` · `boxLine.ts` 를 만든 것과 같은 병).

import { isAssistEvent, FIELD_SHOT_TYPES } from '@/lib/stats/boxLine'

type EventLike = {
  type: string
  result: string | null
  league_player_id: string | null
  related_player_id?: string | null
}

/**
 * 어시스트 한 건 → 패스한 선수(from) · 득점한 선수(to). 어시스트가 아니면 null.
 * 판정은 박스스코어 AST 와 같은 `isAssistEvent` — 네트워크의 합과 표의 AST 가 일치한다.
 */
export function assistPairOf(e: EventLike): { from: string; to: string } | null {
  if (!isAssistEvent(e.type, e.result, e.related_player_id ?? null)) return null
  const from = e.related_player_id as string
  const to = e.league_player_id
  if (!from || !to || from === to) return null
  return { from, to }
}

/**
 * 야투 한 건 → 유형 · 성공 여부. 야투(FIELD_SHOT_TYPES)가 아니거나 선수가 없으면 null.
 * applyEventToBoxLine 과 같은 규칙이라 유형별 합 = 박스스코어 FG 다.
 */
export function fieldShotOf(e: EventLike): { type: string; made: boolean } | null {
  if (!FIELD_SHOT_TYPES.includes(e.type)) return null
  if (!e.league_player_id) return null
  return { type: e.type, made: e.result === 'made' }
}

/**
 * 이 경기에서 선수가 뛴 팀. 후보(이 경기 한정 배정 → 기록에 남은 팀 → 분기 소속 순)를 모아
 * **이 경기의 두 팀 중 하나**를 먼저 고른다. 순서대로 첫 값을 쓰면 분기 소속이 이 경기와 무관한
 * 팀을 돌려줘도 그대로 박혀, 그 선수가 박스스코어·팀비교에서 사라진다(2026-08-23).
 * 두 팀 중 어느 것도 아니면 첫 후보(종전 동작).
 */
export function pickGameSideTeam(
  candidates: (string | null | undefined)[],
  homeTeamId: string | null | undefined,
  awayTeamId: string | null | undefined,
): string | null {
  const cands = candidates.filter(Boolean) as string[]
  return cands.find(t => t === homeTeamId || t === awayTeamId) ?? cands[0] ?? null
}

/**
 * 어시스트 연결의 팀 — 같은 팀끼리의 패스이므로 득점자의 팀을 먼저, 없으면 패스한 선수의 팀.
 */
export function assistTeamOf<T extends { team_id: string | null }>(
  scorer: T | undefined,
  passer: T | undefined,
): T | undefined {
  return scorer?.team_id ? scorer : passer
}
