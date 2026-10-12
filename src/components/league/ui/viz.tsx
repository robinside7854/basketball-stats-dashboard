import type React from 'react'
// 숫자를 도형으로 — 회원 화면 공용 미니 시각화 (2026-10-12).
//
// 배경: 화면마다 「4승 2패 · 98-83 · 66.7%」처럼 숫자가 줄지어 있어 읽기가 느렸다.
//   같은 모양의 막대를 화면마다 따로 그리면 색·두께·글자 규칙이 갈라지므로 여기 하나에 모은다.
// 규칙
//   · 색만으로 뜻을 전하지 않는다 — 칸 안 글자 · aria-label · title 로 숫자를 함께 남긴다.
//   · 색은 --mm-* 토큰만(라이트/다크 공용). 팀 색은 호출부가 accentOrInk 를 거쳐 넘긴다.

import type { CSSProperties } from 'react'

/** 0~1 사이로 자른다 */
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)

// ─── 승·패·무 막대 ──────────────────────────────────────────────
// 길이 = 경기 수. 칸 안에 「4승」처럼 글자도 넣는다(칸이 좁아도 최소 폭 보장).
export function RecordBar({
  wins, losses, draws = 0, height = 28, showLabels = true, className = '',
}: { wins: number; losses: number; draws?: number; height?: number; showLabels?: boolean; className?: string }) {
  const total = wins + losses + draws
  if (total === 0) return <span className="t-label">아직 경기 없음</span>
  const segs = [
    { n: wins, label: '승', bg: 'var(--mm-positive-bg)', fg: 'var(--mm-positive-fg)' },
    { n: losses, label: '패', bg: 'var(--mm-negative-bg)', fg: 'var(--mm-negative-fg)' },
    { n: draws, label: '무', bg: 'var(--mm-neutral-bg)', fg: 'var(--mm-neutral-fg)' },
  ].filter(x => x.n > 0)
  return (
    <div
      className={`flex w-full overflow-hidden ${className}`}
      style={{ height, borderRadius: 'var(--mm-radius-chip)', border: '1px solid var(--mm-rule)' }}
      role="img"
      aria-label={`${wins}승 ${losses}패${draws > 0 ? ` ${draws}무` : ''}`}
    >
      {segs.map((x, i) => (
        <div
          key={x.label}
          className="flex items-center justify-center text-xs sm:text-sm font-black tabular-nums whitespace-nowrap px-1"
          style={{
            flexGrow: x.n, flexBasis: 0, minWidth: showLabels ? '2.5rem' : 6,
            background: x.bg, color: x.fg,
            borderLeft: i > 0 ? '2px solid var(--mm-panel)' : 'none',
          }}
        >
          {showLabels ? `${x.n}${x.label}` : null}
        </div>
      ))}
    </div>
  )
}

// ─── 승패 점 (●●○) ─────────────────────────────────────────────
// 경기 순서대로 결과를 점으로. 한 줄 요약용.
export function ResultDots({ results, size = 10 }: { results: Array<'W' | 'L' | 'D'>; size?: number }) {
  if (results.length === 0) return null
  const label = results.map(r => (r === 'W' ? '승' : r === 'L' ? '패' : '무')).join(' ')
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`경기 결과 ${label}`}>
      {results.map((r, i) => (
        <span
          key={i}
          className="inline-block rounded-full"
          style={{
            width: size, height: size,
            background: r === 'W' ? 'var(--mm-positive)' : r === 'L' ? 'transparent' : 'var(--mm-neutral-fg)',
            border: r === 'L' ? '2px solid var(--mm-negative)' : '1px solid transparent',
          }}
        />
      ))}
    </span>
  )
}

// ─── 진행 막대 ─────────────────────────────────────────────────
// value/max 비율. `mark` 는 기준선(예: 리그 평균) 위치 0~1.
export function ProgressBar({
  value, max = 1, mark, color = 'var(--mm-yellow-strong)', height = 6, label, className = '',
}: { value: number; max?: number; mark?: number | null; color?: string; height?: number; label?: string; className?: string }) {
  const ratio = clamp01(max > 0 ? value / max : 0)
  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height, background: 'var(--mm-panel-alt)', borderRadius: 999, border: '1px solid var(--mm-rule)' }}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <div style={{ width: `${ratio * 100}%`, height: '100%', background: color, borderRadius: 999 }} />
      {mark != null && (
        <span
          aria-hidden
          className="absolute top-[-2px] bottom-[-2px]"
          style={{ left: `calc(${clamp01(mark) * 100}% - 1px)`, width: 2, background: 'var(--mm-ink)' }}
          title="리그 평균"
        />
      )}
    </div>
  )
}

// ─── 양쪽으로 갈라지는 막대 (득점 vs 실점 등) ───────────────────
// 왼쪽 = a, 오른쪽 = b. 두 값을 같은 축에서 길이로 비교한다.
export function VersusBar({
  a, b, aColor = 'var(--mm-positive)', bColor = 'var(--mm-negative)', height = 10, aLabel, bLabel,
}: { a: number; b: number; aColor?: string; bColor?: string; height?: number; aLabel?: string; bLabel?: string }) {
  const total = a + b
  const ra = total > 0 ? a / total : 0.5
  return (
    <div
      className="flex w-full overflow-hidden"
      style={{ height, borderRadius: 999, border: '1px solid var(--mm-rule)' }}
      role="img"
      aria-label={`${aLabel ?? 'A'} ${a} 대 ${bLabel ?? 'B'} ${b}`}
    >
      <div style={{ width: `${ra * 100}%`, background: aColor }} />
      <div style={{ width: `${(1 - ra) * 100}%`, background: bColor, opacity: 0.75 }} />
    </div>
  )
}

// ─── 원형 게이지 ────────────────────────────────────────────────
// 0~1 비율을 고리로. 가운데 글자는 호출부가 정한다(보통 「38%」).
export function Ring({
  ratio, size = 64, stroke = 7, color = 'var(--mm-yellow-strong)', children, label,
}: { ratio: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode; label?: string }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = clamp01(ratio)
  const style: CSSProperties = { width: size, height: size }
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={style} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--mm-panel-alt)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${c * v} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>
        {children}
      </span>
    </div>
  )
}
