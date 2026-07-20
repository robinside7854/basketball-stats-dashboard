// POST /api/leagues/[leagueId]/auth/login
//   body: { loginId: string, password: string }
//   승인된 계정만 로그인 성공 · 성공 시 세션 쿠키 발급
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyPassword } from '@/lib/auth/password'
import { signSession, buildAuthCookieHeader } from '@/lib/auth/session'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  let body: { loginId?: unknown; password?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const loginId = typeof body.loginId === 'string' ? body.loginId.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!loginId || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요' }, { status: 400 })
  }

  const sb = createClient()
  const { data: account } = await sb
    .from('league_user_accounts')
    .select('id, league_player_id, login_id, password_hash, status')
    .eq('league_id', leagueId)
    .eq('login_id', loginId)
    .maybeSingle()

  if (!account) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 })
  }
  if (account.status !== 'approved') {
    const msg = account.status === 'pending'
      ? '아직 승인되지 않았어요. 관리자에게 문의하세요.'
      : account.status === 'rejected'
        ? '가입이 반려되었어요.'
        : '비활성화된 계정이에요.'
    return NextResponse.json({ error: msg, status: account.status }, { status: 403 })
  }

  const ok = verifyPassword(password, account.password_hash)
  if (!ok) return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다' }, { status: 401 })

  // 세션 발급
  const { token, maxAge } = signSession({
    uid: account.id,
    lid: leagueId,
    pid: account.league_player_id,
    loginId: account.login_id,
  })

  // last_login_at 갱신 (best-effort)
  await sb.from('league_user_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', account.id)

  const res = NextResponse.json({ ok: true, loginId: account.login_id })
  res.headers.append('Set-Cookie', buildAuthCookieHeader(token, maxAge))
  return res
}
