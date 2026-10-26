import { isLeaguePrivateGated } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/admin'
import ScheduleClient from './ScheduleClient'

// 경기(일정) 탭 — 리그/대회 판정과 고정 대관(시간·장소·정원)을 서버에서 한 번에 읽어 넘긴다 (2026-10-26 점검 MVP 3).
//   비공개 리그 raw HTML 누출 방지 — 데이터 조회 전에 게이트부터(layout.tsx 주석 참조).
export default async function LeagueSchedulePage({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { leagueId } = await params
  if (await isLeaguePrivateGated(leagueId)) return null
  const { data } = await createClient()
    .from('leagues')
    .select('mode, default_start_time, default_place, default_capacity')
    .eq('id', leagueId)
    .maybeSingle()
  const row = data as { mode?: string; default_start_time?: string | null; default_place?: string | null; default_capacity?: number | null } | null
  return (
    <ScheduleClient
      mode={row?.mode === 'tournament' ? 'tournament' : 'league'}
      venueDefaults={row ? { start_time: row.default_start_time ?? null, place: row.default_place ?? null, capacity: row.default_capacity ?? null } : null}
    />
  )
}
