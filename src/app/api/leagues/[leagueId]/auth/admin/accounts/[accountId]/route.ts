// PATCH /api/leagues/[leagueId]/auth/admin/accounts/[accountId]
//   리그 편집 권한자 · 계정 상태 변경 / 비번 초기화 / 편집 권한 부여
//   body: { action: 'approve' | 'reject' | 'disable' | 'reset_password' | 'set_role', role?: 'admin'|'member' }
//   reset_password 는 비번을 '123456' 으로 고정 초기화
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague, getLeagueAdminSession } from '@/lib/auth/leagueAdmin'
import { setAccountRole, type AccountRole } from '@/lib/auth/setAccountRole'
import { hashPassword } from '@/lib/auth/password'

const RESET_PASSWORD = '123456'

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
