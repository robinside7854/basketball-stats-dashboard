// 더블더블·트리플더블 판정 — 화면(박스스코어 배지)과 서버(computeBadges 라운드 배지)의 단일 진실.
// 규칙이 두 군데로 갈라지면 표에 붙은 DD 와 선수 카드의 배지가 서로 다른 말을 하게 된다.

/** 판정 대상 지표. 순서는 meta.categories 로 DB 에 그대로 저장되므로 바꾸면 기존 배지와 어긋난다. */
export const DD_CATEGORIES = ['pts', 'reb', 'ast', 'stl', 'blk'] as const
export type DdCategory = (typeof DD_CATEGORIES)[number]

export type DdStatLine = Record<DdCategory, number>

/** 10 이상인 지표 목록. 반환 순서는 DD_CATEGORIES 순서. */
export function doubleDoubleCategories(s: DdStatLine): DdCategory[] {
  return DD_CATEGORIES.filter(k => s[k] >= 10)
}

/**
 * 하루 합산 기준 판정. 10 이상인 지표가 3개 이상이면 'TD', 정확히 2개면 'DD', 그 외 null.
 * TD 를 받은 선수에게 DD 는 주지 않는다(배타적).
 */
export function doubleDoubleKind(s: DdStatLine): 'TD' | 'DD' | null {
  const n = doubleDoubleCategories(s).length
  if (n >= 3) return 'TD'
  if (n === 2) return 'DD'
  return null
}
