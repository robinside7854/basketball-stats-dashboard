'use client'
import { Tooltip } from '@/components/ui/tooltip'
import { statDef } from '@/lib/stats/glossary'

interface Props {
  term: string
  label?: string
  className?: string
  children?: React.ReactNode
}

/**
 * 스탯 컬럼 헤더 · 인라인 라벨용. 용어집(GLOSSARY)에 등록된 term 은 자동으로 툴팁 표시.
 *
 * 사용 예:
 *   <StatHeader term="TS%" />          → "TS%" 라벨 + 툴팁
 *   <StatHeader term="APG" label="A" /> → 짧은 라벨 "A" 지만 툴팁은 APG 설명
 */
export default function StatHeader({ term, label, className, children }: Props) {
  const def = statDef(term)
  const display = children ?? label ?? def?.short ?? term

  if (!def) {
    return <span className={className}>{display}</span>
  }

  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <div className="font-bold text-white">{def.long}</div>
          {def.formula && (
            <div className="font-mono text-[10px] text-amber-300 whitespace-pre-wrap">{def.formula}</div>
          )}
          <div className="text-gray-300 leading-relaxed">{def.description}</div>
        </div>
      }
    >
      <span className={`cursor-help underline decoration-dotted decoration-gray-600 underline-offset-2 ${className ?? ''}`}>
        {display}
      </span>
    </Tooltip>
  )
}
