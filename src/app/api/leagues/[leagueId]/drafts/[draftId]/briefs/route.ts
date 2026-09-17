// 드래프트 풀 선수의 "시즌 한 줄 소개" — 1라운드 드라마틱 공개 연출용.
//
// GET → { prev_quarter, season_label, rank_min_gp, briefs: { [league_player_id]: Brief } }
//
// 왜 별도 라우트인가: 포털(단장)은 X-Draft-Code 만 들고 있어 회원 전용인
// /api/leagues/[id]/stats 를 부르면 401 로 조용히 빈다. 연출이 스탯을 못 받으면
// "기록 없음"으로 보이므로, 드래프트 세션 범위로 한정한 읽기 전용 라우트를 둔다.
//
// 가드는 canViewLeague — 공개 리그면 관전자도 본다. 라이브 드래프트 화면은
// 애초에 공개 관전용이고, 같은 숫자가 관전 페이지의 선수 카드에 이미 노출된다.
//
// 2026-09-17: 집계 범위를 "직전 분기"에서 **리그 시즌 전체**로 넓혔다(리허설 피드백).
//   숫자는 computeLeagueStats(quarterId 없음) 를 그대로 쓴다 — 스탯 탭·홈 SSR 과 같은
//   함수라 같은 화면 안에서 다른 숫자가 나올 여지가 없다(세 번째 집계 구현을 만들지 않는다).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { getPreviousQuarterId } from '@/lib/leagueStats'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import type { PlayerStat } from '@/types/league'

/** 순위를 매길 지표 키 */
export type BriefRankKey = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fg_pct'

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
  stl: number
  blk: number
  fg_pct: number
  fg3_pct: number
  /** 리그 전체 순위(1-based, 동점은 경쟁 순위 1·1·3). 자격 미달(gp < rank_min_gp)이면 각 값 null */
  rank: Record<BriefRankKey, number | null>
  /** 순위 모집단 크기(자격을 채운 선수 수) */
  rank_total: number
}

/**
 * 순위 산정 최소 출전 경기 수.
 * 왜 3인가: 미라클은 한 분기에 8~12라운드를 치르고 1~2경기만 나온 선수가 늘 몇 명 있다.
 * 1경기 20점이 시즌 1위로 뜨면 연출의 "전체 n위"가 농담이 된다. 3경기면 그 잡음이 빠지면서
 * 정규 출전자는 거의 전원 남는다(2026 시즌 실측: 47명 중 자격자 다수).
 */
const RANK_MIN_GP = 3

const r1 = (n: number) => Math.round(n * 10) / 10

/** 값이 큰 쪽이 1위. 동점은 경쟁 순위(1,1,3). 반환: player_id → rank */
function competitionRank(rows: { id: string; v: number }[]): Record<string, number> {
  const sorted = [...rows].sort((a, b) => b.v - a.v)
  const out: Record<string, number> = {}
  let prevVal: number | null = null
  let prevRank = 0
  sorted.forEach((row, i) => {
    const rank = prevVal !== null && row.v === prevVal ? prevRank : i + 1
    out[row.id] = rank
    prevVal = row.v
    prevRank = rank
  })
  return out
}

const RANK_KEYS: BriefRankKey[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'fg_pct']
const EMPTY_RANK: Record<BriefRankKey, number | null> = {
  ppg: null, rpg: null, apg: null, spg: null, bpg: null, fg_pct: null,
}

function toBrief(
  base: { name: string; position: string | null; photo_url: string | null },
  prevTeamName: string | null,
  stat: PlayerStat | undefined,
  rank: Record<BriefRankKey, number | null>,
  rankTotal: number,
): DraftPlayerBrief {
  const gp = stat?.gp ?? 0
  if (!stat || gp <= 0) {
    return {
      ...base, prev_team_name: prevTeamName,
      gp: 0, ppg: 0, rpg: 0, apg: 0, spg: 0, bpg: 0, stl: 0, blk: 0, fg_pct: 0, fg3_pct: 0,
      rank: EMPTY_RANK, rank_total: rankTotal,
    }
  }
  return {
    ...base,
    prev_team_name: prevTeamName,
    gp,
    ppg: r1(stat.ppg),
    rpg: r1(stat.rpg),
    apg: r1(stat.apg),
    spg: r1(stat.spg),
    bpg: r1(stat.bpg),
    stl: stat.stl,
    blk: stat.blk,
    fg_pct: r1(stat.fg_pct),
    fg3_pct: r1(stat.fg3_pct),
    rank,
    rank_total: rankTotal,
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
  const [{ data: poolRaw }, { data: playersRaw }, season, { data: quartersRaw }] = await Promise.all([
    supabase.from('league_draft_pool').select('league_player_id').eq('draft_id', draftId),
    supabase.from('league_players').select('id, name, position, photo_url').eq('team_id', teamId),
    // quarterId 를 주지 않으면 = 리그 전체 시즌(모든 분기). 친선전 제외·is_started 필터는 함수 안에 있다.
    computeLeagueStats(supabase, leagueId, {}),
    supabase.from('league_quarters').select('year').eq('league_id', leagueId),
  ])
  const poolIds = new Set((poolRaw ?? []).map(p => p.league_player_id as string))
  const players = ((playersRaw ?? []) as { id: string; name: string; position: string | null; photo_url: string | null }[])
    .filter(p => poolIds.has(p.id))

  // ── 시즌 라벨 ──────────────────────────────────────────────────────────────
  const years = ((quartersRaw ?? []) as { year: number }[]).map(q => q.year).filter(Number.isFinite)
  const minYear = years.length ? Math.min(...years) : null
  const maxYear = years.length ? Math.max(...years) : null
  const seasonLabel = minYear === null
    ? '시즌'
    : minYear === maxYear ? `${maxYear} 시즌` : `${minYear}~${maxYear} 시즌`

  // ── 순위 ──────────────────────────────────────────────────────────────────
  // 모집단: 리그 전체 선수 중 gp ≥ RANK_MIN_GP. 드래프트 풀 안에서만 매기면
  //   "전체 n위"라는 문구와 실제 모집단이 어긋난다(팀장·이미 배정된 선수가 빠져 있다).
  const qualified = season.players.filter(p => p.gp >= RANK_MIN_GP)
  const rankTotal = qualified.length
  const rankByKey = Object.fromEntries(
    RANK_KEYS.map(k => [k, competitionRank(qualified.map(p => ({ id: p.player_id, v: p[k] })))]),
  ) as Record<BriefRankKey, Record<string, number>>
  const rankOf = (pid: string): Record<BriefRankKey, number | null> =>
    Object.fromEntries(RANK_KEYS.map(k => [k, rankByKey[k][pid] ?? null])) as Record<BriefRankKey, number | null>

  const statByPlayer = Object.fromEntries(season.players.map(p => [p.player_id, p])) as Record<string, PlayerStat>

  // ── 직전 분기 소속 팀명(라벨용) ────────────────────────────────────────────
  const prevQid = await getPreviousQuarterId(supabase, leagueId, quarterId)
  let prevTeamOf: Record<string, string | null> = {}
  let prevQuarter: { id: string; label: string } | null = null
  if (prevQid) {
    const [{ data: qRow }, { data: memberships }, { data: teamsRaw }, { data: overrides }] = await Promise.all([
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
    prevTeamOf = Object.fromEntries(
      ((memberships ?? []) as { league_player_id: string; team_id: string | null }[])
        .map(m => [m.league_player_id, m.team_id ? (teamName[m.team_id] ?? null) : null]),
    ) as Record<string, string | null>
    const q = qRow as { year: number; quarter: number } | null
    prevQuarter = { id: prevQid, label: q ? `${String(q.year).slice(2)}.${q.quarter}Q` : '지난 분기' }
  }

  const briefs: Record<string, DraftPlayerBrief> = {}
  for (const p of players) {
    briefs[p.id] = toBrief(
      { name: p.name, position: p.position, photo_url: p.photo_url },
      prevTeamOf[p.id] ?? null,
      statByPlayer[p.id],
      rankOf(p.id),
      rankTotal,
    )
  }

  return NextResponse.json({
    prev_quarter: prevQuarter,
    season_label: seasonLabel,
    rank_min_gp: RANK_MIN_GP,
    briefs,
  }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}
