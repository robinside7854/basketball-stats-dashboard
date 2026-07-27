// 인스타 매거진 카드 생성기용 '라운드' 데이터 집계 (서버 전용).
// 라운드 = 특정 경기 날짜(date). 리더 값은 그 날의 합계.
// 기존 집계(computeLeagueStats)·팀 식별(loadIdentityResolver)·마일스톤(computeMilestones) 재사용.
import { createClient } from '@/lib/supabase/admin'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeMilestones, type UpcomingEntry } from '@/lib/stats/milestones'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import type { PlayerStat } from '@/types/league'

export type RoundStanding = {
  rank: number; key: string; name: string; color: string
  wins: number; losses: number; draws: number; winRate: number
  ptsFor: number; ptsAgainst: number; margin: number
}
export type SocialGame = {
  homeName: string; homeColor: string; homeScore: number
  awayName: string; awayColor: string; awayScore: number
}
export type LeaderDetail = { label: string; value: string }
export type SocialLeader = {
  id: string; name: string; photo_url: string | null
  value: number
  teamName: string; teamColor: string
  details: LeaderDetail[]
}
export type BestPlayer = {
  id: string; name: string; photo_url: string | null
  teamName: string; teamColor: string
  line: { pts: number; reb: number; ast: number; stl: number; blk: number }
}
export type RoundMagazineData = {
  date: string
  dateLabel: string
  leagueName: string
  standings: RoundStanding[]
  games: SocialGame[]
  ptsTop: SocialLeader[]
  rebTop: SocialLeader[]
  astTop: SocialLeader[]
  defTop: SocialLeader[]
  best: BestPlayer | null
  milestones: UpcomingEntry[]
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
function labelDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`
}
const pctOf = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 100) : 0)

export async function getRoundMagazineData(leagueId: string, date: string): Promise<RoundMagazineData> {
  const sb = createClient()
  const [{ data: league }, stats, resolver, milestones, { data: games }] = await Promise.all([
    sb.from('leagues').select('name').eq('id', leagueId).single(),
    computeLeagueStats(sb, leagueId, { from: date, to: date, unit: 'game' }),
    loadIdentityResolver(sb, leagueId),
    computeMilestones(sb, leagueId, { horizonDays: 40, maxUpcoming: 6, maxRecent: 0 }),
    sb.from('league_games')
      .select('id, home_team_id, away_team_id, home_score, away_score, quarter_id')
      .eq('league_id', leagueId).eq('date', date)
      .eq('is_complete', true).eq('is_exhibition', false),
  ])

  const players = stats.players ?? []
  const gameRows = games ?? []
  const quarterId = (gameRows[0]?.quarter_id as string | null) ?? null

  // 팀 순위(라운드) + 스코어보드 집계
  type Agg = { key: string; name: string; color: string; wins: number; losses: number; draws: number; ptsFor: number; ptsAgainst: number }
  const agg = new Map<string, Agg>()
  const ensure = (tid: string | null, qid: string | null): Agg | null => {
    const id = resolver(tid, qid); if (!id) return null
    let a = agg.get(id.key)
    if (!a) { a = { key: id.key, name: id.display_name, color: id.color, wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 }; agg.set(id.key, a) }
    return a
  }
  const socialGames: SocialGame[] = []
  for (const g of gameRows) {
    const h = ensure(g.home_team_id as string | null, g.quarter_id as string | null)
    const a = ensure(g.away_team_id as string | null, g.quarter_id as string | null)
    if (!h || !a) continue
    const hs = (g.home_score as number) ?? 0, as_ = (g.away_score as number) ?? 0
    h.ptsFor += hs; h.ptsAgainst += as_; a.ptsFor += as_; a.ptsAgainst += hs
    if (hs > as_) { h.wins++; a.losses++ } else if (hs < as_) { a.wins++; h.losses++ } else { h.draws++; a.draws++ }
    socialGames.push({ homeName: h.name, homeColor: h.color, homeScore: hs, awayName: a.name, awayColor: a.color, awayScore: as_ })
  }
  const standings: RoundStanding[] = [...agg.values()]
    .map(a => { const tot = a.wins + a.losses + a.draws; return { ...a, winRate: tot > 0 ? +((a.wins / tot) * 100).toFixed(1) : 0, margin: a.ptsFor - a.ptsAgainst } })
    .sort((x, y) => (y.winRate !== x.winRate ? y.winRate - x.winRate : y.margin - x.margin))
    .map((a, i) => ({ rank: i + 1, ...a }))
  const teamPtsByKey = new Map(standings.map(s => [s.key, s.ptsFor]))

  // 선수 → 소속 팀 (라운드 이벤트의 team_id 최빈값)
  const gameIds = gameRows.map(g => g.id as string)
  const playerTeamKey = new Map<string, string>()
  const playerTeamName = new Map<string, { name: string; color: string }>()
  if (gameIds.length) {
    const { data: evs } = await sb.from('league_game_events').select('league_player_id, team_id').in('league_game_id', gameIds)
    const counts = new Map<string, Map<string, number>>()
    for (const e of evs ?? []) {
      const pid = e.league_player_id as string | null, tid = e.team_id as string | null
      if (!pid || !tid) continue
      if (!counts.has(pid)) counts.set(pid, new Map())
      const m = counts.get(pid)!; m.set(tid, (m.get(tid) ?? 0) + 1)
    }
    for (const [pid, m] of counts) {
      const tid = [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      const id = tid ? resolver(tid, quarterId) : null
      if (id) { playerTeamKey.set(pid, id.key); playerTeamName.set(pid, { name: id.display_name, color: id.color }) }
    }
  }
  const teamOf = (pid: string) => playerTeamName.get(pid) ?? { name: '', color: '#9CA3AF' }

  const mk = (p: PlayerStat, value: number, details: LeaderDetail[]): SocialLeader => {
    const t = teamOf(p.player_id)
    return { id: p.player_id, name: p.name, photo_url: p.photo_url ?? null, value, teamName: t.name, teamColor: t.color, details }
  }
  const top = (pick: (p: PlayerStat) => number, details: (p: PlayerStat) => LeaderDetail[]): SocialLeader[] =>
    players.map(p => ({ p, v: pick(p) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 3).map(x => mk(x.p, x.v, details(x.p)))

  const scoringShare = (p: PlayerStat): string => {
    const key = playerTeamKey.get(p.player_id); const tp = key ? (teamPtsByKey.get(key) ?? 0) : 0
    return tp > 0 ? `${Math.round((p.pts / tp) * 100)}%` : '—'
  }
  const ptsTop = top(p => p.pts, p => [
    { label: '야투율', value: `${pctOf(p.fgm, p.fga)}%` },
    { label: '3점', value: `${pctOf(p.fg3m, p.fg3a)}%` },
    { label: '팀 득점 비중', value: scoringShare(p) },
  ])
  const rebTop = top(p => p.reb, p => [
    { label: '공격 리바', value: String(p.oreb) },
    { label: '수비 리바', value: String(p.dreb) },
  ])
  const astTop = top(p => p.ast, p => [
    { label: '턴오버', value: String(p.tov) },
    { label: 'A/T', value: p.tov > 0 ? (p.ast / p.tov).toFixed(1) : (p.ast > 0 ? '∞' : '0') },
  ])
  const defTop = top(p => p.stl + p.blk, p => [
    { label: '스틸', value: String(p.stl) },
    { label: '블록', value: String(p.blk) },
  ])

  // 이번 라운드 BEST — 종합 지표 자동 선정 (득점 가중 + 올어라운드)
  const mvpScore = (p: PlayerStat) => p.pts * 1.5 + p.reb + p.ast * 1.5 + p.stl * 2 + p.blk * 2 + (p.and_one ?? 0) - p.tov
  const bestP = [...players].filter(p => p.pts + p.reb + p.ast + p.stl + p.blk > 0).sort((a, b) => mvpScore(b) - mvpScore(a))[0]
  const bt = bestP ? teamOf(bestP.player_id) : null
  const best: BestPlayer | null = bestP && bt ? {
    id: bestP.player_id, name: bestP.name, photo_url: bestP.photo_url ?? null, teamName: bt.name, teamColor: bt.color,
    line: { pts: bestP.pts, reb: bestP.reb, ast: bestP.ast, stl: bestP.stl, blk: bestP.blk },
  } : null

  return {
    date, dateLabel: labelDate(date), leagueName: league?.name ?? '미라클모닝농구단',
    standings, games: socialGames, ptsTop, rebTop, astTop, defTop, best, milestones: milestones.upcoming ?? [],
  }
}

// 발행 가능한 라운드 날짜 목록 (최신순) — 드롭다운/필터칩용
export async function getRoundDates(leagueId: string, limit = 24): Promise<string[]> {
  const sb = createClient()
  const { data } = await sb.from('league_games').select('date')
    .eq('league_id', leagueId).eq('is_complete', true).eq('is_exhibition', false)
    .order('date', { ascending: false })
  const seen = new Set<string>(); const out: string[] = []
  for (const r of data ?? []) {
    const d = r.date as string
    if (!seen.has(d)) { seen.add(d); out.push(d) }
    if (out.length >= limit) break
  }
  return out
}
