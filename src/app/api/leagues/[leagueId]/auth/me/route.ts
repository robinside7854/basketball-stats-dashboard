// GET /api/leagues/[leagueId]/auth/me
//   현재 로그인 세션 확인 · 선수 메타 함께 반환
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession } from '@/lib/auth/session'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const jar = await cookies()
  const token = jar.get(AUTH_COOKIE)?.value
  const session = verifySession(token)
  if (!session || session.lid !== leagueId) {
    return NextResponse.json({ authenticated: false })
  }

  // 계정 + 선수 메타 조회
  const sb = createClient()
  const { data: acc } = await sb
    .from('league_user_accounts')
    .select('id, league_player_id, login_id, status, password_changed_at')
    .eq('id', session.uid)
    .maybeSingle()
  if (!acc || acc.status !== 'approved') return NextResponse.json({ authenticated: false })

  // 접속 현황(presence) 하트비트 — /me 는 마운트·주기 폴링 시 호출됨. (서버리스 조기종료 방지 위해 await)
  await sb.from('league_user_accounts').update({ last_seen_at: new Date().toISOString() }).eq('id', acc.id)

  const { data: player } = await sb
    .from('league_players')
    .select('id, name, number, position, photo_url')
    .eq('id', acc.league_player_id)
    .maybeSingle()

  return NextResponse.json({
    authenticated: true,
    user: {
      id: acc.id,
      login_id: acc.login_id,
      player_id: acc.league_player_id,
      name: player?.name ?? null,
      number: player?.number ?? null,
      position: player?.position ?? null,
      photo_url: player?.photo_url ?? null,
      is_default_password: !acc.password_changed_at,
    },
  })
}
