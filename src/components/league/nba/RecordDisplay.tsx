// 승패 표현 공용 컴포넌트 (2026-07-19)
//   · ResultChips: WIN / LOSE / DRAW 컬러 라벨 (녹/적/회)
//   · ScoreTable:  득점 / 실점 / 마진 3열 미니 테이블
// 홈 팀 승률 + 라운드 요약 카드에서 공통 사용.

// WIN/LOSE/DRAW 컬러 정의
// bg/border는 반투명 rgba라 다크 모드 근-흑 패널 위에서 옅게 블렌드됨.
// fg는 --mm-positive/--mm-negative/--mm-neutral-strong 토큰(globals.css)으로 다크 모드 별도 상향 —
// 고정 hex를 쓰면 다크 패널 위에서 대비가 1.9~3.7:1 로 무너짐 (2026-07-22 수정).
const RESULT_COLORS = {
  win:  { bg: 'rgba(16,185,129,0.12)',  border: '#10B981', fg: 'var(--mm-positive)' },       // emerald
  lose: { bg: 'rgba(220,38,38,0.12)',   border: '#EF4444', fg: 'var(--mm-negative)' },       // red
  draw: { bg: 'rgba(148,163,184,0.15)', border: '#94A3B8', fg: 'var(--mm-neutral-strong)' }, // slate
} as const

// 1위 팀 배경(노랑) 위에서 사용할 오버라이드 (contrast 확보)
const RESULT_COLORS_TOP = {
  win:  { bg: 'rgba(0,0,0,0.08)',  border: 'rgba(0,0,0,0.35)', fg: '#065F46' },
  lose: { bg: 'rgba(0,0,0,0.08)',  border: 'rgba(0,0,0,0.35)', fg: '#991B1B' },
  draw: { bg: 'rgba(0,0,0,0.08)',  border: 'rgba(0,0,0,0.35)', fg: 'rgba(0,0,0,0.7)' },
} as const

type ChipVariant = 'win' | 'lose' | 'draw'

interface ResultChipProps {
  label: 'WIN' | 'LOSE' | 'DRAW'
  count: number
  variant: ChipVariant
  isTop?: boolean
  compact?: boolean  // 라운드 카드용 조금 작게
}

export function ResultChip({ label, count, variant, isTop = false, compact = false }: ResultChipProps) {
  const c = isTop ? RESULT_COLORS_TOP[variant] : RESULT_COLORS[variant]
  const pad = compact ? '2px 6px' : '3px 8px'
  const labelSize = compact ? '10px' : '11px'
  const countSize = compact ? '12px' : '13px'
  return (
    <span
      className="inline-flex items-center gap-1 font-black uppercase"
      style={{
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        padding: pad,
        borderRadius: '3px',
        lineHeight: 1.15,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ letterSpacing: '0.14em', fontSize: labelSize }}>{label}</span>
      <span className="tabular-nums" style={{ fontSize: countSize, letterSpacing: '-0.01em' }}>{count}</span>
    </span>
  )
}

interface ResultChipsProps {
  wins: number
  losses: number
  draws: number
  isTop?: boolean
  compact?: boolean
}

export function ResultChips({ wins, losses, draws, isTop = false, compact = false }: ResultChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ResultChip label="WIN" count={wins} variant="win" isTop={isTop} compact={compact} />
      <ResultChip label="LOSE" count={losses} variant="lose" isTop={isTop} compact={compact} />
      {draws > 0 && <ResultChip label="DRAW" count={draws} variant="draw" isTop={isTop} compact={compact} />}
    </div>
  )
}

interface ScoreTableProps {
  ptsFor: number
  ptsAgainst: number
  isTop?: boolean
  compact?: boolean
}

export function ScoreTable({ ptsFor, ptsAgainst, isTop = false, compact = false }: ScoreTableProps) {
  const diff = ptsFor - ptsAgainst
  const diffColor = isTop
    ? (diff > 0 ? 'rgba(0,0,0,0.85)' : diff < 0 ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.55)')
    : (diff > 0 ? 'var(--mm-positive)' : diff < 0 ? 'var(--mm-negative)' : 'var(--mm-muted)')
  const labelColor = isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)'
  const valueColor = isTop ? 'var(--mm-black)' : 'var(--mm-ink)'
  const cells: Array<{ label: string; value: string; color: string }> = [
    { label: '득점', value: String(ptsFor), color: valueColor },
    { label: '실점', value: String(ptsAgainst), color: valueColor },
    { label: '마진', value: diff > 0 ? `+${diff}` : String(diff), color: diffColor },
  ]
  const cellPad = compact ? '3px 5px' : '4px 6px'
  const labelSize = compact ? '9px' : '10px'
  const valueSize = compact ? '13px' : '15px'
  return (
    <div
      className="grid grid-cols-3 overflow-hidden"
      style={{
        border: `1px solid ${isTop ? 'rgba(0,0,0,0.25)' : 'var(--mm-rule)'}`,
        borderRadius: '4px',
      }}
      role="table"
      aria-label={`득점 ${ptsFor} · 실점 ${ptsAgainst} · 마진 ${diff > 0 ? '+' : ''}${diff}`}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className="text-center"
          style={{
            padding: cellPad,
            borderRight: i < cells.length - 1 ? `1px solid ${isTop ? 'rgba(0,0,0,0.15)' : 'var(--mm-rule)'}` : undefined,
          }}
          role="cell"
        >
          <div
            className="uppercase font-bold"
            style={{
              color: labelColor,
              fontSize: labelSize,
              letterSpacing: '0.12em',
              lineHeight: 1,
            }}
          >
            {cell.label}
          </div>
          <div
            className="font-jersey font-black tabular-nums"
            style={{
              color: cell.color,
              fontSize: valueSize,
              lineHeight: 1.1,
              marginTop: '2px',
              letterSpacing: '-0.01em',
            }}
          >
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  )
}
