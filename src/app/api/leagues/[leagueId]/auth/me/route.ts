// GET /api/leagues/[leagueId]/auth/me
//   현재 로그인 세션 확인 · 선수 메타 함께 반환
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession } from '@/lib/auth/session'
import { sessionMatchesLeague } from '@/lib/auth/teamMatch'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const jar = await cookies()
  const token = jar.get(AUTH_COOKIE)?.value
  const session = verifySession(token)
  // 판정은 팀 기준 — 리그에서 로그인한 뒤 대회로 이동해도 같은 사람으로 인식돼야 한다.
  //   guard.ts/leagueAdmin.ts 와 같은 함수를 쓴다(sessionMatchesLeague) — 네 곳이 갈리면
  //   화면마다 로그인 유지 여부가 달라진다.
  if (!session || !(await sessionMatchesLeague(session, leagueId))) {
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

  // 접속 현황 기능은 2026-08-11 삭제 — last_seen_at 을 더 이상 쓰지 않는다.
  //   /me 는 화면 진입마다 불리는 경로다. 여기에 UPDATE 가 붙어 있으면 '내가 누구인지' 읽는
  //   요청이 매번 쓰기 요청이 된다. 컬럼은 남겨 두되(과거 값 보존) 갱신은 하지 않는다.

  const { data: player } = await sb
    .from('league_players')
    .select('id, name, number, position, photo_url')
    .eq('id', acc.league_player_id)
    .maybeSingle()

  // 편집 권한(role) 은 별도 쿼리로 조회한다.
  //   마이그레이션 072 는 Supabase 에서 수동 실행하는데 Vercel 배포는 push 즉시 일어난다.
  //   위 메인 select 에 role 을 넣으면 컬럼이 아직 없는 동안 쿼리 전체가 실패해
  //   로그인 회원 전원이 로그아웃된다 → 실패해도 member 로 떨어지도록 분리.
  const { data: roleRow } = await sb
    .from('league_user_accounts')
    .select('role')
    .eq('id', acc.id)
    .maybeSingle()
  const role = (roleRow as { role?: string } | null)?.role === 'admin' ? 'admin' : 'member'

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
      // 편집 권한 — 클라이언트는 이 값으로 편집 모드를 켠다 (실제 인가는 서버가 매번 재검증).
      role,
    },
  })
}
