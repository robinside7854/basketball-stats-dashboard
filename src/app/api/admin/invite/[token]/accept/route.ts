// POST /api/admin/invite/[token]/accept   body: { password, name? }
//   — **공개**. 토큰 자체가 인증이다(아직 계정이 없는 사람이 계정을 만드는 자리).
//
// 실패 사유는 acceptInvite() 가 구분해 주는 그대로 문장으로 옮긴다. 여기서는 열거 위험이 없다 —
// 토큰을 가진 사람은 이미 초대받은 당사자이기 때문. (열거를 막는 건 /access-requests 쪽 일이다)
import { NextResponse } from 'next/server'
import { acceptInvite, MIN_PASSWORD_LENGTH } from '@/lib/auth/platformAdmin'

const REASON_MESSAGE: Record<string, string> = {
  invalid_invite: '초대가 유효하지 않습니다 — 만료되었거나 이미 사용된 링크입니다',
  weak_password: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`,
  already_admin: '이미 등록된 계정입니다 — 기존 비밀번호로 로그인하세요',
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  let body: { password?: unknown; name?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const password = typeof body.password === 'string' ? body.password : ''
  const name = typeof body.name === 'string' ? body.name : undefined
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: REASON_MESSAGE.weak_password }, { status: 400 })
  }

  try {
    const result = await acceptInvite(token ?? '', password, name)
    if (!result.ok) {
      return NextResponse.json(
        { error: REASON_MESSAGE[result.reason] ?? '초대를 수락하지 못했습니다', reason: result.reason },
        { status: 400 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/invite/accept] 실패', e)
    return NextResponse.json({ error: '초대를 수락하지 못했습니다 — 잠시 후 다시 시도하세요' }, { status: 500 })
  }
}
