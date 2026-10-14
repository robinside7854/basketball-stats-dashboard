import { createClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/supabase/paged'
import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { fetchScoringRules } from '@/lib/stats/scoring'
import { computePlayerHeadToHead, type H2HEvent, type H2HGame } from '@/lib/stats/playerHeadToHead'

/**
 * GET /api/leagues/[leagueId]/players/head-to-head?a=<playerId>&b=<playerId>
 *
 * 선수 vs 선수 맞대결 (2026-10-14) — 두 선수가 **상대편으로** 만난 경기의 전적과 그 경기들의 하루 평균,
 * 그리고 같은 팀으로 뛴 경기의 전적. 판정 규칙은 `lib/stats/playerHeadToHead.ts` 머리 주석.
 * - 마감(is_complete) + 정규전만(친선 제외 원칙).
 * - 선수는 팀 소유(087) — league_players 는 team_id 로 찾는다.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const a = sp.get('a') ?? ''
  const b = sp.get('b') ?? ''
  if (!UUID.test(a) || !UUID.test(b) || a === b) {
    return NextResponse.json({ error: 'a, b 에 서로 다른 선수 id 가 필요합니다' }, { status: 400 })
  }
  const supabase = createClient()
  const teamId = await resolveTeamId(leagueId)

  try {
    const [{ data: players, error: pErr }, { data: games, error: gErr }, rules] = await Promise.all([
      supabase.from('league_players').select('id, plus_one').eq('team_id', teamId).in('id', [a, b]),
      supabase
        .from('league_games')
        .select('id, date, slot_num, quarter_id, home_team_id, away_team_id, home_score, away_score, plus_one_player_id, plus_one_extra_ids, plus_one_quarters')
        .eq('league_id', leagueId)
        .eq('is_complete', true)
        .eq('is_exhibition', false)
        .not('home_team_id', 'is', null)
        .not('away_team_id', 'is', null),
      fetchScoringRules(supabase, leagueId),
    ])
    if (pErr) throw new Error(pErr.message)
    if (gErr) throw new Error(gErr.message)
    if ((players ?? []).length < 2) return NextResponse.json({ error: 'player_not_found' }, { status: 404 })

    const [events, gpRows, { data: memberships, error: mErr }] = await Promise.all([
      // 두 선수의 본인 이벤트 + 두 선수에게 어시스트가 붙은 이벤트. 다른 묶음(대회) 경기는 아래에서 경기 목록으로 걸러진다.
      fetchAllPaged<H2HEvent>((from, to) => supabase
        .from('league_game_events')
        .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, quarter')
        .or(`league_player_id.in.(${a},${b}),related_player_id.in.(${a},${b})`)
        .order('id', { ascending: true })
        .range(from, to)),
      fetchAllPaged<{ league_game_id: string; league_player_id: string; team_id: string }>((from, to) => supabase
        .from('league_game_players')
        .select('league_game_id, league_player_id, team_id')
        .eq('league_id', leagueId)
        .in('league_player_id', [a, b])
        .order('id', { ascending: true })
        .range(from, to)),
      supabase.from('league_player_quarters').select('league_player_id, quarter_id, team_id').eq('league_id', leagueId).in('league_player_id', [a, b]),
    ])
    if (mErr) throw new Error(mErr.message)

    const assignedTeam = new Map<string, string>()
    for (const r of gpRows) if (r.team_id) assignedTeam.set(`${r.league_game_id}:${r.league_player_id}`, r.team_id)
    const quarterTeam = new Map<string, string>()
    for (const m of memberships ?? []) if (m.quarter_id && m.team_id) quarterTeam.set(`${m.quarter_id}:${m.league_player_id}`, m.team_id as string)

    const result = computePlayerHeadToHead({
      a, b,
      games: (games ?? []) as H2HGame[],
      events,
      assignedTeam,
      quarterTeam,
      plusOneSet: new Set((players ?? []).filter(p => p.plus_one).map(p => p.id as string)),
      rules,
    })
    return NextResponse.json({ a, b, ...result })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
