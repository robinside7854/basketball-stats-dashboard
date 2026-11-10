// GET /api/admin/clubs — CEO 콘솔 동호회 목록 (2026-11-10 온볼 플랫폼화 1단계)
//   리그 시스템(미라클)·옛 팀 시스템(파란날개)을 **한 목록**으로 준다. 동호회 = teams 한 줄.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { buildClub, type ClubRow } from '@/lib/club/settings'

export async function GET() {
  if (!await requireCeoSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createClient()
  const [teamsR, leaguesR, lpR, pR, accR, tourR] = await Promise.all([
    sb.from('teams').select('*').order('created_at', { ascending: true }),
    sb.from('leagues').select('id, team_id, name, mode, season_year, status, rsvp_rules, youtube_channel'),
    sb.from('league_players').select('team_id, is_guest, is_active'),
    sb.from('players').select('team_id, is_active'),
    sb.from('league_user_accounts').select('team_id, status, role'),
    sb.from('tournaments').select('team_id'),
  ])
  if (teamsR.error) return NextResponse.json({ error: teamsR.error.message }, { status: 500 })
  type L = { id: string; team_id: string | null; name: string; mode: string | null; season_year: number | null; status: string | null; rsvp_rules: { game_weekday?: number; capacity?: number } | null; youtube_channel: string | null }
  const leagues = (leaguesR.data ?? []) as L[]
  const count = <T extends { team_id: string | null }>(rows: T[] | null, id: string, f: (r: T) => boolean = () => true) =>
    (rows ?? []).filter(r => r.team_id === id && f(r)).length
  const clubs = ((teamsR.data ?? []) as ClubRow[]).map(row => {
    const ls = leagues.filter(l => l.team_id === row.id)
    const club = buildClub(row, ls)
    const isLeague = club.system === 'league'
    return {
      id: row.id, name: row.name, org_slug: row.org_slug, sub_slug: row.sub_slug, logo_url: row.logo_url,
      accent_color: row.accent_color, is_public: row.is_public, is_active: row.is_active,
      system: club.system, features: club.features,
      members: isLeague
        ? count(lpR.data as Array<{ team_id: string | null; is_guest: boolean | null; is_active: boolean | null }>, row.id, r => !r.is_guest && r.is_active !== false)
        : count(pR.data as Array<{ team_id: string | null; is_active: boolean | null }>, row.id, r => r.is_active !== false),
      accounts: count(accR.data as Array<{ team_id: string | null; status: string }>, row.id, r => r.status === 'approved'),
      admins: count(accR.data as Array<{ team_id: string | null; status: string; role: string | null }>, row.id, r => r.status === 'approved' && r.role === 'admin'),
      pending: count(accR.data as Array<{ team_id: string | null; status: string }>, row.id, r => r.status === 'pending'),
      seasons: ls.map(l => ({ id: l.id, name: l.name, mode: l.mode, season_year: l.season_year, status: l.status })),
      legacy_tournaments: count(tourR.data as Array<{ team_id: string | null }>, row.id),
    }
  })
  return NextResponse.json({ clubs })
}
