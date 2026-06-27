// 드래프트 관리 권한 — 어드민(NextAuth) 또는 리그 편집 PIN 둘 중 하나면 허용
//
// 어드민 콘솔(/admin)에서는 NextAuth 세션으로, 리그 페이지(/league) 편집 모드에서는
// X-League-Pin 헤더로 드래프트를 관리할 수 있게 한다.
//
// 방 모델(/draft/[token]) 도입 후엔 감독관(supervisor)도 같은 권한을 가짐 —
// 단, 감독관 코드는 분기(quarter) 단위로 발급되므로 별도 helper 사용.

import { auth } from '@/lib/auth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { verifySupervisorCode } from '@/lib/leagueDraftAuth'
import { createClient } from '@/lib/supabase/admin'

export async function isDraftManager(req: Request, leagueId: string): Promise<boolean> {
  const session = await auth()
  if (session) return true
  return verifyLeaguePin(req, leagueId)
}

/**
 * 드래프트 세션을 제어할 수 있는 권한 — 어드민 ∥ PIN ∥ 감독관 코드.
 * 감독관은 해당 분기의 활성 supervisor 코드와 일치해야 함.
 */
export async function isDraftSessionController(
  req: Request,
  leagueId: string,
  quarterId: string,
): Promise<boolean> {
  if (await isDraftManager(req, leagueId)) return true
  const { valid } = await verifySupervisorCode(req, leagueId, quarterId)
  return valid
}

/**
 * draftId 만 알고 있을 때 사용 — DB에서 quarter_id 를 조회한 뒤 세션 제어 권한 확인.
 * 라우트 핸들러가 어차피 draft 를 다시 fetch 하므로 추가 비용은 1 쿼리(미미).
 */
export async function isDraftSessionControllerByDraftId(
  req: Request,
  leagueId: string,
  draftId: string,
): Promise<boolean> {
  if (await isDraftManager(req, leagueId)) return true
  const supabase = createClient()
  const { data } = await supabase
    .from('league_drafts')
    .select('quarter_id')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!data) return false
  const { valid } = await verifySupervisorCode(req, leagueId, (data as { quarter_id: string }).quarter_id)
  return valid
}
