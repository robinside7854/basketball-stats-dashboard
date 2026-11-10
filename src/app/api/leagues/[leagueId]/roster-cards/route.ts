// GET /api/leagues/[leagueId]/roster-cards
//   「선수」 탭(2026-10-16 부활) — 지금 팀에 있는 선수 전원을 카드로 보여 주는 데 필요한 것만 준다.
//   수정·삭제·분기 배정은 팀 탭 RosterEditor. 이 화면의 「+ 선수 등록」은 기존 POST /players 를 그대로 부른다.
//
// 숫자 출처 — 「선수 숫자는 한 벌」(CLAUDE.md):
//   출석(gp = 뛴 날 수)과 분모(total_rounds = 리그가 연 날 수)는 computeLeagueStats 결과 그대로다.
//   getCachedLeagueStats 를 스탯 탭·선수 카드와 **같은 옵션**으로 불러 캐시 항목을 공유한다
//   (전체 = {} · 이번 분기 = quarterPeriod(q) → {from,to} 또는 {quarterId}).
//   친선 제외 · 외부 팀 이벤트 제외도 그 안에 들어 있다.
//
// 명단 규칙
//   · league_players 는 팀 소유 — team_id 로 찾는다(league_id 로 찾으면 대회 묶음에서 0명).
//   · 탈퇴(is_active=false)·외부(상대) 선수·게스트(is_guest) 제외 — 게스트는 명단에 넣지 않는다(2026-10-16 사용자).
//   · 가입 = league_user_accounts status='approved' (team_id 기준 — /players 라우트와 같다).
//   · 등번호·소속팀은 주지 않는다(2026-10-16 사용자) — 등번호는 아무도 없고, 소속팀은 분기마다 바뀐다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
import { loadCurrentQuarter } from '@/lib/league/currentQuarter'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { loadMonthRoster, monthOf } from '@/lib/league/monthlyRoster'
import { loadPeriodStatsMany, quarterPeriod, pickPlayerRow } from '@/lib/stats/playerTotals'
import type { LeagueStatsResult } from '@/lib/stats/leagueStats'

export type RosterCardAttendance = { gp: number; rate: number }

// 기록 숫자(옛 `line`)는 2026-11-10 응답에서 뺐다 — 명단 화면은 출석만 쓰고, 순위는 리더보드 한 곳이다.

export type RosterCard = {
  id: string
  name: string
  /** 콤마로 여러 개일 수 있다(예: "PG,SG") */
  positions: string[]
  photo_url: string | null
  has_account: boolean
  /** 그 분기 정규 소속(지금 분기면 이 달 정규 120 이 먼저 — 오늘 기준). 정규가 아니면 null */
  team: { id: string; name: string; color: string } | null
  /** 플러스원(전역 플래그) */
  plus_one: boolean
  attendance: { all: RosterCardAttendance; quarter: RosterCardAttendance | null }
}

export type RosterCardsResponse = {
  quarter: { id: string; label: string; total_rounds: number } | null
  all_total_rounds: number
  /** 필터 칩용 — 그 분기(그 달)에 정규가 있는 팀, 이름순 */
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
  // ?quarterId= — 특정 분기(2026-11 운영진: 선수 탭에서 지난 분기도 보고 싶다). 없으면 지금 분기.
  const askedQ = new URL(req.url).searchParams.get('quarterId')
  let q = await loadCurrentQuarter(sb, leagueId)
  if (askedQ && askedQ !== q?.id) {
    const { data: row } = await sb.from('league_quarters')
      .select('id, year, quarter, start_date, end_date, kind')
      .eq('league_id', leagueId).eq('id', askedQ).maybeSingle()
    if (row && row.kind !== 'tournament') {
      q = { id: row.id, year: row.year, quarter: row.quarter, label: `${String(row.year).slice(2)}.${row.quarter}Q`, start_date: row.start_date, end_date: row.end_date }
    }
  }

  try {
    // 전체 + 분기를 캐시 항목 하나로(2026-11-03 ISR Reads — 종전 2회)
    const statsPairP = loadPeriodStatsMany(leagueId, q ? ['all', quarterPeriod(q)] : ['all'])
    const [playersRes, accountsRes, externalIds, statsPair] = await Promise.all([
      sb.from('league_players')
        .select('id, name, position, photo_url, is_guest, is_active, plus_one')
        .eq('team_id', teamId),
      sb.from('league_user_accounts')
        .select('league_player_id')
        .eq('team_id', teamId)
        .eq('status', 'approved'),
      fetchExternalPlayerIds(sb, leagueId),
      statsPairP,
    ])
    // 소속 — 그 분기 정규 + (오늘이 그 분기 안이면) 이 달 정규가 먼저
    const todayKst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    const inQuarter = !!q && !!q.start_date && !!q.end_date && todayKst >= q.start_date && todayKst <= q.end_date
    const [memRes, monthMap, resolve] = await Promise.all([
      q
        ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
        : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
      loadMonthRoster(sb, leagueId, inQuarter ? monthOf(todayKst) : null),
      loadIdentityResolver(sb, leagueId),
    ])
    const regularTeam = new Map<string, string>()
    for (const m of memRes.data ?? []) if (m.team_id && m.is_regular !== false) regularTeam.set(m.league_player_id, m.team_id)
    for (const [pid, m] of monthMap) {
      if (m.team_id && m.is_regular) regularTeam.set(pid, m.team_id)
      else regularTeam.delete(pid)
    }
    const teamOf = (pid: string) => {
      const tid = regularTeam.get(pid)
      const id = tid ? resolve(tid, q?.id) : null
      return id ? { id: id.team_id, name: id.display_name, color: id.color } : null
    }

    const allStats = statsPair[0]
    const quarterStats = q ? statsPair[1] ?? null : null
    if (playersRes.error) throw new Error(playersRes.error.message)

    const verified = new Set((accountsRes.data ?? []).map(a => a.league_player_id as string))
    const players: RosterCard[] = []
    for (const p of playersRes.data ?? []) {
      if (p.is_active === false) continue
      if (p.is_guest) continue
      if (externalIds.has(p.id)) continue
      players.push({
        id: p.id,
        name: p.name,
        positions: (p.position ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
        photo_url: p.photo_url ?? null,
        has_account: verified.has(p.id),
        team: teamOf(p.id),
        plus_one: !!p.plus_one,
        attendance: {
          all: att(allStats, p.id) ?? { gp: 0, rate: 0 },
          quarter: att(quarterStats, p.id),
        },
      })
    }

    const body: RosterCardsResponse = {
      quarter: q ? { id: q.id, label: q.label, total_rounds: quarterStats?.total_rounds ?? 0 } : null,
      all_total_rounds: allStats.total_rounds ?? 0,
      teams: [...new Map(players.filter(x => x.team).map(x => [x.team!.id, x.team!])).values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
      players,
    }
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
