// 세션이 이 리그(경기묶음)와 같은 "팀"인지 판정 — 딱 한 곳에서만 정의한다.
//   guard.ts(getApprovedSession) · leagueAdmin.ts(getLeagueAdminSession) ·
//   auth/me/route.ts · auth/password/route.ts 네 곳이 각자
//   `session.lid !== leagueId` 비교를 따로 들고 있었다. 로그인 판정 기준을
//   팀으로 옮기면서 네 곳이 조금이라도 다른 규칙을 쓰면, 같은 회원인데
//   어떤 화면은 리그↔대회를 넘나들어도 로그인이 유지되고 어떤 화면은
//   여전히 튕기는 상태가 된다 — 회원은 왜 화면마다 다른지 짐작할 수 없다.
import type { SessionPayload } from './session'
import { resolveTeamId } from '@/lib/league/teamScope'

export async function sessionMatchesLeague(
  session: SessionPayload | null,
  leagueId: string,
): Promise<boolean> {
  if (!session) return false

  if (session.tid) {
    // 새 쿠키 — 팀 id 를 이미 담고 있으니 바로 비교한다.
    return session.tid === (await resolveTeamId(leagueId))
  }

  // ⚠ 옛 쿠키 호환 갈래 (tid 없음, 이 변경 이전에 발급됨).
  //   세션 쿠키는 30일이고 이미 회원들 브라우저에 들어가 있다 — 여기서 거부하면
  //   배포 순간 로그인한 회원 전원이 튕긴다. 발급 당시의 경기묶음(lid)을 팀으로
  //   유도해서 비교한다 — 그 팀의 다른 경기묶음으로 이동해도 여전히 통과한다.
  //   제거 가능 시점: 이 배포 이후로만 쿠키가 발급되고 30일이 지나 옛 쿠키가
  //   전부 자연 만료된 뒤 (이 배포일 + 30일). 그때 이 갈래를 지우고
  //   `if (session.tid !== (await resolveTeamId(leagueId))) return false` 한 줄로 줄이면 된다.
  const [sessionTeamId, targetTeamId] = await Promise.all([
    resolveTeamId(session.lid),
    resolveTeamId(leagueId),
  ])
  return sessionTeamId === targetTeamId
}
