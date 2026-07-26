import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import Link from 'next/link'
import { loadIdentityResolver, makeIdentityResolver } from '@/lib/stats/teamIdentity'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { computeMilestones } from '@/lib/stats/milestones'

// 홈 페이지 공통 — teams/overrides 를 한 번만 로드해 3개 계산 함수(highlights/rounds/standings)에
// 재사용하기 위한 Promise 타입. 각 함수는 내부에서 await 로 값 참조.
type IdentityResolverPromise = Promise<ReturnType<typeof makeIdentityResolver>>
import MilestoneFeed from '@/components/league/MilestoneFeed'
import PersonalDashboard from '@/components/league/auth/PersonalDashboard'
import LeagueTourTrigger from '@/components/league/LeagueTourTrigger'
import HighlightsHome, { type HighlightsHomePayload } from '@/components/league/HighlightsHome'
import AnnouncementsHome from '@/components/league/announcements/AnnouncementsHome'
import type { LeagueAnnouncement } from '@/lib/announcements/types'
import { loadRecentRounds, loadRoundDetail } from '@/lib/highlights/loader'
import NbaLeaders from '@/components/league/nba/NbaLeaders'
import NbaRoundsSummary, { type RoundSummary, type RoundTeamSummary } from '@/components/league/nba/NbaRoundsSummary'
import NbaTeamStandings, { type StandingRow } from '@/components/league/nba/NbaTeamStandings'
import HomeSectionTabs from '@/components/league/HomeSectionTabs'
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

const getCachedMilestones = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeMilestones(sb, leagueId, { horizonDays: 30, maxUpcoming: 6, maxRecent: 6 })
    },
    // v3 (2026-07-19): 7/18 이벤트 points 백필이 API 우회로 실행돼 revalidateTag 미호출 →
    //                  캐시가 백필 이전 상태(변원식/천세원 100점을 6/27 로 잘못 표기) 로 pin 됨.
    //                  키 상향으로 강제 재계산 · 최근 30일 실제 crossings 6건 노출.
    ['home-milestones-v3', leagueId],
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

const getCachedAnnouncements = (leagueId: string) =>
  unstable_cache(
    async (): Promise<LeagueAnnouncement[]> => {
      const sb = createClient()
      const { data } = await sb
        .from('league_announcements')
        .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
        .eq('league_id', leagueId)
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(20)
      return (data ?? []) as LeagueAnnouncement[]
    },
    ['league-announcements-home', leagueId],
    { tags: [`league-${leagueId}-announcements`], revalidate: 300 },
  )

const getCachedHomeHighlights = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return computeHomeHighlights(sb, leagueId)
    },
    // v2 (2026-07-19): payload 스키마에 clutch_kind / opponent_name 필드 추가 → 캐시 강제 갱신
    ['home-clutch-shots-v2', leagueId],
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
    recentRounds,
    quarterStandings,
    leaderStats,
    initialPhotoMap,
    milestonesData,
    homeHighlights,
    announcements,
  ] = await Promise.all([
    getCachedLeagueMeta(leagueId, orgSlug)(),
    getCachedRecentRounds(leagueId, 4)(),
    getCachedQuarterStandings(leagueId)(),
    getCachedLeaderStats(leagueId)(),
    getCachedPhotoMap(leagueId)(),
    getCachedMilestones(leagueId)(),
    getCachedHomeHighlights(leagueId)(),
    getCachedAnnouncements(leagueId)(),
  ])

  if (!league) notFound()

  const l = league as League
  const otherLeagues = (allLeagues ?? []).filter(ol => ol.id !== leagueId)

  return (
    <div className="space-y-5 lg:space-y-4">
      {/* 헤더 — 리그명만 좌측 상단 (2026-07-21 클린업 · 진행중 배지 / 서브 라벨 삭제) */}
      <div className="relative court-bg rounded-2xl px-5 py-4 lg:px-6 lg:py-5 -mx-2 sm:mx-0 border border-gray-800/40">
        <h1
          className="font-jersey text-2xl sm:text-3xl lg:text-5xl font-bold text-white tracking-wide uppercase break-keep"
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.1 }}
        >
          {l.name}
        </h1>
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

      {/* 개인화 대시보드 · 로그인 상태에서만 노출 (client 컴포넌트가 자체 조건 렌더) */}
      <PersonalDashboard leagueId={leagueId} orgSlug={orgSlug} />

      {/* 상단 병렬 — 공지사항 · 마일스톤 (PC 2열 · 모바일 세로 순차 : 공지 → 마일스톤 · 2026-07-19) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5 items-start">
        <AnnouncementsHome leagueId={leagueId} initialAnnouncements={announcements} orgSlug={orgSlug} />
        <MilestoneFeed leagueId={leagueId} initialData={milestonesData} />
      </div>

      {/* 미라클모닝 브랜드 홈 — 팀 승률 · 최근 라운드 · 리그 리더 · 하이라이트를 탭으로 묶어
          스크롤 길이 단축 (2026-07-27). 활성 탭만 노출 · 기본=팀 승률(첫 방문 투어 타깃 보존). */}
      <HomeSectionTabs
        standings={
          <NbaTeamStandings
            standings={quarterStandings.standings}
            quarterLabel={quarterStandings.quarterLabel}
            gamesCount={quarterStandings.gamesCount}
          />
        }
        rounds={<NbaRoundsSummary rounds={recentRounds} leagueId={leagueId} orgSlug={orgSlug} />}
        leaders={
          <NbaLeaders
            leagueId={leagueId}
            initialPlayers={leaderStats.players}
            initialPhotoMap={initialPhotoMap}
          />
        }
        highlights={<HighlightsHome data={homeHighlights} orgSlug={orgSlug} leagueId={leagueId} />}
      />

      {/* 인터랙티브 튜토리얼 투어 — 첫 방문 자동 실행 · 헤더 물음표 재실행 */}
      <Suspense fallback={null}>
        <LeagueTourTrigger />
      </Suspense>
    </div>
  )
}
