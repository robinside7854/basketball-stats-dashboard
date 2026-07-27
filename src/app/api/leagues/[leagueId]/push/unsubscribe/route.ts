// POST /api/leagues/[leagueId]/push/unsubscribe — endpoint 로 구독 삭제
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  let body: { endpoint?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (!endpoint) return NextResponse.json({ error: 'missing endpoint' }, { status: 400 })

  const sb = createClient()
  await sb
    .from('league_push_subscriptions')
    .delete()
    .eq('league_id', leagueId)
    .eq('endpoint', endpoint)

  return NextResponse.json({ ok: true })
}
