import type { MetadataRoute } from 'next'

// PWA 매니페스트 — 안드로이드/iOS 홈 화면 추가 시 네이티브 앱처럼 표시
//
// 핵심 포인트:
// - purpose: 'maskable' 지정 → 안드로이드가 아이콘 배경 없이 어댑티브 아이콘으로 사용
// - purpose: 'any' 도 함께 제공 → maskable 미지원 환경 폴백
// - background_color / theme_color → 상태바·스플래시 컬러
// - display: 'standalone' → URL 바 없는 네이티브 앱 뷰 (홈 화면에서 실행 시)
export default function manifest(): MetadataRoute.Manifest {
  return {
    // 온볼은 플랫폼이고 동호회는 그 안에 입점한 고객이다.
    // 앱 정체성은 온볼 하나이며, 사용자는 앱을 열고 자기 동호회로 들어간다.
    name: '온볼 OnBall',
    short_name: '온볼',
    description: '동호회 농구 스탯 · 경기 기록 플랫폼',
    start_url: '/',
    display: 'standalone',
    // 앱 다크 지반색(--mm-ground)과 동일. 안드로이드 설치형 런치 화면 배경이자
    // 상태바 색. 예전 #0a0a0a 는 차가운 검정이라 콘텐츠로 넘어갈 때 튀었다. (2026-08-10)
    background_color: '#191714',
    theme_color: '#191714',
    orientation: 'portrait',
    icons: [
      // 'any' 용 — 홈 화면·탭에서 잘 보이도록 농구공을 크게 크롭한 버전
      {
        src: '/icon.png',
        sizes: '192x192 512x512',
        type: 'image/png',
        purpose: 'any',
      },
      // 'maskable' 용 — 안드로이드 어댑티브 아이콘 마스크 크롭 대비
      //   중앙 원 안에 농구공이 들어가도록 여백 확보된 별도 이미지
      {
        src: '/icon-maskable.png',
        sizes: '192x192 512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
