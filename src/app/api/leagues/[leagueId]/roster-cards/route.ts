// GET /api/leagues/[leagueId]/roster-cards
//   「선수」 탭(2026-10-16 부활) — 지금 팀에 있는 선수 전원을 카드로 보여 주는 데 필요한 것만 준다.
//   편집 기능은 없다(명단 편집은 팀 탭 RosterEditor).
//
// 숫자 출처 — 「선수 숫자는 한 벌」(CLAUDE.md):
//   출석(gp = 뛴 날 수)과 분모(total_rounds = 리그가 연 날 수)는 computeLeagueStats 결과 그대로다.
//   getCachedLeagueStats 를 스탯 탭·선수 카드와 **같은 옵션**으로 불러 캐시 항목을 공유한다
//   (전체 = {} · 이번 분기 = quarterPeriod(q) → {from,to} 또는 {quarterId}).
//   친선 제외 · 외부 팀 이벤트 제외도 그 안에 들어 있다.
//
// 명단 규칙
//   · league_players 는 팀 소유 — team_id 로 찾는다(league_id 로 찾으면 대회 묶음에서 0명).
//   · 탈퇴(is_active=false)·외부(상대) 선수 제외.
//   · 가입 = league_user_accounts status='approved' (team_id 기준 — /players 라우트와 같다).
//   · 소속팀 = 지금 분기 league_player_quarters → (team_id, 그 분기) 정체성으로 이름·색을 푼다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
import { loadCurrentQuarter } from '@/lib/league/currentQuarter'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { loadPeriodStats, quarterPeriod, pickPlayerRow } from '@/lib/stats/playerTotals'
import type { LeagueStatsResult } from '@/lib/stats/leagueStats'

export type RosterCardAttendance = { gp: number; rate: number }

export type RosterCard = {
  id: string
  name: string
  number: number | null
  /** 콤마로 여러 개일 수 있다(예: "PG,SG") */
  positions: string[]
  photo_url: string | null
  is_guest: boolean
  has_account: boolean
  /** 지금 분기 소속 — 배정이 없으면 null */
  team: { id: string; name: string; color: string; is_regular: boolean } | null
  attendance: { all: RosterCardAttendance; quarter: RosterCardAttendance | null }
}

export type RosterCardsResponse = {
  quarter: { id: string; label: string; total_rounds: number } | null
  all_total_rounds: number
  teams: { id: string; name: string; color: string }[]
  players: RosterCard[]
}

function att(res: LeagueStatsResult | null, playerId: string): RosterCardAttendance | null {
  if (!res) return null
  const total = res.total_rounds ?? 0
  const gp = pickPlayerRow(res, playerId)?.gp ?? 0
  return { gp, rate: total > 0 ? gp / total : 0 }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sb = createClient()
  const teamId = await resolveTeamId(leagueId)
  const q = await loadCurrentQuarter(sb, leagueId)

  try {
    const [playersRes, accountsRes, membershipRes, externalIds, resolver, allStats, quarterStats] = await Promise.all([
      sb.from('league_players')
        .select('id, name, number, position, photo_url, is_guest, is_active')
        .eq('team_id', teamId),
      sb.from('league_user_accounts')
        .select('league_player_id')
        .eq('team_id', teamId)
        .eq('status', 'approved'),
      q
        ? sb.from('league_player_quarters')
            .select('league_player_id, team_id, is_regular')
            .eq('quarter_id', q.id)
        : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[], error: null }),
      fetchExternalPlayerIds(sb, leagueId),
      loadIdentityResolver(sb, leagueId),
      loadPeriodStats(leagueId, 'all'),
      q ? loadPeriodStats(leagueId, quarterPeriod(q)) : Promise.resolve(null),
    ])
    if (playersRes.error) throw new Error(playersRes.error.message)

    const verified = new Set((accountsRes.data ?? []).map(a => a.league_player_id as string))
    const membership = new Map(
      ((membershipRes.data ?? []) as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[])
        .map(m => [m.league_player_id, m]),
    )

    const teamMap = new Map<string, { id: string; name: string; color: string }>()
    const players: RosterCard[] = []
    for (const p of playersRes.data ?? []) {
      if (p.is_active === false) continue
      if (externalIds.has(p.id)) continue
      const m = membership.get(p.id)
      const ident = m?.team_id && q ? resolver(m.team_id, q.id) : null
      if (ident) teamMap.set(ident.team_id, { id: ident.team_id, name: ident.display_name, color: ident.color })
      players.push({
        id: p.id,
        name: p.name,
        number: p.number ?? null,
        positions: (p.position ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
        photo_url: p.photo_url ?? null,
        is_guest: !!p.is_guest,
        has_account: verified.has(p.id),
        team: ident ? { id: ident.team_id, name: ident.display_name, color: ident.color, is_regular: m?.is_regular !== false } : null,
        attendance: {
          all: att(allStats, p.id) ?? { gp: 0, rate: 0 },
          quarter: att(quarterStats, p.id),
        },
      })
    }

    const body: RosterCardsResponse = {
      quarter: q ? { id: q.id, label: q.label, total_rounds: quarterStats?.total_rounds ?? 0 } : null,
      all_total_rounds: allStats.total_rounds ?? 0,
      teams: [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      players,
    }
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
