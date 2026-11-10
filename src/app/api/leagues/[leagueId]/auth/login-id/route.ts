// PATCH /api/leagues/[leagueId]/auth/login-id — 본인 아이디 변경 (2026-11-10 운영진)
//   body: { loginId: string, password: string } — 남이 잠깐 빌린 폰으로 바꾸지 못하게 현재 비밀번호를 같이 받는다.
//   종전 아이디 = 실명이던 회원이 자유 아이디로 옮기는 길. 같은 팀 안에서 겹치면 409.
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession, signSession, buildAuthCookieHeader } from '@/lib/auth/session'
import { verifyPassword } from '@/lib/auth/password'
import { sessionMatchesLeague } from '@/lib/auth/teamMatch'
import { resolveTeamId } from '@/lib/league/teamScope'
import { loginIdProblem, normLoginId } from '@/lib/auth/loginId'

export async function PATCH(req: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  const jar = await cookies()
  const session = verifySession(jar.get(AUTH_COOKIE)?.value)
  if (!session || !(await sessionMatchesLeague(session, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  let body: { loginId?: unknown; password?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }
  const next = typeof body.loginId === 'string' ? body.loginId.normalize('NFC').trim() : ''
  const pw = typeof body.password === 'string' ? body.password : ''
  const prob = loginIdProblem(next)
  if (prob) return NextResponse.json({ error: prob }, { status: 400 })

  const sb = createClient()
  const { data: acc } = await sb.from('league_user_accounts').select('id, login_id, password_hash').eq('id', session.uid).maybeSingle()
  if (!acc) return NextResponse.json({ error: '계정 없음' }, { status: 404 })
  if (!verifyPassword(pw, acc.password_hash)) return NextResponse.json({ error: '비밀번호가 올바르지 않습니다' }, { status: 401 })
  if (normLoginId(String(acc.login_id)) === normLoginId(next) && acc.login_id === next) return NextResponse.json({ ok: true, loginId: next })

  const teamId = await resolveTeamId(leagueId)
  const { data: accs } = await sb.from('league_user_accounts').select('id, login_id').eq('team_id', teamId)
  if ((accs ?? []).some(a => a.id !== acc.id && normLoginId(String(a.login_id)) === normLoginId(next))) {
    return NextResponse.json({ error: '이미 쓰고 있는 아이디예요' }, { status: 409 })
  }
  const { error } = await sb.from('league_user_accounts').update({ login_id: next }).eq('id', acc.id)
  if (error) {
    if ((error as { code?: string }).code === '23505') return NextResponse.json({ error: '이미 쓰고 있는 아이디예요' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 로그인 쿠키에도 새 아이디를 넣어 다시 발급한다(2026-11-10 리뷰 — 종전엔 다시 로그인할 때까지 옛 아이디가
  //   쿠키에 남아 화면·월렛 장부 기록에 옛 이름이 찍혔다)
  const res = NextResponse.json({ ok: true, loginId: next })
  const { token, maxAge } = signSession({ ...session, loginId: next })
  res.headers.append('Set-Cookie', buildAuthCookieHeader(token, maxAge))
  return res
}
