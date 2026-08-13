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
// 이 파일만 별도로 둔 이유: requireCeoSession 이 next-auth 를 끌어온다.
//   leagueAdmin.ts 에 넣으면 canEditLeague 를 쓰는 모든 리그 mutation 라우트가
//   next-auth 를 함께 로드하게 된다 — 필요한 곳에서만 import 하도록 분리한다.
import { isLeagueAdmin } from './leagueAdmin'
import { requireCeoSession } from './ceo'

export async function isIdentifiedAdmin(leagueId: string): Promise<boolean> {
  if (await isLeagueAdmin(leagueId)) return true
  return (await requireCeoSession()) !== null
}
