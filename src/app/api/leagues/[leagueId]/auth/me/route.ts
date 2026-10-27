// GET /api/leagues/[leagueId]/auth/me
//   현재 로그인 세션 확인 · 선수 메타 함께 반환 · `ceo`(온볼 운영자 세션 여부)도 함께 (2026-10-12).
//
//   ⚠ `ceo` 는 종전 `/api/auth/ceo-session` 이 따로 주던 값이다 — 리그 화면 진입마다 요청이 하나 더
//     나갔다(리뉴얼 5단계에서 합침). 판정 함수는 그대로 `requireCeoSession()`(DB 재확인) 이고,
//     화면 표시용일 뿐이다. 실제 인가는 각 mutation 라우트의 canEditLeague 가 매 요청 다시 한다.
//   ⚠ role 도 여기서 **매 요청 DB 에서** 읽는다(세션 토큰에 넣지 않는다 — 강등 즉시 반영).
//   개인 데이터라 응답은 `private, no-store` — 공유 캐시에 실리면 안 된다.
//   ⚠ 2026-10-26 (점검 MVP 0·1):
//     · 로그인 유지 연장 — 쿠키는 발급 시각 기준 30일 고정이라 매일 들어와도 30일째에 갑자기 잠겼다.
//       남은 기간이 REFRESH_BELOW 보다 짧으면 같은 내용으로 새로 서명해 30일을 다시 준다(=30일 동안 안 오면 로그아웃).
//     · last_seen_at 다시 기록 — 「안 본다」를 잴 수단이 로그인 시각뿐이었다. 쓰기가 화면마다 붙지 않게
//       SEEN_EVERY 에 한 번만 UPDATE 한다.
import { NextResponse, after } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession, signSession, buildAuthCookieHeader } from '@/lib/auth/session'
import { sessionMatchesLeague } from '@/lib/auth/teamMatch'
import { requireCeoSession } from '@/lib/auth/ceo'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const DAY = 24 * 60 * 60 * 1000
const REFRESH_BELOW = 25 * DAY   // 남은 기간이 25일 미만(=발급 후 5일 지남)이면 연장
const SEEN_EVERY = 6 * 60 * 60 * 1000

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // CEO 판정은 회원 세션과 무관하므로 먼저 띄워 두고 병렬로 기다린다.
  const ceoPromise = requireCeoSession().then(s => !!s).catch(() => false)
  const jar = await cookies()
  const token = jar.get(AUTH_COOKIE)?.value
  const session = verifySession(token)
  // 판정은 팀 기준 — 리그에서 로그인한 뒤 대회로 이동해도 같은 사람으로 인식돼야 한다.
  //   guard.ts/leagueAdmin.ts 와 같은 함수를 쓴다(sessionMatchesLeague) — 네 곳이 갈리면
  //   화면마다 로그인 유지 여부가 달라진다.
  if (!session || !(await sessionMatchesLeague(session, leagueId))) {
    return NextResponse.json({ authenticated: false, ceo: await ceoPromise }, { headers: NO_STORE })
  }

  // 계정 + 선수 메타 조회
  const sb = createClient()
  const { data: acc } = await sb
    .from('league_user_accounts')
    .select('id, league_player_id, login_id, status, password_changed_at, last_seen_at')
    .eq('id', session.uid)
    .maybeSingle()
  if (!acc || acc.status !== 'approved') return NextResponse.json({ authenticated: false, ceo: await ceoPromise }, { headers: NO_STORE })

  // 마지막 열람 시각 — SEEN_EVERY 에 한 번만 쓴다(best-effort, 실패해도 응답은 그대로)
  //   2026-10-27 속도: 응답을 기다리게 하지 않고 응답 뒤에 쓴다(after — Vercel 이 끝날 때까지 기다려 준다).
  const lastSeen = (acc as { last_seen_at?: string | null }).last_seen_at
  if (!lastSeen || Date.now() - new Date(lastSeen).getTime() > SEEN_EVERY) {
    after(async () => {
      await sb.from('league_user_accounts').update({ last_seen_at: new Date().toISOString() }).eq('id', acc.id).then(() => {}, () => {})
    })
  }

  // 편집 권한(role) 은 별도 쿼리로 조회한다.
  //   마이그레이션 072 는 Supabase 에서 수동 실행하는데 Vercel 배포는 push 즉시 일어난다.
  //   위 메인 select 에 role 을 넣으면 컬럼이 아직 없는 동안 쿼리 전체가 실패해
  //   로그인 회원 전원이 로그아웃된다 → 실패해도 member 로 떨어지도록 분리.
  //   선수 메타와 role 은 서로 기다릴 이유가 없어 같이 보낸다(2026-10-27).
  const [{ data: player }, { data: roleRow }] = await Promise.all([
    sb.from('league_players')
      .select('id, name, number, position, photo_url')
      .eq('id', acc.league_player_id)
      .maybeSingle(),
    sb.from('league_user_accounts')
      .select('role')
      .eq('id', acc.id)
      .maybeSingle(),
  ])
  const role = (roleRow as { role?: string } | null)?.role === 'admin' ? 'admin' : 'member'

  const res = NextResponse.json({
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
    ceo: await ceoPromise,
  }, { headers: NO_STORE })
  // 로그인 유지 연장 — 같은 내용(uid·lid·tid·pid)으로 다시 서명
  if (session.exp - Date.now() < REFRESH_BELOW) {
    const { token: fresh, maxAge } = signSession({ uid: session.uid, lid: session.lid, tid: session.tid, pid: session.pid, loginId: session.loginId })
    res.headers.append('Set-Cookie', buildAuthCookieHeader(fresh, maxAge))
  }
  return res
}
