// 팀 탭 로딩 자리 (2026-10-26) — 빙글 도는 공 스피너 대신 실제 화면 모양을 미리 깐다(mm-shimmer).
//   팀 전적 카드 3장 → 팀별 선수 표. 줄 수는 대략치라 받은 뒤 높이가 조금 달라질 수 있다.
import type { CSSProperties } from 'react'

/** 회색 막대 한 칸 — 높이·너비만 받는다 */
export function ShimmerBlock({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={`mm-shimmer ${className}`} style={{ borderRadius: 'var(--mm-radius-ctl)', ...style }} />
}

/** 섹션 안 작은 자리(누적 맞대결·팀 상세 등) */
export function ShimmerRows({ rows = 3, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-2" role="status" aria-label="불러오는 중">
      {Array.from({ length: rows }, (_, i) => <ShimmerBlock key={i} style={{ height }} />)}
    </div>
  )
}

export default function TeamsSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="팀 기록 불러오는 중">
      <ShimmerBlock className="w-24" style={{ height: 26 }} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[0, 1, 2].map(i => (
          <div key={i} className="p-4 space-y-3" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}>
            <div className="flex items-center justify-between gap-3">
              <ShimmerBlock className="w-28" style={{ height: 22 }} />
              <ShimmerBlock className="w-14" style={{ height: 28 }} />
            </div>
            <ShimmerBlock style={{ height: 26 }} />
          </div>
        ))}
      </div>
      <div className="p-4 space-y-2" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}>
        <ShimmerBlock className="w-32 mb-2" style={{ height: 22 }} />
        {Array.from({ length: 6 }, (_, i) => <ShimmerBlock key={i} style={{ height: 40 }} />)}
      </div>
    </div>
  )
}
