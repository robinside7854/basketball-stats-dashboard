// /api/admin/admins/[id]/reset-link
//   POST   — 공동관리자 비밀번호 재설정 링크 발급. 응답에 링크 전문이 딱 한 번 실려 나간다.
//   DELETE — 그 계정으로 살아 있는 재설정 링크를 전부 회수한다(잘못 전달했을 때의 경로).
//   인가: NextAuth CEO 세션
//
// 왜 필요한가
//   비밀번호를 잊은 공동관리자는 지금까지 복구 경로가 없었다 — 재초대는 이미 계정이 있어
//   튕기고, 재활성화는 비밀번호를 바꾸지 않는다(어드민 콘솔 감사 2026-08-15, 03 항목).
//
// 왜 메일이 아니라 링크를 돌려주는가
//   초대(admins/invite/route.ts)와 같은 이유다 — 온볼 전용 도메인이 없어 제3자에게 메일을
//   못 보낸다. CEO 가 화면에서 링크를 복사해 본인에게 직접 전달한다.
//
// 가드에 대하여
//   requireCeoSession() 은 이 저장소에서 가장 좁은 문이다 — 부트스트랩 소유자이거나 지금 이
//   순간 활성인 platform_admins 계정만 통과한다. 리그 편집 PIN 은 여기에 닿을 수 있는 경로가
//   아예 없다(PIN 은 canEditLeague 체인에만 붙는다). 리그 회원 어드민의 reset_password 가
//   isIdentifiedAdmin 으로 PIN 을 배제하는 것과 같은 취지이며, 여기선 그보다 더 좁다.
//
// 토큰 원문은 createPasswordReset() 이 돌려주는 이 순간이 유일한 노출 지점이다 — DB 엔
// sha256 해시만 남으므로 화면을 닫으면 어디서도 다시 꺼낼 수 없다.
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { siteUrl } from '@/lib/siteUrl'
import { createClient } from '@/lib/supabase/admin'
import {
  createPasswordReset,
  getAdminById,
  PASSWORD_RESET_TTL_HOURS,
} from '@/lib/auth/platformAdmin'
import { logAudit } from '@/lib/audit'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: '계정 ID가 없습니다' }, { status: 400 })

  try {
    const target = await getAdminById(id)
    if (!target) return NextResponse.json({ error: '계정을 찾을 수 없습니다' }, { status: 404 })

    // 비활성 계정에 링크를 주면 새 비밀번호를 정해도 로그인은 계속 막힌다(findActiveAdminByEmail
    // 이 비활성 계정을 없는 것으로 취급한다). 헛걸음을 만들기 전에 순서를 알려준다.
    if (target.disabled_at) {
      return NextResponse.json(
        { error: '비활성화된 계정입니다 — 먼저 다시 활성화한 뒤 재설정하세요' },
        { status: 400 },
      )
    }

    const issuedBy = session.user?.email ?? null
    const { token, reset } = await createPasswordReset(id, issuedBy)

    // 발급 사실을 서버 로그에도 남긴다. DB 행(issued_by/created_at)이 원본이고 이건 사본이지만,
    // 표를 통째로 못 읽는 상황에서도 "누가 언제 발급했나" 를 되짚을 수 있어야 한다.
    console.info(`[admin/reset-link] 발급 issued_by=${issuedBy ?? '알수없음'} target=${target.email}`)

    // 계정을 통째로 가져갈 수 있는 링크다 — 발급 자체가 권한 행위이므로 감사 로그에 남긴다.
    // ⚠ 토큰 원문은 detail 에 넣지 않는다(위 주석의 "유일한 노출 지점" 원칙).
    await logAudit({
      req, action: 'platform_admin.password_reset_link.create',
      targetTable: 'platform_admins', targetId: id,
      detail: { targetEmail: target.email, ttlHours: PASSWORD_RESET_TTL_HOURS },
    })

    return NextResponse.json({
      ok: true,
      reset,
      url: `${siteUrl()}/admin/reset-password/${token}`,
      ttlHours: PASSWORD_RESET_TTL_HOURS,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: '계정 ID가 없습니다' }, { status: 400 })

  try {
    const sb = createClient()
    // 회수는 계정 단위다 — CEO 가 화면에서 하려는 일이 "이 사람 링크를 죽인다" 이기 때문.
    // PostgREST 는 아무 행도 못 바꿔도 204 를 주므로 반환 행 수로 판정한다(감사 04 ② 패턴).
    const { data, error } = await sb
      .from('platform_admin_password_resets')
      .update({ revoked_at: new Date().toISOString() })
      .eq('admin_id', id)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id')
    if (error) return NextResponse.json({ error: `회수 실패 — ${error.message}` }, { status: 500 })
    if (!data || data.length === 0) {
      return NextResponse.json({ error: '회수할 링크가 없습니다' }, { status: 404 })
    }

    console.info(
      `[admin/reset-link] 회수 by=${session.user?.email ?? '알수없음'} admin_id=${id} count=${data.length}`,
    )
    await logAudit({
      req, action: 'platform_admin.password_reset_link.revoke',
      targetTable: 'platform_admins', targetId: id,
      detail: { revoked: data.length },
    })
    return NextResponse.json({ ok: true, revoked: data.length })
  } catch (e) {
    const message = e instanceof Error ? e.message : '알 수 없는 오류'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
