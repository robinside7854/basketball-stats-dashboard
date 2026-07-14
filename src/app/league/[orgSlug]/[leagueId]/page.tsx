import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { loadIdentityResolver, makeIdentityResolver } from '@/lib/stats/teamIdentity'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeStreaks } from '@/lib/stats/streaks'
import { computeMilestones } from '@/lib/stats/milestones'

// 홈 페이지 공통 — teams/overrides 를 한 번만 로드해 3개 계산 함수(highlights/rounds/standings)에
// 재사용하기 위한 Promise 타입. 각 함수는 내부에서 await 로 값 참조.
type IdentityResolverPromise = Promise<ReturnType<typeof makeIdentityResolver>>
import StreakSpotlight from '@/components/league/StreakSpotlight'
import MilestoneFeed from '@/components/league/MilestoneFeed'
import LeagueTourTrigger from '@/components/league/LeagueTourTrigger'
import HighlightsHome, { type HighlightsHomePayload } from '@/components/league/HighlightsHome'
import { loadRecentRounds, loadRoundDetail } from '@/lib/highlights/loader'
import { type NbaHeroData } from '@/components/league/nba/NbaHero'
import NbaHeroCarousel, { type WeeklyPOTW, type POTWTopCategory, type SecondaryCategory } from '@/components/league/nba/NbaHeroCarousel'
import NbaLeaders from '@/components/league/nba/NbaLeaders'
import NbaRoundsSummary, { type RoundSummary, type RoundTeamSummary } from '@/components/league/nba/NbaRoundsSummary'
import NbaTeamStandings, { type StandingRow } from '@/components/league/nba/NbaTeamStandings'
import type { League } from '@/types/league'

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
//   - 클러치 (마지막 2분 + 3점차 이내 pts)        · 20
//
// 사용자 지적:
//   "clutch leader 선정 기준은? 한 팀에서 뛰었다면 n승 견인은 모두가 마찬가지"
// → 기존 승리 기여 (winRate + team pts share) 는 팀원 전원 동일 승수가 되므로 무의미.
//   실제 접전 상황(clutch)의 개인 득점으로 재정의:
//     · 클러치 window: video_timestamp 기준 game_end - 120s ~ game_end (마지막 2분)
//     · 접전 조건: |running_home - running_away| ≤ 3 (원 포제션)
//   이벤트를 게임별로 시간순 walk 하며 running score 유지 → 클러치 시점에 획득한 pts 만 별도 집계.
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
  clutch: 20,
} as const

// 클러치 판정 파라미터 — clutchStats.ts 와 동일 (통일된 정의)
const CLUTCH_TIME_WINDOW_SECONDS = 120  // 마지막 2분
const CLUTCH_MARGIN_MAX = 3              // 3점 이내
const SCORING_EVENTS_SET = new Set([
  'shot_3p', 'shot_post', 'shot_layup', 'shot_2p_mid',
  'and_one', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw',
])

type PlayerRoundStats = {
  pts: number
  fga: number     // 필드골 시도
  fta: number     // 자유투 시도
  fg3m: number    // 3점 성공 (NEW · 3점 폭격 서브 지표용)
  fg3a: number    // 3점 시도 (NEW)
  reb: number
  oreb: number
  dreb: number
  stl: number
  blk: number
  ast: number
  tov: number
  gp: Set<string>       // 참여 게임 IDs
  clutchPts: number     // 클러치 상황(마지막 2분 + 3점차 이내)에서 획득한 pts
  clutchGp: Set<string> // 클러치 상황을 경험한 게임 IDs (표본 트래킹)
}

function emptyRoundStats(): PlayerRoundStats {
  return {
    pts: 0, fga: 0, fta: 0, fg3m: 0, fg3a: 0,
    reb: 0, oreb: 0, dreb: 0,
    stl: 0, blk: 0, ast: 0, tov: 0,
    gp: new Set(), clutchPts: 0, clutchGp: new Set(),
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
): string {
  const ts = tsPct(s.pts, s.fga, s.fta)
  switch (topCategory) {
    case 'volume':
      return `${name}, ${s.pts}점 폭발로 라운드 지배`
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
    case 'clutch':
      return `${name}, 접전 승부처 클러치 ${s.clutchPts}점 · 마지막 2분에 강했다`
    default:
      return `${name}, 이번 라운드 최고 임팩트`
  }
}

// 2번째 우세 지표 서브 라벨 — "이번 라운드 32점 · 3점 8/12" 처럼 함께 노출용.
// 우세 지표(topCategory) 와 별개로 그 라운드 그 선수의 "게임 지배 방법" 을 한 줄 요약.
function buildSecondaryLabel(s: PlayerRoundStats, category: SecondaryCategory): string {
  switch (category) {
    case 'three':      return `3점 ${s.fg3m}/${s.fg3a}`
    case 'reb':        return `리바운드 ${s.reb}개`
    case 'stl':        return `스틸 ${s.stl}개`
    case 'blk':        return `블락 ${s.blk}개`
    case 'ast':        return `어시스트 ${s.ast}개`
    case 'efficiency': return `TS ${tsPct(s.pts, s.fga, s.fta).toFixed(0)}%`
    case 'clutch':     return `클러치 ${s.clutchPts}점`
    case 'volume':     return `${s.pts}점`
    default:           return ''
  }
}

async function computeWeeklyPOTW(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  weeks: number = 4,
): Promise<WeeklyPOTW[]> {
  const from = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  // 1) 완료된 게임 (친선 제외) + 홈/어웨이 팀 (클러치 스코어 walk 용)
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
  // 게임별 홈/어웨이 팀 (클러치 walk 시 running score 배정용)
  type GameTeams = { homeTeamId: string | null; awayTeamId: string | null }
  const gameTeamsMap: Record<string, GameTeams> = {}
  for (const g of filteredGames) {
    gameTeamsMap[g.id as string] = {
      homeTeamId: g.home_team_id as string | null,
      awayTeamId: g.away_team_id as string | null,
    }
  }

  // 3) 선수 플러스원 플래그
  const { data: playersRaw } = await supabase
    .from('league_players')
    .select('id, plus_one')
    .eq('league_id', leagueId)
  const plusOneSet = new Set((playersRaw ?? []).filter(p => p.plus_one).map(p => p.id))

  // 4) 이벤트 페이지네이션 — 클러치 판정 위해 video_timestamp/points 포함
  //    league_player_id 가 null 인 이벤트도 running score walk 를 위해 함께 조회
  //    (id 순 조회 후 게임별로 video_timestamp 재정렬)
  type EvRow = {
    id: number
    league_player_id: string | null
    type: string
    result: string | null
    league_game_id: string
    team_id: string | null
    video_timestamp: number | null
    points: number | null
  }
  const events: EvRow[] = []
  const PAGE = 1000
  let pg = 0
  while (true) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('id, league_player_id, type, result, league_game_id, team_id, video_timestamp, points')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (chunk?.length) events.push(...(chunk as EvRow[]))
    if (!chunk || chunk.length < PAGE) break
    pg++
  }

  // 5) 게임별 이벤트 그룹핑 + max video_timestamp (클러치 window 계산)
  const gameEvents = new Map<string, EvRow[]>()
  const gameMaxTs = new Map<string, number>()
  for (const e of events) {
    const gid = e.league_game_id
    if (!gameEvents.has(gid)) gameEvents.set(gid, [])
    gameEvents.get(gid)!.push(e)
    if (e.video_timestamp != null) {
      const cur = gameMaxTs.get(gid) ?? -1
      if (e.video_timestamp > cur) gameMaxTs.set(gid, e.video_timestamp)
    }
  }

  // 6) 라운드 × 선수 종합 스탯 집계 — 게임별 시간순 walk 로 클러치 판정
  //    · 이벤트를 video_timestamp 오름차순 재정렬 (null 은 뒤로, id tiebreak)
  //    · running homeScore / awayScore 유지 → 이벤트 발생 "직전" 스코어 기준 접전 판정
  //    · video_timestamp 없는 이벤트 (수동 입력 · 레거시) 는 자연스레 클러치 제외
  const byRound = new Map<string, Map<string, PlayerRoundStats>>()

  for (const [gid, evs] of gameEvents) {
    const date = gameDateMap[gid]
    if (!date) continue
    const teams = gameTeamsMap[gid]
    if (!teams) continue
    const gpo = gamePlusOneMap[gid]
    const maxTs = gameMaxTs.get(gid)
    const clutchStart = maxTs != null ? maxTs - CLUTCH_TIME_WINDOW_SECONDS : null

    // video_timestamp 오름차순 정렬 (null 은 뒤로) — id tiebreak
    evs.sort((a, b) => {
      const ta = a.video_timestamp ?? Number.MAX_SAFE_INTEGER
      const tb = b.video_timestamp ?? Number.MAX_SAFE_INTEGER
      if (ta !== tb) return ta - tb
      return a.id - b.id
    })

    if (!byRound.has(date)) byRound.set(date, new Map())
    const map = byRound.get(date)!

    let homeScore = 0
    let awayScore = 0

    for (const e of evs) {
      // 이 이벤트의 클러치 여부 (이벤트 반영 "전" 스코어 기준)
      const inClutchTime = clutchStart != null && e.video_timestamp != null && e.video_timestamp >= clutchStart
      const inClutchScore = Math.abs(homeScore - awayScore) <= CLUTCH_MARGIN_MAX
      const isClutch = inClutchTime && inClutchScore

      // 선수 스탯 집계 (league_player_id 있는 경우만)
      const pid = e.league_player_id
      if (pid) {
        if (!map.has(pid)) map.set(pid, emptyRoundStats())
        const s = map.get(pid)!

        if (e.type !== 'sub_in' && e.type !== 'sub_out') {
          s.gp.add(gid)
        }

        const made = e.result === 'made'
        const isP1 = gpo !== null ? pid === gpo : plusOneSet.has(pid)

        // 이 이벤트로 획득한 pts (플러스원 보정 반영) — 클러치 pts 집계용
        let ptsGained = 0
        switch (e.type) {
          case 'shot_3p':
            s.fga++
            s.fg3a++
            if (made) { ptsGained = isP1 ? 4 : 3; s.pts += ptsGained; s.fg3m++ }
            break
          case 'shot_2p_mid': case 'shot_layup': case 'shot_post':
            s.fga++
            if (made) { ptsGained = isP1 ? 3 : 2; s.pts += ptsGained }
            break
          case 'ft_2pt': case 'ft_3pt_1':
            s.fta++
            if (made) { ptsGained = 2; s.pts += ptsGained }
            break
          case 'free_throw': case 'ft_3pt_2':
            s.fta++
            if (made) { ptsGained = 1; s.pts += ptsGained }
            break
          case 'and_one':
            if (made) { ptsGained = 1; s.pts += ptsGained }
            break
          case 'oreb': s.oreb++; s.reb++; break
          case 'dreb': s.dreb++; s.reb++; break
          case 'steal': s.stl++; break
          case 'block': s.blk++; break
          case 'turnover': s.tov++; break
        }
        // 어시스트: related_player_id 는 v1 스킵 (팀 통계 API 는 별도 처리)

        // 클러치 상황이면 이 이벤트의 pts 를 clutchPts 에 가산
        if (isClutch) {
          if (ptsGained > 0) s.clutchPts += ptsGained
          if (e.type !== 'sub_in' && e.type !== 'sub_out') {
            s.clutchGp.add(gid)
          }
        }
      }

      // 스코어 업데이트 — 이벤트 처리 후 반영 (다음 이벤트의 클러치 판정용)
      const madeForScore = e.result === 'made'
      if (madeForScore && SCORING_EVENTS_SET.has(e.type) && e.team_id && e.points != null) {
        if (e.team_id === teams.homeTeamId) homeScore += e.points
        else if (e.team_id === teams.awayTeamId) awayScore += e.points
      }
    }
  }

  // 6.5) seriesByPid — 각 선수의 라운드별 값 시리즈 (오래된 → 최신 정렬)
  //     · 우세 지표(topCategory) 기반 sparkline 렌더에 사용
  //     · upset bonus 계산 (그 선수의 과거 라운드 평균 대비 이번 라운드 증분율) 에도 사용
  //     · 이전엔 step 9 에 있었으나 upset bonus 를 위해 top1 선정 전으로 이동
  type RoundMetricValues = {
    date: string
    pts: number
    reb: number
    ast: number
    stl: number
    blk: number
    ts_pct: number
    clutch: number
    fg3m: number  // NEW · 3점 성공 (breakdown 노출용)
    fg3a: number  // NEW · 3점 시도
  }
  const seriesByPid = new Map<string, RoundMetricValues[]>()
  for (const date of uniqueDates) {
    const map = byRound.get(date)
    if (!map) continue
    for (const [pid, s] of map) {
      if (!seriesByPid.has(pid)) seriesByPid.set(pid, [])
      seriesByPid.get(pid)!.push({
        date,
        pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk,
        ts_pct: tsPct(s.pts, s.fga, s.fta),
        clutch: s.clutchPts,
        fg3m: s.fg3m, fg3a: s.fg3a,
      })
    }
  }
  for (const [, arr] of seriesByPid) arr.sort((a, b) => a.date.localeCompare(b.date))

  // 7) 각 라운드별 종합 점수 계산 → top1 선정 (다양성 로직 + upset bonus + 서브 지표)
  //    · 다양성 A: 지난 라운드 POTW pid 는 이번 라운드 후보에서 제외 (연속 방지).
  //               제외 후 후보 0 명이면 fallback = 전원 후보로 완화.
  //    · upset bonus: 그 선수의 과거 라운드 평균 pts 대비 이번 라운드 증분율 → +0~+15.
  //                   매번 볼륨 최상위만 뽑히는 편향 완화, 깜짝 활약 반영.
  //                   첫 라운드나 그 선수의 첫 등장이면 pastRounds=0 → 보너스 0.
  //    · secondary: 가중치 2번째 카테고리 + 볼륨우세+3점폭격 특수 케이스.
  //                 "그 라운드 그 선수가 어떻게 게임을 지배했는지" 를 한 줄로 노출.
  type TopPick = {
    pid: string; stats: PlayerRoundStats
    ts_pct: number
    compositeScore: number
    topCategory: POTWTopCategory
    secondaryCategory?: SecondaryCategory
    secondaryLabel?: string
  }
  const topPerRound = new Map<string, TopPick>()
  const prevPotwPids = new Set<string>()  // 오래된 라운드부터 누적 → 다음 라운드 후보 제외

  // uniqueDates 는 최신 → 오래된 순. 다양성 적용은 오래된 → 최신 순으로 iterate.
  const sortedDatesAsc = [...uniqueDates].reverse()

  for (const date of sortedDatesAsc) {
    const map = byRound.get(date)
    if (!map) continue

    // 참가자 (gp>0 필터). max 정규화는 제외 후보 포함 전체 참가자 기준으로 계산 —
    // 제외된 선수가 여전히 실제 최고치이면 그 값을 기준으로 상대평가해야 의미가 있음.
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
    const clutchRoster = roster.filter(r => r.s.clutchGp.size > 0)
    const maxClutchPts = clutchRoster.length > 0
      ? Math.max(...clutchRoster.map(r => r.s.clutchPts), 1)
      : 1

    type Scored = {
      pid: string; s: PlayerRoundStats; ts: number
      composite: number
      topCategory: POTWTopCategory
      secondaryCategory?: SecondaryCategory
    }
    const scored: Scored[] = roster.map(r => {
      const s = r.s
      const norm = {
        volume: s.pts / maxPts,
        efficiency: (s.fga + s.fta) >= 5 ? r.ts / maxTs : 0,
        reb: s.reb / maxReb,
        stl: s.stl / maxStl,
        blk: s.blk / maxBlk,
        ast: s.ast / maxAst,
        clutch: s.clutchGp.size > 0 ? s.clutchPts / maxClutchPts : 0,
      }

      // 가중 합 (총 100)
      let composite =
        norm.volume     * POTW_WEIGHTS.volume +
        norm.efficiency * POTW_WEIGHTS.efficiency +
        norm.reb        * POTW_WEIGHTS.reb +
        norm.stl        * POTW_WEIGHTS.stl +
        norm.blk        * POTW_WEIGHTS.blk +
        norm.ast        * POTW_WEIGHTS.ast +
        norm.clutch     * POTW_WEIGHTS.clutch

      // upset bonus — 이 선수의 과거 라운드 평균 pts 대비 이번 pts 증분율.
      // surpriseFactor 1.0 = 평균 대비 2배 → 보너스 10, 상한 15 (전체 100/15).
      // 첫 라운드나 이 선수 첫 등장이면 pastRounds=0 → 보너스 0.
      const playerSeries = seriesByPid.get(r.pid) ?? []
      const pastRounds = playerSeries.filter(e => e.date < date)
      if (pastRounds.length > 0) {
        const avgPts = pastRounds.reduce((sum, e) => sum + e.pts, 0) / pastRounds.length
        if (avgPts > 0) {
          const surpriseFactor = Math.max(0, (s.pts - avgPts) / avgPts)
          const upsetBonus = Math.min(surpriseFactor * 10, 15)
          composite += upsetBonus
        }
      }

      // 우세 카테고리 판정 (가중 × 정규화 값 최고)
      const weighted: Array<[POTWTopCategory, number]> = [
        ['volume',     norm.volume     * POTW_WEIGHTS.volume],
        ['efficiency', norm.efficiency * POTW_WEIGHTS.efficiency],
        ['reb',        norm.reb        * POTW_WEIGHTS.reb],
        ['stl',        norm.stl        * POTW_WEIGHTS.stl],
        ['blk',        norm.blk        * POTW_WEIGHTS.blk],
        ['ast',        norm.ast        * POTW_WEIGHTS.ast],
        ['clutch',     norm.clutch     * POTW_WEIGHTS.clutch],
      ]
      weighted.sort((a, b) => b[1] - a[1])
      const topCategory: POTWTopCategory = weighted[0][0]
      // 2번째 카테고리 (weighted 값 > 0 인 경우만) — 없으면 undefined
      let secondaryCategory: SecondaryCategory | undefined =
        (weighted[1] && weighted[1][1] > 0) ? weighted[1][0] : undefined

      // 특수 케이스 — 볼륨 우세 + 3점 폭격이면 서브 지표를 'three' 로 승격.
      // 변원식 케이스: 32점 + 3점 8/12 → "그 주 게임 지배 방법" = 3점 폭격.
      // 조건: 3점 시도 ≥ 3 · (성공률 ≥ 40% OR 성공 ≥ 5)
      if (topCategory === 'volume' && s.fg3a >= 3) {
        const fg3Pct = (s.fg3m / s.fg3a) * 100
        if (fg3Pct >= 40 || s.fg3m >= 5) {
          secondaryCategory = 'three'
        }
      }

      return { pid: r.pid, s, ts: r.ts, composite, topCategory, secondaryCategory }
    })

    // 다양성 A — 지난 POTW pid 제외. 전원 제외되면 완화 (fallback).
    let candidates = scored.filter(x => !prevPotwPids.has(x.pid))
    if (candidates.length === 0) candidates = scored

    const top = candidates.sort((a, b) => b.composite - a.composite)[0]
    if (top && top.composite > 0) {
      topPerRound.set(date, {
        pid: top.pid,
        stats: top.s,
        ts_pct: top.ts,
        compositeScore: +top.composite.toFixed(1),
        topCategory: top.topCategory,
        secondaryCategory: top.secondaryCategory,
        secondaryLabel: top.secondaryCategory
          ? buildSecondaryLabel(top.s, top.secondaryCategory)
          : undefined,
      })
      prevPotwPids.add(top.pid)
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

  // 9) seriesByPid 는 step 6.5 에서 이미 생성됨 — 여기선 결과 배열 구성에만 사용.

  // 10) 결과 배열 (최신 라운드 → 오래된 순)
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
    const fallbackEntry: RoundMetricValues = {
      date,
      pts: s.pts,
      reb: s.reb,
      ast: s.ast,
      stl: s.stl,
      blk: s.blk,
      ts_pct: tsPct(s.pts, s.fga, s.fta),
      clutch: s.clutchPts,
      fg3m: s.fg3m,
      fg3a: s.fg3a,
    }
    // 버그 픽스 — 각 POTW date 이하 라운드만 노출 (미래 날짜 제거).
    // 사용자 지적: "6/27 클러치 플레이어 최근 2주 흐름에 미래 7/4 일정 포함"
    //          · "6/20 박현욱도 마찬가지". 해당 시점 기준 과거 라운드만 렌더링해야 함.
    const fullSeries = seriesByPid.get(top.pid) ?? [fallbackEntry]
    const series = fullSeries.filter(e => e.date <= date)
    // ppr 도 필터된 series 기반으로 재계산 (미래 라운드 오염 제거)
    const ppr = series.length > 0
      ? +(series.reduce((sum, e) => sum + e.pts, 0) / series.length).toFixed(1)
      : s.pts
    const fg3Pct = s.fg3a > 0 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : 0
    const headline = makeHeadline(meta.name, s, top.topCategory)

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
        ppr,
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
        clutchPts: s.clutchPts,
        clutchGp: s.clutchGp.size,
        compositeScore: top.compositeScore,
        topCategory: top.topCategory,
        headline,
        fg3m: s.fg3m,
        fg3a: s.fg3a,
        fg3_pct: fg3Pct,
        secondaryCategory: top.secondaryCategory,
        secondaryLabel: top.secondaryLabel,
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

// B2: 재방문 시 즉시 응답용 unstable_cache 래퍼 3종.
//   - keyParts 에 leagueId 를 넣어 리그별 캐시 분리
//   - tags 는 향후 편집 API 완료 시 `revalidateTag('league-${leagueId}')` 로 무효화 (다음 iteration)
//   - revalidate 60s TTL — 편집 반영 지연 상한
// supabase / resolverPromise 는 클로저에서 재구성 (unstable_cache 는 serializable 인자만 허용)
const getCachedWeeklyPOTW = (leagueId: string, weeks: number) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeWeeklyPOTW(sb, leagueId, weeks)
    },
    ['home-weekly-potw', leagueId, String(weeks)],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 60 },
  )

const getCachedRecentRounds = (leagueId: string, weeks: number) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const resolverPromise = loadIdentityResolver(sb, leagueId)
      return computeRecentRounds(sb, leagueId, resolverPromise, weeks)
    },
    ['home-recent-rounds', leagueId, String(weeks)],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 60 },
  )

const getCachedQuarterStandings = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const resolverPromise = loadIdentityResolver(sb, leagueId)
      return computeCurrentQuarterStandings(sb, leagueId, resolverPromise)
    },
    ['home-quarter-standings', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 60 },
  )

// B2 확장: 리더/스트릭/마일스톤/포토맵도 캐시.
//   - 홈 SSR 프리페치 대상. 모든 캐시는 mutation route(events/games/players 등)의
//     `revalidateTag('league-${leagueId}[-games]')` 로 무효화됨.
//   - TTL 60s 상한. 편집 즉시 반영은 태그 무효화로 보장.
const getCachedLeaderStats = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeLeagueStats(sb, leagueId, { unit: 'round' })
    },
    ['home-leader-stats', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 60 },
  )

const getCachedStreaks = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeStreaks(sb, leagueId, { minStreak: 2 })
    },
    ['home-streaks', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 60 },
  )

const getCachedMilestones = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeMilestones(sb, leagueId, { horizonDays: 30, maxUpcoming: 6, maxRecent: 6 })
    },
    // v2: 이벤트 단위 트래킹 — key 변경으로 구 캐시(날짜 단위) 자동 무효화
    ['home-milestones-v2', leagueId],
    // events 태그 추가: 이벤트 timestamp/points 변경 시 재계산 필요
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

// 사진 맵: `league` 태그만 무효화하면 됨(경기 편집으로 안 바뀜)
const getCachedPhotoMap = (leagueId: string) =>
  unstable_cache(
    async (): Promise<Record<string, string | null>> => {
      const sb = createClient()
      const { data } = await sb
        .from('league_players')
        .select('id, photo_url')
        .eq('league_id', leagueId)
      const map: Record<string, string | null> = {}
      for (const p of (data ?? []) as { id: string; photo_url: string | null }[]) {
        map[p.id] = p.photo_url
      }
      return map
    },
    ['home-photo-map', leagueId],
    { tags: [`league-${leagueId}`], revalidate: 60 },
  )

// 홈 하이라이트 위젯 — 최근 재생 가능 라운드(status='ready') 대표 클립 3-5개.
// 발견성 강화용. 클립 상위 5개는 균등 분산 샘플링(단순 chunk-first pick) 으로 다양한 시점 노출.
async function computeHomeHighlights(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
): Promise<HighlightsHomePayload | null> {
  // v2: "이번주 클러치샷" — 가장 최근 재생 가능 라운드의 is_clutch=true 클립만
  //     클러치 없으면 { date, clips: [] } 반환 (빈 상태 UI 로 안내)
  //     라운드조차 없으면 null (섹션 자체 미노출)
  const rounds = await loadRecentRounds(supabase, leagueId, 24)
  const target = rounds.find(r => r.status === 'ready')
  if (!target) return null

  const detail = await loadRoundDetail(supabase, leagueId, target.date)
  const all = detail.clips
  // 클러치 필터 · 원본 인덱스 유지
  const clutchWithIdx = all
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.is_clutch === true)

  return {
    date: target.date,
    clips: clutchWithIdx.map(x => x.c),
    clipIndexes: clutchWithIdx.map(x => x.i),
    totalClips: all.length,
    displayNames: target.team_names,
  }
}

const getCachedHomeHighlights = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeHomeHighlights(sb, leagueId)
    },
    ['home-clutch-shots-v1', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

// 리그 메타 조회: `leagues` 자체 변경(status/name)만 무효화.
// 경기 편집으로는 안 바뀌지만 안전하게 league 태그에 묶어둔다.
const getCachedLeagueMeta = (leagueId: string, orgSlug: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const [{ data: league }, { data: allLeagues }] = await Promise.all([
        sb.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single(),
        sb.from('leagues').select('id, name, status, season_year').eq('org_slug', orgSlug).order('created_at', { ascending: false }),
      ])
      return { league, allLeagues }
    },
    ['home-league-meta', leagueId, orgSlug],
    { tags: [`league-${leagueId}`], revalidate: 60 },
  )

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  // B2 확장: 리그 메타 + 홈 프리페치 7종을 모두 `unstable_cache` 로 감싸 병렬 실행.
  //   - 재방문 시 캐시 히트 → SSR 시간 대부분 제거.
  //   - 캐시 미스 시에도 Promise.all 로 병렬 → 순차 waterfall 없음.
  //   - 편집 API(events/games/players/quarters 등)가 `revalidateTag('league-${leagueId}[-games]')`
  //     로 무효화하므로 편집 반영 최대 지연은 순간(태그 무효화 후 다음 요청).
  const [
    { league, allLeagues },
    weeklyPOTW,
    recentRounds,
    quarterStandings,
    leaderStats,
    initialPhotoMap,
    streaksData,
    milestonesData,
    homeHighlights,
  ] = await Promise.all([
    getCachedLeagueMeta(leagueId, orgSlug)(),
    getCachedWeeklyPOTW(leagueId, 4)(),
    getCachedRecentRounds(leagueId, 4)(),
    getCachedQuarterStandings(leagueId)(),
    getCachedLeaderStats(leagueId)(),
    getCachedPhotoMap(leagueId)(),
    getCachedStreaks(leagueId)(),
    getCachedMilestones(leagueId)(),
    getCachedHomeHighlights(leagueId)(),
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
          <h1 className="font-jersey text-2xl sm:text-3xl lg:text-5xl font-bold text-white tracking-wide uppercase break-keep min-w-0" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.1 }}>{l.name}</h1>
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
        <HighlightsHome data={homeHighlights} orgSlug={orgSlug} leagueId={leagueId} />
        <NbaTeamStandings
          standings={quarterStandings.standings}
          quarterLabel={quarterStandings.quarterLabel}
          gamesCount={quarterStandings.gamesCount}
        />
        <NbaRoundsSummary rounds={recentRounds} leagueId={leagueId} orgSlug={orgSlug} />
        <NbaLeaders
          leagueId={leagueId}
          initialPlayers={leaderStats.players}
          initialPhotoMap={initialPhotoMap}
        />
      </div>

      {/* 스토리텔링 — 진행 중 연속 기록 + 커리어 마일스톤 (유지) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <StreakSpotlight leagueId={leagueId} maxEntries={8} initialData={streaksData} />
        <MilestoneFeed leagueId={leagueId} initialData={milestonesData} />
      </div>

      {/* 인터랙티브 튜토리얼 투어 — 첫 방문 자동 실행 · 헤더 물음표 재실행 */}
      <Suspense fallback={null}>
        <LeagueTourTrigger />
      </Suspense>
    </div>
  )
}
