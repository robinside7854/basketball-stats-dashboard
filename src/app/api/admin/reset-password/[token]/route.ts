// /api/admin/reset-password/[token]   — **공개**. 토큰 자체가 인증이다.
//   GET  — 링크가 아직 유효한지 확인한다(가려진 이메일만 함께 준다).
//   POST — body: { password } · 새 비밀번호를 설정하고 링크를 소진한다.
//
// 열거(account enumeration)에 대하여
//   조회 키가 토큰 해시 하나뿐이라 이메일을 입력받는 자리가 없다 — 즉 이 경로로는
//   "그 주소가 온볼 운영자인가" 를 물어볼 수 없다. 그래도 응답에 주소를 통째로 실으면,
//   링크가 엉뚱한 사람에게 전달됐을 때 관리자 주소를 그대로 알려주는 꼴이 된다.
//   그래서 'ro***@example.com' 형태로 가려서 준다 — 본인은 알아보고 남은 못 알아본다.
//   (초대 화면이 주소를 다 보여주는 것과 다른 판단이다. 그쪽은 아직 계정이 아니다.)
//
// 레이트리밋을 붙이지 않은 이유
//   토큰은 32바이트(256비트) 랜덤이라 대입이 성립하지 않는다. 접근 요청(POST
//   /api/admin/access-requests)에 리밋을 건 것은 그쪽이 '사람이 고르는 값'인 이메일을
//   받기 때문이고, 여기는 추측 대상이 아니다.
import { NextResponse } from 'next/server'
import {
  checkPasswordReset,
  completePasswordReset,
  hashIp,
  MIN_PASSWORD_LENGTH,
} from '@/lib/auth/platformAdmin'
import { logAudit } from '@/lib/audit'

const REASON_MESSAGE: Record<string, string> = {
  invalid_token: '링크가 유효하지 않습니다 — 만료되었거나 이미 사용된 링크입니다',
  weak_password: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`,
  update_failed: '비밀번호를 바꾸지 못했습니다 — 관리자에게 새 링크를 요청하세요',
}

/** x-forwarded-for 는 'client, proxy1, proxy2' 형태다 — 맨 앞이 원 클라이언트. */
// (access-requests 라우트의 같은 함수와 중복이지만, 그쪽은 모듈 밖으로 내보내지 않는다.
//  공용으로 올릴 만큼 커지면 그때 옮기는 편이 낫다 — 지금 옮기면 무관한 파일을 건드리게 된다.)
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown'
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  try {
    const result = await checkPasswordReset(token ?? '')
    return NextResponse.json(result)
  } catch (e) {
    // 표가 아직 없는 배포(마이그레이션 105 미적용)도 여기로 떨어진다. 'not_found' 로
    // 뭉뚱그리면 멀쩡한 링크를 받은 사람이 링크를 버리므로, 조회 실패는 500 으로 구분한다.
    console.error('[admin/reset-password] 링크 확인 실패', e)
    return NextResponse.json({ error: '링크를 확인하지 못했습니다' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  let body: { password?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: REASON_MESSAGE.weak_password }, { status: 400 })
  }

  try {
    // 사용 IP 는 해시로만 남긴다 — 사후에 "이 링크가 어디서 쓰였나" 를 대조하는 데는 충분하고
    // 남겨두는 개인정보는 줄인다(097 platform_access_requests.ip_hash 와 같은 판단).
    const result = await completePasswordReset(token ?? '', password, hashIp(clientIp(req)))
    if (!result.ok) {
      return NextResponse.json(
        { error: REASON_MESSAGE[result.reason] ?? '비밀번호를 바꾸지 못했습니다', reason: result.reason },
        { status: result.reason === 'update_failed' ? 500 : 400 },
      )
    }
    // 비밀번호가 실제로 바뀐 시점을 남긴다. 발급(reset_link.create)만 있고 이 줄이 없으면
    // "링크는 나갔는데 쓰였는지 모르는" 반쪽 기록이 된다 — 드래프트 created_by 가 그랬던 형태다.
    // 행위자는 세션이 없어 'unknown' 이다. 그게 사실이다(토큰 소지자였다).
    await logAudit({
      req, action: 'platform_admin.password.reset',
      targetTable: 'platform_admins', targetId: result.adminId,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[admin/reset-password] 재설정 실패', e)
    return NextResponse.json(
      { error: '비밀번호를 바꾸지 못했습니다 — 잠시 후 다시 시도하세요' },
      { status: 500 },
    )
  }
}
