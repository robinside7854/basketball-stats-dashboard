import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { HighlightPlayer, HighlightTeam } from '@/components/league/HighlightBanner'
import { makeIdentityResolver, type QuarterOverride, type TeamBase } from '@/lib/stats/teamIdentity'
import StreakSpotlight from '@/components/league/StreakSpotlight'
import MilestoneFeed from '@/components/league/MilestoneFeed'
import NbaHero, { type NbaHeroData } from '@/components/league/nba/NbaHero'
import NbaLeaders from '@/components/league/nba/NbaLeaders'
import NbaRoundsSummary, { type RoundSummary, type RoundTeamSummary } from '@/components/league/nba/NbaRoundsSummary'
import type { League } from '@/types/league'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']

// 최근 N일 하이라이트 3종 계산:
//   1) topTeam: 이 주 최고 승률 프랜차이즈 (팀명 + 승/패/승률)
//   2) scoringKing: 이 주 누적 득점 최다 선수 (평득 아닌 누적 PTS)
//   3) hotHand: 이 주 3P% 최고 (최소 5회 시도)
async function computeHighlights(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
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

  // 팀 정체성 resolver 로드 (프랜차이즈 분리)
  const [{ data: teamsRaw }, { data: overridesRaw }] = await Promise.all([
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
  ])
  const identityResolver = makeIdentityResolver(
    (teamsRaw ?? []) as TeamBase[],
    (overridesRaw ?? []) as QuarterOverride[],
  )

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
  weeks: number = 4,
): Promise<RoundSummary[]> {
  const from = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: games }, { data: teamsRaw }, { data: overridesRaw }] = await Promise.all([
    supabase
      .from('league_games')
      .select('id, date, home_team_id, away_team_id, home_score, away_score, is_complete, is_exhibition, quarter_id')
      .eq('league_id', leagueId)
      .eq('is_exhibition', false)
      .eq('is_complete', true)
      .gte('date', from)
      .lte('date', today)
      .order('date', { ascending: false }),
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
  ])
  const resolver = makeIdentityResolver(
    (teamsRaw ?? []) as TeamBase[],
    (overridesRaw ?? []) as QuarterOverride[],
  )

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

  const [{ data: league }, { data: allLeagues }, highlights, recentRounds] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single(),
    supabase.from('leagues').select('id, name, status, season_year').eq('org_slug', orgSlug).order('created_at', { ascending: false }),
    computeHighlights(supabase, leagueId, 28),  // 최근 4주 (라운드 기반 임팩트)
    computeRecentRounds(supabase, leagueId, 4),
  ])
  const heroProps = await toNbaHero(supabase, leagueId, highlights.scoringKing, `최근 ${recentRounds.length}라운드`)

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

      {/* 미라클모닝 브랜드 파일럿 — Hero + RoundsSummary + Leaders */}
      <div className="rounded-none overflow-hidden">
        <NbaHero data={heroProps.data} rangeLabel={heroProps.rangeLabel} />
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
