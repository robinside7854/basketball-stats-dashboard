import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { HighlightPlayer, HighlightTeam } from '@/components/league/HighlightBanner'
import { loadIdentityResolver, makeIdentityResolver } from '@/lib/stats/teamIdentity'

// 홈 페이지 공통 — teams/overrides 를 한 번만 로드해 3개 계산 함수(highlights/rounds/standings)에
// 재사용하기 위한 Promise 타입. 각 함수는 내부에서 await 로 값 참조.
type IdentityResolverPromise = Promise<ReturnType<typeof makeIdentityResolver>>
import StreakSpotlight from '@/components/league/StreakSpotlight'
import MilestoneFeed from '@/components/league/MilestoneFeed'
import { type NbaHeroData } from '@/components/league/nba/NbaHero'
import NbaHeroCarousel, { type WeeklyPOTW, type POTWTopCategory } from '@/components/league/nba/NbaHeroCarousel'
import NbaLeaders from '@/components/league/nba/NbaLeaders'
import NbaRoundsSummary, { type RoundSummary, type RoundTeamSummary } from '@/components/league/nba/NbaRoundsSummary'
import NbaTeamStandings, { type StandingRow } from '@/components/league/nba/NbaTeamStandings'
import type { League } from '@/types/league'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']

// 최근 N일 하이라이트 3종 계산:
//   1) topTeam: 이 주 최고 승률 프랜차이즈 (팀명 + 승/패/승률)
//   2) scoringKing: 이 주 누적 득점 최다 선수 (평득 아닌 누적 PTS)
//   3) hotHand: 이 주 3P% 최고 (최소 5회 시도)
async function computeHighlights(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  resolverPromise: IdentityResolverPromise,
  daysAgo: number = 7,
): Promise<{ topTeam: HighlightTeam | null; scoringKing: HighlightPlayer | null; hotHand: HighlightPlayer | null; rangeLabel: string }> {
  const today = new Date()
  const from = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  const fromIso = from.toISOString().slice(0, 10)
  const toIso = today.toISOString().slice(0, 10)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  const rangeLabel = `${fmt(from)} ~ ${fmt(today)}`

  // 최근 N일 is_started 게임만 (마감 안 된 경기 포함) — 팀 W/L 계산 위해 quarter_id/score/is_exhibition 도 가져옴
  const { data: games } = await supabase
    .from('league_games')
    .select('id, date, plus_one_player_id, home_team_id, away_team_id, home_score, away_score, is_exhibition, is_complete, quarter_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .gte('date', fromIso)
    .lte('date', toIso)
  const gameIds = (games ?? []).map(g => g.id)
  if (gameIds.length === 0) return { topTeam: null, scoringKing: null, hotHand: null, rangeLabel }
  const gamePlusOneMap: Record<string, string | null> = Object.fromEntries(
    (games ?? []).map(g => [g.id as string, (g.plus_one_player_id as string | null) ?? null])
  )
  // 라운드(=날짜) 단위 집계용 — 미라클모닝은 하루에 여러 게임 진행되므로
  // 게임 단위 gp 는 라운드당 득점을 왜곡시킴. 실제 임팩트는 "그 날 총 몇 점" 이 자연스러움.
  const gameDateMap: Record<string, string> = Object.fromEntries(
    (games ?? []).map(g => [g.id as string, (g.date as string) ?? g.id as string])
  )

  // 팀 정체성 resolver — 홈 페이지 상단에서 미리 로드된 Promise 를 await (재조회 없음)
  const identityResolver = await resolverPromise

  // 프랜차이즈 W/L 집계 (완료 경기, 친선 제외)
  type TeamAgg = { key: string; name: string; color: string; W: number; L: number; D: number }
  const teamAgg = new Map<string, TeamAgg>()
  const ensureTeam = (team_id: string | null, quarter_id: string | null): TeamAgg | null => {
    const id = identityResolver(team_id, quarter_id)
    if (!id) return null
    let a = teamAgg.get(id.key)
    if (!a) {
      a = { key: id.key, name: id.display_name, color: id.color, W: 0, L: 0, D: 0 }
      teamAgg.set(id.key, a)
    }
    return a
  }
  for (const g of (games ?? [])) {
    if (!g.is_complete || g.is_exhibition) continue
    const h = ensureTeam(g.home_team_id as string | null, g.quarter_id as string | null)
    const a = ensureTeam(g.away_team_id as string | null, g.quarter_id as string | null)
    if (!h || !a) continue
    const hs = (g.home_score as number) ?? 0
    const as_ = (g.away_score as number) ?? 0
    if (hs > as_) { h.W++; a.L++ }
    else if (hs < as_) { a.W++; h.L++ }
    else { h.D++; a.D++ }
  }
  // 이 주 최고 승률팀 — 승률 desc → W desc → 최소 1경기 이상
  const teamsList = [...teamAgg.values()]
    .filter(t => (t.W + t.L + t.D) > 0)
    .map(t => ({ ...t, rate: (t.W + t.L + t.D) > 0 ? t.W / (t.W + t.L + t.D) : 0 }))
    .sort((a, b) => b.rate - a.rate || b.W - a.W)
  const topTeam: HighlightTeam | null = teamsList[0]
    ? { name: teamsList[0].name, color: teamsList[0].color, wins: teamsList[0].W, losses: teamsList[0].L, draws: teamsList[0].D, rate: +(teamsList[0].rate * 100).toFixed(1) }
    : null

  // 선수 플러스원 + 메타
  const { data: players } = await supabase
    .from('league_players')
    .select('id, name, number, plus_one')
    .eq('league_id', leagueId)
  const plusOneSet = new Set((players ?? []).filter(p => p.plus_one).map(p => p.id))
  const meta = Object.fromEntries((players ?? []).map(p => [p.id, p]))

  // 이벤트 페이지네이션
  type EvRow = { league_player_id: string | null; type: string; result: string | null; league_game_id: string }
  const events: EvRow[] = []
  const PAGE = 1000
  let pg = 0
  while (true) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_player_id, type, result, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (chunk?.length) events.push(...(chunk as EvRow[]))
    if (!chunk || chunk.length < PAGE) break
    pg++
  }

  // 집계 — 라운드(=날짜) 기반 gp 로 임팩트 계산
  type Agg = { pts: number; fg3m: number; fg3a: number; gp: Set<string>; rd: Set<string>; byRound: Record<string, number> }
  const agg: Record<string, Agg> = {}
  const ensure = (pid: string): Agg => {
    if (!agg[pid]) agg[pid] = { pts: 0, fg3m: 0, fg3a: 0, gp: new Set(), rd: new Set(), byRound: {} }
    return agg[pid]
  }
  for (const e of events) {
    if (!e.league_player_id) continue
    const pid = e.league_player_id
    const s = ensure(pid)
    const rdKey = gameDateMap[e.league_game_id] ?? e.league_game_id
    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      s.gp.add(e.league_game_id)
      s.rd.add(rdKey)
    }
    const made = e.result === 'made'
    const gpo = gamePlusOneMap[e.league_game_id]
    const isP1 = gpo !== null ? pid === gpo : plusOneSet.has(pid)
    let ptsGain = 0
    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; if (made) { s.fg3m++; ptsGain = isP1 ? 4 : 3 }; break
      case 'shot_2p_mid': case 'shot_layup': case 'shot_post': case 'shot_2p_drive':
        if (made) ptsGain = isP1 ? 3 : 2; break
      case 'ft_2pt': case 'ft_3pt_1': if (made) ptsGain = 2; break
      case 'free_throw': case 'ft_3pt_2': case 'and_one': if (made) ptsGain = 1; break
    }
    if (ptsGain > 0) {
      s.pts += ptsGain
      s.byRound[rdKey] = (s.byRound[rdKey] ?? 0) + ptsGain
    }
  }

  // 평탄화 — 라운드(=날짜) 단위 임팩트 지표 rd/ppr 포함
  const list = Object.entries(agg)
    .map(([pid, s]) => {
      // 라운드별 시리즈 (오래된 순 → 최신)
      const roundSeries = Object.entries(s.byRound)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, pts]) => ({ date, pts }))
      return {
        player_id: pid,
        name: (meta[pid]?.name as string) ?? '알 수 없음',
        number: (meta[pid]?.number as number | null) ?? null,
        pts: s.pts,
        gp: s.gp.size,
        rd: s.rd.size,
        ppg: s.gp.size > 0 ? +(s.pts / s.gp.size).toFixed(1) : 0,
        ppr: s.rd.size > 0 ? +(s.pts / s.rd.size).toFixed(1) : 0,
        roundSeries,
        fg3m: s.fg3m,
        fg3a: s.fg3a,
        fg3_pct: s.fg3a > 0 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : 0,
      }
    })
    .filter(p => p.gp > 0)
  void SHOT_TYPES  // unused-vars 회피

  // 이 주 득점왕: 누적 PTS 최다 (평득 아님)
  const scoringKing = list.slice().sort((a, b) => b.pts - a.pts)[0] ?? null
  // Hot Hand: 3P% 최고 (최소 5회 시도)
  const hotHand = list.filter(p => p.fg3a >= 5).sort((a, b) => b.fg3_pct - a.fg3_pct)[0] ?? null

  return { topTeam, scoringKing, hotHand, rangeLabel }
}

// 최근 4주 라운드 요약 — NbaRoundsSummary 용.
// 미라클모닝은 하루 = 1라운드 (여러 경기 진행). 각 라운드마다 팀별 W-L-득실차 요약.
async function computeRecentRounds(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  resolverPromise: IdentityResolverPromise,
  weeks: number = 4,
): Promise<RoundSummary[]> {
  const from = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  // 게임 조회와 resolver await 를 병렬로
  const [{ data: games }, resolver] = await Promise.all([
    supabase
      .from('league_games')
      .select('id, date, home_team_id, away_team_id, home_score, away_score, is_complete, is_exhibition, quarter_id')
      .eq('league_id', leagueId)
      .eq('is_exhibition', false)
      .eq('is_complete', true)
      .gte('date', from)
      .lte('date', today)
      .order('date', { ascending: false }),
    resolverPromise,
  ])

  // 라운드(=date) 별로 grouping — 최신순 유지
  const byDate = new Map<string, typeof games>()
  for (const g of games ?? []) {
    const d = g.date as string
    if (!byDate.has(d)) byDate.set(d, [])
    byDate.get(d)!.push(g)
  }
  const dates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)).slice(0, weeks)

  const fmtWeek = (iso: string): string => {
    const d = new Date(iso + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  }

  const rounds: RoundSummary[] = []
  for (const date of dates) {
    const roundGames = byDate.get(date) ?? []
    const teamAgg = new Map<string, RoundTeamSummary>()
    const ensureTeam = (team_id: string | null, quarter_id: string | null) => {
      const id = resolver(team_id, quarter_id)
      if (!id) return null
      let t = teamAgg.get(id.key)
      if (!t) {
        t = { key: id.key, name: id.display_name, color: id.color, wins: 0, losses: 0, draws: 0, ptsFor: 0, ptsAgainst: 0 }
        teamAgg.set(id.key, t)
      }
      return t
    }
    for (const g of roundGames ?? []) {
      const h = ensureTeam(g.home_team_id as string | null, g.quarter_id as string | null)
      const a = ensureTeam(g.away_team_id as string | null, g.quarter_id as string | null)
      if (!h || !a) continue
      const hs = (g.home_score as number) ?? 0
      const as_ = (g.away_score as number) ?? 0
      h.ptsFor += hs; h.ptsAgainst += as_
      a.ptsFor += as_; a.ptsAgainst += hs
      if (hs > as_) { h.wins++; a.losses++ }
      else if (hs < as_) { a.wins++; h.losses++ }
      else { h.draws++; a.draws++ }
    }
    const teams = [...teamAgg.values()]
      .filter(t => t.wins + t.losses + t.draws > 0)
      .sort((a, b) => {
        const ar = a.wins / (a.wins + a.losses + a.draws)
        const br = b.wins / (b.wins + b.losses + b.draws)
        if (br !== ar) return br - ar
        return (b.ptsFor - b.ptsAgainst) - (a.ptsFor - a.ptsAgainst)
      })
    rounds.push({
      date,
      weekLabel: fmtWeek(date),
      gamesCount: (roundGames ?? []).length,
      teams,
    })
  }
  return rounds
}

// 최근 4주 라운드별 Player of the Week — NbaHeroCarousel 용.
//
// 가중치 종합 점수 방식 (총 100점):
//   - 득점 볼륨 (라운드 총 pts)                  · 25
//   - 득점 효율 (TS%)                            · 15
//   - 리바운드 (총 REB)                          · 10
//   - 스틸 · 블락 · 어시스트 각 10               · 30
//   - 승리 기여 (승리 게임 참여 + 승리팀 pts 비중) · 20
//
// 각 지표를 라운드 내 최대값 대비 정규화(0~1) 후 가중 합산 → composite score.
// 최고 점수 선수 선정 + 우세 카테고리 · 스토리 헤드라인 자동 생성.

const POTW_WEIGHTS = {
  volume: 25,
  efficiency: 15,
  reb: 10,
  stl: 10,
  blk: 10,
  ast: 10,
  win: 20,
} as const

type PlayerRoundStats = {
  pts: number
  fga: number     // 필드골 시도
  fta: number     // 자유투 시도
  reb: number
  oreb: number
  dreb: number
  stl: number
  blk: number
  ast: number
  tov: number
  gp: Set<string>       // 참여 게임 IDs
  wins: number          // 승리한 게임 참여 수
  losses: number        // 패배한 게임 참여 수
  ptsInWins: number     // 승리 게임 내 개인 pts (승리 기여용)
  teamPtsInWins: number // 승리 게임 내 그 선수 팀 총 pts
}

function emptyRoundStats(): PlayerRoundStats {
  return {
    pts: 0, fga: 0, fta: 0, reb: 0, oreb: 0, dreb: 0,
    stl: 0, blk: 0, ast: 0, tov: 0,
    gp: new Set(), wins: 0, losses: 0, ptsInWins: 0, teamPtsInWins: 0,
  }
}

// True Shooting Percentage
function tsPct(pts: number, fga: number, fta: number): number {
  const denom = 2 * (fga + 0.44 * fta)
  return denom > 0 ? (pts / denom) * 100 : 0
}

// 헤드라인 생성 (규칙 기반, 뉴스 톤)
function makeHeadline(
  name: string,
  s: PlayerRoundStats,
  topCategory: POTWTopCategory,
  teamWon: boolean,
): string {
  const ts = tsPct(s.pts, s.fga, s.fta)
  switch (topCategory) {
    case 'volume':
      return teamWon
        ? `${name}, ${s.pts}점 폭발로 팀 승리 견인`
        : `${name}, 홀로 ${s.pts}점 몰아친 라운드 지배`
    case 'efficiency':
      return `${name}, TS ${ts.toFixed(0)}% 초효율 · ${s.pts}점 정조준`
    case 'reb':
      return `${name}, 리바운드 ${s.reb}개로 페인트존 장악`
    case 'stl':
      return `${name}, 스틸 ${s.stl}개 · 상대 공격 완전 잠금`
    case 'blk':
      return `${name}, 블락 ${s.blk}개로 림 프로텍터 등극`
    case 'ast':
      return `${name}, 어시스트 ${s.ast}개 · 팀 공격 리드`
    case 'win':
      return `${name}, ${s.wins}승 견인 · 승리의 아이콘`
    default:
      return `${name}, 이번 라운드 최고 임팩트`
  }
}

async function computeWeeklyPOTW(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  weeks: number = 4,
): Promise<WeeklyPOTW[]> {
  const from = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  // 1) 완료된 게임 (친선 제외) + 스코어 · 팀 정보
  const { data: games } = await supabase
    .from('league_games')
    .select('id, date, plus_one_player_id, home_team_id, away_team_id, home_score, away_score')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)
    .gte('date', from)
    .lte('date', today)
  if (!games || games.length === 0) return []

  // 2) 라운드(=date) 유니크 · 최신순 · 최근 N개
  const uniqueDates = [...new Set(games.map(g => g.date as string))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, weeks)
  const dateSet = new Set(uniqueDates)
  const filteredGames = games.filter(g => dateSet.has(g.date as string))
  const gameIds = filteredGames.map(g => g.id as string)
  const gameDateMap: Record<string, string> = Object.fromEntries(
    filteredGames.map(g => [g.id as string, g.date as string])
  )
  const gamePlusOneMap: Record<string, string | null> = Object.fromEntries(
    filteredGames.map(g => [g.id as string, (g.plus_one_player_id as string | null) ?? null])
  )
  // 게임별 승패 판정 (팀 기준)
  type GameResult = {
    homeTeamId: string | null; awayTeamId: string | null
    homeScore: number; awayScore: number
    homeWon: boolean; awayWon: boolean
  }
  const gameResultMap: Record<string, GameResult> = {}
  for (const g of filteredGames) {
    const hs = (g.home_score as number) ?? 0
    const as = (g.away_score as number) ?? 0
    gameResultMap[g.id as string] = {
      homeTeamId: g.home_team_id as string | null,
      awayTeamId: g.away_team_id as string | null,
      homeScore: hs, awayScore: as,
      homeWon: hs > as, awayWon: as > hs,
    }
  }

  // 3) 선수 플러스원 플래그
  const { data: playersRaw } = await supabase
    .from('league_players')
    .select('id, plus_one')
    .eq('league_id', leagueId)
  const plusOneSet = new Set((playersRaw ?? []).filter(p => p.plus_one).map(p => p.id))

  // 4) 이벤트 페이지네이션 — team_id 필드도 함께 (승리 기여 판정용)
  type EvRow = { league_player_id: string | null; type: string; result: string | null; league_game_id: string; team_id: string | null }
  const events: EvRow[] = []
  const PAGE = 1000
  let pg = 0
  while (true) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_player_id, type, result, league_game_id, team_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (chunk?.length) events.push(...(chunk as EvRow[]))
    if (!chunk || chunk.length < PAGE) break
    pg++
  }

  // 5) 라운드 × 선수 종합 스탯 집계 + 게임별 선수의 team_id 추적
  const byRound = new Map<string, Map<string, PlayerRoundStats>>()
  const playerTeamPerGame = new Map<string, Map<string, string>>() // pid → gameId → team_id
  for (const e of events) {
    if (!e.league_player_id) continue
    const date = gameDateMap[e.league_game_id]
    if (!date) continue
    const pid = e.league_player_id

    if (!byRound.has(date)) byRound.set(date, new Map())
    const map = byRound.get(date)!
    if (!map.has(pid)) map.set(pid, emptyRoundStats())
    const s = map.get(pid)!

    if (e.type !== 'sub_in' && e.type !== 'sub_out') {
      s.gp.add(e.league_game_id)
    }

    // team_id 추적 (선수-게임별 소속팀)
    if (e.team_id && e.type !== 'sub_in' && e.type !== 'sub_out') {
      if (!playerTeamPerGame.has(pid)) playerTeamPerGame.set(pid, new Map())
      const m = playerTeamPerGame.get(pid)!
      if (!m.has(e.league_game_id)) m.set(e.league_game_id, e.team_id)
    }

    const made = e.result === 'made'
    const gpo = gamePlusOneMap[e.league_game_id]
    const isP1 = gpo !== null ? pid === gpo : plusOneSet.has(pid)

    switch (e.type) {
      case 'shot_3p':
        s.fga++
        if (made) s.pts += isP1 ? 4 : 3
        break
      case 'shot_2p_mid': case 'shot_layup': case 'shot_post': case 'shot_2p_drive':
        s.fga++
        if (made) s.pts += isP1 ? 3 : 2
        break
      case 'ft_2pt': case 'ft_3pt_1':
        s.fta++
        if (made) s.pts += 2
        break
      case 'free_throw': case 'ft_3pt_2':
        s.fta++
        if (made) s.pts += 1
        break
      case 'and_one':
        if (made) s.pts += 1
        break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
    }
    // 어시스트 = 슛 성공 이벤트의 related_player 참조인데, related 필드 조회 안 함
    // → 어시스트 이벤트 타입 별도 있을 경우만 카운트 (없으면 0)
    // 실제 데이터에 assist 이벤트 있는지 확인 필요. 우선은 pts 이벤트의 related 로 보정 불가.
    // NOTE: 팀 통계 API 는 related_player_id 로 어시스트 계산. 여기선 v1 스킵.
  }

  // 6) 각 라운드에서 각 선수의 승리 기여 계산
  for (const [, map] of byRound) {
    for (const [pid, s] of map) {
      const teamPerGame = playerTeamPerGame.get(pid) ?? new Map()
      for (const gid of s.gp) {
        const teamId = teamPerGame.get(gid)
        const gr = gameResultMap[gid]
        if (!gr || !teamId) continue
        const isHome = teamId === gr.homeTeamId
        const isAway = teamId === gr.awayTeamId
        const teamScore = isHome ? gr.homeScore : (isAway ? gr.awayScore : 0)
        const won = isHome ? gr.homeWon : (isAway ? gr.awayWon : false)
        if (won) {
          s.wins++
          s.ptsInWins += s.pts / s.gp.size  // 근사: 이 게임 참여분 = 총 pts / gp
          s.teamPtsInWins += teamScore
        } else {
          s.losses++
        }
      }
    }
  }

  // 7) 각 라운드별 종합 점수 계산 → top1 선정
  type TopPick = {
    pid: string; stats: PlayerRoundStats
    ts_pct: number
    compositeScore: number
    topCategory: POTWTopCategory
  }
  const topPerRound = new Map<string, TopPick>()

  for (const [date, map] of byRound) {
    const roster: Array<{ pid: string; s: PlayerRoundStats; ts: number }> = []
    for (const [pid, s] of map) {
      if (s.gp.size === 0) continue
      const ts = tsPct(s.pts, s.fga, s.fta)
      roster.push({ pid, s, ts })
    }
    if (roster.length === 0) continue

    // 라운드 내 각 카테고리 max
    const maxPts = Math.max(...roster.map(r => r.s.pts), 1)
    const maxTs = Math.max(...roster.filter(r => (r.s.fga + r.s.fta) >= 5).map(r => r.ts), 1)  // 최소 시도 필터
    const maxReb = Math.max(...roster.map(r => r.s.reb), 1)
    const maxStl = Math.max(...roster.map(r => r.s.stl), 1)
    const maxBlk = Math.max(...roster.map(r => r.s.blk), 1)
    const maxAst = Math.max(...roster.map(r => r.s.ast), 1)  // v1: 대부분 0
    const maxWinScore = Math.max(
      ...roster.map(r => {
        const games = r.s.gp.size
        const winRate = games > 0 ? r.s.wins / games : 0
        const contrib = r.s.teamPtsInWins > 0 ? r.s.ptsInWins / r.s.teamPtsInWins : 0
        return winRate * (1 + contrib)  // 승률 + 기여도 boost
      }),
      1,
    )

    // 각 선수 종합 점수
    const scored = roster.map(r => {
      const s = r.s
      const games = s.gp.size
      const winRate = games > 0 ? s.wins / games : 0
      const contrib = s.teamPtsInWins > 0 ? s.ptsInWins / s.teamPtsInWins : 0
      const winScoreRaw = winRate * (1 + contrib)

      const norm = {
        volume: s.pts / maxPts,
        efficiency: (s.fga + s.fta) >= 5 ? r.ts / maxTs : 0,
        reb: s.reb / maxReb,
        stl: s.stl / maxStl,
        blk: s.blk / maxBlk,
        ast: s.ast / maxAst,
        win: winScoreRaw / maxWinScore,
      }

      // 가중 합 (총 100)
      const composite =
        norm.volume     * POTW_WEIGHTS.volume +
        norm.efficiency * POTW_WEIGHTS.efficiency +
        norm.reb        * POTW_WEIGHTS.reb +
        norm.stl        * POTW_WEIGHTS.stl +
        norm.blk        * POTW_WEIGHTS.blk +
        norm.ast        * POTW_WEIGHTS.ast +
        norm.win        * POTW_WEIGHTS.win

      // 우세 카테고리 판정 (가중 × 정규화 값 최고)
      const weighted: Array<[POTWTopCategory, number]> = [
        ['volume',     norm.volume     * POTW_WEIGHTS.volume],
        ['efficiency', norm.efficiency * POTW_WEIGHTS.efficiency],
        ['reb',        norm.reb        * POTW_WEIGHTS.reb],
        ['stl',        norm.stl        * POTW_WEIGHTS.stl],
        ['blk',        norm.blk        * POTW_WEIGHTS.blk],
        ['ast',        norm.ast        * POTW_WEIGHTS.ast],
        ['win',        norm.win        * POTW_WEIGHTS.win],
      ]
      weighted.sort((a, b) => b[1] - a[1])
      const topCategory: POTWTopCategory = weighted[0][0]

      return { pid: r.pid, s, ts: r.ts, composite, topCategory }
    })

    const top = scored.sort((a, b) => b.composite - a.composite)[0]
    if (top && top.composite > 0) {
      topPerRound.set(date, {
        pid: top.pid,
        stats: top.s,
        ts_pct: top.ts,
        compositeScore: +top.composite.toFixed(1),
        topCategory: top.topCategory,
      })
    }
  }

  // 8) top1 선수들의 meta + photo_url 일괄 조회
  const topPids = [...topPerRound.values()].map(t => t.pid)
  if (topPids.length === 0) return []

  const { data: playersMeta } = await supabase
    .from('league_players')
    .select('id, name, number, photo_url')
    .in('id', topPids)
    .eq('league_id', leagueId)
  const metaMap = new Map<string, { name: string; number: number | null; photo_url: string | null }>()
  for (const p of playersMeta ?? []) {
    metaMap.set(p.id as string, {
      name: p.name as string,
      number: (p.number as number | null) ?? null,
      photo_url: (p.photo_url as string | null) ?? null,
    })
  }

  // 8) 각 POTW 선수의 "최근 N주 라운드 흐름 시리즈" 계산
  // → 사용자가 요청한 "RD=1 무의미, 흐름을 보여줘" 대응.
  // byRound 를 활용해 각 선수(pid)별로 그 선수가 참여한 모든 라운드 pts 를 시리즈로.
  // 오래된 → 최신 순 (sparkline 자연스러움)
  const seriesByPid = new Map<string, Array<{ date: string; pts: number }>>()
  for (const date of uniqueDates) {
    const map = byRound.get(date)
    if (!map) continue
    for (const [pid, s] of map) {
      if (!seriesByPid.has(pid)) seriesByPid.set(pid, [])
      seriesByPid.get(pid)!.push({ date, pts: s.pts })
    }
  }
  // 시리즈를 오래된 → 최신 정렬 (sparkline 축)
  for (const [, arr] of seriesByPid) arr.sort((a, b) => a.date.localeCompare(b.date))

  // 9) 결과 배열 (최신 라운드 → 오래된 순)
  const fmtWeek = (iso: string): string => {
    const d = new Date(iso + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  }
  const result: WeeklyPOTW[] = []
  for (const date of uniqueDates) {
    const top = topPerRound.get(date)
    if (!top) continue
    const meta = metaMap.get(top.pid)
    if (!meta) continue
    const s = top.stats
    const series = seriesByPid.get(top.pid) ?? [{ date, pts: s.pts }]
    const teamWon = s.wins > s.losses
    const headline = makeHeadline(meta.name, s, top.topCategory, teamWon)

    result.push({
      date,
      label: fmtWeek(date),
      potw: {
        playerId: top.pid,
        name: meta.name,
        number: meta.number,
        pts: s.pts,
        gp: s.gp.size,
        rd: series.length,
        ppr: series.length > 0 ? +(series.reduce((sum, e) => sum + e.pts, 0) / series.length).toFixed(1) : s.pts,
        photoUrl: meta.photo_url,
        roundSeries: series,
      },
      breakdown: {
        pts: s.pts,
        ts_pct: +top.ts_pct.toFixed(1),
        reb: s.reb,
        stl: s.stl,
        blk: s.blk,
        ast: s.ast,
        wins: s.wins,
        losses: s.losses,
        compositeScore: top.compositeScore,
        topCategory: top.topCategory,
        headline,
      },
    })
  }
  return result
}

// 현재 분기 팀 승률 요약 — NbaTeamStandings 용.
// 기본: is_current=true 분기 대상. 현재 분기 없으면 시즌 전체.
async function computeCurrentQuarterStandings(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  resolverPromise: IdentityResolverPromise,
): Promise<{ standings: StandingRow[]; quarterLabel: string; gamesCount: number }> {
  // 분기 조회와 resolver await 병렬
  const [{ data: quarters }, resolver] = await Promise.all([
    supabase
      .from('league_quarters')
      .select('id, year, quarter, is_current')
      .eq('league_id', leagueId)
      .order('year', { ascending: false })
      .order('quarter', { ascending: false }),
    resolverPromise,
  ])

  const currentQ = (quarters ?? []).find(q => q.is_current) ?? (quarters ?? [])[0]
  let quarterLabel = '시즌 전체'
  let gameQuery = supabase
    .from('league_games')
    .select('id, home_team_id, away_team_id, home_score, away_score, quarter_id')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)

  if (currentQ) {
    quarterLabel = `${String(currentQ.year).slice(2)}.${currentQ.quarter}Q`
    gameQuery = gameQuery.eq('quarter_id', currentQ.id)
  }

  const { data: games } = await gameQuery
  if (!games || games.length === 0) {
    return { standings: [], quarterLabel, gamesCount: 0 }
  }

  const teamAgg = new Map<string, StandingRow>()
  const ensureTeam = (team_id: string | null, quarter_id: string | null) => {
    const id = resolver(team_id, quarter_id)
    if (!id) return null
    let t = teamAgg.get(id.key)
    if (!t) {
      t = {
        key: id.key,
        name: id.display_name,
        color: id.color,
        wins: 0, losses: 0, draws: 0,
        ptsFor: 0, ptsAgainst: 0,
        winRate: 0,
      }
      teamAgg.set(id.key, t)
    }
    return t
  }

  for (const g of games) {
    const h = ensureTeam(g.home_team_id as string | null, g.quarter_id as string | null)
    const a = ensureTeam(g.away_team_id as string | null, g.quarter_id as string | null)
    if (!h || !a) continue
    const hs = (g.home_score as number) ?? 0
    const as_ = (g.away_score as number) ?? 0
    h.ptsFor += hs; h.ptsAgainst += as_
    a.ptsFor += as_; a.ptsAgainst += hs
    if (hs > as_) { h.wins++; a.losses++ }
    else if (hs < as_) { a.wins++; h.losses++ }
    else { h.draws++; a.draws++ }
  }

  const standings = [...teamAgg.values()]
    .filter(t => t.wins + t.losses + t.draws > 0)
    .map(t => {
      const total = t.wins + t.losses + t.draws
      return { ...t, winRate: total > 0 ? +((t.wins / total) * 100).toFixed(1) : 0 }
    })
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate
      return (b.ptsFor - b.ptsAgainst) - (a.ptsFor - a.ptsAgainst)
    })

  return { standings, quarterLabel, gamesCount: games.length }
}

// scoringKing (이 주의 득점왕) → NbaHero 데이터 매핑
// 라운드(=날짜) 기반 지표 rd/ppr/roundSeries 전달. photo_url 은 별도 조회.
async function toNbaHero(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  scoringKing: HighlightPlayer | null,
  rangeLabel: string,
): Promise<{ data: NbaHeroData; rangeLabel: string }> {
  if (!scoringKing) return { data: null, rangeLabel }
  const { data: p } = await supabase
    .from('league_players')
    .select('photo_url')
    .eq('id', scoringKing.player_id)
    .eq('league_id', leagueId)
    .maybeSingle()
  return {
    data: {
      playerId: scoringKing.player_id,
      name: scoringKing.name,
      number: scoringKing.number ?? null,
      pts: scoringKing.pts,
      gp: scoringKing.gp,
      rd: scoringKing.rd ?? scoringKing.gp,
      ppr: scoringKing.ppr ?? scoringKing.ppg,
      photoUrl: (p?.photo_url as string | null) ?? null,
      roundSeries: scoringKing.roundSeries,
    },
    rangeLabel,
  }
}

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const supabase = createClient()

  // MVP-1: teams/overrides 를 한 번만 로드해 3개 계산 함수에 재사용
  // (기존 3회 중복 조회 → 1회로 축소)
  const resolverPromise: IdentityResolverPromise = loadIdentityResolver(supabase, leagueId)

  const [{ data: league }, { data: allLeagues }, weeklyPOTW, recentRounds, quarterStandings] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single(),
    supabase.from('leagues').select('id, name, status, season_year').eq('org_slug', orgSlug).order('created_at', { ascending: false }),
    computeWeeklyPOTW(supabase, leagueId, 4),                        // 최근 4주 라운드별 POTW (슬라이드)
    computeRecentRounds(supabase, leagueId, resolverPromise, 4),
    computeCurrentQuarterStandings(supabase, leagueId, resolverPromise),
  ])

  if (!league) notFound()

  const l = league as League

  const statusColor: Record<string, string> = {
    upcoming: 'bg-yellow-900/40 text-yellow-400',
    active: 'bg-green-900/40 text-green-400',
    completed: 'bg-gray-800 text-gray-500',
  }
  const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }

  const otherLeagues = (allLeagues ?? []).filter(ol => ol.id !== leagueId)

  return (
    <div className="space-y-5 lg:space-y-4">
      {/* 헤더 — 코트 미세 텍스처 배경 + 저지 폰트 */}
      <div className="relative court-bg rounded-2xl px-5 py-4 lg:px-6 lg:py-5 -mx-2 sm:mx-0 border border-gray-800/40">
        <div className="flex items-center justify-between">
          <h1 className="font-jersey text-3xl lg:text-5xl font-bold text-white tracking-wide uppercase whitespace-nowrap">{l.name}</h1>
          <span className={`text-xs lg:text-sm px-2.5 py-1 rounded-full font-medium ${statusColor[l.status] ?? 'bg-gray-800 text-gray-400'}`}>
            {statusLabel[l.status] ?? l.status}
          </span>
        </div>
        <p className="text-gray-500 text-sm lg:text-base mt-1">{l.season_year}시즌 · {l.season_type === 'quarterly' ? '분기별(3개월)' : '연간(1년)'} · 시작일 {l.start_date}</p>
      </div>

      {/* 시즌 전환 */}
      {otherLeagues.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {otherLeagues.map(ol => (
            <Link
              key={ol.id}
              href={`/league/${orgSlug}/${ol.id}`}
              className="text-sm px-4 py-2 rounded-full border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer btn-press"
            >
              {ol.name} ({ol.season_year})
            </Link>
          ))}
        </div>
      )}

      {/* 미라클모닝 브랜드 홈 — POTW Carousel + 팀 승률 + 최근 라운드 + 리그 리더 */}
      <div className="rounded-none overflow-hidden">
        <NbaHeroCarousel entries={weeklyPOTW} leagueId={leagueId} />
        <NbaTeamStandings
          standings={quarterStandings.standings}
          quarterLabel={quarterStandings.quarterLabel}
          gamesCount={quarterStandings.gamesCount}
        />
        <NbaRoundsSummary rounds={recentRounds} leagueId={leagueId} />
        <NbaLeaders leagueId={leagueId} />
      </div>

      {/* 스토리텔링 — 진행 중 연속 기록 + 커리어 마일스톤 (유지) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <StreakSpotlight leagueId={leagueId} maxEntries={8} />
        <MilestoneFeed leagueId={leagueId} />
      </div>
    </div>
  )
}
