import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import LeagueStandingsTabs from '@/components/league/LeagueStandingsTabs'
import LeagueSchedule from '@/components/league/LeagueSchedule'
import HighlightBanner, { type HighlightPlayer } from '@/components/league/HighlightBanner'
import type { League, LeagueStanding, LeagueGame, LeagueTeam, Quarter } from '@/types/league'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive']

// 최근 N일 MVP / Hot Hand 계산 (서버 컴포넌트 안에서 직접)
async function computeHighlights(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  daysAgo: number = 7,
): Promise<{ mvp: HighlightPlayer | null; hotHand: HighlightPlayer | null; rangeLabel: string }> {
  const today = new Date()
  const from = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000)
  const fromIso = from.toISOString().slice(0, 10)
  const toIso = today.toISOString().slice(0, 10)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  const rangeLabel = `${fmt(from)} ~ ${fmt(today)}`

  // 최근 N일 is_started 게임만 (마감 안 된 경기 포함)
  const { data: games } = await supabase
    .from('league_games')
    .select('id, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .gte('date', fromIso)
    .lte('date', toIso)
  const gameIds = (games ?? []).map(g => g.id)
  if (gameIds.length === 0) return { mvp: null, hotHand: null, rangeLabel }
  const gamePlusOneMap: Record<string, string | null> = Object.fromEntries(
    (games ?? []).map(g => [g.id as string, (g.plus_one_player_id as string | null) ?? null])
  )

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

  // 집계
  const agg: Record<string, { pts: number; fg3m: number; fg3a: number; gp: Set<string> }> = {}
  const ensure = (pid: string) => {
    if (!agg[pid]) agg[pid] = { pts: 0, fg3m: 0, fg3a: 0, gp: new Set() }
    return agg[pid]
  }
  for (const e of events) {
    if (!e.league_player_id) continue
    const pid = e.league_player_id
    const s = ensure(pid)
    if (e.type !== 'sub_in' && e.type !== 'sub_out') s.gp.add(e.league_game_id)
    const made = e.result === 'made'
    const gpo = gamePlusOneMap[e.league_game_id]
    const isP1 = gpo !== null ? pid === gpo : plusOneSet.has(pid)
    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; if (made) { s.fg3m++; s.pts += isP1 ? 4 : 3 }; break
      case 'shot_2p_mid': case 'shot_layup': case 'shot_post': case 'shot_2p_drive':
        if (made) s.pts += isP1 ? 3 : 2; break
      case 'ft_2pt': case 'ft_3pt_1': if (made) s.pts += 2; break
      case 'free_throw': case 'ft_3pt_2': case 'and_one': if (made) s.pts += 1; break
    }
  }

  // 평탄화 + 최소 기준
  const list = Object.entries(agg)
    .map(([pid, s]) => ({
      player_id: pid,
      name: (meta[pid]?.name as string) ?? '알 수 없음',
      number: (meta[pid]?.number as number | null) ?? null,
      pts: s.pts,
      gp: s.gp.size,
      ppg: s.gp.size > 0 ? +(s.pts / s.gp.size).toFixed(1) : 0,
      fg3m: s.fg3m,
      fg3a: s.fg3a,
      fg3_pct: s.fg3a > 0 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : 0,
    }))
    .filter(p => p.gp > 0)
  void SHOT_TYPES  // unused-vars 회피

  // MVP: 누적 PTS 최다
  const mvp = list.slice().sort((a, b) => b.pts - a.pts)[0] ?? null
  // Hot Hand: 3P% 최고 (최소 5회 시도)
  const hotHand = list.filter(p => p.fg3a >= 5).sort((a, b) => b.fg3_pct - a.fg3_pct)[0] ?? null

  return { mvp, hotHand, rangeLabel }
}

const TARGET_SEASON_YEAR = 2026  // 분기 탭은 2026 시즌 기준

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const supabase = createClient()

  const [{ data: league }, { data: teams }, { data: games }, { data: allLeagues }, { data: quartersRaw }, { data: overridesRaw }, highlights] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single(),
    supabase.from('league_teams').select('*').eq('league_id', leagueId),
    supabase.from('league_games').select('*').eq('league_id', leagueId).order('round_num', { ascending: true }),
    supabase.from('leagues').select('id, name, status, season_year').eq('org_slug', orgSlug).order('created_at', { ascending: false }),
    supabase.from('league_quarters').select('*').eq('league_id', leagueId).eq('year', TARGET_SEASON_YEAR).order('quarter', { ascending: true }),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
    computeHighlights(supabase, leagueId, 7),
  ])

  if (!league) notFound()

  const l = league as League
  const teamList = (teams as LeagueTeam[]) ?? []
  const teamMap = Object.fromEntries(teamList.map(t => [t.id, t]))
  const quarters = (quartersRaw as Quarter[]) ?? []

  // 분기별 팀명/색상 override 맵 — league_teams 는 quarter 개념이 없어
  // 시즌마다 팀명이 바뀌면 과거 분기의 순위표·일정에서 잘못된 이름이 보임.
  // (quarter_id, team_id) 에 override 가 있으면 그 분기 표시에서만 대체.
  type OverrideRow = { quarter_id: string; team_id: string; name: string | null; color: string | null }
  const overrideMap: Record<string, Record<string, { name?: string; color?: string }>> = {}
  for (const ov of (overridesRaw as OverrideRow[] | null) ?? []) {
    if (!overrideMap[ov.quarter_id]) overrideMap[ov.quarter_id] = {}
    overrideMap[ov.quarter_id][ov.team_id] = {
      name: ov.name ?? undefined,
      color: ov.color ?? undefined,
    }
  }
  const resolveTeam = (teamId: string | null | undefined, quarterId: string | null | undefined): LeagueTeam | null => {
    if (!teamId) return null
    const base = teamMap[teamId]
    if (!base) return null
    const ov = quarterId ? overrideMap[quarterId]?.[teamId] : undefined
    if (!ov) return base
    return { ...base, name: ov.name ?? base.name, color: ov.color ?? base.color }
  }

  const gameList = ((games as LeagueGame[]) ?? []).map(g => ({
    ...g,
    home_team: resolveTeam(g.home_team_id, g.quarter_id),
    away_team: resolveTeam(g.away_team_id, g.quarter_id),
  }))

  // 주어진 게임 목록으로 순위 계산 (+ 팀 streak)
  // quarterId 를 넘기면 그 분기의 override 이름/색상으로 팀 정보 대체
  function computeStandings(filteredGames: typeof gameList, quarterId?: string): LeagueStanding[] {
    const standing: Record<string, LeagueStanding> = {}
    for (const t of teamList) {
      const displayTeam = quarterId ? (resolveTeam(t.id, quarterId) ?? t) : t
      standing[t.id] = { team: displayTeam, played: 0, wins: 0, draws: 0, losses: 0, points: 0, goals_for: 0, goals_against: 0, goal_diff: 0, streak: null }
    }
    for (const g of filteredGames.filter(g => g.is_complete && g.home_team_id && g.away_team_id && !g.is_exhibition)) {
      const h = standing[g.home_team_id!]
      const a = standing[g.away_team_id!]
      if (!h || !a) continue
      h.played++; a.played++
      h.goals_for += g.home_score; h.goals_against += g.away_score
      a.goals_for += g.away_score; a.goals_against += g.home_score
      if (g.home_score > g.away_score) { h.wins++; h.points += 3; a.losses++ }
      else if (g.home_score < g.away_score) { a.wins++; a.points += 3; h.losses++ }
      else { h.draws++; h.points++; a.draws++; a.points++ }
    }
    for (const s of Object.values(standing)) s.goal_diff = s.goals_for - s.goals_against

    // 팀별 streak — 본인 팀이 참가한 완료 경기를 날짜 desc 순으로 walk
    // 같은 결과 연속 길이를 count. 첫 다른 결과에서 중단.
    const completedGames = filteredGames
      .filter(g => g.is_complete && g.home_team_id && g.away_team_id && !g.is_exhibition)
      .sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return (b.slot_num ?? 0) - (a.slot_num ?? 0)
      })
    for (const teamId of Object.keys(standing)) {
      let type: 'W'|'L'|'D'|null = null
      let count = 0
      for (const g of completedGames) {
        if (g.home_team_id !== teamId && g.away_team_id !== teamId) continue
        const isHome = g.home_team_id === teamId
        const myPts = isHome ? g.home_score : g.away_score
        const oppPts = isHome ? g.away_score : g.home_score
        const result: 'W'|'L'|'D' = myPts > oppPts ? 'W' : myPts < oppPts ? 'L' : 'D'
        if (type === null) { type = result; count = 1; continue }
        if (result === type) { count++ } else break
      }
      if (type !== null && count > 0) standing[teamId].streak = { type, count }
    }
    return Object.values(standing).sort((a, b) => b.points - a.points || b.goal_diff - a.goal_diff || b.goals_for - a.goals_for)
  }

  // 누적: 이 리그의 전체 완료 경기 (base 팀명 사용 — 팀 정체성이 team_id 로 유지되므로)
  const cumulativeStandings = computeStandings(gameList)
  // 분기별: 2026 시즌 분기들 (해당 분기의 override 이름/색상 적용)
  const quarterStandings = quarters.map(q => ({
    quarter: q,
    standings: computeStandings(gameList.filter(g => g.quarter_id === q.id), q.id),
  }))

  const statusColor: Record<string, string> = {
    upcoming: 'bg-yellow-900/40 text-yellow-400',
    active: 'bg-green-900/40 text-green-400',
    completed: 'bg-gray-800 text-gray-500',
  }
  const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }

  const otherLeagues = (allLeagues ?? []).filter(ol => ol.id !== leagueId)

  const today = new Date().toISOString().slice(0, 10)
  const nextGame = gameList
    .filter(g => !g.is_complete && g.date >= today && g.home_team_id && g.away_team_id)
    .sort((a, b) => a.date.localeCompare(b.date))[0]

  return (
    <div className="space-y-5">
      {/* 헤더 — 코트 미세 텍스처 배경 + 저지 폰트 */}
      <div className="relative court-bg rounded-2xl px-5 py-4 -mx-2 sm:mx-0 border border-gray-800/40">
        <div className="flex items-center justify-between">
          <h1 className="font-jersey text-3xl font-bold text-white tracking-wide uppercase">{l.name}</h1>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[l.status] ?? 'bg-gray-800 text-gray-400'}`}>
            {statusLabel[l.status] ?? l.status}
          </span>
        </div>
        <p className="text-gray-500 text-sm mt-1">{l.season_year}시즌 · {l.season_type === 'quarterly' ? '분기별(3개월)' : '연간(1년)'} · 시작일 {l.start_date}</p>
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

      {/* 이 주의 하이라이트 (최근 7일 MVP + Hot Hand) */}
      <HighlightBanner
        leagueId={leagueId}
        mvp={highlights.mvp}
        hotHand={highlights.hotHand}
        dateRangeLabel={highlights.rangeLabel}
      />

      {/* PC: 2컬럼 (순위표 우측 고정 + 좌측 일정), 모바일: 스택 */}
      <div className="lg:grid lg:grid-cols-[3fr_2fr] lg:gap-8 lg:items-start space-y-5 lg:space-y-0">

        {/* 좌측: 다음 경기 + 일정 */}
        <div className="space-y-5">
          {/* 다음 경기 하이라이트 */}
          {nextGame && (() => {
            const home = resolveTeam(nextGame.home_team_id, nextGame.quarter_id)
            const away = resolveTeam(nextGame.away_team_id, nextGame.quarter_id)
            const isToday = nextGame.date === today
            return (
              <div className="bg-gradient-to-r from-blue-950/40 via-gray-900 to-gray-900 border border-blue-900/40 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  {isToday ? (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />오늘 경기
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">다음 경기</span>
                  )}
                  <span className="text-xs text-gray-500">· {nextGame.date}</span>
                </div>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2">
                    {home && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: home.color }} />}
                    <span className="text-base font-black text-white">{home?.name ?? '—'}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-600">VS</span>
                  <div className="flex items-center gap-2">
                    {away && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: away.color }} />}
                    <span className="text-base font-black text-white">{away?.name ?? '—'}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* 최근 일정 / 결과 */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-semibold text-white">일정 · 결과</h2>
              <Link href={`/league/${orgSlug}/${leagueId}/schedule`}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                전체 보기 →
              </Link>
            </div>
            <div className="p-4">
              <LeagueSchedule games={gameList} leagueId={leagueId} limit={6} />
            </div>
          </div>
        </div>

        {/* 우측: 순위표 (PC에서 sticky) */}
        <div className="lg:sticky lg:top-20">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="font-jersey text-lg font-bold text-white uppercase tracking-wide">순위표</h2>
              <span className="font-jersey text-[10px] text-orange-400 tracking-widest">{TARGET_SEASON_YEAR} 시즌</span>
            </div>
            <LeagueStandingsTabs cumulative={cumulativeStandings} quarters={quarterStandings} />
          </div>
        </div>

      </div>
    </div>
  )
}
