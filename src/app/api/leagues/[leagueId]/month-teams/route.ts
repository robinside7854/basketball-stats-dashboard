// GET /api/leagues/[leagueId]/month-teams — 홈 「이번 달 우리 팀」 (2026-11-08 운영진, 홈 리그 리더 자리)
//
// 이번 달 팀마다: 팀 이름·색(그 분기 정체성) · 이번 달 유니폼 색 · 팀원(사진·이름) · 팀장.
// 소속 규칙은 명단 탭(roster-cards)과 같다 — 지금 분기 정규 소속 위에 이번 달 정규(마이그레이션 120)가 먼저.
// 캐시(unstable_cache)를 쓰지 않는 DB 조회만이라 ISR Reads 를 늘리지 않는다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { loadCurrentQuarter } from '@/lib/league/currentQuarter'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { loadMonthRoster, monthOf } from '@/lib/league/monthlyRoster'
import { loadMonthUniforms, todayKst, type Uniform } from '@/lib/league/uniformPhoto'

export type MonthTeamMember = { id: string; name: string; photo_url: string | null; leader: boolean }
export type MonthTeam = { id: string; name: string; color: string; uniform: Uniform | null; members: MonthTeamMember[] }
export type MonthTeamsResponse = { month: string; monthLabel: string; teams: MonthTeam[] }

export async function GET(req: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) return NextResponse.json({ error: 'login_required' }, { status: 401 })
  const sb = createClient()
  const today = todayKst()
  const month = monthOf(today)!
  const [teamId, q] = await Promise.all([resolveTeamId(leagueId), loadCurrentQuarter(sb, leagueId)])
  const inQuarter = !!q && !!q.start_date && !!q.end_date && today >= q.start_date && today <= q.end_date

  const [playersRes, memRes, monthMap, uniforms, resolve, leadersRes] = await Promise.all([
    sb.from('league_players').select('id, name, photo_url, is_guest, is_active').eq('team_id', teamId),
    q ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
    loadMonthRoster(sb, leagueId, inQuarter ? month : null),
    loadMonthUniforms(sb, leagueId, month),
    loadIdentityResolver(sb, leagueId),
    q ? sb.from('league_team_quarter_leaders').select('team_id, leader_player_id').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { team_id: string; leader_player_id: string }[] }),
  ])
  if (playersRes.error) return NextResponse.json({ error: playersRes.error.message }, { status: 500 })

  const regular = new Map<string, string>()
  for (const m of memRes.data ?? []) if (m.team_id && m.is_regular !== false) regular.set(m.league_player_id, m.team_id)
  for (const [pid, m] of monthMap) {
    if (m.team_id && m.is_regular) regular.set(pid, m.team_id)
    else regular.delete(pid)
  }
  const leaders = new Set((leadersRes.data ?? []).map(l => l.leader_player_id as string))

  const teams = new Map<string, MonthTeam>()
  for (const p of (playersRes.data ?? []) as { id: string; name: string; photo_url: string | null; is_guest: boolean | null; is_active: boolean | null }[]) {
    if (p.is_active === false || p.is_guest) continue
    const tid = regular.get(p.id)
    if (!tid) continue
    const id = resolve(tid, q?.id)
    if (!id) continue
    let t = teams.get(id.team_id)
    if (!t) { t = { id: id.team_id, name: id.display_name, color: id.color, uniform: uniforms.get(id.team_id) ?? null, members: [] }; teams.set(id.team_id, t) }
    t.members.push({ id: p.id, name: p.name, photo_url: p.photo_url ?? null, leader: leaders.has(p.id) })
  }
  const list = [...teams.values()]
    .map(t => ({ ...t, members: t.members.sort((a, b) => Number(b.leader) - Number(a.leader) || a.name.localeCompare(b.name, 'ko')) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const body: MonthTeamsResponse = { month, monthLabel: `${Number(month.slice(5, 7))}월`, teams: list }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
