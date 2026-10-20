'use client'
import { useEffect, useRef } from 'react'

/** Esc 키로 닫기 — 팝업(dialog) 공용. 키보드만 쓰는 사람도 팝업을 빠져나올 수 있어야 한다(접근성 점검 2026-10-20). */
export function useEscapeKey(onEscape: () => void, active = true) {
  const ref = useRef(onEscape)
  useEffect(() => { ref.current = onEscape })
  useEffect(() => {
    if (!active) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') ref.current() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [active])
}
