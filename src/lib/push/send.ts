// 리그 전체 구독자에게 웹 푸시 발송 + 만료 구독 자동 정리.
// 서버 전용(service role). 공지 자동발송·수동 알럿 발송이 공유.
import { createClient } from '@/lib/supabase/admin'
import { isPushConfigured, webpush } from './config'

export interface PushPayload {
  title: string
  body: string
  url?: string          // 클릭 시 열 경로 (기본 '/')
  tag?: string          // 같은 tag 는 알림 대체(중복 방지)
  image?: string        // 큰 히어로 배너 이미지 URL (선택)
}

export interface PushSendResult {
  ok: boolean
  configured: boolean
  total: number
  sent: number
  failed: number
  pruned: number
}

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string }

export async function sendLeaguePush(leagueId: string, payload: PushPayload): Promise<PushSendResult> {
  if (!isPushConfigured()) {
    return { ok: false, configured: false, total: 0, sent: 0, failed: 0, pruned: 0 }
  }

  const sb = createClient()
  const { data: subs } = await sb
    .from('league_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('league_id', leagueId)

  const rows = (subs ?? []) as SubRow[]
  if (rows.length === 0) {
    return { ok: true, configured: true, total: 0, sent: 0, failed: 0, pruned: 0 }
  }

  const body = JSON.stringify({
    title: payload.title.slice(0, 120),
    body: payload.body.slice(0, 300),
    url: payload.url || '/',
    tag: payload.tag || 'mm-league',
    ...(payload.image ? { image: payload.image } : {}),
  })

  const deadEndpoints: string[] = []
  let sent = 0
  let failed = 0

  await Promise.all(rows.map(async (r) => {
    try {
      await webpush.sendNotification(
        { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } },
        body,
      )
      sent++
    } catch (e) {
      failed++
      // 410 Gone / 404 Not Found → 구독 만료 → 삭제 대상
      const code = (e as { statusCode?: number })?.statusCode
      if (code === 410 || code === 404) deadEndpoints.push(r.endpoint)
    }
  }))

  let pruned = 0
  if (deadEndpoints.length > 0) {
    const { count } = await sb
      .from('league_push_subscriptions')
      .delete({ count: 'exact' })
      .in('endpoint', deadEndpoints)
    pruned = count ?? deadEndpoints.length
  }

  return { ok: true, configured: true, total: rows.length, sent, failed, pruned }
}
