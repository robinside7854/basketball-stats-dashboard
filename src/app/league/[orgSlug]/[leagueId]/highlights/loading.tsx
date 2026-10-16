// 하이라이트 불러오는 중 — 실제 화면 모양(제목 · 칩 줄 · 영상 카드 격자)을 그대로 비춘다.
// 공용 SubTabLoadingSkeleton 은 표·목록 모양이라 영상 카드가 뜰 때 자리가 크게 흔들렸다.
export default function Loading() {
  return (
    <div className="space-y-4 mm-brand" role="status" aria-busy="true" aria-label="하이라이트 불러오는 중">
      <div className="space-y-3" aria-hidden>
        {/* 제목 */}
        <div className="flex items-center gap-3">
          <span className="mm-shimmer shrink-0" style={{ width: 24, height: 24, borderRadius: 'var(--mm-radius-ctl)' }} />
          <span className="mm-shimmer h-7 w-32" style={{ borderRadius: 'var(--mm-radius-ctl)' }} />
        </div>
        {/* 칩 줄 */}
        <div className="flex items-center gap-2 overflow-hidden">
          {[56, 72, 64, 64, 88, 72, 80].map((w, i) => (
            <span key={i} className="mm-shimmer shrink-0 h-9" style={{ width: w, borderRadius: 'var(--mm-radius-chip)' }} />
          ))}
        </div>
      </div>

      {/* 날짜 카드 격자 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="overflow-hidden"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
          >
            <div className="mm-shimmer aspect-video" />
            <div className="p-3 space-y-2">
              <span className="mm-shimmer block h-5 w-2/5" style={{ borderRadius: 'var(--mm-radius-ctl)' }} />
              <span className="mm-shimmer block h-3 w-3/5" style={{ borderRadius: 'var(--mm-radius-chip)' }} />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">불러오는 중이에요</span>
    </div>
  )
}
