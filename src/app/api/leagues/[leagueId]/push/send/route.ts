// POST /api/leagues/[leagueId]/push/send — 수동 알럿 발송 (편집 PIN 필요)
// body: { title, body, url? } → 리그 전체 구독자에게 발송.
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { isPushConfigured } from '@/lib/push/config'
import { sendLeaguePush } from '@/lib/push/send'

const MAX_TITLE = 80
const MAX_BODY = 200

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!isPushConfigured()) {
    return NextResponse.json({ error: 'push not configured' }, { status: 501 })
  }
  if (!(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { title?: unknown; body?: unknown; url?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : ''
  const message = typeof body.body === 'string' ? body.body.trim().slice(0, MAX_BODY) : ''
  const url = typeof body.url === 'string' && body.url.startsWith('/') ? body.url.slice(0, 300) : '/'
  if (!title) return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })

  const result = await sendLeaguePush(leagueId, { title, body: message, url, tag: 'mm-alert' })
  return NextResponse.json(result)
}
