// 리그 편집 권한 게이트 (2026-08-04)
//   정책: 로그인 회원 중 role='admin' 인 계정 = 기존 편집 PIN 과 동일한 편집 권한.
//
//   전환기 동안 PIN(X-League-Pin)도 계속 통과시킨다 (OR 게이트).
//   어드민 지정·실사용 검증이 끝나면 canEditLeague 에서 PIN 분기만 걷어내면 된다.
//
//   ⚠ role 을 세션 토큰(mm_auth)에서 읽지 않고 매 요청 DB 를 재조회한다.
//      쿠키가 30일 만료라 토큰에 실으면 권한 회수가 최대 30일 지연되기 때문.
//      guard.ts 의 getApprovedSession 이 status 를 재확인하는 것과 같은 방식이다.
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from './ceo'
import { AUTH_COOKIE, verifySession, type SessionPayload } from './session'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { sessionMatchesLeague } from './teamMatch'
import { resolveTeamId } from '@/lib/league/teamScope'

// 이 리그의 어드민 회원 세션. 미로그인 · 타 팀 세션 · 미승인 · 일반회원이면 null.
export async function getLeagueAdminSession(leagueId: string): Promise<SessionPayload | null> {
  const jar = await cookies()
  const session = verifySession(jar.get(AUTH_COOKIE)?.value)
  // 세션은 팀 스코프 — 같은 팀의 리그↔대회는 통과, 다른 팀 쿠키는 통과 불가.
  //   (guard.ts 의 getApprovedSession 과 같은 판정 함수 — 네 곳이 갈리면 화면마다
  //   로그인 유지 여부가 달라진다.)
  if (!session || !(await sessionMatchesLeague(session, leagueId))) return null

  // 계정 조회도 팀 기준으로 — league_id 로 찾으면 이 리그에서 발급된 계정만 보여서,
  //   같은 팀의 다른 경기묶음(대회)으로 넘어온 어드민이 여기서 막힌다.
  const teamId = await resolveTeamId(leagueId)

  // 마이그레이션 072 실행 전이면 role 컬럼이 없어 이 쿼리가 실패한다 → acc=null →
  // 어드민 불가로 "닫히고" canEditLeague 는 PIN 폴백으로 넘어간다 (fail-closed, 안전).
  const sb = createClient()
  const { data: acc } = await sb
    .from('league_user_accounts')
    .select('id, status, role')
    .eq('id', session.uid)
    .eq('team_id', teamId)
    .maybeSingle()
  if (!acc || acc.status !== 'approved' || acc.role !== 'admin') return null
  return session
}

export async function isLeagueAdmin(leagueId: string): Promise<boolean> {
  return (await getLeagueAdminSession(leagueId)) !== null
}

// mutation API 라우트용 편집 권한 가드 —
//   CEO/공동관리자 세션 ∥ 어드민 회원 세션 ∥ (전환기) 리그 편집 PIN.
// verifyLeaguePin 과 시그니처가 같아 기존 호출부를 그대로 치환할 수 있다.
//
// ⚠ CEO 분기를 맨 앞에 두는 이유(2026-08-15): 이게 없으면 운영 콘솔(/admin)에 CEO 로
//   로그인해도 리그 관리 탭이 전부 401 이라, CEO 가 실제로 일하려면 팀 대시보드로 가서
//   4자리 PIN 을 쳐야 했다 — 폐지 대상인 PIN 이 CEO 의 유일한 실동작 경로가 돼 있었다.
//   같은 콘솔의 드래프트 API(isDraftManager)는 이미 이 한 줄로 CEO 를 통과시킨다.
//   판정은 requireCeoSession() 하나에만 맡긴다. auth() 를 직접 부르면 AUTH_SECRET 이
//   빈 경우 truthy 한 비-세션 객체가 돌아와 fail-open 이 되기 때문(ceo.ts 주석 참조).
//   requireCeoSession 은 실패·예외·권한 회수를 전부 null 로 떨어뜨리므로(fail-closed)
//   여기서는 세션이 있을 때만 true 이고, 없으면 아래 기존 경로로 그대로 내려간다.
export async function canEditLeague(req: Request, leagueId: string): Promise<boolean> {
  if (await requireCeoSession()) return true
  if (await isLeagueAdmin(leagueId)) return true
  return verifyLeaguePin(req, leagueId)
}
