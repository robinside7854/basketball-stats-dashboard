// 인스타 매거진 카드 생성기용 '라운드' 데이터 집계 (서버 전용).
// 라운드 = 특정 경기 날짜(date). 리더 값은 그 날의 합계.
// 기존 집계(computeLeagueStats)·팀 식별(loadIdentityResolver)·마일스톤(computeMilestones) 재사용.
import { createClient } from '@/lib/supabase/admin'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeMilestones, type UpcomingEntry } from '@/lib/stats/milestones'
import { loadIdentityResolver, makeIdentityResolver } from '@/lib/stats/teamIdentity'
import type { PlayerStat } from '@/types/league'

type Resolver = ReturnType<typeof makeIdentityResolver>
type GameRow = {
  home_team_id: string | null; away_team_id: string | null
  home_score: number | null; away_score: number | null
  quarter_id: string | null
}

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
  standings: RoundStanding[]         // 그 날(라운드) 결과 순위
  games: SocialGame[]
  ptsTop: SocialLeader[]
  rebTop: SocialLeader[]
  astTop: SocialLeader[]
  defTop: SocialLeader[]
  best: BestPlayer | null
  quarterLabel: string               // 예: '26.3Q' (라운드 소속 분기)
  quarterStandings: RoundStanding[]  // 해당 분기 · 그 날까지 누적 순위
  milestones: UpcomingEntry[]
}

const DOW = ['일', '월', '화', '수', '목', '금', '토']
function labelDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`
}
const pctOf = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 100) : 0)

// 경기행 집합 → 팀 순위(승률·마진·랭크) 집계
function buildStandings(rows: GameRow[], resolver: Resolver): RoundStanding[] {
  type Agg = { key: string; name: string; color: string; wins: number; losses: number; draws: number; ptsFor: number; ptsAgainst: number }
  const agg = new Map<string, Agg>()
  const ensure = (tid: string | null, qid: string | null): Agg | null => {
    const id = resolver(tid, qid); if (!id) return null
    let a = agg.get(id.key)
    if (!a) { a = { key: id.key, name: id.display_name, color: id.color, wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 }; agg.set(id.key, a) }
    return a
  }
  for (const g of rows) {
    const h = ensure(g.home_team_id, g.quarter_id)
    const a = ensure(g.away_team_id, g.quarter_id)
    if (!h || !a) continue
    const hs = g.home_score ?? 0, as_ = g.away_score ?? 0
    h.ptsFor += hs; h.ptsAgainst += as_; a.ptsFor += as_; a.ptsAgainst += hs
    if (hs > as_) { h.wins++; a.losses++ } else if (hs < as_) { a.wins++; h.losses++ } else { h.draws++; a.draws++ }
  }
  return [...agg.values()]
    .map(a => { const tot = a.wins + a.losses + a.draws; return { ...a, winRate: tot > 0 ? +((a.wins / tot) * 100).toFixed(1) : 0, margin: a.ptsFor - a.ptsAgainst } })
    .sort((x, y) => (y.winRate !== x.winRate ? y.winRate - x.winRate : y.margin - x.margin))
    .map((a, i) => ({ rank: i + 1, ...a }))
}

export async function getRoundMagazineData(leagueId: string, date: string): Promise<RoundMagazineData> {
  const sb = createClient()
  const [{ data: league }, stats, resolver, milestones, { data: games, error: gamesErr }] = await Promise.all([
    sb.from('leagues').select('name').eq('id', leagueId).single(),
    // unit 을 넘기지 않는다 — 라운드(R) 기준 하나로 통일(2026-08-10, 경기 슬롯 단위 삭제).
    // 이 매거진은 하루치이고 pts/reb/ast 같은 누적값만 쓴다(gp·ppg 미사용). 단위가 바뀌어도
    // 화면에 나오는 숫자는 그대로다.
    computeLeagueStats(sb, leagueId, { from: date, to: date }),
    loadIdentityResolver(sb, leagueId),
    computeMilestones(sb, leagueId, { horizonDays: 40, maxUpcoming: 6, maxRecent: 0 }),
    sb.from('league_games')
      .select('id, home_team_id, away_team_id, home_score, away_score, quarter_id')
      .eq('league_id', leagueId).eq('date', date)
      .eq('is_complete', true).eq('is_exhibition', false),
  ])
  // 이 라운드의 경기 목록 — 쿼리 실패를 빈 배열로 넘기면 "그 날 경기 없음"과 구분이 안 돼
  // 소셜 카드(순위/스코어보드)가 조용히 텅 빈 상태로 발행된다.
  if (gamesErr) throw new Error(`getRoundMagazineData: leagueId=${leagueId} date=${date} league_games 조회 실패 — ${gamesErr.message}`)

  const players = stats.players ?? []
  const gameRows = (games ?? []) as (GameRow & { id: string })[]
  const quarterId = gameRows[0]?.quarter_id ?? null

  // 라운드 순위 + 스코어보드
  const standings = buildStandings(gameRows, resolver)
  const teamPtsByKey = new Map(standings.map(s => [s.key, s.ptsFor]))
  const socialGames: SocialGame[] = []
  for (const g of gameRows) {
    const h = resolver(g.home_team_id, g.quarter_id), a = resolver(g.away_team_id, g.quarter_id)
    if (!h || !a) continue
    socialGames.push({ homeName: h.display_name, homeColor: h.color, homeScore: g.home_score ?? 0, awayName: a.display_name, awayColor: a.color, awayScore: g.away_score ?? 0 })
  }

  // 분기 누적 순위 (라운드 소속 분기 · 그 날까지) + 분기 라벨
  let quarterLabel = '시즌 누적'
  let quarterStandings: RoundStanding[] = []
  {
    let qGamesQuery = sb.from('league_games')
      .select('home_team_id, away_team_id, home_score, away_score, quarter_id')
      .eq('league_id', leagueId).lte('date', date)
      .eq('is_complete', true).eq('is_exhibition', false)
    if (quarterId) qGamesQuery = qGamesQuery.eq('quarter_id', quarterId)
    const [{ data: qMeta }, { data: qGames, error: qGamesErr }] = await Promise.all([
      quarterId ? sb.from('league_quarters').select('year, quarter').eq('id', quarterId).single() : Promise.resolve({ data: null }),
      qGamesQuery,
    ])
    // 분기 누적 순위 산출용 경기 목록 — 실패를 빈 배열로 넘기면 순위가 조용히 리셋된다.
    if (qGamesErr) throw new Error(`getRoundMagazineData: leagueId=${leagueId} quarterId=${quarterId} league_games(분기 누적) 조회 실패 — ${qGamesErr.message}`)
    if (qMeta) quarterLabel = `${String((qMeta as { year: number }).year).slice(2)}.${(qMeta as { quarter: number }).quarter}Q`
    quarterStandings = buildStandings((qGames ?? []) as GameRow[], resolver)
  }

  // 선수 → 소속 팀 (라운드 이벤트의 team_id 최빈값)
  const gameIds = gameRows.map(g => g.id)
  const playerTeamKey = new Map<string, string>()
  const playerTeamName = new Map<string, { name: string; color: string }>()
  if (gameIds.length) {
    const { data: evs, error: evsErr } = await sb.from('league_game_events').select('league_player_id, team_id').in('league_game_id', gameIds)
    // 실패를 조용히 넘기면 선수 소속팀을 못 찾아 리더 카드의 팀명/컬러가 전부 빈 값(회색)으로 나온다.
    if (evsErr) throw new Error(`getRoundMagazineData: leagueId=${leagueId} date=${date} league_game_events(팀 소속 판정) 조회 실패 — ${evsErr.message}`)
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

  const mvpScore = (p: PlayerStat) => p.pts * 1.5 + p.reb + p.ast * 1.5 + p.stl * 2 + p.blk * 2 + (p.and_one ?? 0) - p.tov
  const bestP = [...players].filter(p => p.pts + p.reb + p.ast + p.stl + p.blk > 0).sort((a, b) => mvpScore(b) - mvpScore(a))[0]
  const bt = bestP ? teamOf(bestP.player_id) : null
  const best: BestPlayer | null = bestP && bt ? {
    id: bestP.player_id, name: bestP.name, photo_url: bestP.photo_url ?? null, teamName: bt.name, teamColor: bt.color,
    line: { pts: bestP.pts, reb: bestP.reb, ast: bestP.ast, stl: bestP.stl, blk: bestP.blk },
  } : null

  return {
    date, dateLabel: labelDate(date), leagueName: league?.name ?? '미라클모닝농구단',
    standings, games: socialGames, ptsTop, rebTop, astTop, defTop, best,
    quarterLabel, quarterStandings, milestones: milestones.upcoming ?? [],
  }
}

// 발행 가능한 라운드 날짜 목록 (최신순) — 드롭다운용
export async function getRoundDates(leagueId: string, limit = 24): Promise<string[]> {
  const sb = createClient()
  const { data, error } = await sb.from('league_games').select('date')
    .eq('league_id', leagueId).eq('is_complete', true).eq('is_exhibition', false)
    .order('date', { ascending: false })
  // 쿼리 실패를 빈 배열로 넘기면 "발행할 라운드가 없음"과 구분이 안 돼 드롭다운이 조용히 빈다.
  if (error) throw new Error(`getRoundDates: leagueId=${leagueId} league_games 조회 실패 — ${error.message}`)
  const seen = new Set<string>(); const out: string[] = []
  for (const r of data ?? []) {
    const d = r.date as string
    if (!seen.has(d)) { seen.add(d); out.push(d) }
    if (out.length >= limit) break
  }
  return out
}
