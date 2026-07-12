'use client'

import { useEffect, useState } from 'react'

// 인앱 스플래시(런치 배너) — 안드로이드/아이폰 공통.
//   iOS 의 apple-touch-startup-image 는 안드로이드에서 동작하지 않으므로,
//   설치형 PWA(standalone)로 실행될 때 전체화면 배너를 잠깐 띄웠다가 페이드 아웃한다.
//   표시 여부(설치형에서만)는 CSS `@media (display-mode: standalone)` 로 게이트 →
//   일반 브라우저 탭에서는 첫 페인트부터 아예 렌더되지 않아 깜빡임이 없다.
//   여기 JS 는 '노출 시간 유지 후 페이드' 타이밍만 담당한다.
export default function AppSplash() {
  const [done, setDone] = useState(false)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // 유지 시간(ms) — 모션 최소화 설정 시 짧게
    const hold = reduce ? 300 : 1200
    const t = setTimeout(() => setDone(true), hold)
    return () => clearTimeout(t)
  }, [])

  return (
    <div className={`app-splash${done ? ' app-splash--done' : ''}`} aria-hidden="true">
      {/* 마스터 스플래시 이미지 재사용 (검정 배경 + 배너) */}
      <img src="/splash/apple-splash.png" alt="" />
    </div>
  )
}
