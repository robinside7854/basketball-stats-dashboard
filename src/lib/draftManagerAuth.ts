// 드래프트 관리 권한 — 어드민(NextAuth) 또는 리그 편집 PIN 둘 중 하나면 허용
//
// 어드민 콘솔(/admin)에서는 NextAuth 세션으로, 리그 페이지(/league) 편집 모드에서는
// X-League-Pin 헤더로 드래프트를 관리할 수 있게 한다.

import { auth } from '@/lib/auth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function isDraftManager(req: Request, leagueId: string): Promise<boolean> {
  const session = await auth()
  if (session) return true
  return verifyLeaguePin(req, leagueId)
}
