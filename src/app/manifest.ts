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
    name: '미라클모닝 농구단',
    short_name: '미라클모닝',
    description: '미라클모닝 농구단 스탯 · 경기 대시보드',
    start_url: '/league/miracle/2026',
    display: 'standalone',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    orientation: 'portrait',
    icons: [
      // 'any' + 'maskable' 둘 다 제공 — 안드로이드가 어댑티브 아이콘으로 사용
      // 사이즈는 512x512 하나만 있어도 브라우저가 다운스케일함
      {
        src: '/icon.png',
        sizes: '192x192 512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '192x192 512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
