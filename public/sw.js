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

// ── 웹 푸시 (공지/알럿) ─────────────────────────────────────────
// 서버(web-push)가 보낸 payload(JSON)를 시스템 알림으로 표시.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (e) {
    data = { title: '미라클모닝농구단', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || '미라클모닝농구단'
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.tag || 'mm-league',
    renotify: true,
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// 알림 클릭 → 해당 URL 로 포커스/열기 (이미 열린 탭 있으면 재사용)
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // 같은 오리진 탭이 있으면 그 탭으로 이동
        if ('focus' in client) {
          client.navigate(target).catch(() => {})
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})

// 브라우저가 구독을 회전(rotate)시키면 재구독 유도는 다음 방문 시 처리.
self.addEventListener('pushsubscriptionchange', () => {
  // 최소 구현: 별도 처리 없음. 클라이언트 재방문 시 getSubscription 으로 재동기화.
})
