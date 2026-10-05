'use client'
// 화면이 보일 때만 도는 폴링.
//
// 왜: 폴링 한 번 = 서버 함수 호출 한 번이라 Vercel 의 CPU 한도(무료 플랜 월 4시간)를 그대로 깎는다.
//   드래프트 화면은 끝난 뒤에도 5초마다 불렀고, 백그라운드 탭에서도 멈추지 않아
//   탭 하나가 시간당 720번을 쓰고 있었다(2026-10-05 한도 초과 점검에서 발견).
//
// - 탭이 숨겨지면 멈추고, 다시 보이면 즉시 한 번 부른 뒤 재개한다.
// - intervalMs 가 null 이면 폴링하지 않는다.
// - fn 은 ref 로 들고 있어 매 렌더 바뀌어도 타이머를 다시 만들지 않는다.
// - 첫 호출(마운트 시)은 하지 않는다 — 각 화면이 이미 따로 부른다.
import { useEffect, useRef } from 'react'

export function useVisiblePolling(fn: () => void, intervalMs: number | null) {
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])

  useEffect(() => {
    if (intervalMs == null || typeof document === 'undefined') return
    let id: ReturnType<typeof setInterval> | null = null
    const start = () => { if (id == null) id = setInterval(() => fnRef.current(), intervalMs) }
    const stop = () => { if (id != null) { clearInterval(id); id = null } }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
      else { fnRef.current(); start() }
    }
    if (document.visibilityState !== 'hidden') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility) }
  }, [intervalMs])
}
