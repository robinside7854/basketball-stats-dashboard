'use client'

import { useEffect, useState } from 'react'

// 온볼 인앱 스플래시 — 공이 좌측에서 튀며 들어와 로고 자리에 서고,
// 밑줄과 워드마크가 좌→우로 쓸려 나온다.
//
// 2026-08-10 전면 교체. 이전에는 1290×2796 PNG(1.2MB) 한 장을 object-fit:cover 로
// 늘려 썼는데 세 가지 문제가 있었다.
//   1. 이미지에 "미라클모닝농구단 게임로그"가 박혀 있어 온볼(플랫폼) 정체성과 어긋남
//   2. 기기 화면비가 다르면 가장자리가 잘림
//   3. 배경이 #0a0a0a 라 앱 다크 지반색(#191714)으로 넘어갈 때 색이 튐
// 이제 코드로 그린다 — 전 해상도 선명, 잘림 없음, 수 KB, 배경색 일치.
//
// 노출 게이트 (실제 판정은 layout.tsx <head> 인라인 스크립트가 페인트 전에 끝낸다):
//   · 세션당 1회. 재방문/페이지 이동에는 <html>.no-splash 로 감춰진다.
//   · iOS 설치형은 OS 가 이미 정지 런치 이미지를 그린 뒤이므로 바운스를 생략한다
//     (<html>.splash-static). 안 그러면 자리잡은 로고가 다시 좌측으로 튕겨나간다.
export const SPLASH_SESSION_KEY = 'onball_splash_seen'

const HOLD_MS = 2050 // 애니메이션(약 1.75초)이 끝나고 잠깐 머무는 시간
const HOLD_MS_STATIC = 850 // 바운스를 건너뛰는 경우(iOS 설치형 · 모션 최소화)
const FADE_MS = 520

export default function AppSplash() {
  // 'on' → 'fade' → 'off'. SSR·첫 페인트는 항상 'on' 이라 하이드레이션 전에도 화면을 덮는다.
  const [phase, setPhase] = useState<'on' | 'fade' | 'off'>('on')

  useEffect(() => {
    let seen = false
    try {
      seen = sessionStorage.getItem(SPLASH_SESSION_KEY) === '1'
    } catch {
      // 시크릿 모드 등에서 sessionStorage 접근이 막히면 그냥 매번 보여준다
    }
    if (seen) {
      setPhase('off')
      return
    }
    try {
      sessionStorage.setItem(SPLASH_SESSION_KEY, '1')
    } catch {
      /* 위와 동일 */
    }

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isStatic = document.documentElement.classList.contains('splash-static')
    const hold = reduce || isStatic ? HOLD_MS_STATIC : HOLD_MS

    const toFade = window.setTimeout(() => setPhase('fade'), hold)
    const toOff = window.setTimeout(() => setPhase('off'), hold + FADE_MS)
    return () => {
      window.clearTimeout(toFade)
      window.clearTimeout(toOff)
    }
  }, [])

  if (phase === 'off') return null

  return (
    <div className={`app-splash${phase === 'fade' ? ' app-splash--done' : ''}`} aria-hidden="true">
      <div className="splash-lock">
        {/* 심볼은 브랜드 가이드의 onball-symbol.svg 와 동일한 패스 */}
        <svg className="splash-ball" viewBox="0 0 152 132" focusable="false">
          <g fill="none" stroke="#EAB308" strokeWidth="8" strokeLinecap="round">
            <circle cx="76" cy="66" r="52" />
            <path d="M25 66 H127" />
            <path d="M76 14 V118" />
            <path d="M41 25 C 60 45, 60 87, 41 107" />
            <path d="M111 25 C 92 45, 92 87, 111 107" />
          </g>
        </svg>
        <div className="splash-col">
          <span className="splash-word">ONBALL</span>
          <i className="splash-rule" />
        </div>
      </div>
      <p className="splash-tag">공이 온 순간은, 사라지지 않는다</p>
    </div>
  )
}
