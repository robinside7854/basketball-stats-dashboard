'use client'
// 스탯 컬럼 헤더 · 라벨 + 물음표 아이콘 (호버·클릭 툴팁).
// StatHelpTooltip 이 실제 UI 담당 (PC 호버 · 모바일 탭 모두 지원).

import { statDef } from '@/lib/stats/glossary'
import StatHelpTooltip from '@/components/stats/StatHelpTooltip'

interface Props {
  term: string
  label?: string
  className?: string
  children?: React.ReactNode
  /** 물음표 아이콘 사이즈 (기본 11) */
  helpSize?: number
  /** 물음표 숨기고 라벨만 (예: 툴팁 표시 필요 없을 때) */
  hideHelp?: boolean
}

/**
 * 스탯 컬럼 헤더 · 인라인 라벨용. 용어집(GLOSSARY)에 등록된 term 은 자동으로 툴팁 표시.
 *
 * 사용:
 *   <StatHeader term="TS%" />           → "TS%" + ? 아이콘 (호버/클릭 툴팁)
 *   <StatHeader term="APG" label="A" /> → "A" 라벨, 툴팁은 APG 설명
 *   <StatHeader term="TS%" hideHelp />  → 툴팁 없이 라벨만
 */
export default function StatHeader({ term, label, className, children, helpSize = 11, hideHelp = false }: Props) {
  const def = statDef(term)
  const display = children ?? label ?? def?.short ?? term

  if (!def || hideHelp) {
    return <span className={className}>{display}</span>
  }

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
      <span>{display}</span>
      <StatHelpTooltip statKey={term} size={helpSize} />
    </span>
  )
}
