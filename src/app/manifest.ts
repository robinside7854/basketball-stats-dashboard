import type { MetadataRoute } from 'next'
import { PWA_GROUND_COLOR, PWA_ICONS } from '@/lib/pwa/appShell'

// PWA 매니페스트 (루트) — 대문에서 "홈 화면에 추가" 했을 때의 설치본.
//
// 핵심 포인트:
// - purpose: 'maskable' 지정 → 안드로이드가 아이콘 배경 없이 어댑티브 아이콘으로 사용
// - purpose: 'any' 도 함께 제공 → maskable 미지원 환경 폴백
// - background_color / theme_color → 상태바·스플래시 컬러
// - display: 'standalone' → URL 바 없는 네이티브 앱 뷰 (홈 화면에서 실행 시)
//
// ⚠ 동호회 화면에서 설치하면 이 매니페스트가 아니라 리그별 매니페스트가 쓰인다
//   (`/league/[orgSlug]/[leagueId]/manifest.webmanifest`, 리그 layout 이 덮어씀).
//   start_url 이 오리진당 하나라 어디서 설치하든 대문으로 열리던 문제를 그렇게 고쳤다 —
//   특히 iOS 설치형은 사파리와 저장소가 분리돼 localStorage 로는 복귀시킬 수 없다.
//   아이콘·색은 `@/lib/pwa/appShell` 에서 공유하므로 두 매니페스트가 갈라지지 않는다.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // 온볼은 플랫폼이고 동호회는 그 안에 입점한 고객이다.
    // 앱 정체성은 온볼 하나이며, 사용자는 앱을 열고 자기 동호회로 들어간다.
    // (리그별 설치본도 name 은 '온볼 — <동호회명>' 으로 온볼 계열을 유지한다.)
    name: '온볼 OnBall',
    short_name: '온볼',
    description: '동호회 농구 스탯 · 경기 기록 플랫폼',
    start_url: '/',
    display: 'standalone',
    background_color: PWA_GROUND_COLOR,
    theme_color: PWA_GROUND_COLOR,
    orientation: 'portrait',
    icons: PWA_ICONS,
  }
}
