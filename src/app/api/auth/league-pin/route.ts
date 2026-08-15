// POST /api/auth/league-pin — 리그 편집 PIN 확인 (편집 모드 전환 모달이 부른다)
//
// 2026-08-15 보안 수정 — 감사 02 항목.
//   이전 구현은 가드 0 · 시도 제한 0 · 로그 0 이었다. 4자리 PIN 을 무제한으로 대입할 수 있어
//   프로덕션 실측에서 연속 오답 6회가 전부 401(429 없음)이었고, 10,000 조합을 한 시간 안에
//   전수 시도할 수 있었다.
//
//   실제 검증·카운팅·타이밍 안전 비교는 verifyLeaguePinValue 한 곳에 모여 있다
//   (src/lib/leaguePinAuth.ts). X-League-Pin 헤더 경로와 같은 카운터를 쓰게 하려는 것 —
//   두 경로가 각자 세면 한쪽을 막아도 다른 쪽으로 그대로 대입할 수 있다.
import { NextResponse } from 'next/server'
import { verifyLeaguePinValue } from '@/lib/leaguePinAuth'
import { clientIp, lockMessage } from '@/lib/auth/attemptThrottle'
import { logAudit } from '@/lib/audit'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const leagueId = typeof (body as { leagueId?: unknown } | null)?.leagueId === 'string'
    ? ((body as { leagueId: string }).leagueId)
    : ''
  const pin = typeof (body as { pin?: unknown } | null)?.pin === 'string'
    ? ((body as { pin: string }).pin)
    : ''
  if (!leagueId || !pin) return NextResponse.json({ ok: false }, { status: 400 })

  const result = await verifyLeaguePinValue(leagueId, pin, clientIp(req.headers))

  if (result.status === 'locked') {
    // 429 + Retry-After. 남은 시간을 알려주는 건 신원을 새지 않는다 —
    // PIN 의 속성이 아니라 요청자 자신의 행동에 대한 응답이기 때문
    // (access-requests 라우트가 같은 이유로 429 만 예외로 두고 있다).
    return NextResponse.json(
      { ok: false, error: lockMessage(result.retryAfterSec), retryAfterSec: result.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } }
    )
  }

  if (result.status !== 'ok') {
    // 실패만 남기고 'locked' 응답은 남기지 않는다. 실패는 throttle 상한(창당 10회)이
    // 곧 로그 상한이 되지만, 잠긴 뒤의 재시도는 상한이 없어 그대로 기록하면
    // 감사 로그 자체가 범람 표적이 된다. 연쇄를 드러내는 데는 실패 기록으로 충분하다.
    // 행위자는 'unknown' 으로 남는다 — 틀린 PIN 은 아무도 인증하지 못했다는 사실 그대로다.
    await logAudit({
      req, action: 'auth.league_pin.failed', targetTable: 'leagues', targetId: leagueId,
      leagueId, result: 'denied',
    })
    return NextResponse.json({ ok: false }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
