// PATCH /api/admin/admins/[id]   body: { disabled: boolean }
//   공동관리자 계정 비활성화/재활성화. 삭제하지 않는 이유는 과거 행위 기록이
//   이메일 문자열을 가리키고 있어서다(마이그레이션 097 주석).
//   인가: NextAuth CEO 세션
//
// 두 가지 자물쇠를 건다 — 둘 다 "콘솔에 아무도 못 들어가는 상태"를 막기 위한 것이다.
//   1) 자기 자신은 못 끈다. 실수 한 번으로 즉시 자기 세션이 죽는다(requireCeoSession 은
//      매 요청 DB 를 보므로 다음 클릭부터 바로 막힌다).
//   2) 마지막 남은 활성 관리자는 못 끈다 — **단, 부트스트랩 계정이 없을 때만**.
//
// 2번의 단서가 왜 붙는가. countActiveAdmins() 는 platform_admins 행만 센다. 부트스트랩
// 계정(ADMIN_EMAIL)은 DB 에 행이 없어 이 집계에 안 잡힌다. 그래서 단서 없이 걸면
// "공동관리자가 한 명일 때 그 한 명을 영영 회수할 수 없다" 가 되는데, 그 상황은 잠김이 아니다 —
// 소유자는 환경변수로 항상 들어올 수 있기 때문이다. 회수는 이 체계의 존재 이유 중 하나라
// 잠김 위험이 실재하지 않는 곳에서 막으면 안 된다.
// 부트스트랩이 없는 배포에서는 원래 의도대로 마지막 한 명을 지킨다.
// (참고: requireCeoSession 은 ADMIN_EMAIL 미설정 시 아예 fail-closed 이므로, 현실에서 이
//  단서가 참이 되는 경우는 거의 없다. 그래도 조건을 남기는 편이 의도를 코드로 남긴다.)
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import {
  countActiveAdmins,
  getAdminById,
  normalizeEmail,
  setAdminDisabled,
} from '@/lib/auth/platformAdmin'
import { logAudit } from '@/lib/audit'

function hasBootstrapAccount(): boolean {
  return Boolean(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: { disabled?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const disabled = body.disabled
  if (typeof disabled !== 'boolean') {
    return NextResponse.json({ error: 'disabled 는 true 또는 false 여야 합니다' }, { status: 400 })
  }

  try {
    const target = await getAdminById(id)
    if (!target) return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 })

    if (disabled) {
      const me = session.user?.email
      if (typeof me === 'string' && normalizeEmail(me) === normalizeEmail(target.email)) {
        return NextResponse.json({ error: '자기 자신은 비활성화할 수 없습니다' }, { status: 400 })
      }
      // 이미 꺼져 있는 계정을 또 끄는 요청은 활성 수를 줄이지 않으므로 검사에서 제외한다.
      if (!target.disabled_at && !hasBootstrapAccount() && (await countActiveAdmins()) <= 1) {
        return NextResponse.json(
          { error: '마지막 남은 활성 관리자입니다 — 다른 관리자를 먼저 추가하세요' },
          { status: 400 },
        )
      }
    }

    await setAdminDisabled(id, disabled)
    // 공동관리자 회수/복구는 콘솔 전체의 접근권을 바꾸는 행위다 — 대상 이메일까지 남긴다
    // (platform_admins 는 삭제하지 않고 비활성화만 하므로 이메일은 비밀값이 아니다).
    await logAudit({
      req, action: 'platform_admin.disabled.update', targetTable: 'platform_admins', targetId: id,
      detail: { disabled, targetEmail: target.email },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
