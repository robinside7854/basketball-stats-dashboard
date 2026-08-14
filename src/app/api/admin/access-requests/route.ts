// /api/admin/access-requests
//   POST — **공개**. 권한 없는 사람이 이메일만 남기는 창구 (/admin/request-access 화면).
//   GET  — CEO 전용. 대기/처리된 요청 목록.
//
// ⚠ POST 의 응답은 어떤 경우에도 똑같은 { ok: true } 다.
//   "이미 관리자입니다" / "이미 요청하셨습니다" 처럼 결과를 갈라 보여주면, 아무나 이 엔드포인트로
//   이메일을 하나씩 넣어보며 **누가 온볼 운영자인지 밖에서 열거**할 수 있다(account enumeration).
//   여기서 갈리지 않으므로 판단은 전부 CEO 화면에서 사람이 한다. 레이트리밋 초과(429)만 예외인데,
//   그건 이메일의 속성이 아니라 요청자의 행동에 대한 응답이라 신원을 새지 않는다.
//
// 메일 발송 실패는 절대 접수를 실패시키지 않는다 — DB 에 남은 요청이 원본이고 메일은 알림이다.
// 나가지 못한 경우 notified_at 이 NULL 로 남아 화면에서 '메일 미발송'으로 구분된다.
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { createClient } from '@/lib/supabase/admin'
import { hashIp, isValidEmail, normalizeEmail } from '@/lib/auth/platformAdmin'
import { ownerNotifyAddress, sendMail } from '@/lib/mail'
import { siteUrl } from '@/lib/siteUrl'

// 레이트리밋 — Redis 가 없으므로 DB count 로 센다. 표에 이미 (ip_hash, created_at) 과
// (lower(email), created_at) 인덱스가 있어(마이그레이션 097) 이 조회는 인덱스만 탄다.
const IP_WINDOW_MS = 10 * 60_000     // 10분
const IP_MAX = 5                      // 같은 IP 에서 10분에 5건까지
const EMAIL_WINDOW_MS = 24 * 3600_000 // 24시간
const EMAIL_MAX = 3                   // 같은 이메일로 하루 3건까지

/** x-forwarded-for 는 'client, proxy1, proxy2' 형태다 — 맨 앞이 원 클라이언트. */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function POST(req: Request) {
  let body: { email?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const raw = typeof body.email === 'string' ? body.email : ''
  const email = normalizeEmail(raw)
  // 형식 오류는 신원을 새지 않는다(입력 자체가 주소가 아니다) — 그대로 알려준다.
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: '올바른 이메일 주소를 입력하세요' }, { status: 400 })
  }

  const supabase = createClient()
  const ipHash = hashIp(clientIp(req))

  // 레이트리밋 조회가 실패하면 접수를 막지 않는다 — 스팸보다 정상 요청이 막히는 쪽이 더 나쁘다.
  try {
    const [byIp, byEmail] = await Promise.all([
      supabase
        .from('platform_access_requests')
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', new Date(Date.now() - IP_WINDOW_MS).toISOString()),
      supabase
        .from('platform_access_requests')
        .select('id', { count: 'exact', head: true })
        .ilike('email', email)
        .gte('created_at', new Date(Date.now() - EMAIL_WINDOW_MS).toISOString()),
    ])
    if ((byIp.count ?? 0) >= IP_MAX || (byEmail.count ?? 0) >= EMAIL_MAX) {
      return NextResponse.json(
        { error: '요청이 너무 잦습니다 — 잠시 후 다시 시도하세요' },
        { status: 429 },
      )
    }
  } catch (e) {
    console.error('[access-requests] 레이트리밋 조회 실패 — 접수는 계속 진행', e)
  }

  const { data: inserted, error } = await supabase
    .from('platform_access_requests')
    .insert({ email, ip_hash: ipHash })
    .select('id')
    .single()
  if (error || !inserted) {
    console.error('[access-requests] 접수 실패', error)
    return NextResponse.json({ error: '요청을 접수하지 못했습니다 — 잠시 후 다시 시도하세요' }, { status: 500 })
  }

  // 알림. 실패해도 위 접수는 그대로 살아 있다.
  const to = ownerNotifyAddress()
  if (to) {
    const result = await sendMail({
      to,
      subject: '[온볼] 운영 콘솔 접근 요청',
      text:
        `운영 콘솔 접근 요청이 접수되었습니다.\n\n` +
        `이메일: ${email}\n` +
        `시각: ${new Date().toLocaleString('ko-KR')}\n\n` +
        `처리하기: ${siteUrl()}/admin/admins\n`,
    })
    if (result.sent) {
      await supabase
        .from('platform_access_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', inserted.id)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: Request) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const status = new URL(req.url).searchParams.get('status')
  const supabase = createClient()
  let query = supabase
    .from('platform_access_requests')
    .select('id, email, status, notified_at, created_at, handled_at, handled_by')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && ['pending', 'invited', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}
