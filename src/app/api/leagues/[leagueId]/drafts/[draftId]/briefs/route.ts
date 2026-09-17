// 드래프트 풀 선수의 "지난 분기 한 줄 소개" — 1라운드 드라마틱 공개 연출용.
//
// GET → { prev_quarter: { id, label } | null, briefs: { [league_player_id]: Brief } }
//
// 왜 별도 라우트인가: 포털(단장)은 X-Draft-Code 만 들고 있어 회원 전용인
// /api/leagues/[id]/stats 를 부르면 401 로 조용히 빈다. 연출이 스탯을 못 받으면
// "기록 없음"으로 보이므로, 드래프트 세션 범위로 한정한 읽기 전용 라우트를 둔다.
//
// 가드는 canViewLeague — 공개 리그면 관전자도 본다. 라이브 드래프트 화면은
// 애초에 공개 관전용이고, 같은 숫자가 관전 페이지의 선수 카드에 이미 노출된다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { aggregateQuarterStats, getPreviousQuarterId, type PlayerAgg } from '@/lib/leagueStats'

export interface DraftPlayerBrief {
  name: string
  position: string | null
  photo_url: string | null
  /** 지난 분기에 뛰던 팀 이름(그 분기 override 적용). 소속 기록이 없으면 null */
  prev_team_name: string | null
  gp: number
  ppg: number
  rpg: number
  apg: number
  spg: number
  bpg: number
  fg_pct: number
  fg3_pct: number
}

const r1 = (n: number) => Math.round(n * 10) / 10
const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 1000) / 10 : 0)

function toBrief(
  base: { name: string; position: string | null; photo_url: string | null },
  prevTeamName: string | null,
  agg: PlayerAgg | undefined,
): DraftPlayerBrief {
  const gp = agg?.gp ?? 0
  if (!agg || gp <= 0) {
    return {
      ...base, prev_team_name: prevTeamName,
      gp: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, fg_pct: 0, fg3_pct: 0,
    }
  }
  return {
    ...base,
    prev_team_name: prevTeamName,
    gp,
    ppg: r1(agg.pts / gp),
    rpg: r1(agg.reb / gp),
    apg: r1(agg.ast / gp),
    spg: r1(agg.stl / gp),
    bpg: r1(agg.blk / gp),
    fg_pct: pct(agg.fgm, agg.fga),
    fg3_pct: pct(agg.fg3m, agg.fg3a),
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const quarterId = (draft as { quarter_id: string }).quarter_id

  const teamId = await resolveTeamId(leagueId)
  const [{ data: poolRaw }, { data: playersRaw }] = await Promise.all([
    supabase.from('league_draft_pool').select('league_player_id').eq('draft_id', draftId),
    supabase.from('league_players').select('id, name, position, photo_url').eq('team_id', teamId),
  ])
  const poolIds = new Set((poolRaw ?? []).map(p => p.league_player_id as string))
  const players = ((playersRaw ?? []) as { id: string; name: string; position: string | null; photo_url: string | null }[])
    .filter(p => poolIds.has(p.id))

  const prevQid = await getPreviousQuarterId(supabase, leagueId, quarterId)
  if (!prevQid) {
    const briefs: Record<string, DraftPlayerBrief> = {}
    for (const p of players) {
      briefs[p.id] = toBrief({ name: p.name, position: p.position, photo_url: p.photo_url }, null, undefined)
    }
    return NextResponse.json({ prev_quarter: null, briefs }, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  }

  const [agg, { data: qRow }, { data: memberships }, { data: teamsRaw }, { data: overrides }] = await Promise.all([
    aggregateQuarterStats(supabase, leagueId, prevQid),
    supabase.from('league_quarters').select('year, quarter').eq('id', prevQid).maybeSingle(),
    supabase.from('league_player_quarters').select('league_player_id, team_id').eq('quarter_id', prevQid),
    supabase.from('league_teams').select('id, name').eq('league_id', leagueId),
    supabase.from('league_team_quarter_overrides').select('team_id, name').eq('league_id', leagueId).eq('quarter_id', prevQid),
  ])

  // 팀명은 (team_id, quarter_id) 로만 정해진다 — league_teams 이름을 그대로 쓰면 지난 분기 명패가 어긋난다.
  const overrideName = Object.fromEntries(
    ((overrides ?? []) as { team_id: string; name: string | null }[]).map(o => [o.team_id, o.name]),
  ) as Record<string, string | null>
  const teamName = Object.fromEntries(
    ((teamsRaw ?? []) as { id: string; name: string }[]).map(t => [t.id, overrideName[t.id] ?? t.name]),
  ) as Record<string, string>
  const prevTeamOf = Object.fromEntries(
    ((memberships ?? []) as { league_player_id: string; team_id: string | null }[])
      .map(m => [m.league_player_id, m.team_id ? (teamName[m.team_id] ?? null) : null]),
  ) as Record<string, string | null>

  const briefs: Record<string, DraftPlayerBrief> = {}
  for (const p of players) {
    briefs[p.id] = toBrief(
      { name: p.name, position: p.position, photo_url: p.photo_url },
      prevTeamOf[p.id] ?? null,
      agg[p.id],
    )
  }

  const q = qRow as { year: number; quarter: number } | null
  return NextResponse.json({
    prev_quarter: { id: prevQid, label: q ? `${String(q.year).slice(2)}.${q.quarter}Q` : '지난 분기' },
    briefs,
  }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
