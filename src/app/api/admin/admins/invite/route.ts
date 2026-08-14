// POST /api/admin/admins/invite   body: { email }
//   공동관리자 초대 생성. 응답에 초대 링크 전문이 딱 한 번 실려 나간다.
//   인가: NextAuth CEO 세션
//
// 왜 메일이 아니라 링크를 돌려주는가
//   온볼 전용 도메인이 아직 없어 Resend 발신 도메인 인증이 안 된 상태다(src/lib/mail.ts 주석).
//   지금은 제3자에게 메일을 못 보낸다. 그래서 CEO 가 화면에서 링크를 복사해 카톡/문자로
//   직접 전달하는 방식으로 간다. 도메인이 생기면 여기에 sendMail 한 줄을 더하면 된다.
//
// 토큰 원문은 createInvite() 가 돌려주는 이 순간이 유일한 노출 지점이다 — DB 엔 sha256
// 해시만 남으므로 화면을 닫으면 어디서도 다시 꺼낼 수 없다.
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { createClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/siteUrl'
import {
  createInvite,
  isBootstrapEmail,
  isValidEmail,
  listAdmins,
  normalizeEmail,
} from '@/lib/auth/platformAdmin'

export async function POST(req: Request) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { email?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const raw = typeof body.email === 'string' ? body.email : ''
  const email = normalizeEmail(raw)
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: '올바른 이메일 주소를 입력하세요' }, { status: 400 })
  }

  // 소유자(부트스트랩)는 환경변수로 항상 들어오는 계정이라 초대할 대상이 아니다.
  if (isBootstrapEmail(email)) {
    return NextResponse.json({ error: '이미 소유자 계정입니다 — 초대가 필요 없습니다' }, { status: 400 })
  }

  try {
    // 비활성화된 계정은 '초대'가 아니라 '다시 활성화'로 되돌리는 게 맞다 — 초대를 새로 만들면
    // acceptInvite() 가 already_admin 으로 튕겨서 초대받은 사람만 헛걸음한다.
    const admins = await listAdmins()
    const existing = admins.find(a => normalizeEmail(a.email) === email)
    if (existing && !existing.disabled_at) {
      return NextResponse.json({ error: '이미 활성 상태인 공동관리자입니다' }, { status: 400 })
    }
    if (existing && existing.disabled_at) {
      return NextResponse.json(
        { error: '비활성화된 계정입니다 — 초대 대신 목록에서 다시 활성화하세요' },
        { status: 400 },
      )
    }

    const invitedBy = session.user?.email ?? null
    const { token, invite } = await createInvite(email, invitedBy)

    // 이 사람이 남긴 접근 요청이 대기 중이었다면 함께 닫는다. 안 그러면 초대를 보내고도
    // 대기 목록에 계속 남아 두 번 초대하게 된다.
    const supabase = createClient()
    const { error: reqError } = await supabase
      .from('platform_access_requests')
      .update({ status: 'invited', handled_at: new Date().toISOString(), handled_by: invitedBy })
      .eq('status', 'pending')
      .ilike('email', email)
    if (reqError) {
      // 초대는 이미 만들어졌다 — 여기서 실패해도 초대를 되돌리지 않고 로그만 남긴다.
      console.error('[admin/invite] 접근 요청 상태 갱신 실패', reqError)
    }

    return NextResponse.json({
      ok: true,
      invite,
      url: `${siteUrl()}/admin/invite/${token}`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
