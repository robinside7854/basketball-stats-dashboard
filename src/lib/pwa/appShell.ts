// PWA 설치본의 공통 껍데기 — 아이콘·색·iOS 런치 스크린.
//
// 왜 별도 파일인가: 매니페스트가 두 종류가 됐다.
//   1) 루트 `src/app/manifest.ts`        — 대문에서 설치했을 때 (start_url '/')
//   2) 리그별 `.../manifest.webmanifest` — 동호회 화면에서 설치했을 때 (start_url = 그 동호회)
// 둘은 **start_url·이름만 다르고 나머지는 완전히 같아야 한다**. 아이콘/색이 갈라지면
// 같은 앱인데 설치 경로에 따라 다른 아이콘이 뜨는 사고가 난다 — 그래서 여기 한 곳에 둔다.

import type { MetadataRoute, Metadata } from 'next'

// 앱 다크 지반색(--mm-ground)과 동일. 안드로이드 설치형 런치 화면 배경이자 상태바 색.
// 예전 #0a0a0a 는 차가운 검정이라 콘텐츠로 넘어갈 때 튀었다. (2026-08-10)
export const PWA_GROUND_COLOR = '#191714'

export const PWA_ICONS: MetadataRoute.Manifest['icons'] = [
  // 'any' 용 — 홈 화면·탭에서 잘 보이도록 농구공을 크게 크롭한 버전.
  //   src/app/icon.png 은 Next 의 예약 파일명이라 /icon.png 로 서빙된다.
  //   sizes 는 실제 픽셀(512x512)만 적는다 — 없는 192 를 적으면 사실이 아니고,
  //   안드로이드는 512 하나로도 축소해서 쓴다.
  {
    src: '/icon.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'any',
  },
  // 'maskable' 용 — 안드로이드 어댑티브 아이콘 마스크 크롭 대비
  //   중앙 원 안에 농구공이 들어가도록 여백 확보된 별도 이미지.
  //   ⚠ 이 파일은 반드시 public/ 에 둔다. src/app/ 안에서는 Next 가
  //   icon·apple-icon 등 **예약된 이름만** 서빙하므로 icon-maskable.png 는
  //   404 가 된다 — 실제로 그래서 안드로이드 어댑티브 아이콘이 깨져 있었다(2026-08-10).
  {
    src: '/icon-maskable.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
]

// iOS 아이폰 세로 해상도 media query 목록 (device-width/height × DPR).
//   각 항목은 하나의 아이폰 세대군을 타깃 → 모두 동일 마스터 스플래시로 매핑.
const SPLASH_DEVICES = [
  '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 Pro Max
  '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 Plus / 15 Pro Max / 14 Pro Max
  '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 Pro
  '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 15 Plus / 14 Plus / 13 Pro Max / 12 Pro Max
  '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 / 15 Pro / 15 / 14 Pro
  '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 14 / 13 / 13 Pro / 12 / 12 Pro
  '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // X / XS / 11 Pro
  '(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 13 mini / 12 mini
  '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 11 Pro Max / XS Max
  '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', // 11 / XR
  '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', // SE 2/3 · 8 · 7 · 6s
  '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', // SE 1
]

/**
 * iOS 홈 화면 웹앱 메타(`apple-mobile-web-app-*`).
 *
 * ⚠ Next 의 metadata 병합은 필드 단위 **덮어쓰기**다 — 하위 layout 이 `appleWebApp` 을 다시 쓰면
 *   루트의 capable·statusBarStyle·startupImage 가 통째로 사라진다. 그래서 리그 레이아웃에서도
 *   이 함수로 **전체를 다시 만든다**(title 만 다르게). 직접 객체를 쓰면 스플래시가 조용히 죽는다.
 *
 * @param title 홈 화면 아이콘 아래 표시될 이름. 매니페스트 short_name 과 반드시 같은 값을 넘긴다 —
 *   iOS 가 둘 중 무엇을 우선하는지 버전마다 달라서(16.4 부터 매니페스트 지원) 갈라두면 기기마다
 *   다른 이름이 뜬다.
 */
export function appleWebAppMetadata(title: string): NonNullable<Metadata['appleWebApp']> {
  return {
    capable: true,
    statusBarStyle: 'black-translucent',
    title,
    // iOS 전용 런치 스크린(전면 스플래시).
    //   안드로이드는 매니페스트 background_color + 아이콘으로 자동 구성되므로 여기서 다루지 않음.
    //   마스터 이미지 1장(/splash/apple-splash.png, 1290×2796)을 모든 아이폰 해상도 media query에 매핑 →
    //   기기별 화면비 차이는 iOS가 스케일. 핵심 콘텐츠는 중앙 안전영역(1000×1000)에 두어 크롭 대비.
    //   ※ 픽셀 퍼펙트가 필요하면 url 을 해상도별 파일로 교체 (scripts/gen-splash 로 자동 생성).
    startupImage: SPLASH_DEVICES.map((media) => ({
      url: '/splash/apple-splash.png',
      media,
    })),
  }
}
