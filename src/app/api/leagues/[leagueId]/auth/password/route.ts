// PATCH /api/leagues/[leagueId]/auth/password
//   본인 비번 변경 (로그인 필요)
//   body: { currentPassword: string, newPassword: string }
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession } from '@/lib/auth/session'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const jar = await cookies()
  const session = verifySession(jar.get(AUTH_COOKIE)?.value)
  if (!session || session.lid !== leagueId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }
  const cur = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const nw = typeof body.newPassword === 'string' ? body.newPassword : ''
  if (nw.length < 4) return NextResponse.json({ error: '새 비밀번호는 4자 이상' }, { status: 400 })

  const sb = createClient()
  const { data: acc } = await sb
    .from('league_user_accounts')
    .select('password_hash')
    .eq('id', session.uid)
    .maybeSingle()
  if (!acc) return NextResponse.json({ error: '계정 없음' }, { status: 404 })

  if (!verifyPassword(cur, acc.password_hash)) {
    return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다' }, { status: 401 })
  }

  const { error } = await sb
    .from('league_user_accounts')
    .update({
      password_hash: hashPassword(nw),
      password_changed_at: new Date().toISOString(),
    })
    .eq('id', session.uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
