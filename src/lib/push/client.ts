// 클라이언트 웹 푸시 구독 헬퍼 — 브라우저에서만 사용.
// Service Worker(/sw.js) + Notification 권한 + PushManager 를 감싼다.

export type PushSupport = 'unsupported' | 'ok'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// VAPID public key(base64url) → Uint8Array (PushManager.subscribe 요구 형식)
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

// 현재 이 브라우저가 이 앱에 이미 구독돼 있는지
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) return null
    return await reg.pushManager.getSubscription()
  } catch {
    return null
  }
}

// 구독 실행 → 서버 저장. 반환: 성공 여부.
export async function subscribeToPush(
  leagueId: string,
  vapidPublicKey: string,
  label?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (!vapidPublicKey) return { ok: false, reason: 'not-configured' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'denied' }

  try {
    const reg = await ensureRegistration()
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      })
    }
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
    const res = await fetch(`/api/leagues/${leagueId}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        label: label || null,
        user_agent: navigator.userAgent.slice(0, 300),
      }),
    })
    if (!res.ok) return { ok: false, reason: 'server' }
    return { ok: true }
  } catch {
    return { ok: false, reason: 'error' }
  }
}

// 구독 해제 → 서버에서도 삭제.
export async function unsubscribeFromPush(leagueId: string): Promise<boolean> {
  if (!pushSupported()) return false
  try {
    const sub = await getExistingSubscription()
    if (!sub) return true
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await fetch(`/api/leagues/${leagueId}/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
    return true
  } catch {
    return false
  }
}
