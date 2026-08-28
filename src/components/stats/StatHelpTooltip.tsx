'use client'
// 스탯 설명 툴팁 — 컬럼 라벨 옆에 `?` 아이콘 · 호버(PC) / 클릭(모바일) 로 공식/설명 표시
//
// 사용법:
//   <StatHelpTooltip statKey="TS%" />
//   <StatHelpTooltip statKey="eFG%" size={16} />  // 4단계(14/16/20/24) 안에서만
//
// GLOSSARY(src/lib/stats/glossary.ts) 에서 long/formula/description 조회.
// 매치 안 되는 key 는 null (렌더 안 함).

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { statDef } from '@/lib/stats/glossary'

interface Props {
  statKey: string
  size?: number
  className?: string
  ariaLabel?: string   // 커스텀 레이블 (기본: `${long} 설명`)
}

const TOOLTIP_MAX_WIDTH = 260
const VIEWPORT_PADDING = 12

// Beautiful sm shadow (compact popover · skill 표준)
const BEAUTIFUL_SM_SHADOW =
  '0px 2px 3px -1px rgba(0,0,0,0.1),' +
  '0px 1px 0px 0px rgba(25,28,33,0.02),' +
  '0px 0px 0px 1px rgba(25,28,33,0.08)'

export default function StatHelpTooltip({ statKey, size = 14, className, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null)
  const [mounted, setMounted] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const def = statDef(statKey)

  const updateCoords = useCallback(() => {
    const btn = btnRef.current
    if (!btn) return
    const r = btn.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    // 아래 공간이 부족하면 위로
    const preferBottom = r.bottom + 8 + 200 <= vh - VIEWPORT_PADDING
    const placement: 'top' | 'bottom' = preferBottom ? 'bottom' : 'top'
    const centerX = r.left + r.width / 2
    // 뷰포트 좌우 clamp
    const clampedX = Math.max(VIEWPORT_PADDING + TOOLTIP_MAX_WIDTH / 2, Math.min(vw - VIEWPORT_PADDING - TOOLTIP_MAX_WIDTH / 2, centerX))
    const top = placement === 'bottom' ? r.bottom + 8 : r.top - 8
    setCoords({ top, left: clampedX, placement })
  }, [])

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    updateCoords()
    const onScroll = () => updateCoords()
    const onResize = () => updateCoords()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, updateCoords])

  useEffect(() => {
    if (!open) return
    const onClickOut = (e: Event) => {
      const btn = btnRef.current
      const tip = tooltipRef.current
      const target = e.target as Node | null
      if (!target) return
      if (btn?.contains(target)) return
      if (tip?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOut)
    document.addEventListener('touchstart', onClickOut, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOut)
      document.removeEventListener('touchstart', onClickOut)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!def) return null

  // PC(hover 지원) 감지 · 호버 시 자동 열림
  const hoverSupported = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen(v => !v)
        }}
        onMouseEnter={() => {
          if (hoverSupported) setOpen(true)
        }}
        onMouseLeave={() => {
          if (hoverSupported) setOpen(false)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={ariaLabel ?? `${def.long} 설명`}
        title={def.long}
        className={className}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 2,
          marginLeft: 3,
          border: 'none',
          background: 'transparent',
          color: 'var(--mm-muted)',
          cursor: 'pointer',
          borderRadius: 999,
          transition: 'color 160ms',
          verticalAlign: 'middle',
        }}
        onMouseOver={(e) => { e.currentTarget.style.color = 'var(--mm-ink)' }}
        onMouseOut={(e) => { if (!open) e.currentTarget.style.color = 'var(--mm-muted)' }}
      >
        <HelpCircle size={size} aria-hidden strokeWidth={2.5} />
      </button>

      {mounted && open && coords && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.placement === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            zIndex: 200,
            background: 'var(--mm-panel)',
            color: 'var(--mm-ink)',
            border: '1px solid var(--mm-rule)',
            borderRadius: 8,
            boxShadow: BEAUTIFUL_SM_SHADOW,
            padding: '10px 12px',
            maxWidth: TOOLTIP_MAX_WIDTH,
            minWidth: 200,
            fontSize: 12,
            lineHeight: 1.5,
            pointerEvents: 'auto',
            animation: 'mmTooltipIn 140ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--mm-ink)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span>{def.long}</span>
            <span style={{ fontSize: 10, opacity: 0.7, fontFamily: 'monospace' }}>({def.short})</span>
          </div>
          {def.formula && (
            <div style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              color: 'var(--mm-yellow-strong)',
              background: 'var(--mm-panel-alt)',
              padding: '5px 8px',
              borderRadius: 4,
              marginBottom: 6,
              wordBreak: 'break-word',
              border: '1px solid var(--mm-rule)',
            }}>
              {def.formula}
            </div>
          )}
          <div style={{ color: 'var(--mm-ink-soft)', fontSize: 12, lineHeight: 1.55 }}>
            {def.description}
          </div>
        </div>,
        document.body
      )}

      <style jsx global>{`
        @keyframes mmTooltipIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </>
  )
}
