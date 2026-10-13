'use client'
// 「전체화면 연속 재생」 버튼 — 리그 하이라이트 피드 전용 (2026-10-13).
// 지금 목록(필터 결과)을 고른 클립부터 순서대로 화면 가득 이어 본다. 실제 동작은 HighlightsPlayer 의 몰입 모드.
// ⚠ onClick 안에서 openImmersive() 를 동기로 부른다 — Fullscreen API 는 사용자 제스처 안에서만 열린다.
import type { RefObject } from 'react'
import { Maximize } from 'lucide-react'
import type { HighlightsPlayerHandle } from './HighlightsPlayer'

export default function ImmersivePlayButton({
  playerRef, disabled, className = '',
}: { playerRef: RefObject<HighlightsPlayerHandle | null>; disabled?: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => playerRef.current?.openImmersive()}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-sm font-bold whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] ${className}`}
      style={{
        background: 'var(--mm-ink)',
        color: 'var(--mm-ground)',
        border: '1px solid var(--mm-ink)',
        borderRadius: 'var(--mm-radius-chip)',
      }}
      aria-label="지금 목록을 전체화면으로 이어서 재생"
    >
      <Maximize size={16} aria-hidden />
      전체화면 연속 재생
    </button>
  )
}
