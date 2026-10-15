// 통산(전체 기간) 순위 — 순수 함수만 (2026-10-14).
// 참고: kbl-stats `lib/records.ts` 의 withRanks(공동 순위)·역대 통산 순위 보드.
//
// 재료는 `computeLeagueStats` 를 분기 없이 부른 결과(= 그 리그의 모든 정규 경기, 친선전 제외)다.
//   새 집계를 만들지 않는다 — 통산 숫자가 스탯 탭 「전체」와 다르면 사용자가 둘 중 하나를 의심하게 된다.
// 마일스톤의 「통산 득점 N위」도 같은 withRanks 로 순위를 매긴다(마일스톤 누적 = 같은 경기·같은 채점).

/**
 * 공동 순위 매기기 — 이미 값 큰 순으로 정렬된 배열에 rank 를 붙인다.
 * 앞 사람과 값이 같으면 같은 순위, 다르면 「자기 자리 + 1」 (1, 2, 2, 4 …).
 */
export function withRanks<T>(sorted: readonly T[], valueOf: (t: T) => number): (T & { rank: number })[] {
  let rank = 0
  return sorted.map((r, i) => {
    if (i === 0 || valueOf(r) !== valueOf(sorted[i - 1])) rank = i + 1
    return { ...r, rank }
  })
}

/** 통산 누적 보드의 부문 — 배열 순서 = 화면(칩) 순서.
 *  (2026-10-14) 스탯 탭 「기록실」이 이 보드 하나가 되면서 부문을 늘렸다. 전부 computeLeagueStats 의
 *  **누적 합계 필드 그대로**다 — 새로 세지 않는다(「선수 숫자는 한 벌」). 비율·평균은 넣지 않는다(누적 보드다). */
export type CareerStatKey =
  | 'pts' | 'reb' | 'oreb' | 'dreb' | 'ast' | 'stl' | 'blk'
  | 'fg3m' | 'fg2m' | 'fgm' | 'ftm' | 'and_one' | 'gp'

export const CAREER_STATS: readonly { key: CareerStatKey; label: string; unit: string }[] = [
  { key: 'gp',      label: '출전일',   unit: '일' },
  { key: 'pts',     label: '득점',     unit: '점' },
  { key: 'reb',     label: '리바운드',  unit: '개' },
  { key: 'ast',     label: '어시스트',  unit: '개' },
  { key: 'stl',     label: '스틸',     unit: '개' },
  { key: 'blk',     label: '블락',     unit: '개' },
  { key: 'fg3m',    label: '3점 성공',  unit: '개' },
  { key: 'fg2m',    label: '2점 성공',  unit: '개' },
  { key: 'fgm',     label: '야투 성공', unit: '개' },
  { key: 'ftm',     label: '자유투 성공', unit: '개' },
  { key: 'oreb',    label: '공격 리바', unit: '개' },
  { key: 'dreb',    label: '수비 리바', unit: '개' },
  { key: 'and_one', label: '앤드원',   unit: '개' },
]

/** 통산 보드 기본 인원 */
export const CAREER_TOP = 5

export interface CareerInput {
  player_id: string
  name: string
}

/**
 * 한 부문 통산 상위 — 값 큰 순 → 같으면 이름순(가나다). 0 은 뺀다.
 * 공동 순위 때문에 top 을 넘는 인원이 나올 수 있다(5위가 둘이면 6명) — 순위 기준으로 자른다.
 */
export function careerTop<T extends CareerInput>(
  players: readonly T[],
  valueOf: (p: T) => number,
  top: number = CAREER_TOP,
): (T & { rank: number; value: number })[] {
  const rows = players
    .map(p => ({ ...p, value: valueOf(p) || 0 }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'ko'))
  return withRanks(rows, r => r.value).filter(r => r.rank <= top)
}

/** 값 맵(선수 → 누적)에서 한 선수의 공동 순위. 값이 0 이하이거나 없으면 null */
export function rankIn(values: ReadonlyMap<string, number>, id: string): number | null {
  const mine = values.get(id)
  if (mine == null || mine <= 0) return null
  let above = 0
  for (const v of values.values()) if (v > mine) above++
  return above + 1
}

/** 「역대 3위」 */
export const careerRankLabel = (rank: number) => `역대 ${rank}위`
