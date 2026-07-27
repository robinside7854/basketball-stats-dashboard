// 인스타 위클리 매거진 카드 생성기용 주간 데이터 집계 (서버 전용).
// 기존 집계(computeLeagueStats)·팀 식별(loadIdentityResolver)·마일스톤(computeMilestones) 재사용.
// 주간 = [from, to] 날짜 범위. 리더 값은 그 기간의 '합계'(pts/reb/ast/stl/blk).
import { createClient } from '@/lib/supabase/admin'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeMilestones, type UpcomingEntry } from '@/lib/stats/milestones'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import type { PlayerStat } from '@/types/league'

export type SocialLeader = {
  id: string
  name: string
  photo_url: string | null
  value: number       // 대표 수치 (정렬 기준)
  sub?: string        // 보조 표기 (예: 수비 'S 5 · B 2')
}
export type SocialGame = {
  homeName: string; homeColor: string; homeScore: number
  awayName: string; awayColor: string; awayScore: number
}
export type SocialRound = { date: string; label: string; games: SocialGame[] }

export type WeeklyMagazineData = {
  from: string
  to: string
  leagueName: string
  scoreboard: SocialRound[]
  ptsTop: SocialLeader[]
  rebTop: SocialLeader[]
  astTop: SocialLeader[]
  defTop: SocialLeader[]          // 스틸+블록 합산 상위
  best: (SocialLeader & { line: { pts: number; reb: number; ast: number; stl: number; blk: number } }) | null
  milestones: UpcomingEntry[]
}

const fmtRound = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

const toLeader = (p: PlayerStat, value: number, sub?: string): SocialLeader => ({
  id: p.player_id, name: p.name, photo_url: p.photo_url ?? null, value, sub,
})

// value 내림차순 상위 n · 0 이하 제외
const topN = (players: PlayerStat[], pick: (p: PlayerStat) => number, n: number, subOf?: (p: PlayerStat) => string): SocialLeader[] =>
  players
    .map(p => ({ p, v: pick(p) }))
    .filter(x => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map(x => toLeader(x.p, x.v, subOf?.(x.p)))

export async function getWeeklyMagazineData(leagueId: string, from: string, to: string): Promise<WeeklyMagazineData> {
  const sb = createClient()

  const [{ data: league }, stats, resolver, milestones, { data: games }] = await Promise.all([
    sb.from('leagues').select('name').eq('id', leagueId).single(),
    computeLeagueStats(sb, leagueId, { from, to, unit: 'game' }),
    loadIdentityResolver(sb, leagueId),
    computeMilestones(sb, leagueId, { horizonDays: 40, maxUpcoming: 6, maxRecent: 0 }),
    sb.from('league_games')
      .select('date, home_team_id, away_team_id, home_score, away_score, quarter_id')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
      .eq('is_exhibition', false)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: false }),
  ])

  const players = stats.players ?? []

  // 스코어보드 — 날짜별 그룹
  const byDate = new Map<string, SocialGame[]>()
  for (const g of games ?? []) {
    const h = resolver(g.home_team_id as string | null, g.quarter_id as string | null)
    const a = resolver(g.away_team_id as string | null, g.quarter_id as string | null)
    if (!h || !a) continue
    const date = g.date as string
    if (!byDate.has(date)) byDate.set(date, [])
    byDate.get(date)!.push({
      homeName: h.display_name, homeColor: h.color, homeScore: (g.home_score as number) ?? 0,
      awayName: a.display_name, awayColor: a.color, awayScore: (g.away_score as number) ?? 0,
    })
  }
  const scoreboard: SocialRound[] = [...byDate.keys()]
    .sort((x, y) => y.localeCompare(x))
    .map(date => ({ date, label: fmtRound(date), games: byDate.get(date)! }))

  const ptsTop = topN(players, p => p.pts, 3)
  const rebTop = topN(players, p => p.reb, 3)
  const astTop = topN(players, p => p.ast, 3)
  const defTop = topN(players, p => p.stl + p.blk, 3, p => `가로채기 ${p.stl} · 블록 ${p.blk}`)

  const bestP = [...players].filter(p => p.pts > 0).sort((a, b) => b.pts - a.pts)[0]
  const best = bestP
    ? { ...toLeader(bestP, bestP.pts), line: { pts: bestP.pts, reb: bestP.reb, ast: bestP.ast, stl: bestP.stl, blk: bestP.blk } }
    : null

  return {
    from, to,
    leagueName: league?.name ?? '미라클모닝농구단',
    scoreboard,
    ptsTop, rebTop, astTop, defTop,
    best,
    milestones: milestones.upcoming ?? [],
  }
}
