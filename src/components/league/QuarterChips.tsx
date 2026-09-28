// 리그 스탯 계열 화면(리더보드·어워즈·팀순위)이 각자 그리던 분기 칩을 하나로 모은 것.
// 세 화면의 크기·문구·현재 분기 표시가 제각각이라 같은 선택(공유 컨텍스트)이 다른 컨트롤처럼 보였다.
export type QuarterChipItem = { id: string; label: string; isCurrent?: boolean }

export function QuarterChips({
  quarters,
  value,
  onChange,
  allLabel = '전체',
}: {
  quarters: QuarterChipItem[]
  value: string
  onChange: (v: string) => void
  allLabel?: string
}) {
  const chip = (id: string, label: string, isCurrent?: boolean) => {
    const active = value === id
    return (
      <button
        key={id}
        type="button"
        onClick={() => onChange(id)}
        aria-pressed={active}
        className="shrink-0 px-3 py-2 text-sm font-semibold transition-colors cursor-pointer btn-press min-h-[44px] whitespace-nowrap tabular-nums"
        style={active
          ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)' }
          : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
        }
      >
        {label}
        {isCurrent && (
          <span
            className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle"
            style={{ background: active ? 'var(--mm-yellow)' : 'var(--mm-yellow-strong)' }}
            aria-hidden
          />
        )}
      </button>
    )
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
      {chip('all', allLabel)}
      {quarters.map(q => chip(q.id, q.label, q.isCurrent))}
    </div>
  )
}
