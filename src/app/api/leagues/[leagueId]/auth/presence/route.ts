// GET /api/leagues/[leagueId]/auth/presence — 접속 현황 (전체 공개, 인증 불필요)
//   승인된 계정 회원의 온라인 여부(최근 활동) + 마지막 접속 시각.
//   '온라인' = last_seen_at 이 ONLINE_WINDOW_MS 이내.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

const ONLINE_WINDOW_MS = 5 * 60 * 1000  // 5분 이내 활동 = 온라인

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sb = createClient()

  const { data: accounts } = await sb
    .from('league_user_accounts')
    .select('league_player_id, last_seen_at, last_login_at')
    .eq('league_id', leagueId)
    .eq('status', 'approved')

  const rows = accounts ?? []
  if (rows.length === 0) {
    return NextResponse.json({ online: 0, total: 0, members: [] })
  }

  // 선수 메타 병합
  const playerIds = rows.map(r => r.league_player_id).filter(Boolean)
  const { data: players } = await sb
    .from('league_players')
    .select('id, name, number, photo_url')
    .in('id', playerIds)
  const pmap = new Map((players ?? []).map(p => [p.id, p]))

  const now = Date.now()
  const members = rows.map(r => {
    const p = pmap.get(r.league_player_id)
    const seen = r.last_seen_at ? new Date(r.last_seen_at).getTime() : null
    const online = seen != null && (now - seen) < ONLINE_WINDOW_MS
    return {
      player_id: r.league_player_id,
      name: p?.name ?? null,
      number: p?.number ?? null,
      photo_url: p?.photo_url ?? null,
      online,
      last_seen_at: r.last_seen_at ?? r.last_login_at ?? null,
    }
  })

  // 정렬: 온라인 먼저 → 최근 접속 순
  members.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1
    const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0
    const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0
    return tb - ta
  })

  return NextResponse.json({
    online: members.filter(m => m.online).length,
    total: members.length,
    members,
  })
}
