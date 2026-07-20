// PATCH /api/leagues/[leagueId]/auth/admin/accounts/[accountId]
//   어드민 (리그 PIN) · 계정 상태 변경 or 비번 초기화
//   body: { action: 'approve' | 'reject' | 'disable' | 'reset_password' }
//   reset_password 는 비번을 '123456' 으로 고정 초기화
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { hashPassword } from '@/lib/auth/password'

const RESET_PASSWORD = '123456'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; accountId: string }> },
) {
  const { leagueId, accountId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { action?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }
  const action = typeof body.action === 'string' ? body.action : ''

  const sb = createClient()
  const patch: Record<string, unknown> = {}
  switch (action) {
    case 'approve':
      patch.status = 'approved'
      patch.approved_at = new Date().toISOString()
      patch.approved_by = 'league_pin'
      break
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
