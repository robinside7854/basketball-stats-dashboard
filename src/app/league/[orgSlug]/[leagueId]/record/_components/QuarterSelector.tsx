import { QUARTER_OPTIONS } from '../_lib/constants'
import type { Setter } from '../_lib/types'

// 쿼터 선택 — 기록 중에는 **항상** 보인다 (2026-10-12).
//   종전엔 쿼터 영상이 있는 날에만 보여서, 영상 없이 기록하는 날은 쿼터를 넘길 수단이
//   없었고 팀 파울도 쿼터로 나눌 수 없었다. 쿼터 영상이 있으면 누르는 순간
//   그 쿼터 영상으로 바뀌고(activeVideo), 없으면 기록 쿼터만 바뀐다.
export default function QuarterSelector({
  currentQuarter, setCurrentQuarter,
}: {
  currentQuarter: number
  setCurrentQuarter: Setter<number>
}) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-2 border-t border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]/60 overflow-x-auto" role="group" aria-label="기록 중인 쿼터">
      <span className="pl-1 shrink-0 text-xs font-semibold text-[color:var(--mm-ink-soft)]">쿼터</span>
      {QUARTER_OPTIONS.map(q => {
        const active = currentQuarter === q.value
        return (
          <button
            key={q.value}
            type="button"
            onClick={() => setCurrentQuarter(q.value)}
            aria-pressed={active}
            aria-label={`${q.label} 로 기록`}
            className={`h-11 min-w-11 shrink-0 px-3 text-xs font-black tabular-nums border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              active
                ? 'bg-amber-500 border-amber-400 text-[color:var(--mm-black)]'
                : 'bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-rule)] hover:text-[color:var(--mm-ink)]'
            }`}
          >
            {q.label}
          </button>
        )
      })}
    </div>
  )
}
