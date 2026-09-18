// 드래프트 화면 공용 포지션 메타 — 색·아이콘·라벨을 한 곳에서만 정한다.
//
// 왜 모듈로 빼는가: 픽 모달의 열 머리띠·행 좌측 테두리·행 안의 태그, 그리고 요약 카드가
// 서로 다른 파일에 있다. 같은 포지션이 화면마다 다른 색이면 "색으로 구분한다"는 전제가
// 무너지므로, 색을 파일마다 적지 않고 여기서만 읽어 쓴다.
//
// 2026-09-18: 화면 구분 단위를 5코드(PG/SG/SF/PF/C)에서 **3그룹**(가드·포워드·센터)으로 줄였다.
//   리허설에서 390px 5열은 열마다 2~3명뿐이라 "몇 명 남았나"가 눈에 안 들어왔다.
//   선수 개인의 코드는 행 안의 태그로 그대로 남는다 — 분류만 굵게, 표기는 그대로.

import { Compass, Wind, Shield, Users, type LucideIcon } from 'lucide-react'
import { contrastRatio } from '@/lib/util/contrastColor'

/** 선수 개인에게 붙는 포지션 코드 — 행 태그에 그대로 쓴다. */
export const POSITION_CODES = ['PG', 'SG', 'SF', 'PF', 'C'] as const
export type PositionCode = (typeof POSITION_CODES)[number]

export const GUARD = '가드'
export const FORWARD = '포워드'
export const CENTER = '센터'
export const OTHER = '기타'

/** 화면에 세로 열/구역으로 세울 순서. 코드가 없거나 모르는 값은 전부 「기타」로 모은다. */
export const POSITION_GROUP_ORDER = [GUARD, FORWARD, CENTER, OTHER] as const
export type PositionGroup = (typeof POSITION_GROUP_ORDER)[number]

const CODE_TO_GROUP: Record<PositionCode, PositionGroup> = {
  PG: GUARD, SG: GUARD, SF: FORWARD, PF: FORWARD, C: CENTER,
}

/**
 * 색 위에 얹을 글자색 — 흰/검 중 **대비가 큰 쪽**을 고른다.
 *
 * 휘도 임계값(textOnBg)으로 고르면 #3B82F6 이 흰색으로 떨어져 3.68:1 이 된다(AA 미달).
 * 실측: 검은 글자가 가드 5.38 · 포워드 7.80 · 센터 5.26 으로 통과하고,
 * 기타(#6B7280)만 흰 글자 4.83 로 통과한다. 그래서 "흰 글자 고정"이 아니라 색마다 계산해 둔다.
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

const RAW: Record<PositionGroup, { label: string; color: string; Icon: LucideIcon }> = {
  [GUARD]: { label: GUARD, color: '#3B82F6', Icon: Compass },
  [FORWARD]: { label: FORWARD, color: '#10B981', Icon: Wind },
  [CENTER]: { label: CENTER, color: '#EF4444', Icon: Shield },
  [OTHER]: { label: OTHER, color: '#6B7280', Icon: Users },
}

export const POSITION_META: Record<PositionGroup, PositionMeta> = Object.fromEntries(
  Object.entries(RAW).map(([k, v]) => [k, { ...v, ink: inkFor(v.color) }]),
) as Record<PositionGroup, PositionMeta>

/**
 * "SG, SF" 처럼 복수 포지션인 선수는 **첫 번째로 적힌 포지션**의 코드만 본다.
 * 양쪽에 중복 노출하면 "몇 명 남았나"를 눈으로 셀 수 없게 된다(같은 이름이 두 번 보임).
 */
export function primaryCode(raw: string | null | undefined): PositionCode | null {
  const first = (raw ?? '').split(',')[0]?.trim().toUpperCase()
  if (!first) return null
  return (POSITION_CODES as readonly string[]).includes(first) ? (first as PositionCode) : null
}

/** 선수를 세울 그룹. 이름은 옛 API 그대로 두되 반환값이 그룹이다. */
export function primaryPosition(raw: string | null | undefined): PositionGroup {
  const code = primaryCode(raw)
  return code ? CODE_TO_GROUP[code] : OTHER
}

/** 알 수 없는 코드가 들어와도 화면이 비지 않도록 항상 메타를 돌려준다. */
export function positionMeta(raw: string | null | undefined): PositionMeta {
  return POSITION_META[primaryPosition(raw)]
}
