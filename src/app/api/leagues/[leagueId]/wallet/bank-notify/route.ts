// POST /api/leagues/[leagueId]/wallet/bank-notify — 카카오뱅크 입금 알림 받기(마이그레이션 128)
//   통장 주인 폰의 알림 자동화 앱(MacroDroid 등)이 보낸다. 로그인 대신 연결 비밀번호(헤더 x-bank-token
//   또는 Authorization: Bearer) — 어드민이 월렛 어드민 탭에서 발급(해시만 저장).
//   본문 = JSON { text } 또는 그냥 글(text/plain). 짝이 딱 하나면 충전 요청 자동 승인 — 정본 lib/wallet/bankAuto.ts.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { loadWalletConfig } from '@/lib/wallet/wallet'
import { handleBankNotification, teamForToken } from '@/lib/wallet/bankAuto'

type Ctx = { params: Promise<{ leagueId: string }> }

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const teamId = await resolveTeamId(leagueId)
  if (!teamId || !(await loadWalletConfig(teamId))) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const sb = createClient()
  const auth = req.headers.get('authorization')
  const token = req.headers.get('x-bank-token') ?? (auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null)
  if (!(await teamForToken(sb, teamId, token))) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const rawBody = await req.text()
  let text = rawBody
  try {
    const j = JSON.parse(rawBody) as unknown
    if (j && typeof j === 'object') {
      const o = j as Record<string, unknown>
      text = [o.title, o.text].filter(v => typeof v === 'string').join(' ') || rawBody
    }
  } catch { /* 그냥 글 */ }
  if (!text.trim()) return NextResponse.json({ error: '빈 알림' }, { status: 400 })

  const res = await handleBankNotification(sb, teamId, text)
  return NextResponse.json({ ok: true, ...res })
}
