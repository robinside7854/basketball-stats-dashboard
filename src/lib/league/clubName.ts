import { cache } from 'react'
import { createClient } from '@/lib/supabase/admin'

// 동호회(리그) 이름 — 탭 제목·잠금 화면용(2026-11-10 운영진: 이름은 보여도 된다).
//   한 요청 안에서 layout·page 가 같이 불러도 한 번만 읽는다(React cache).
export const getClubName = cache(async (leagueId: string): Promise<string | null> => {
  const { data } = await createClient().from('leagues').select('name').eq('id', leagueId).maybeSingle()
  return (data?.name as string | undefined) ?? null
})
