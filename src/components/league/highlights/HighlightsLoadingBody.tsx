'use client'
// 하이라이트 loading.tsx 의 본문 — 주소를 보고 재생기 모양 / 카드 격자 모양을 고른다.
// (규칙은 highlights/page.tsx 상단 주석의 쿼리 표와 같다 — 재생기가 뜨는 화면: ?date= · ?player= · ?f=best)
import { useSearchParams } from 'next/navigation'

export default function HighlightsLoadingBody() {
  const sp = useSearchParams()
  const f = sp.get('f')
  const playerView = f === 'best' || (!f && (sp.has('date') || sp.has('player')))
  return playerView ? <PlayerSkeleton /> : <CardGridSkeleton />
}

export function CardGridSkeleton() {
  return (
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
  )
}

/** 재생기 화면 — 제목 줄 · 16:9 상자 · 조작 줄 · 클립 목록 (lg 에서는 목록이 오른쪽 열) */
function PlayerSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="flex items-center gap-3">
        <span className="mm-shimmer shrink-0" style={{ width: 40, height: 40, borderRadius: '9999px' }} />
        <div className="space-y-1.5 flex-1">
          <span className="mm-shimmer block h-5 w-40" style={{ borderRadius: 'var(--mm-radius-ctl)' }} />
          <span className="mm-shimmer block h-3 w-28" style={{ borderRadius: 'var(--mm-radius-chip)' }} />
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-8 space-y-2">
          <div className="mm-shimmer aspect-video" style={{ borderRadius: 'var(--mm-radius-card)' }} />
          <span className="mm-shimmer block h-12" style={{ borderRadius: 'var(--mm-radius-ctl)' }} />
        </div>
        <div className="lg:col-span-4 space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-2"
              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
            >
              <span className="mm-shimmer shrink-0 w-24 aspect-video" style={{ borderRadius: 'var(--mm-radius-chip)' }} />
              <div className="flex-1 space-y-1.5">
                <span className="mm-shimmer block h-4 w-3/5" style={{ borderRadius: 'var(--mm-radius-ctl)' }} />
                <span className="mm-shimmer block h-3 w-2/5" style={{ borderRadius: 'var(--mm-radius-chip)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
