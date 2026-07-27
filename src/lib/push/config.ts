// 웹 푸시(VAPID) 서버 설정 — 환경변수 유무를 안전하게 감싼다.
// env 미설정 시 isPushConfigured()=false → UI 는 알림 기능을 숨기고 발송 API 는 501.
import webpush from 'web-push'

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? ''
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:robin6596@gmail.com'

let configured = false
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
    configured = true
  } catch {
    configured = false
  }
}

export function isPushConfigured(): boolean {
  return configured
}

export function getVapidPublicKey(): string {
  return PUBLIC_KEY
}

export { webpush }
