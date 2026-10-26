// 하이라이트 불러오는 중 — 실제 화면 모양(제목 · 칩 줄 · 본문)을 그대로 비춘다.
// 공용 SubTabLoadingSkeleton 은 표·목록 모양이라 영상 카드가 뜰 때 자리가 크게 흔들렸다.
// 본문 모양은 주소로 고른다(2026-10-26): ?date= · ?player= · ?f=best 는 재생기(16:9) + 클립 목록,
//   그 밖(첫 화면 · 명경기 · 마일스톤)은 카드 격자. loading 은 searchParams 를 못 받으므로 클라이언트 조각이 읽는다.
import { Suspense } from 'react'
import HighlightsLoadingBody, { CardGridSkeleton } from '@/components/league/highlights/HighlightsLoadingBody'

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

      <Suspense fallback={<CardGridSkeleton />}>
        <HighlightsLoadingBody />
      </Suspense>
      <span className="sr-only">불러오는 중이에요</span>
    </div>
  )
}
