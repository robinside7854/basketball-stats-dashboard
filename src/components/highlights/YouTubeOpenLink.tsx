// 「YouTube 앱으로 열기」 — 지금 재생 중인 클립을 YouTube 원본의 그 시각으로 연다 (리뉴얼 4단계, 2026-10-12).
//
// 휴대폰에서 youtube.com/watch 링크는 유니버설 링크/앱 링크로 YouTube 앱이 받는다.
// 임베드 플레이어가 광고·지역 제한·저사양 기기에서 막힐 때의 탈출구라 늘 보이게 둔다.
import { ExternalLink } from 'lucide-react'
import type { HighlightClip } from '@/lib/highlights/types'

export function youtubeWatchUrl(clip: Pick<HighlightClip, 'video_id' | 'clip_start'>): string {
  const t = Math.max(0, Math.floor(clip.clip_start))
  return `https://www.youtube.com/watch?v=${encodeURIComponent(clip.video_id)}&t=${t}s`
}

export default function YouTubeOpenLink({ clip, className = '' }: { clip: HighlightClip | null | undefined; className?: string }) {
  if (!clip || !clip.video_id) return null
  return (
    <a
      href={youtubeWatchUrl(clip)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-sm font-bold whitespace-nowrap transition-colors hover:border-[color:var(--mm-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] ${className}`}
      style={{
        background: 'var(--mm-panel)',
        color: 'var(--mm-ink)',
        border: '1px solid var(--mm-rule)',
        borderRadius: 'var(--mm-radius-chip)',
      }}
      aria-label="지금 클립을 YouTube 앱으로 열기"
    >
      <ExternalLink size={16} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
      {/* 좁은 화면에선 「전체화면 연속 재생」과 한 줄에 놓이도록 짧게 */}
      <span className="sm:hidden">YouTube 앱</span>
      <span className="hidden sm:inline">YouTube 앱으로 열기</span>
    </a>
  )
}
