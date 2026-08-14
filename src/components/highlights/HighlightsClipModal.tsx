'use client'
// HighlightsClipModal — 공용 하이라이트 클립 팝업 (ClutchClipModal 일반화)
// 사용처: 홈 이번주 클러치샷 · 위닝샷 배지 · 프로필카드 베스트샷 등
// - HighlightsPlayer 플레이리스트 자동 재생 (auto-advance 유지)
// - ESC / X / 배경 클릭으로 닫힘
// - 상단 헤더 슬롯: 아이콘 + 제목 · onFooter prop 으로 현재 클립 하단에 부가 액션(핀 버튼 등) 삽입

import { useState, useEffect, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { X } from 'lucide-react'
import { SHOT_TYPE_LABEL, shouldShowAssist } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'

const HighlightsPlayer = dynamic(() => import('./HighlightsPlayer'), { ssr: false })

interface Props {
  clips: HighlightClip[]
  startIdx?: number
  title: string
  icon?: ReactNode
  accentColor?: string        // 헤더 경계선/포커스 · 기본 mm-yellow
  onClose: () => void
  onFooter?: (clip: HighlightClip, idx: number) => ReactNode   // 현재 재생 클립 하단 액션 슬롯
  ariaLabel?: string
}

export default function HighlightsClipModal({
  clips, startIdx = 0, title, icon, accentColor,
  onClose, onFooter, ariaLabel,
}: Props) {
  const [currentIdx, setCurrentIdx] = useState(Math.max(0, Math.min(startIdx, clips.length - 1)))

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 배경 스크롤 잠금
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  if (clips.length === 0) return null
  const current = clips[currentIdx]
  const border = accentColor ?? 'var(--mm-yellow)'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-5xl bg-[color:var(--mm-panel)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] rounded-sm overflow-hidden"
        style={{ borderRadius: 6, border: `1px solid ${border}` }}
      >
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div className="inline-flex items-center gap-2 min-w-0">
            {icon}
            <span className="text-xs font-black uppercase tracking-[0.14em] shrink-0" style={{ color: 'var(--mm-ink)' }}>
              {title}
            </span>
            <span className="text-[11px] shrink-0" style={{ color: 'var(--mm-muted)' }}>
              {currentIdx + 1} / {clips.length}
            </span>
            {current && (
              <span className="text-[11px] truncate ml-2" style={{ color: 'var(--mm-ink-soft)' }}>
                {current.player_name} · {SHOT_TYPE_LABEL[current.shot_type] ?? current.shot_type}
                {/* 앤드원은 별도 클립이 아니라 이 슛에 흡수돼 있다 — 같은 장면이 두 번 재생되지 않게. */}
                {current.has_and_one && (
                  <span className="font-black" style={{ color: 'var(--mm-yellow-strong)' }}> +1 앤드원</span>
                )}
                {/* 어시스트 — 득점만 보면 "누가 만들어 줬는지"가 사라진다. 동호회에서 자주 오가는 이야기다.
                    자유투·앤드원은 어시스트가 성립하지 않으므로 shouldShowAssist 로 거른다
                    (그 판정은 clip.ts 가 정본이다 — 여기서 다시 쓰지 않는다). */}
                {shouldShowAssist(current.shot_type) && current.assist_player_name && (
                  <span style={{ color: 'var(--mm-muted)' }}>
                    {' '}← {current.assist_player_name} 어시스트
                  </span>
                )}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors hover:bg-[color:var(--mm-panel-alt)] cursor-pointer shrink-0"
            style={{ color: 'var(--mm-ink-soft)' }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ background: '#000' }}>
          <HighlightsPlayer
            clips={clips}
            currentIdx={currentIdx}
            onIndexChange={setCurrentIdx}
          />
        </div>
        {onFooter && current && (
          <div className="px-4 py-2.5" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            {onFooter(current, currentIdx)}
          </div>
        )}
      </div>
    </div>
  )
}
