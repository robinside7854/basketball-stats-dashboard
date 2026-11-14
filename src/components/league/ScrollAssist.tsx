'use client'
// 스크롤 도우미 (2026-11-11 운영진)
//   ① PC(마우스) 빈 곳 더블클릭 → 창 위쪽 절반이면 맨 위로, 아래쪽 절반이면 맨 아래로 순간 이동.
//      글자·버튼·입력칸·영상 위 더블클릭은 건드리지 않는다(낱말 선택 등 원래 동작 그대로).
//      기록 화면·드래프트 방은 더블클릭이 작업 손놀림과 겹칠 수 있어 끈다.
//   ② 화면 두 장 넘게 내려가면 오른쪽 아래 「맨 위로」 둥근 버튼(폰은 하단 메뉴 위).
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowUp } from 'lucide-react'

const SKIP = 'a,button,input,textarea,select,label,video,iframe,canvas,svg,[role="button"],[contenteditable="true"],[data-no-dblscroll]'

function hasTextUnder(e: MouseEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  // 낱말 위 더블클릭 = 낱말 선택(원래 동작) — 그 요소 바로 안에 글자가 있으면 건너뛴다
  for (const n of Array.from(el.childNodes)) if (n.nodeType === 3 && (n.textContent ?? '').trim()) return true
  return false
}

export default function ScrollAssist() {
  const pathname = usePathname() ?? ''
  const [showTop, setShowTop] = useState(false)
  const off = /\/(record|draft)(\/|$)/.test(pathname)

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > window.innerHeight * 2)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // 누르는 손맛 — 안드로이드 폰에서 버튼을 누르면 아주 짧게 떨린다(아이폰 브라우저는 진동을 막아 둔다). 2026-11-14 운영진
  useEffect(() => {
    if (!('vibrate' in navigator) || !window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const onDown = (e: MouseEvent) => {
      const t = (e.target as HTMLElement | null)?.closest('button,[role="button"],[role="tab"],a[href]') as HTMLElement | null
      if (!t || t.matches(':disabled,[aria-disabled="true"],[data-no-press]')) return
      try { navigator.vibrate(8) } catch {}
    }
    document.addEventListener('click', onDown, { passive: true })
    return () => document.removeEventListener('click', onDown)
  }, [])

  useEffect(() => {
    if (off) return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const onDbl = (e: MouseEvent) => {
      if (!mq.matches) return
      const t = e.target as HTMLElement | null
      if (!t || t.closest(SKIP) || hasTextUnder(e)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      window.getSelection()?.removeAllRanges()
      const toTop = e.clientY < window.innerHeight / 2
      window.scrollTo({ top: toTop ? 0 : document.documentElement.scrollHeight, behavior: 'auto' })
    }
    document.addEventListener('dblclick', onDbl)
    return () => document.removeEventListener('dblclick', onDbl)
  }, [off])

  if (!showTop) return null
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="맨 위로"
      className="mm-press fixed right-4 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full cursor-pointer active:scale-90 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] bottom-[calc(72px+env(safe-area-inset-bottom,0px))] lg:bottom-6"
      style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', boxShadow: 'var(--mm-shadow-md)' }}
    >
      <ArrowUp size={22} aria-hidden />
    </button>
  )
}
