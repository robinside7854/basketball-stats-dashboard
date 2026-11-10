// 단장이 평문 코드를 입력했을 때 어느 팀의 단장인지 식별.
//
// POST body: { quarter_id, plain_code }
// 응답:
//   matched: { team_id, label, code_id } | null
//
// 평문 코드는 bcrypt 해시와 비교 (bcrypt.compare).
// 코드를 찾은 경우 — 응답에 codeId를 포함하므로 클라이언트가 X-Draft-Code 헤더로 픽 요청 가능.

import { NextResponse } from 'next/server'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'
import { checkAttemptLock, recordFailedAttempt, clearFailedAttempts, clientIp, lockMessage } from '@/lib/auth/attemptThrottle'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const body = await req.json().catch(() => null) as
    | { quarter_id?: string; plain_code?: string }
    | null
  if (!body?.quarter_id || !body?.plain_code) {
    return NextResponse.json({ error: 'quarter_id, plain_code 필요' }, { status: 400 })
  }

  // 틀린 시도 횟수 제한(2026-11-10 리뷰) — 분기·IP 단위. 막히면 몇 분 뒤 다시.
  const ip = clientIp(req.headers)
  const subject = `${leagueId}:${body.quarter_id}`
  const lock = await checkAttemptLock('draft_code', subject, ip)
  if (lock.locked) return NextResponse.json({ error: lockMessage(lock.retryAfterSec) }, { status: 429 })
  const result = await lookupDraftCode(leagueId, body.quarter_id, body.plain_code.trim())
  if (!result) {
    await recordFailedAttempt('draft_code', subject, ip)
    return NextResponse.json({ matched: null })
  }
  await clearFailedAttempts('draft_code', subject, ip)
  return NextResponse.json({
    matched: {
      team_id: result.teamId,
      label: result.label,
      code_id: result.codeId,
      role: result.role,
    },
  })
}
