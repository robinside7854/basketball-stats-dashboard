// POST /api/auth/pin — 팀(대회) 편집 PIN 확인. 편집 모드 전환 모달이 부른다.
//
// 2026-08-15 보안 수정 — 리그 PIN(/api/auth/league-pin)과 같은 구멍이 여기에도 그대로 있었다:
// 4자리 PIN 에 시도 제한도 로그도 없었다. 검증·카운팅·타이밍 안전 비교는
// verifyTeamPinBySlug 한 곳에 모여 있고(src/lib/teamPinAuth.ts), X-Team-Pin 헤더 경로와
// 같은 카운터를 쓴다 — 두 경로가 각자 세면 한쪽을 막아도 다른 쪽으로 대입이 그대로 된다.
import { NextResponse } from 'next/server'
import { verifyTeamPinBySlug } from '@/lib/teamPinAuth'
import { clientIp, lockMessage } from '@/lib/auth/attemptThrottle'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const b = (body ?? {}) as { pin?: unknown; org?: unknown; team?: unknown }
  const pin = typeof b.pin === 'string' ? b.pin : ''
  const org = typeof b.org === 'string' && b.org ? b.org : 'paranalgae'
  // sub-team 지정 시 해당 팀 PIN만 검증
  const team = typeof b.team === 'string' && b.team ? b.team : undefined
  if (!pin) return NextResponse.json({ ok: false }, { status: 400 })

  const result = await verifyTeamPinBySlug(org, team, pin, clientIp(req.headers))

  if (result.status === 'locked') {
    // 남은 시간을 알려주는 건 PIN 의 속성이 아니라 요청자 자신의 행동에 대한 응답이라 안전하다.
    return NextResponse.json(
      { ok: false, error: lockMessage(result.retryAfterSec), retryAfterSec: result.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } }
    )
  }

  if (result.status !== 'ok') return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}
