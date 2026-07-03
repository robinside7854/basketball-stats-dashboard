'use client'
// Service Worker 자동 등록 컴포넌트
//
// PWA 설치 인식을 위해 클라이언트 진입 시 /sw.js 등록.
// 실패해도 앱 동작에는 영향 없음 (silent fail).

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // 개발 모드에서는 스킵 (dev 서버 HMR 방해 방지)
    if (process.env.NODE_ENV !== 'production') return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // silent — SW 등록 실패해도 앱은 정상 동작
      })
  }, [])

  return null
}
