import { createClient } from '@/lib/supabase/admin'

/**
 * 팀 편집 PIN 검증 — 대회(파란날개) mutation API 가드.
 * 리그의 verifyLeaguePin 과 같은 구조. X-Team-Pin 헤더를 teams.edit_pin 과 대조한다.
 *
 * 불리언 대신 teams.id 를 돌려준다. 호출부가 핀 생성 시 team_id 를 채우거나
 * 리소스 소유권을 대조하는 데 그대로 쓰기 위함이다. 실패 시 null.
 */
export async function verifyTeamPin(req: Request, org: string, team: string): Promise<string | null> {
  const pin = req.headers.get('X-Team-Pin')
  if (!pin) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', org)
    .eq('sub_slug', team)
    .eq('edit_pin', pin)
    .maybeSingle()
  return (data?.id as string) ?? null
}
