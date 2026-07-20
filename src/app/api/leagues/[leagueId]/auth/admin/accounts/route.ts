// GET  /api/leagues/[leagueId]/auth/admin/accounts?status=pending|all
//   어드민 (리그 PIN) · 계정 목록 (pending 필터 or 전체)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const status = sp.get('status') ?? 'all'
  const sb = createClient()
  let q = sb.from('league_user_accounts')
    .select('id, league_player_id, login_id, status, requested_at, approved_at, last_login_at, reset_by_admin_at')
    .eq('league_id', leagueId)
    .order('requested_at', { ascending: false })
  if (status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 선수 메타 조인
  const pids = (data ?? []).map(d => d.league_player_id)
  const { data: players } = pids.length > 0
    ? await sb.from('league_players').select('id, name, number, photo_url').in('id', pids)
    : { data: [] as Array<{ id: string; name: string; number: number | null; photo_url: string | null }> }
  const meta = new Map(((players ?? []) as Array<{ id: string; name: string; number: number | null; photo_url: string | null }>).map(p => [p.id, p]))

  return NextResponse.json({
    accounts: (data ?? []).map(a => ({
      ...a,
      player: meta.get(a.league_player_id) ?? null,
    })),
  })
}
