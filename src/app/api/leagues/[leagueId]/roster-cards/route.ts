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
import { loadPeriodStats, quarterPeriod, pickPlayerRow } from '@/lib/stats/playerTotals'
import type { LeagueStatsResult } from '@/lib/stats/leagueStats'
import { leagueMinRounds, meetsAttemptMin } from '@/lib/stats/eligibility'

export type RosterCardAttendance = { gp: number; rate: number }

/** 리뉴얼 R2 (2026-10-31): 선수 탭이 스탯 리더보드를 겸한다 — 하루 평균 6개 + 순위 자격.
 *  숫자는 computeLeagueStats 행 그대로(스탯 탭·선수 카드와 같은 캐시 항목). */
export type RosterCardLine = {
  ppg: number; rpg: number; orp: number; drp: number; apg: number; spg: number; bpg: number; topg: number
  /** 3점 성공 하루 평균 */
  tpg: number
  fgm: number; fga: number; fg_pct: number
  fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number
  eligible: boolean
  /** 성공률 순위 자격(출전 자격 + 최소 시도 — 스탯 탭과 같은 meetsAttemptMin) */
  fg_ok: boolean; fg3_ok: boolean; ft_ok: boolean
}

export type RosterCard = {
  id: string
  name: string
  /** 콤마로 여러 개일 수 있다(예: "PG,SG") */
  positions: string[]
  photo_url: string | null
  has_account: boolean
  attendance: { all: RosterCardAttendance; quarter: RosterCardAttendance | null }
  line: { all: RosterCardLine | null; quarter: RosterCardLine | null }
}

export type RosterCardsResponse = {
  quarter: { id: string; label: string; total_rounds: number } | null
  all_total_rounds: number
  players: RosterCard[]
}

function att(res: LeagueStatsResult | null, playerId: string): RosterCardAttendance | null {
  if (!res) return null
  const total = res.total_rounds ?? 0
  const gp = pickPlayerRow(res, playerId)?.gp ?? 0
  return { gp, rate: total > 0 ? gp / total : 0 }
}

function lineOf(res: LeagueStatsResult | null, playerId: string, minGp: number): RosterCardLine | null {
  if (!res) return null
  const r = pickPlayerRow(res, playerId)
  if (!r || !r.gp) return null
  const eligible = r.gp >= minGp && res.players.some(x => x.player_id === playerId)
  return {
    ppg: r.ppg, rpg: r.rpg, orp: r.orp, drp: r.drp, apg: r.apg, spg: r.spg, bpg: r.bpg, topg: r.topg,
    tpg: Math.round((r.fg3m / r.gp) * 10) / 10,
    fgm: r.fgm, fga: r.fga, fg_pct: r.fg_pct,
    fg3m: r.fg3m, fg3a: r.fg3a, fg3_pct: r.fg3_pct,
    ftm: r.ftm, fta: r.fta, ft_pct: r.ft_pct,
    // 게스트 줄(guests)은 순위 모집단 밖 — players 에 있을 때만 자격
    eligible,
    fg_ok: eligible && meetsAttemptMin(r, 'fg_pct'),
    fg3_ok: eligible && meetsAttemptMin(r, 'fg3_pct'),
    ft_ok: eligible && meetsAttemptMin(r, 'ft_pct'),
  }
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
    const [playersRes, accountsRes, externalIds, allStats, quarterStats] = await Promise.all([
      sb.from('league_players')
        .select('id, name, position, photo_url, is_guest, is_active')
        .eq('team_id', teamId),
      sb.from('league_user_accounts')
        .select('league_player_id')
        .eq('team_id', teamId)
        .eq('status', 'approved'),
      fetchExternalPlayerIds(sb, leagueId),
      loadPeriodStats(leagueId, 'all'),
      q ? loadPeriodStats(leagueId, quarterPeriod(q)) : Promise.resolve(null),
    ])
    if (playersRes.error) throw new Error(playersRes.error.message)

    const minAll = leagueMinRounds(allStats.total_rounds ?? 0, allStats.players)
    const minQ = quarterStats ? leagueMinRounds(quarterStats.total_rounds ?? 0, quarterStats.players) : 0
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
        attendance: {
          all: att(allStats, p.id) ?? { gp: 0, rate: 0 },
          quarter: att(quarterStats, p.id),
        },
        line: { all: lineOf(allStats, p.id, minAll), quarter: lineOf(quarterStats, p.id, minQ) },
      })
    }

    const body: RosterCardsResponse = {
      quarter: q ? { id: q.id, label: q.label, total_rounds: quarterStats?.total_rounds ?? 0 } : null,
      all_total_rounds: allStats.total_rounds ?? 0,
      players,
    }
    return NextResponse.json(body)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
