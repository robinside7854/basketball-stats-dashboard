import { createClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/supabase/paged'
import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { gameDateRange } from '@/lib/league/currentQuarter'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { assistPairOf, fieldShotOf, pickGameSideTeam, assistTeamOf } from '@/lib/stats/gameInsights'

/**
 * GET /api/leagues/[leagueId]/team-insights?quarterId=<id|all>
 *
 * 팀 탭 「시즌 어시스트 · 공격 유형」 (2026-10-12 리뉴얼 3단계) — 날짜별 박스스코어의 「어시스트」·
 * 「공격 유형」 탭을 분기·시즌 단위로 쌓은 것.
 *
 * - 마감(is_complete) + 정규전만. 친선전은 집계 제외 원칙 그대로.
 * - 분기는 기간이 있으면 **날짜로** 고른다(`gameDateRange`) — 경기의 quarter_id 는 뒤늦게 채워지고
 *   새 분기 행을 만들기 전에 기록한 경기는 옛 분기로 박힌다. 팀 정체성·분기 소속 판정도 같은 이유로
 *   날짜가 속한 분기를 쓴다(기간이 없을 때만 경기의 quarter_id).
 * - 팀은 `(team_id, quarter_id)` 정체성(teamIdentity.ts)으로 묶는다 — 3분기 굿모닝과 1분기 락다운은
 *   같은 team_id 라도 다른 팀이다.
 * - 판정(어시스트 · 야투 유형 · 이 경기의 어느 팀)은 daily-boxscore 와 같은 `lib/stats/gameInsights.ts`.
 *   점수는 싣지 않는다(+1 가산 때문에 "성공 × 2/3" 이 실제 득점과 어긋난다 — 하루 화면과 같은 이유).
 *
 * 응답: { teams[], players[], assist_links[{ team_key, from, to, count }], shot_types[{ team_key, player_id, type, fga, fgm }] }
 *   팀 판정이 안 된 기록(옛 기록 · 정체성 없음)은 팀 단위 화면에 놓을 자리가 없으므로 뺀다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const quarterId = new URL(req.url).searchParams.get('quarterId')
  const supabase = createClient()

  const { data: quarterRows } = await supabase
    .from('league_quarters')
    .select('id, year, quarter, start_date, end_date, kind')
    .eq('league_id', leagueId)
  type QRow = { id: string; year: number; quarter: number; start_date: string | null; end_date: string | null; kind: string | null }
  const quarters = ((quarterRows ?? []) as QRow[]).filter(q => q.kind !== 'tournament')
  const selected = quarterId && quarterId !== 'all' ? (quarterRows ?? []).find(q => q.id === quarterId) as QRow | undefined : undefined
  if (quarterId && quarterId !== 'all' && !selected) return NextResponse.json({ error: 'quarter not found' }, { status: 404 })
  const range = selected ? gameDateRange({ ...selected, label: '' }) : null

  let gq = supabase
    .from('league_games')
    .select('id, date, home_team_id, away_team_id, quarter_id')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)
    .not('home_team_id', 'is', null)
    .not('away_team_id', 'is', null)
  if (selected) gq = range ? gq.gte('date', range.from).lte('date', range.to) : gq.eq('quarter_id', selected.id)

  const [{ data: games, error: gErr }, resolver, teamId] = await Promise.all([
    gq,
    loadIdentityResolver(supabase, leagueId),
    resolveTeamId(leagueId),
  ])
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
  const empty = { teams: [], players: [], assist_links: [], shot_types: [] }
  if (!games || games.length === 0) return NextResponse.json(empty)

  type Game = { id: string; date: string; home_team_id: string; away_team_id: string; quarter_id: string | null }
  // 이 경기가 속한 분기 — 특정 분기를 골랐으면 그 분기, 「전체」면 날짜가 든 분기(없으면 경기의 quarter_id)
  const quarterOf = (g: Game): string | null => {
    if (selected) return selected.id
    return quarters.find(q => q.start_date && q.end_date && q.start_date <= g.date && g.date <= q.end_date)?.id
      ?? g.quarter_id
  }

  const gameIds = games.map(g => g.id as string)
  type Ev = { league_game_id: string; league_player_id: string; related_player_id: string | null; team_id: string | null; type: string; result: string | null }
  let events: Ev[]
  let gpRows: { league_game_id: string; league_player_id: string; team_id: string }[]
  try {
    ;[events, gpRows] = await Promise.all([
      // ⚠ 시즌 전체면 1,000행을 넘는다 — 끝까지 읽는다(정렬 필수)
      fetchAllPaged<Ev>((from, to) => supabase
        .from('league_game_events')
        .select('league_game_id, league_player_id, related_player_id, team_id, type, result')
        .in('league_game_id', gameIds)
        .not('league_player_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)),
      fetchAllPaged<{ league_game_id: string; league_player_id: string; team_id: string }>((from, to) => supabase
        .from('league_game_players').select('league_game_id, league_player_id, team_id')
        .in('league_game_id', gameIds).order('id', { ascending: true }).range(from, to)),
    ])
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }

  const [{ data: players }, { data: memberships }] = await Promise.all([
    // 선수는 팀 소유(087) — league_id 로 찾으면 대회 묶음에서 0명이 나온다
    supabase.from('league_players').select('id, name, photo_url').eq('team_id', teamId),
    supabase.from('league_player_quarters').select('league_player_id, quarter_id, team_id').eq('league_id', leagueId),
  ])

  const gpTeam = new Map<string, string>()
  for (const r of gpRows) gpTeam.set(`${r.league_game_id}:${r.league_player_id}`, r.team_id)
  const qTeam = new Map<string, string>()
  for (const m of memberships ?? []) if (m.quarter_id) qTeam.set(`${m.quarter_id}:${m.league_player_id}`, m.team_id as string)
  // 기록에 남은 팀 — (경기, 선수)의 첫 값. daily-boxscore 의 eventTeamMap 과 같다.
  const evTeam = new Map<string, string>()
  for (const e of events) {
    if (!e.team_id) continue
    const k = `${e.league_game_id}:${e.league_player_id}`
    if (!evTeam.has(k)) evTeam.set(k, e.team_id)
  }

  const gameById = new Map((games as Game[]).map(g => [g.id, g]))
  type Ident = { key: string; team_id: string; name: string; color: string }
  const identities = new Map<string, Ident>()
  // (경기, 선수) → 정체성. 같은 경기 안에서는 선수 한 명의 팀이 하나다(박스스코어 행과 같은 단위).
  const identCache = new Map<string, Ident | null>()
  const identityOf = (g: Game, pid: string): Ident | null => {
    const ck = `${g.id}:${pid}`
    if (identCache.has(ck)) return identCache.get(ck)!
    const qid = quarterOf(g)
    const tid = pickGameSideTeam([
      gpTeam.get(ck),                              // 이 경기 한정 배정
      evTeam.get(ck),                              // 기록에 남은 팀
      qid ? qTeam.get(`${qid}:${pid}`) : null,     // 분기 소속 (정규전 폴백)
    ], g.home_team_id, g.away_team_id)
    const r = tid ? resolver(tid, qid) : null
    let out: Ident | null = null
    if (r) {
      out = identities.get(r.key) ?? { key: r.key, team_id: r.team_id, name: r.display_name, color: r.color }
      identities.set(r.key, out)
    }
    identCache.set(ck, out)
    return out
  }

  const linkMap = new Map<string, { team_key: string; from: string; to: string; count: number }>()
  const shotMap = new Map<string, { team_key: string; player_id: string; type: string; fga: number; fgm: number }>()
  const usedPlayers = new Set<string>()

  for (const e of events) {
    const g = gameById.get(e.league_game_id)
    if (!g) continue

    const pair = assistPairOf(e)
    if (pair) {
      const t = assistTeamOf(
        { team_id: identityOf(g, pair.to)?.key ?? null },
        { team_id: identityOf(g, pair.from)?.key ?? null },
      )
      const key = t?.team_id
      if (key) {
        const lk = `${key}|${pair.from}|${pair.to}`
        const cur = linkMap.get(lk)
        if (cur) cur.count++
        else linkMap.set(lk, { team_key: key, from: pair.from, to: pair.to, count: 1 })
        usedPlayers.add(pair.from); usedPlayers.add(pair.to)
      }
    }

    const shot = fieldShotOf(e)
    if (shot) {
      const key = identityOf(g, e.league_player_id)?.key
      if (key) {
        const sk = `${key}|${e.league_player_id}|${shot.type}`
        let row = shotMap.get(sk)
        if (!row) { row = { team_key: key, player_id: e.league_player_id, type: shot.type, fga: 0, fgm: 0 }; shotMap.set(sk, row) }
        row.fga++
        if (shot.made) row.fgm++
        usedPlayers.add(e.league_player_id)
      }
    }
  }

  const playerOut = (players ?? [])
    .filter(p => usedPlayers.has(p.id as string))
    .map(p => ({ id: p.id as string, name: p.name as string, photo_url: (p.photo_url as string | null) ?? null }))

  return NextResponse.json({
    teams: [...identities.values()],
    players: playerOut,
    assist_links: [...linkMap.values()].sort((a, b) => b.count - a.count),
    shot_types: [...shotMap.values()],
  })
}
