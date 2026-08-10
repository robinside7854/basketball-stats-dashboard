// Service Worker — PWA 설치 인식 + 오프라인 폴백 + 정적 자산 캐시 + 웹 푸시
//
// Chrome Android 가 "PWA 설치"(WebAPK)로 인식하려면 fetch 핸들러 있는 SW 등록이 필수.
// 없으면 홈에 추가 시 웹 북마크로 처리된다.
//
// ⚠ 캐시 원칙 — 이 앱은 실시간 기록 대시보드다. "빠르게" 보다 "틀리지 않게" 가 먼저다.
//   · /api/*            → 절대 캐시하지 않는다. 어제 순위표를 오늘 순위표로 보여주면 그건 버그다.
//   · 페이지 HTML       → 캐시하지 않는다. 로그인 상태·팀 권한에 따라 내용이 달라지므로
//                         캐시해 두면 다른 회원의 화면이 남을 수 있다. 실패 시 /offline 만 내준다.
//   · /_next/static/*   → 파일명에 빌드 해시가 박혀 있어 내용이 절대 안 바뀐다. 캐시 우선.
//   · 이미지·폰트       → stale-while-revalidate. 선수 사진이 매번 다시 내려오는 게 가장 큰 낭비였다.
//   · Range 요청        → 건드리지 않는다. 하이라이트 영상 탐색이 부분 응답으로 오는데,
//                         이걸 캐시에 넣으면 재생이 깨진다.
//   그 외는 아예 가로채지 않고 브라우저에 맡긴다(respondWith 미호출) — 불필요한 SW 왕복을 없앤다.

const VERSION = 'v2'
const SHELL_CACHE = `onball-shell-${VERSION}`
const ASSET_CACHE = `onball-asset-${VERSION}`
const OFFLINE_URL = '/offline'

// 이미지 캐시 상한 — 선수 사진이 쌓이면 무한정 커진다. 넘으면 오래된 것부터 버린다.
const MAX_ASSET_ENTRIES = 150

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // 오프라인 화면은 반드시 미리 받아둔다 — 정작 필요한 순간엔 받을 수 없다.
      cache.addAll([OFFLINE_URL, '/icon.png']).catch(() => {}),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      // 버전이 올라가면 옛 캐시는 통째로 버린다. 남겨두면 용량만 먹고 아무도 안 읽는다.
      Promise.all(
        names
          .filter((n) => n.startsWith('onball-') && n !== SHELL_CACHE && n !== ASSET_CACHE)
          .map((n) => caches.delete(n)),
      ),
    ).then(() => self.clients.claim()),
  )
})

// 캐시 상한 유지 — cache.keys() 는 삽입 순서를 지키므로 앞에서부터 버리면 오래된 것부터 나간다.
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length <= max) return
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)))
}

function isStaticBuildAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')
}

function isCacheableImage(url) {
  if (url.pathname.startsWith('/_next/image')) return true
  if (/\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(url.pathname)) return true
  // 선수 사진·팀 로고는 Supabase 스토리지에서 온다.
  if (/\.supabase\.(co|in)$/.test(url.hostname) && url.pathname.includes('/storage/')) return true
  return false
}

function isCacheableFont(url) {
  // Pretendard(본문 한글 폰트) — CDN 왕복이 첫 화면 체감에 그대로 얹힌다.
  return url.hostname === 'cdn.jsdelivr.net'
}

self.addEventListener('fetch', (event) => {
  const req = event.request

  // GET 이 아닌 요청(기록 저장·PIN 확인 등)은 캐시 대상이 아니다.
  if (req.method !== 'GET') return
  // 영상 탐색(부분 응답) — 캐시에 넣으면 재생이 깨진다.
  if (req.headers.has('range')) return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }

  // 실시간 데이터는 캐시 금지. 오래된 스탯을 보여주느니 실패하는 편이 낫다.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // ── 페이지 이동: 네트워크 우선, 실패하면 오프라인 화면 ─────────────────
  //    응답은 저장하지 않는다(로그인 상태별로 내용이 달라진다).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cached = await caches.match(OFFLINE_URL)
        return (
          cached ||
          new Response('오프라인', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        )
      }),
    )
    return
  }

  // ── 빌드 산출물: 캐시 우선 (파일명 해시가 바뀌면 새 항목이 된다) ───────
  if (isStaticBuildAsset(url)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // ── 이미지·폰트: 캐시를 즉시 내주고 뒤에서 갱신 ────────────────────────
  if (isCacheableImage(url) || isCacheableFont(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req)
        const network = fetch(req)
          .then((res) => {
            // opaque(status 0)는 타 오리진 폰트라 정상이다. 그 외 실패 응답은 저장하지 않는다.
            if (res.ok || res.type === 'opaque') {
              cache.put(req, res.clone()).then(() => trimCache(ASSET_CACHE, MAX_ASSET_ENTRIES))
            }
            return res
          })
          // 캐시에도 없고 네트워크도 죽었을 때 undefined 를 흘리면 respondWith 가 터진다.
          // 이미지 하나 때문에 화면 전체가 깨지지 않도록 빈 응답으로 닫는다.
          .catch(() => hit || new Response('', { status: 504, statusText: 'offline' }))
        return hit || network
      }),
    )
    return
  }

  // 나머지는 가로채지 않는다 — 브라우저 기본 경로가 더 빠르다.
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
    icon: '/icon.png',            // 큰 브랜드 아이콘(컬러)
    badge: '/notif-badge.png',    // 상태바 모노크롬 배지(흰색 농구공)
    tag: data.tag || 'mm-league',
    renotify: true,
    lang: 'ko',
    dir: 'auto',
    timestamp: Date.now(),
    vibrate: [80, 40, 80],        // 짧은 더블 진동
    requireInteraction: false,
    actions: [{ action: 'open', title: '열기' }],
    data: { url: data.url || '/' },
  }
  // 큰 히어로 배너(선택) — payload.image 가 있을 때만
  if (data.image) options.image = data.image
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
