'use client'
// 앱 확인 모달 — 브라우저 기본 confirm() 대체.
//
// 왜: 카카오톡 인앱 브라우저·iOS 사파리에서 네이티브 confirm() 은 여러 줄 본문이 잘리고
// 버튼이 44px 미만이라 드래프트 당일 감독관이 잘못 누르기 쉽다. 본문을 줄 단위로 받아
// 그대로 보여주고, 확인/취소 버튼을 터치 타깃 규격으로 낸다.

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface ConfirmModalProps {
  open: boolean
  title: string
  /** 본문 — 줄 단위. 빈 문자열은 문단 간격으로 쓰인다. */
  lines?: string[]
  /** 되돌릴 수 없는 액션이면 true — 경고 아이콘 + negative 색 */
  danger?: boolean
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  open,
  title,
  lines = [],
  danger = false,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
      style={{
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--mm-panel)] p-5 sm:p-6 shadow-2xl"
        style={{ borderColor: danger ? 'var(--mm-negative)' : 'var(--mm-rule)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3
          id="confirm-modal-title"
          className={`text-lg sm:text-xl font-black mb-3 flex items-center gap-2 ${danger ? 'text-[var(--mm-negative)]' : 'text-[var(--mm-ink)]'}`}
        >
          {danger && <AlertTriangle size={20} className="shrink-0" aria-hidden />}
          <span className="min-w-0 break-keep">{title}</span>
        </h3>
        {lines.length > 0 && (
          <div className="space-y-1.5">
            {lines.map((line, i) =>
              line.trim() === ''
                ? <div key={i} className="h-2" aria-hidden />
                : <p key={i} className="text-sm sm:text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">{line}</p>,
            )}
          </div>
        )}
        <div className="flex gap-3 mt-5">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1 min-h-11 h-12 text-base font-bold bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] hover:opacity-90 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-rule)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]"
          >
            {cancelLabel}
          </Button>
          <Button
            autoFocus
            onClick={onConfirm}
            className={`flex-1 min-h-11 h-12 text-base font-black cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)] ${
              danger
                ? 'bg-[var(--mm-negative)] text-[var(--mm-panel)] hover:opacity-90 focus-visible:ring-[var(--mm-negative)]'
                : 'bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 focus-visible:ring-[var(--mm-yellow-strong)]'
            }`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
