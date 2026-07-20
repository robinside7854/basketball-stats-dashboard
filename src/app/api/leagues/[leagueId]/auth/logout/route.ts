// POST /api/leagues/[leagueId]/auth/logout
//   세션 쿠키 삭제
import { NextResponse } from 'next/server'
import { buildAuthClearCookieHeader } from '@/lib/auth/session'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.append('Set-Cookie', buildAuthClearCookieHeader())
  return res
}
