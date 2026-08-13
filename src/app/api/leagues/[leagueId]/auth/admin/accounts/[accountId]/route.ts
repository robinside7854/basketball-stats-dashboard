// PATCH /api/leagues/[leagueId]/auth/admin/accounts/[accountId]
//   리그 편집 권한자 · 계정 상태 변경 / 비번 초기화 / 편집 권한 부여
//   body: { action: 'approve' | 'reject' | 'disable' | 'reset_password' | 'set_role', role?: 'admin'|'member' }
//   reset_password 는 비번을 '123456' 으로 고정 초기화
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague, getLeagueAdminSession } from '@/lib/auth/leagueAdmin'
import { isIdentifiedAdmin } from '@/lib/auth/identifiedAdmin'
import { setAccountRole, type AccountRole } from '@/lib/auth/setAccountRole'
import { hashPassword } from '@/lib/auth/password'

const RESET_PASSWORD = '123456'

// isIdentifiedAdmin("신원이 남는 권한자" = 어드민 회원 세션 ∥ CEO)은
// `@/lib/auth/identifiedAdmin` 로 옮겼다 (AI 프로필 생성 라우트도 같은 경계를 쓴다).
//
// ⚠ canEditLeague 와 다르다. canEditLeague 는 편집 PIN 도 통과시킨다.
//   PIN 은 단톡방을 떠도는 4자리 공유 비밀이고 누가 썼는지 기록이 안 남는다.
//   그런 열쇠로 **영구 권한**을 만들어내는 경로가 있으면, 잠깐 새어나간 PIN 이
//   되돌릴 수 없는 어드민으로 굳는다. PIN 을 나중에 바꿔도 그 어드민은 남는다.
//   그래서 아래 세 가지는 PIN 으로 못 하게 막는다:
//     · set_role        — 직접적인 권한 상승
//     · reset_password  — 어드민 비번을 '123456' 으로 만든 뒤 그 계정으로 로그인하면 결과가 같다
//     · 어드민 계정의 disable/reject — 탈취는 아니지만 운영진을 잠가버릴 수 있다
//   나머지(일반 회원 승인·반려·비활성)는 PIN 으로도 계속 가능하다. 아직 어드민이 없는
//   동호회가 첫 회원을 받는 길까지 막으면 온보딩이 멈춘다.

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; accountId: string }> },
) {
  const { leagueId, accountId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { action?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }
  const action = typeof body.action === 'string' ? body.action : ''

  // 편집 권한 부여/회수 — 공용 로직(승인계정 검사 · 마지막 어드민 보호)에 위임.
  // 자기 자신 강등은 막는다 (실수로 편집 권한을 잃고 잠기는 것 방지).
  if (action === 'set_role') {
    if (!await isIdentifiedAdmin(leagueId)) {
      return NextResponse.json(
        { error: '편집 PIN 으로는 어드민을 지정할 수 없습니다. 어드민 회원으로 로그인하거나 운영자에게 요청하세요.' },
        { status: 403 },
      )
    }
    const role = (body as { role?: unknown }).role
    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json({ error: "role 은 'admin' 또는 'member' 여야 합니다" }, { status: 400 })
    }
    if (role === 'member') {
      const me = await getLeagueAdminSession(leagueId)
      if (me?.uid === accountId) {
        return NextResponse.json({ error: '본인의 어드민 권한은 해제할 수 없습니다' }, { status: 409 })
      }
    }
    const result = await setAccountRole(leagueId, accountId, role as AccountRole)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true, account: result.account })
  }

  const sb = createClient()

  // 대상 계정이 어드민이면, 그 계정을 건드리는 행위는 신원 있는 권한자만 할 수 있다.
  //   · reset_password → 어드민 비번을 '123456' 으로 바꾼 뒤 그 계정으로 로그인 = set_role 과 같은 결과
  //   · disable/reject → 탈취는 아니지만 운영진 전원을 잠가 PIN 만 남는 상태로 되돌릴 수 있다
  // 조회는 team 기준이다. 같은 팀의 리그↔대회를 오가는 계정이 여기서 안 잡히면 검사가 헛돈다.
  const { data: targetRow } = await sb
    .from('league_user_accounts')
    .select('role')
    .eq('id', accountId)
    .maybeSingle()
  const targetIsAdmin = targetRow?.role === 'admin'
  const sensitive = action === 'reset_password' || targetIsAdmin
  if (sensitive && !await isIdentifiedAdmin(leagueId)) {
    return NextResponse.json(
      {
        error: targetIsAdmin
          ? '편집 PIN 으로는 어드민 계정을 변경할 수 없습니다.'
          : '편집 PIN 으로는 비밀번호를 초기화할 수 없습니다. 어드민 회원으로 로그인하세요.',
      },
      { status: 403 },
    )
  }

  const patch: Record<string, unknown> = {}
  switch (action) {
    case 'approve': {
      patch.status = 'approved'
      patch.approved_at = new Date().toISOString()
      // 승인 주체 기록 — 어드민 회원이면 그 계정, PIN 폴백이면 'league_pin'
      const approver = await getLeagueAdminSession(leagueId)
      patch.approved_by = approver?.loginId ?? 'league_pin'
      break
    }
    case 'reject':
      patch.status = 'rejected'
      break
    case 'disable':
      patch.status = 'disabled'
      break
    case 'reset_password':
      patch.password_hash = hashPassword(RESET_PASSWORD)
      patch.password_changed_at = null
      patch.reset_by_admin_at = new Date().toISOString()
      break
    default:
      return NextResponse.json({ error: `알 수 없는 action: ${action}` }, { status: 400 })
  }

  const { data, error } = await sb
    .from('league_user_accounts')
    .update(patch)
    .eq('id', accountId)
    .eq('league_id', leagueId)
    .select('id, status, reset_by_admin_at, approved_at')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '계정을 찾지 못했습니다' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    account: data,
    reset_password_note: action === 'reset_password' ? `초기 비번: ${RESET_PASSWORD}` : undefined,
  })
}
