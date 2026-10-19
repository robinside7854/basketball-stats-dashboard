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
        className="min-w-0 px-1 sm:px-3.5 py-2 text-sm font-semibold transition-colors cursor-pointer mm-press min-h-[44px] whitespace-nowrap tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
        style={active
          ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', borderRadius: 'var(--mm-radius-chip)' }
          : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }
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
    // 가로 스크롤 없이 한 줄에 같은 폭으로 — 칸이 모자라면 다음 줄로 넘어간다(운영진 2026-10-19).
    //   375px 에서 「전체」+ 분기 4개(5칸)가 한 줄에 들어간다. 넓은 화면은 칸을 늘리지 않고 줄바꿈만 한다.
    <div className="grid gap-1.5 sm:flex sm:flex-wrap sm:gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(58px, 1fr))' }}>
      {chip('all', allLabel)}
      {quarters.map(q => chip(q.id, q.label, q.isCurrent))}
    </div>
  )
}
