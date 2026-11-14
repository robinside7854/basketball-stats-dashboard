import Image from 'next/image'
import { clubLogoOf } from '@/lib/league/leagueLogo'
import RsvpHomeCard from '@/components/league/rsvp/RsvpHomeCard'
import AdminPassAlert from '@/components/league/wallet/AdminPassAlert'
import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { unstable_cache } from 'next/cache'
import { loadIdentityResolver, makeIdentityResolver } from '@/lib/stats/teamIdentity'
import { computeLeagueStats } from '@/lib/stats/leagueStats'

// 홈 페이지 공통 — teams/overrides 를 한 번만 로드해 3개 계산 함수(highlights/rounds/standings)에
// 재사용하기 위한 Promise 타입. 각 함수는 내부에서 await 로 값 참조.
type IdentityResolverPromise = Promise<ReturnType<typeof makeIdentityResolver>>
import ShareLeagueButton from '@/components/league/ShareLeagueButton'
import PendingSignupsAlert from '@/components/league/PendingSignupsAlert'
import type { RoundSummary, RoundTeamSummary, RoundGame } from '@/components/league/home/roundTypes'
// 홈 순위표(NbaTeamStandings)는 2026-11-02 운영진 결정으로 뺐다 — 팀 순위는 「기록 → 팀」 탭. 되돌리기: docs/renewal-rollback.md R6
import { type StandingRow } from '@/components/league/nba/NbaTeamStandings'
import { HomeMeProvider } from '@/components/league/home/HomeMeContext'
import { LastRoundTimeline } from '@/components/league/home/LastRound'
import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import DraftInProgressBanner from '@/components/league/home/DraftInProgressBanner'
import { getApprovedSession, isLeaguePrivateGated } from '@/lib/auth/guard'
import { fetchLeagueMode } from '@/lib/league/competitions'
import TournamentBoard from '@/components/league/TournamentBoard'
import { resolveTeamId } from '@/lib/league/teamScope'
import { pickRecentRounds } from '@/lib/league/recentRounds'
import type { League } from '@/types/league'
import { loadCurrentQuarter, gameDateRange } from '@/lib/league/currentQuarter'
import { computeTeamForm, computeGamesBehind, type FormGame } from '@/lib/stats/standings'
import { tallyDayRecord } from '@/lib/stats/dayRecord'

// 기록이 있는 최근 경기일 요약 — 홈 맨 위 경기일 카드(LastRoundTimeline) 용.
// 미라클모닝은 하루 = 1라운드 (여러 경기 진행). 팀별 W-L-득실차 + 슬롯 순 경기 목록.
// (2026-10-15) 홈 탭 「지난 경기일」(그 앞 3일)을 뺐으므로 하루만 만든다 — 지난 날짜는 일정 탭.
async function computeRecentRounds(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  resolverPromise: IdentityResolverPromise,
): Promise<RoundSummary[]> {
  const today = new Date().toISOString().slice(0, 10)

  // 게임 조회와 resolver await 를 병렬로
  const [{ data: games }, resolver] = await Promise.all([
    supabase
      .from('league_games')
      .select('id, date, slot_num, home_team_id, away_team_id, home_score, away_score, is_complete, is_exhibition, quarter_id, youtube_url, youtube_start_offset')
      .eq('league_id', leagueId)
      .eq('is_exhibition', false)
      .eq('is_complete', true)
      .lte('date', today)
      .order('date', { ascending: false })
      // ponytail: 날짜 창 대신 행 상한 — 하루 50경기를 넘기면 4번째 라운드가 잘릴 수 있다.
      //   그럴 일이 생기면 날짜만 먼저 뽑고 .in('date', dates) 로 2단 조회.
      .limit(200),
    resolverPromise,
  ])

  // 분기와 상관없이 기록이 있는 최근 RECENT_ROUNDS 일 (2026-10-12 사용자 요청).
  //   종전엔 지금 분기 경기만 골라서, 분기 첫 주에는 카드가 1장뿐이었다.
  //   팀명은 경기마다 (team_id, quarter_id) 로 풀리므로 지난 분기 날짜도 그때 팀명으로 나온다.
  const recent = pickRecentRounds(games ?? [], 1)

  const fmtWeek = (iso: string): string => {
    const d = new Date(iso + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  }

  const rounds: RoundSummary[] = []
  for (const [date, roundGames] of recent) {
    // 그날 팀 승패 — lib/stats/dayRecord.ts 한 벌(일정·하이라이트·박스스코어와 같은 규칙).
    //   이 조회는 이미 정규전·마감만이라 친선 처리는 탈 일이 없다.
    const toSide = (team_id: string | null, quarter_id: string | null) => {
      const id = resolver(team_id, quarter_id)
      return id ? { key: id.key, name: id.display_name, color: id.color } : null
    }
    const teams: RoundTeamSummary[] = tallyDayRecord((roundGames ?? []).map(g => ({
      home: toSide(g.home_team_id as string | null, g.quarter_id as string | null),
      away: toSide(g.away_team_id as string | null, g.quarter_id as string | null),
      home_score: g.home_score as number | null,
      away_score: g.away_score as number | null,
      is_complete: g.is_complete as boolean,
      is_exhibition: g.is_exhibition as boolean,
    }))).teams.map(t => ({ ...t, color: t.color ?? '#9ca3af' }))
    // 그날 경기를 슬롯 순서로 — 홈 「지난 토요일」 타임라인(2026-10-12). 위 집계와 같은 행·같은 resolver 라
    //   추가 쿼리가 없다. 친선전은 위 조회에서 이미 빠졌다(정규전은 대진 롤업이 일어나지 않으므로 슬롯 = 경기).
    const games: RoundGame[] = [...(roundGames ?? [])]
      .sort((a, b) => ((a.slot_num as number | null) ?? 999) - ((b.slot_num as number | null) ?? 999))
      .map(g => {
        const h = resolver(g.home_team_id as string | null, g.quarter_id as string | null)
        const a = resolver(g.away_team_id as string | null, g.quarter_id as string | null)
        return {
          id: g.id as string,
          slot_num: (g.slot_num as number | null) ?? null,
          home: h ? { name: h.display_name, color: h.color } : null,
          away: a ? { name: a.display_name, color: a.color } : null,
          home_score: (g.home_score as number) ?? 0,
          away_score: (g.away_score as number) ?? 0,
          youtube_url: (g.youtube_url as string | null) ?? null,
          youtube_start_offset: (g.youtube_start_offset as number | null) ?? 0,
        }
      })
    rounds.push({
      date,
      weekLabel: fmtWeek(date),
      gamesCount: (roundGames ?? []).length,
      teams,
      games,
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
  // 지금 분기 — 홈의 순위·리더가 같은 판정을 쓴다(최근 라운드는 2026-10-12 부터 분기 무관)(lib/league/currentQuarter.ts).
  const [currentQ, resolver] = await Promise.all([
    loadCurrentQuarter(supabase, leagueId),
    resolverPromise,
  ])

  let quarterLabel = '시즌 전체'
  let gameQuery = supabase
    .from('league_games')
    .select('id, date, slot_num, home_team_id, away_team_id, home_score, away_score, quarter_id')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)

  if (currentQ) {
    quarterLabel = currentQ.label
    // 기간이 있으면 날짜로 — 4분기 행을 만들기 전에 기록한 경기는 quarter_id 가 3분기로 박혀 있다
    const range = gameDateRange(currentQ)
    gameQuery = range
      ? gameQuery.gte('date', range.from).lte('date', range.to)
      : gameQuery.eq('quarter_id', currentQ.id)
  }

  const { data: games } = await gameQuery
  if (!games || games.length === 0) {
    return { standings: [], quarterLabel, gamesCount: 0 }
  }

  const teamAgg = new Map<string, StandingRow>()
  // 상대전적 — "우리 vs 저 팀" 을 팀키 쌍으로 쌓는다. 위 teamAgg 와 같은 루프에서
  // 채우므로 추가 쿼리가 없다(이 화면은 홈 첫 화면이라 왕복을 늘리면 안 된다).
  // 바깥키 = 나, 안쪽키 = 상대.
  const h2hAgg = new Map<string, Map<string, { wins: number; losses: number; draws: number }>>()
  const bumpH2H = (meKey: string, oppKey: string, result: 'w' | 'l' | 'd') => {
    let row = h2hAgg.get(meKey)
    if (!row) { row = new Map(); h2hAgg.set(meKey, row) }
    let rec = row.get(oppKey)
    if (!rec) { rec = { wins: 0, losses: 0, draws: 0 }; row.set(oppKey, rec) }
    if (result === 'w') rec.wins++
    else if (result === 'l') rec.losses++
    else rec.draws++
  }

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
        h2h: [],
      }
      teamAgg.set(id.key, t)
    }
    return t
  }

  // 팀명은 **이 분기 이름**으로 — 경기의 quarter_id 가 옛 분기로 박혀 있어도 순위표에 지난 분기
  //   팀명(락다운 등)이 섞이지 않게 한다. 이 표는 정의상 한 분기짜리다.
  const qidFor = (g: { quarter_id: unknown }) => currentQ?.id ?? (g.quarter_id as string | null)
  // 흐름(최근 5 · 연승/연패 · 최근 경기일) 입력 — 같은 루프에서 모은다(추가 쿼리 없음).
  //   이 조회는 한 분기 · 마감 · 정규전뿐이라 연승이 분기를 넘지 않는다(lib/stats/standings.ts).
  const formGames: FormGame[] = []
  for (const g of games) {
    const h = ensureTeam(g.home_team_id as string | null, qidFor(g))
    const a = ensureTeam(g.away_team_id as string | null, qidFor(g))
    if (!h || !a) continue
    formGames.push({
      date: g.date as string,
      slot: (g.slot_num as number | null) ?? null,
      homeKey: h.key, awayKey: a.key,
      homeScore: (g.home_score as number) ?? 0, awayScore: (g.away_score as number) ?? 0,
    })
    // 같은 팀끼리 잡힌 경기(데이터 이상 · 팀 통합 후 옛 경기 등)는 상대전적에서 뺀다.
    // 안 그러면 "자기 자신에게 1승 1패" 같은 항목이 생긴다.
    const isSelfMatch = h.key === a.key
    const hs = (g.home_score as number) ?? 0
    const as_ = (g.away_score as number) ?? 0
    h.ptsFor += hs; h.ptsAgainst += as_
    a.ptsFor += as_; a.ptsAgainst += hs
    if (hs > as_) {
      h.wins++; a.losses++
      if (!isSelfMatch) { bumpH2H(h.key, a.key, 'w'); bumpH2H(a.key, h.key, 'l') }
    } else if (hs < as_) {
      a.wins++; h.losses++
      if (!isSelfMatch) { bumpH2H(a.key, h.key, 'w'); bumpH2H(h.key, a.key, 'l') }
    } else {
      h.draws++; a.draws++
      if (!isSelfMatch) { bumpH2H(h.key, a.key, 'd'); bumpH2H(a.key, h.key, 'd') }
    }
  }

  const form = computeTeamForm(formGames)
  const standings: StandingRow[] = [...teamAgg.values()]
    .filter(t => t.wins + t.losses + t.draws > 0)
    .map(t => {
      const total = t.wins + t.losses + t.draws
      // 상대 이름은 teamAgg 에서 가져온다 — 분기 안에서 팀명이 바뀌어도 표시명이 한 곳에서만 정해진다.
      const h2h = [...(h2hAgg.get(t.key) ?? new Map())]
        .map(([oppKey, rec]) => ({
          key: oppKey,
          name: teamAgg.get(oppKey)?.name ?? '상대',
          ...(rec as { wins: number; losses: number; draws: number }),
        }))
        // 많이 이긴 상대부터 — 아무 순서나 두면 카드마다 상대 순서가 달라져 비교가 어렵다.
        .sort((x, y) => (y.wins - y.losses) - (x.wins - x.losses) || x.name.localeCompare(y.name, 'ko'))
      return { ...t, h2h, winRate: total > 0 ? +((t.wins / total) * 100).toFixed(1) : 0, form: form.get(t.key) ?? null }
    })
    .sort((a, b) => {
      if (b.winRate !== a.winRate) return b.winRate - a.winRate
      return (b.ptsFor - b.ptsAgainst) - (a.ptsFor - a.ptsAgainst)
    })
  const gb = computeGamesBehind(standings)
  for (const t of standings) t.gamesBehind = gb.get(t.key) ?? null

  return { standings, quarterLabel, gamesCount: games.length }
}

// B2: 재방문 시 즉시 응답용 unstable_cache 래퍼 3종.
//   - keyParts 에 leagueId 를 넣어 리그별 캐시 분리
//   - tags 는 향후 편집 API 완료 시 `revalidateTag('league-${leagueId}')` 로 무효화 (다음 iteration)
//   - revalidate 60s TTL — 편집 반영 지연 상한
// supabase / resolverPromise 는 클로저에서 재구성 (unstable_cache 는 serializable 인자만 허용)
const getCachedRecentRounds = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const resolverPromise = loadIdentityResolver(sb, leagueId)
      return computeRecentRounds(sb, leagueId, resolverPromise)
    },
    ['home-recent-rounds', leagueId, '1', 'all-quarters', 'v3-dayrecord'],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 홈 순위표는 R6 에서 뺐다(되돌리기용으로 남김)
const getCachedQuarterStandings = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const resolverPromise = loadIdentityResolver(sb, leagueId)
      return computeCurrentQuarterStandings(sb, leagueId, resolverPromise)
    },
    ['home-quarter-standings', leagueId, 'v2-form'],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )

// B2 확장: 리더/스트릭/마일스톤/포토맵도 캐시.
//   - 홈 SSR 프리페치 대상. 모든 캐시는 mutation route(events/games/players 등)의
//     `revalidateTag('league-${leagueId}[-games]')` 로 무효화됨.
//   - TTL 60s 상한. 편집 즉시 반영은 태그 무효화로 보장.
const getCachedLeaderStats = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      // 리그 리더는 **지금 분기** 기준 (2026-10-10 — 분기가 바뀌면 리더보드도 새로 시작한다).
      //   종전엔 시즌 누적이라 4분기가 돼도 3분기까지의 1위가 그대로 떠 있었다.
      const q = await loadCurrentQuarter(sb, leagueId)
      const range = q ? gameDateRange(q) : null
      const stats = await computeLeagueStats(sb, leagueId, {
        unit: 'round',
        ...(range ? { from: range.from, to: range.to } : q ? { quarterId: q.id } : {}),
      })
      return { ...stats, quarterLabel: q?.label ?? null, quarterId: q?.id ?? null }
    },
    ['home-leader-stats-q', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )

const getCachedPhotoMap = (leagueId: string) =>
  unstable_cache(
    async (): Promise<Record<string, string | null>> => {
      const sb = createClient()
      // 첫 방문자용 "명단 인원" 표시가 이 맵의 키 수를 쓴다 — 명단은 팀 소유이므로
      // team_id 로 세야 대회 전용으로 추가된 선수도 빠지지 않는다(이 페이지는 mode='league'
      // 일 때만 렌더되지만 팀 명단 소스는 어디서 보든 하나여야 한다).
      const teamId = await resolveTeamId(leagueId)
      const { data } = await sb
        .from('league_players')
        .select('id, photo_url')
        .eq('team_id', teamId)
      const map: Record<string, string | null> = {}
      for (const p of (data ?? []) as { id: string; photo_url: string | null }[]) {
        map[p.id] = p.photo_url
      }
      return map
    },
    ['home-photo-map', leagueId],
    { tags: [`league-${leagueId}`], revalidate: 3600 },
  )

const getCachedLeagueMeta = (leagueId: string, orgSlug: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      // 형제 묶음 목록(allLeagues)은 홈 대회 알약과 함께 2026-09-28 뺐다 — 상단 전환 칩이 담당.
      const { data: league } = await sb.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single()
      return { league }
    },
    ['home-league-meta', leagueId, orgSlug],
    { tags: [`league-${leagueId}`], revalidate: 3600 },
  )

// (2026-11-03 ISR Reads) 홈이 위 캐시 4개를 따로 읽으면 Vercel 이 방문 1회를 4회로 센다 — 10월에 무료 한도(100만)를
//   넘겨 사이트가 멈춘 원인 중 하나. 묶음 하나로 감싸 **방문 1회 = 캐시 읽기 1회**. 안쪽 캐시는 묶음이 비었을 때만
//   다시 읽힌다(그때도 안쪽이 살아 있으면 재계산 없이 채운다). 무효화 태그는 안쪽의 합집합.
//   순위표(getCachedQuarterStandings)는 홈에서 뺐으므로(R6) 여기 넣지 않는다.
const getCachedHome = (leagueId: string, orgSlug: string) =>
  unstable_cache(
    async () => {
      // 리그 리더·사진 묶음은 홈에서 리더 칸을 뺀 2026-11-08 부터 읽지 않는다(getCachedLeaderStats·getCachedPhotoMap 은 되돌리기용으로 남김)
      const [meta, recentRounds] = await Promise.all([
        getCachedLeagueMeta(leagueId, orgSlug)(),
        getCachedRecentRounds(leagueId)(),
      ])
      return { meta, recentRounds }
    },
    ['home-bundle-v2', leagueId, orgSlug],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 의 주석 참조.
  // layout 이 화면(children)은 이미 막지만, Next 가 layout·page 를 병렬 렌더하기 때문에
  // 이 아래 데이터 fetch 를 실제로 실행하기 전에 여기서도 먼저 끊어야 한다.
  //   2026-10-27 속도: mode 조회는 화면에 아무것도 내보내지 않으므로 잠금 확인과 같이 보낸다(차례로 기다리지 않게).
  const [gated, leagueMode] = await Promise.all([isLeaguePrivateGated(leagueId), fetchLeagueMode(leagueId)])
  if (gated) return null

  // 대회 묶음(mode='tournament')이면 대회 보드로 분기 — 리그 홈(순위표·라운드 중심)의
  // 무거운 프리페치 7종을 전혀 타지 않는다. mode 하나만 필요하므로 fetchTeamCompetitions
  // (형제 묶음 전체 + 묶음별 경기 수까지 가져옴, Task 1) 대신 전용 소형 헬퍼를 쓴다
  // (Task 3 브리프 지적 — 여기서 낭비하지 않는다). 리그(mode='league')면 아래 기존 로직이
  // 한 글자도 안 바뀐 채 그대로 실행된다 — 미라클 리그 홈은 지금과 완전히 동일해야 한다.
  if (leagueMode === 'tournament') {
    return <TournamentBoard leagueId={leagueId} orgSlug={orgSlug} />
  }

  // B2 확장: 리그 메타 + 홈 프리페치 7종을 모두 `unstable_cache` 로 감싸 병렬 실행.
  //   - 재방문 시 캐시 히트 → SSR 시간 대부분 제거.
  //   - 캐시 미스 시에도 Promise.all 로 병렬 → 순차 waterfall 없음.
  //   - 편집 API(events/games/players/quarters 등)가 `revalidateTag('league-${leagueId}[-games]')`
  //     로 무효화하므로 편집 반영 최대 지연은 순간(태그 무효화 후 다음 요청).
  const [
    { meta: { league }, recentRounds },
    approvedSession,
    draftLive,
  ] = await Promise.all([
    getCachedHome(leagueId, orgSlug)(),
    // 스탯 게이팅 — 쿠키 접근이라 unstable_cache 밖에서 호출 (2026-07-28)
    getApprovedSession(leagueId),
    // 진행 중인 드래프트가 있는가 — 한 줄 조회(캐시 밖: 시작·마감이 바로 보여야 한다). 띠는 어드민에게만 그린다.
    //   'setup'(만들고 시작 안 한 것)·리허설(is_test)은 뺀다 — 안 그러면 띠가 몇 주씩 떠 있는다.
    createClient()
      .from('league_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('is_test', false)
      .not('status', 'in', '(setup,completed)')
      .then(({ count }) => (count ?? 0) > 0, () => false),
  ])

  if (!league) notFound()

  const l = league as League
  const logo = await clubLogoOf(leagueId)
  // 스탯 게이팅 — 승인 회원만 리더보드·마일스톤·하이라이트 열람 (순위표·라운드는 공개)
  const isMember = !!approvedSession
  // 「지난 토요일」 = 기록이 있는 최근 경기일(최근 라운드 첫 카드와 같은 날)
  const latestRound = recentRounds[0] ?? null

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* 헤더 카드(팀 이름 · 멤버 수 · 공유)는 2026-10-26 뺐다(점검 MVP 1) — 첫 화면 1/5 을 쓰면서 정보가 없었다.
          그 자리에 회원 본인의 「지난 토요일 나」(MyLastDay)를 둔다. 공유 버튼은 맨 아래 줄로. */}
      {/* 동호회 로고 + 이름 한 줄(2026-11-08 운영진 — 미라클 로고). 10/26 에 뺀 큰 헤더 카드와 달리 한 줄(약 56px)만 쓴다.
          로고가 없는 리그는 종전처럼 제목을 화면 읽기용으로만 둔다. */}
      {/* 이용 가이드는 홈 오른쪽 위에서 바로(2026-11-14 운영진) */}
      <div className="flex items-center gap-3 px-1">
        {logo ? (
          <>
            <Image src={logo} alt="" width={56} height={56} priority className="shrink-0 w-12 h-12 lg:w-14 lg:h-14" />
            <h1 className="font-black break-keep leading-tight" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(20px, 5.5vw, 26px)', letterSpacing: '-0.01em' }}>{l.name}</h1>
          </>
        ) : (
          <h1 className="sr-only">{l.name}</h1>
        )}
        <Link href={`/league/${orgSlug}/${leagueId}/guide`}
          className="mm-press ml-auto shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3 text-sm font-bold whitespace-nowrap"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }}>
          <BookOpen className="w-4 h-4" aria-hidden />이용 가이드
        </Link>
      </div>

      {/* 가입 신청 대기 알림 — 어드민에게만, 대기 건이 있을 때만 보인다.
          지금까지 신청은 설정 탭 안에서만 보였는데 어드민이 설정에 들어갈 일은 드물어서,
          신청한 사람은 승인될 때까지 아무것도 못 보고 기다렸다. 가입률이 관문인 지금
          그 지연은 그대로 이탈이 된다. 참여신청 카드보다 위에 두는 이유는 이게
          '나만 처리할 수 있는 일'이기 때문이다. */}
      {/* 이번 주 참가신청(2026-11-09 운영진) — 월요일 0시에 저절로 열리고, 여기서 바로 참/불. 회원·어드민에게만, 일요일엔 안 보인다. */}
      <RsvpHomeCard leagueId={leagueId} base={`/league/${orgSlug}/${leagueId}`} />
      <PendingSignupsAlert leagueId={leagueId} />
      {/* 정규권 안 산 사람(어드민 전용 · 이번 달 + 20일부터 다음 달) — 2026-11-09 운영진 */}
      <AdminPassAlert leagueId={leagueId} base={`/league/${orgSlug}/${leagueId}`} />
      {draftLive && <DraftInProgressBanner orgSlug={orgSlug} leagueId={leagueId} />}

      {/* ── 홈 통합 개편 (2026-10-14) ────────────────────────────────────────────────
          순서: ① 지난 경기일(팀 성적 + 경기 타일 한 카드) → ② 이번 분기(순위 · 리더) → ③ 탭(하이라이트 · 마일스톤).
          · 「내 카드」를 뺐다(사용자 결정) — 로딩이 느렸고 내 기록은 하단 네비 「내 프로필」(/me)에 같은 것이 있다.
          · 「그날 팀 성적」 카드를 경기 목록 카드에 합쳤다 — 아래 「최근 라운드」 첫 장도 같은 날이라 세 번 보였다.
            (2026-10-15) 탭의 「지난 경기일」도 뺐다 — 일정 탭과 같은 목록이라 카드 아래 「전체 일정 보기 →」로 대신한다.
          · 마일스톤은 맨 아래 따로 있던 것을 탭으로 넣었다.
          개인 데이터(내 경기 노랑 표시)는 HomeMeProvider 가 **브라우저에서** 받는다 —
          이 페이지의 나머지는 unstable_cache(사용자 공용)라 개인 값이 거기 섞이면 안 된다. */}
      {latestRound && (
        <HomeMeProvider leagueId={leagueId} latestDate={latestRound.date} serverMember={isMember}>
          <div className="space-y-4 lg:space-y-5">
            <LastRoundTimeline round={latestRound} orgSlug={orgSlug} leagueId={leagueId} />
            {/* 「결과 단톡방에 공유」(AdminDayShare)는 2026-11-09 운영진 결정으로 뺐다 — 박스스코어 안 공유로 쓴다 */}
          </div>
        </HomeMeProvider>
      )}

      {/* 「이번 분기 · 리그 리더」(NbaLeaders)는 2026-11-08 뺐고, 그 자리의 「이번 달 우리 팀」(HomeMonthTeams)도
          2026-11-09 운영진 결정으로 뺐다(파일은 남김). 팀 구성은 참가신청 현황 · 명단 편집에서 본다. */}

      {/* 하이라이트 · 마일스톤 탭은 2026-10-26 뺐다(점검 MVP 3) — 클러치샷·마일스톤이 대부분의 주에 빈 카드였는데
          홈에서 가장 무거운 계산(24일치 경기·이벤트 전체 스캔)이었다. 그날 클립은 위 경기일 카드·「지난 토요일 나」의
          하이라이트 버튼이, 전체 모음은 하이라이트 탭이 맡는다. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Link
          href={`/league/${orgSlug}/${leagueId}/highlights`}
          className="mm-press inline-flex items-center gap-1 min-h-[44px] text-sm font-black"
          style={{ color: 'var(--mm-ink)' }}
        >
          하이라이트 모아 보기 <ArrowRight size={15} aria-hidden />
        </Link>
        <ShareLeagueButton leagueName={l.name} />
      </div>
    </div>
  )
}
