// GET /api/admin/admins
//   운영 콘솔 공동관리자 화면의 초기 데이터 한 번에 — 계정 목록 + 열린 초대 + 부트스트랩 이메일.
//   인가: NextAuth CEO 세션 (/api/admin/** 공통 패턴)
//
// bootstrapEmail 을 함께 내려주는 이유: 부트스트랩 계정(ADMIN_EMAIL)은 platform_admins 에
// 행이 없어서 목록에 안 뜬다. 화면이 '소유자' 배지를 붙이고 비활성화 버튼을 감추려면
// 어떤 주소가 소유자인지 알아야 한다. 이미 CEO 로 인증된 응답이라 노출해도 무방하다.
//
// resets(살아 있는 비밀번호 재설정 링크)는 **실패해도 이 응답 전체를 죽이지 않는다.**
// 그 표는 마이그레이션 105 이후에만 존재한다 — 아직 적용 전인 배포에서 조회가 터지면
// 공동관리자 화면이 통째로 500 이 된다. 재설정 기능만 조용히 꺼지는 편이 옳다.
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import {
  listAdmins,
  listOpenInvites,
  listOpenPasswordResets,
  normalizeEmail,
  type PlatformPasswordReset,
} from '@/lib/auth/platformAdmin'

export async function GET() {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    let resets: PlatformPasswordReset[] = []
    let resetsUnavailable = false
    const [admins, invites] = await Promise.all([listAdmins(), listOpenInvites()])
    try {
      resets = await listOpenPasswordResets()
    } catch (e) {
      resetsUnavailable = true
      console.error('[admin/admins] 재설정 링크 목록 조회 실패 — 마이그레이션 105 미적용?', e)
    }

    const bootstrap = process.env.ADMIN_EMAIL
    return NextResponse.json({
      admins,
      invites,
      resets,
      resetsUnavailable,
      bootstrapEmail: bootstrap ? normalizeEmail(bootstrap) : null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
