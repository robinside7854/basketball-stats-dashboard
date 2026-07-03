// 미니멀 Service Worker — PWA 설치 인식용
//
// Chrome Android 가 "PWA 설치" 로 인식하려면 fetch 핸들러 있는 SW 등록이 필수.
// 없으면 홈에 추가 시 웹 북마크로 처리 (흰 배경 어댑티브 아이콘).
//
// 이 SW 는 캐싱을 하지 않고 네트워크 우선 방식 (오프라인 지원 없음).
// 필요 시 나중에 캐시 전략 추가 가능.

const CACHE_NAME = 'miracle-basketball-v1'

self.addEventListener('install', (event) => {
  // 즉시 활성화 (기존 SW 대기 안 함)
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // 활성화되자마자 클라이언트 제어
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  // 네트워크 우선 · 실패 시 그대로 실패 (오프라인 대응은 나중에)
  event.respondWith(fetch(event.request).catch(() => {
    return new Response('오프라인', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }))
})
