'use client'

import { useEffect, useRef, useState } from 'react'

// 인앱 스플래시(런치 배너) — 안드로이드/아이폰 공통.
//   iOS 의 apple-touch-startup-image 는 안드로이드에서 동작하지 않으므로,
//   설치형 PWA(standalone)로 실행될 때 전체화면 배너를 띄웠다가 페이드 아웃한다.
//
//   표시 게이트(설치형에서만):
//     1차 = CSS `@media (display-mode: standalone)` (하이드레이션 전부터 적용, 깜빡임 0)
//     폴백 = 아래 JS 가 standalone 감지 시 <html>.is-pwa 부여 (일부 브라우저가 미디어를 다르게 볼 때)
//
//   페이드 타이밍이 핵심:
//     예전엔 고정 1.2s 후 페이드 → 배너 이미지(수 MB)가 그 안에 안 떠서 '검정만 보이다 사라짐'.
//     이제 이미지가 실제로 로드된 뒤(onLoad) 잠깐 더 유지하고 페이드 → 반드시 눈에 보인다.
//     (네트워크가 느려도 MAX_WAIT 상한으로 앱 진입이 막히지 않게 함)
const SRC = '/splash/apple-splash.webp' // 경량 WebP (~80KB) — 즉시 로딩
const MAX_WAIT = 4500

export default function AppSplash() {
  const imgRef = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [done, setDone] = useState(false)

  // 이미지가 이미 캐시되어 onLoad 가 안 뜨는 경우 대비 + 안전 리빌.
  //   (webp 가 브라우저 캐시에 있으면 React onLoad 가 발화하지 않아 배너가 계속 투명해짐)
  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) {
      setLoaded(true)
      return
    }
    // 어떤 이유로든 로드 이벤트가 누락돼도 배너가 안 보이는 일이 없도록 안전장치
    const safety = window.setTimeout(() => setLoaded(true), 700)
    return () => clearTimeout(safety)
  }, [])

  // standalone(설치형) 감지 폴백
  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      window.matchMedia('(display-mode: minimal-ui)').matches ||
      nav.standalone === true
    if (standalone) document.documentElement.classList.add('is-pwa')
  }, [])

  // 이미지 로드 후 유지 → 페이드 (+ 최대 대기 상한)
  //   afterLoad = 배너가 완전히 뜬 뒤 유지 시간(ms). 더 길게/짧게 하려면 이 값만 조정.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const afterLoad = reduce ? 500 : 1800
    const max = window.setTimeout(() => setDone(true), MAX_WAIT)
    if (!loaded) return () => clearTimeout(max)
    const t = window.setTimeout(() => setDone(true), afterLoad)
    return () => {
      clearTimeout(t)
      clearTimeout(max)
    }
  }, [loaded])

  return (
    <div
      className={`app-splash${loaded ? ' is-loaded' : ''}${done ? ' app-splash--done' : ''}`}
      aria-hidden="true"
    >
      <img
        ref={imgRef}
        src={SRC}
        alt=""
        onLoad={() => setLoaded(true)}
        onError={() => setDone(true)}
      />
    </div>
  )
}
