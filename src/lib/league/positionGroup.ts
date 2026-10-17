// 리그 포지션은 「가드·포워드·센터」 세 가지뿐이다 (2026-10-17 운영진 결정).
//
// 저장값: 새로 고르는 값은 'G' · 'F' · 'C'. 예전 5코드(PG·SG·SF·PF·C)로 저장된 선수는
//   **읽을 때 이 함수로 묶는다** — DB 를 고치지 않아도 모든 화면이 세 그룹으로 보인다.
//   여러 포지션("PG,SG")은 첫 번째로 적힌 것을 쓴다(드래프트 positions.ts 와 같은 규칙).
// ⚠ 포지션을 화면에 보이거나 같은 포지션끼리 비교할 때는 반드시 이 파일을 쓴다 — 5코드를 다시 쓰지 말 것.
//   파란날개(팀 화면)는 이 규칙 밖이다.

export type PositionGroupCode = 'G' | 'F' | 'C'

export const POSITION_GROUPS: readonly { code: PositionGroupCode; label: string }[] = [
  { code: 'G', label: '가드' },
  { code: 'F', label: '포워드' },
  { code: 'C', label: '센터' },
] as const

const MAP: Record<string, PositionGroupCode> = {
  G: 'G', PG: 'G', SG: 'G', '가드': 'G',
  F: 'F', SF: 'F', PF: 'F', '포워드': 'F',
  C: 'C', '센터': 'C',
}

/** 저장된 포지션 문자열 → 그룹. 없거나 모르는 값이면 null */
export function positionGroupOf(raw: string | null | undefined): PositionGroupCode | null {
  for (const part of (raw ?? '').split(',')) {
    const key = part.trim().toUpperCase()
    const g = MAP[key] ?? MAP[part.trim()]
    if (g) return g
  }
  return null
}

export function positionGroupLabel(code: PositionGroupCode | null | undefined): string {
  return POSITION_GROUPS.find(p => p.code === code)?.label ?? ''
}

/** 저장된 문자열을 바로 「가드」 등으로 — 없으면 '' */
export function positionLabelOf(raw: string | null | undefined): string {
  return positionGroupLabel(positionGroupOf(raw))
}
