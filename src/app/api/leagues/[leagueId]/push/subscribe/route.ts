// POST /api/leagues/[leagueId]/push/subscribe — 브라우저 구독 저장(upsert by endpoint)
// 익명 구독 허용(로그인 불필요) · endpoint 가 고유 식별자.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isPushConfigured } from '@/lib/push/config'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'push not configured' }, { status: 501 })
  }

  let body: { endpoint?: unknown; p256dh?: unknown; auth?: unknown; label?: unknown; user_agent?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  const p256dh = typeof body.p256dh === 'string' ? body.p256dh : ''
  const auth = typeof body.auth === 'string' ? body.auth : ''
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'missing subscription fields' }, { status: 400 })
  }
  const member_label = typeof body.label === 'string' ? body.label.trim().slice(0, 60) || null : null
  const user_agent = typeof body.user_agent === 'string' ? body.user_agent.slice(0, 300) : null

  const sb = createClient()
  const { error } = await sb
    .from('league_push_subscriptions')
    .upsert(
      { league_id: leagueId, endpoint, p256dh, auth, member_label, user_agent, last_seen_at: new Date().toISOString() },
      { onConflict: 'endpoint' },
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
