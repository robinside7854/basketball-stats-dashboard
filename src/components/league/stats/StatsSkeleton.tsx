// 리그 스탯(리더보드) 불러오는 중 — 실제 화면과 같은 모양으로 자리를 잡아 둔다.
// 서브탭 줄 · 머리 카드(제목·분기 칩·표 모드) · TOP 5 다섯 칸 + 정렬 줄 · 표 8줄.
// 빙글 도는 공(BasketballLoader) 대신 이 모양을 쓰면 다 불러왔을 때 화면이 튀지 않는다.

function Block({ className = '', radius = 'var(--mm-radius-ctl)', style }: { className?: string; radius?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={`mm-shimmer ${className}`} style={{ borderRadius: radius, ...style }} />
}

const panelStyle: React.CSSProperties = {
  background: 'var(--mm-panel)',
  border: '1px solid var(--mm-rule)',
  borderRadius: 'var(--mm-radius-card)',
}

/** full = 서브탭·머리 카드까지(첫 진입) / body = TOP 5·표만(머리는 이미 그려진 상태에서 분기만 바꿀 때) */
export default function StatsSkeleton({ variant = 'full' }: { variant?: 'full' | 'body' }) {
  const full = variant === 'full'
  return (
    <div className={full ? 'mm-brand space-y-5' : 'space-y-5'} role="status" aria-busy="true" aria-label="스탯을 불러오는 중이에요">
      {/* 서브탭 줄 */}
      {full && (
        <div className="flex gap-2">
          {[0, 1, 2].map(i => <Block key={i} className="h-10 w-20" radius="var(--mm-radius-chip)" />)}
        </div>
      )}

      {/* 머리 카드 */}
      {full && (
        <div className="p-4 lg:p-6 space-y-3" style={panelStyle}>
          <Block className="h-8 w-36" />
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3, 4].map(i => <Block key={i} className="h-11 w-16 shrink-0" radius="var(--mm-radius-chip)" />)}
          </div>
          <Block className="h-10 w-48" />
        </div>
      )}

      {/* TOP 5 */}
      <div className="p-4 lg:p-6" style={panelStyle}>
        <Block className="h-6 w-32 mb-3" />
        <div className="flex gap-2 overflow-hidden sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:gap-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="w-[30%] min-w-[104px] shrink-0 sm:w-auto sm:min-w-0 space-y-2">
              <Block className="w-full" radius="var(--mm-radius-card)" style={{ aspectRatio: '1 / 1' }} />
              <Block className="h-4 w-3/4" />
              <Block className="h-6 w-1/2" />
            </div>
          ))}
        </div>
        {/* TOP 5 아래 한 줄 — 정렬 · 순위 범위 */}
        <div className="flex gap-2 mt-3">
          <Block className="h-11 flex-1 md:hidden" />
          <Block className="h-11 w-11 shrink-0 md:hidden" />
          <Block className="h-11 flex-1 md:flex-none md:w-36" />
        </div>
      </div>

      {/* 표 */}
      <div style={panelStyle} className="overflow-hidden">
        <div className="px-4 py-3 lg:px-6 lg:py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <Block className="h-6 w-24" />
          <Block className="h-11 w-28 ml-auto" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 lg:px-6" style={{ borderBottom: i < 7 ? '1px solid var(--mm-rule)' : undefined }}>
            <Block className="size-7 shrink-0" radius="var(--mm-radius-chip)" />
            <Block className="h-5 w-24 shrink-0" />
            <Block className="h-5 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
