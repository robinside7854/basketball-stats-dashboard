// 드래프트 화면 공용 포지션 메타 — 색·아이콘·라벨을 한 곳에서만 정한다.
//
// 왜 모듈로 빼는가: 픽 모달의 열 머리띠·행 좌측 테두리·행 안의 태그, 그리고 요약 카드가
// 서로 다른 파일에 있다. 같은 포지션이 화면마다 다른 색이면 "색으로 구분한다"는 전제가
// 무너지므로, 색을 파일마다 적지 않고 여기서만 읽어 쓴다.

import { Compass, Crosshair, Wind, Anchor, Shield, Users, type LucideIcon } from 'lucide-react'
import { contrastRatio } from '@/lib/util/contrastColor'

/** 화면에 세로 열로 세울 포지션 순서. 여기 없는 값(또는 빈 값)은 전부 「기타」로 모은다. */
export const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export const OTHER = '기타'

export type PositionCode = (typeof POSITION_ORDER)[number] | typeof OTHER

/**
 * 색 위에 얹을 글자색 — 흰/검 중 **대비가 큰 쪽**을 고른다.
 *
 * 휘도 임계값(textOnBg)으로 고르면 #3B82F6 이 흰색으로 떨어져 3.68:1 이 된다(AA 미달).
 * 실측: 흰 글자는 6색 중 5색이 4.5:1 에 못 미치고, 검은 글자는 5색이 통과한다
 * (PG 5.38 · SG 4.68 · SF 7.80 · PF 9.22 · C 5.26 / 기타 #6B7280 만 흰색 4.83).
 * 그래서 "흰 글자 고정"이 아니라 색마다 계산해 둔다.
 */
function inkFor(bg: string): '#ffffff' | '#0a0a0a' {
  return contrastRatio(bg, '#0a0a0a') >= contrastRatio(bg, '#ffffff') ? '#0a0a0a' : '#ffffff'
}

export interface PositionMeta {
  label: string
  color: string
  /** color 를 배경으로 쓸 때의 글자색 (WCAG 대비 큰 쪽) */
  ink: '#ffffff' | '#0a0a0a'
  Icon: LucideIcon
}

const RAW: Record<PositionCode, { label: string; color: string; Icon: LucideIcon }> = {
  PG: { label: 'PG', color: '#3B82F6', Icon: Compass },
  SG: { label: 'SG', color: '#8B5CF6', Icon: Crosshair },
  SF: { label: 'SF', color: '#10B981', Icon: Wind },
  PF: { label: 'PF', color: '#F59E0B', Icon: Anchor },
  C: { label: 'C', color: '#EF4444', Icon: Shield },
  [OTHER]: { label: OTHER, color: '#6B7280', Icon: Users },
}

export const POSITION_META: Record<PositionCode, PositionMeta> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [k, { ...v, ink: inkFor(v.color) }]),
) as Record<PositionCode, PositionMeta>

/**
 * "SG, SF" 처럼 복수 포지션인 선수는 **첫 번째로 적힌 포지션**으로만 분류한다.
 * 양쪽에 중복 노출하면 "몇 명 남았나"를 눈으로 셀 수 없게 된다(같은 이름이 두 번 보임).
 */
export function primaryPosition(raw: string | null | undefined): PositionCode {
  const first = (raw ?? '').split(',')[0]?.trim().toUpperCase()
  if (!first) return OTHER
  return (POSITION_ORDER as readonly string[]).includes(first) ? (first as PositionCode) : OTHER
}

/** 알 수 없는 코드가 들어와도 화면이 비지 않도록 항상 메타를 돌려준다. */
export function positionMeta(raw: string | null | undefined): PositionMeta {
  return POSITION_META[primaryPosition(raw)]
}
