// "신원이 남는 권한자" 가드 — 어드민 회원 세션(league_user_accounts.role='admin') 또는 CEO.
//
// ⚠ canEditLeague 와 다르다. canEditLeague 는 편집 PIN 도 통과시킨다.
//   PIN 은 단톡방을 떠도는 4자리 공유 비밀이고 누가 썼는지 기록이 안 남는다.
//   그래서 "되돌릴 수 없는 결과" 나 "돈이 나가는 행위" 는 이 가드로 막는다.
//   (CLAUDE.md "PIN 폐지 방향(2026-08-10)" — 새 기능에 PIN 가드를 얹지 말 것)
//
// 원래 /api/leagues/[leagueId]/auth/admin/accounts/[accountId]/route.ts 안의
// 로컬 함수였다. AI 프로필 생성 라우트에서도 같은 경계가 필요해져 공용으로 올렸다.
// 경계 정의가 두 벌로 갈라지면 한쪽만 느슨해져도 눈치채기 어렵다.
//
// 이 파일을 별도로 둔 이유는 이제 "무엇을 통과시키는가"의 차이 하나다(위 ⚠ 참조).
//   원래는 next-auth 로드를 canEditLeague 사용처에서 떼어놓으려는 목적도 있었지만,
//   2026-08-15 에 canEditLeague 가 CEO 를 직접 통과시키게 되면서(운영 콘솔이 401 로
//   막혀 CEO 가 PIN 을 쳐야 했던 문제) leagueAdmin.ts 도 ceo.ts 를 import 한다.
//   그래도 이 가드는 합치지 않는다 — 여기는 PIN 을 배제하는 더 좁은 경계다.
import { isLeagueAdmin } from './leagueAdmin'
import { requireCeoSession } from './ceo'

export async function isIdentifiedAdmin(leagueId: string): Promise<boolean> {
  if (await isLeagueAdmin(leagueId)) return true
  return (await requireCeoSession()) !== null
}
