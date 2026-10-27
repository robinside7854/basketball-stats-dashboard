// 하이라이트 피드 — 탭 4개(경기별 · 명경기 · 커리어 마일스톤 · 베스트샷)와 선수별 화면을 한 피드로 (리뉴얼 4단계, 2026-10-12).
//
// 상태는 전부 URL 쿼리 — 링크 공유·뒤로가기가 그대로 된다. 칩 규칙은 HighlightsFeedChips 주석.
//   (없음)               날짜 카드 피드 — 누르면 ?date=
//   ?date=D[&player=P]   그날 클립 (재생기 고정 + 목록)            ← 옛 /highlights/[date]
//   ?player=P            그 선수 클립 (핀 지정 포함)               ← 옛 /highlights/player/[id]
//   ?f=best[&player=P]   베스트샷(핀) 클립                         ← 옛 /highlights/best-shots
//   ?f=classics          명경기                                     ← 옛 /highlights/classics
//   ?f=milestones        커리어 마일스톤                            ← 옛 /highlights/milestones
// 옛 주소는 각 page.tsx 가 이 피드로 redirect 한다(쿼리 보존 — 짧은 링크 /h/ 도 옛 주소를 가리킨다).
//
// 접근 — 옛 페이지들과 똑같이 둔다.
//   · 비공개 리그 미승인: raw HTML 누출 방지로 데이터 조회 전에 null (layout 이 게이트 화면을 그린다)
//   · 베스트샷: 공개 리그면 누구나(옛 best-shots 는 isLeaguePrivateGated 만 봤다)
//   · 그 밖의 전부: 승인 회원 전용(getApprovedSession) — 날짜 목록도 비회원에게는 싣지 않는다
// 캐시 — 옛 페이지들의 unstable_cache 키·태그를 그대로 쓴다. 개인 데이터(핀 상태·세션)는 캐시 밖.
// 「내 클립」 카드(2026-10-26) — 세션의 선수 id 로 기존 선수 피드 캐시(getPlayerCached, 키 = 선수)를 읽어
//   여기서 센다. 캐시 항목 자체는 「그 선수의 클립」이라 누가 보든 같고(승인 회원이면 누구 클립이든 볼 수 있다),
//   「누가 보고 있나」는 캐시에 들어가지 않는다.
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Film, PlayCircle, ChevronRight, Clock, VideoOff, Pin, Trophy, UserX } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import { ProgressBar } from '@/components/league/ui/viz'
import { Avatar } from '@/components/league/ui'
import PlayerName from '@/components/league/ui/PlayerName'
import SectionCard from '@/components/league/ui/SectionCard'
import { EmptyState } from '@/components/league/ui'
import HighlightsBrowser from '@/components/highlights/HighlightsBrowser'
import PlayerHighlightsBrowser from '@/components/highlights/PlayerHighlightsBrowser'
import HighlightsFeedChips, { type FeedKind, type FeedPlayerLabel } from '@/components/league/highlights/HighlightsFeedChips'
import { formatFeedDate } from '@/components/league/highlights/feedFormat'
import FeedKeyed from '@/components/league/highlights/FeedKeyed'
import MyClipsCard, { MarkMyClipsSeen } from '@/components/league/highlights/MyClipsCard'
import ClassicGameCard from '@/components/league/highlights/ClassicGameCard'
import PlayerMilestoneChart, { type PlayerMilestoneData } from '@/components/league/highlights/PlayerMilestoneChart'
import { loadRecentRounds, loadRoundDetail, loadPlayerHighlights, loadLeagueBestShots } from '@/lib/highlights/loader'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { tallyDayRecord, type DayRecord, type DayRecordGame } from '@/lib/stats/dayRecord'
import { computeClassicGames } from '@/lib/stats/classicGames'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import StatGate from '@/components/league/auth/StatGate'
import { getApprovedSession, isLeaguePrivateGated } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'

// ── 날짜 카드 W-L 뱃지 ──────────────────────────────────────────
// 규칙은 lib/stats/dayRecord.ts 한 벌 — 홈·일정·박스스코어와 같다(2026-10-15):
//   친선전 제외(친선전뿐인 날은 친선전으로 세고 「친선」 표시) · 정체성 키로 묶음 · 승률 → 득실.
//   (종전엔 친선 포함 · 승 순이라 같은 날 홈과 승패가 달랐다.) 날짜 카드 자체는 친선 날도 그대로 남는다.
async function computeRoundRecords(
  supabase: SupabaseClient,
  leagueId: string,
  dates: string[],
): Promise<Record<string, DayRecord>> {
  if (dates.length === 0) return {}
  const [{ data: games }, resolver] = await Promise.all([
    supabase
      .from('league_games')
      .select('date, home_team_id, away_team_id, home_score, away_score, quarter_id, is_exhibition')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
      .in('date', dates),
    loadIdentityResolver(supabase, leagueId),
  ])
  const byDate: Record<string, DayRecordGame[]> = {}
  const side = (teamId: string | null, quarterId: string | null) => {
    const id = resolver(teamId, quarterId)
    return id ? { key: id.key, name: id.display_name, color: id.color } : null
  }
  for (const g of (games ?? []) as Array<{
    date: string
    home_team_id: string | null
    away_team_id: string | null
    home_score: number | null
    away_score: number | null
    quarter_id: string | null
    is_exhibition: boolean | null
  }>) {
    (byDate[g.date] ??= []).push({
      home: side(g.home_team_id, g.quarter_id),
      away: side(g.away_team_id, g.quarter_id),
      home_score: g.home_score,
      away_score: g.away_score,
      is_exhibition: g.is_exhibition,
    })
  }
  return Object.fromEntries(Object.entries(byDate).map(([date, gs]) => [date, tallyDayRecord(gs)]))
}

// ── 캐시 (옛 페이지들과 같은 키·태그) ──────────────────────────────
const getLandingCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      // 시즌 전체 날짜 (한 시즌 최대 ~50 · 여유롭게 60)
      const rounds = await loadRecentRounds(sb, leagueId, 60)
      const records = await computeRoundRecords(sb, leagueId, rounds.map(r => r.date))
      return { rounds, records }
    },
    // v4: 카드 썸네일(thumb_video_id) 추가 · v5: 승패 = dayRecord(친선 제외)
    ['highlights-landing-v5', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 3600 },
  )

const getRoundCached = (leagueId: string, date: string) =>
  unstable_cache(
    async () => loadRoundDetail(createClient(), leagueId, date),
    ['highlights-round-detail', leagueId, date],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 3600 },
  )

const getPlayerCached = (leagueId: string, playerId: string) =>
  unstable_cache(
    async () => loadPlayerHighlights(createClient(), leagueId, playerId),
    ['highlights-player-page', leagueId, playerId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-events`, `league-${leagueId}-players-${playerId}`], revalidate: 3600 },
  )

const getBestCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const detail = await loadLeagueBestShots(sb, leagueId)
      const pids = detail.players.map(p => p.id)
      let photoMap: Record<string, string | null> = {}
      if (pids.length > 0) {
        const { data } = await sb.from('league_players').select('id, photo_url').in('id', pids)
        photoMap = Object.fromEntries(((data ?? []) as Array<{ id: string; photo_url: string | null }>).map(r => [r.id, r.photo_url]))
      }
      return { ...detail, photoMap }
    },
    ['highlights-best-shots-v2', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-events`, `league-${leagueId}-pins`], revalidate: 3600 },
  )

const getClassicsCached = (leagueId: string) =>
  unstable_cache(
    async () => computeClassicGames(null, leagueId),
    ['league-classics-page', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 300 },
  )

const getMilestonesCached = (leagueId: string) =>
  unstable_cache(
    async (): Promise<PlayerMilestoneData[]> => {
      const sb = createClient()
      const { players } = await computeLeagueStats(sb, leagueId)
      const { data: pMeta } = await sb
        .from('league_players')
        .select('id, is_guest')
        .eq('league_id', leagueId)
      const guestIds = new Set(((pMeta ?? []) as Array<{ id: string; is_guest: boolean | null }>).filter(p => p.is_guest).map(p => p.id))
      return players
        .filter(p => !guestIds.has(p.player_id))
        .map(p => ({
          player_id: p.player_id, name: p.name, number: p.number, position: p.position,
          photo_url: p.photo_url ?? null,
          pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk,
        }))
    },
    ['highlights-milestones-players-v1', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 3600 },
  )

// 선수 칩 이름 — 팀 소유 명단에서(league_id 로 찾으면 대회 묶음에서 0명). 캐시 밖, 한 행.
async function loadPlayerLabel(leagueId: string, playerId: string): Promise<FeedPlayerLabel | null> {
  const sb = createClient()
  const teamId = await resolveTeamId(leagueId)
  const { data } = await sb
    .from('league_players')
    .select('id, name, number, photo_url')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  const r = data as { id: string; name: string; number: number | string | null; photo_url: string | null } | null
  if (!r) return null
  const n = r.number == null || r.number === '' ? null : Number(r.number)
  return { id: r.id, name: r.name, number: Number.isFinite(n) ? n : null, photo_url: r.photo_url }
}

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return s && s.length <= 64 ? s : null
}

const GATE_COPY: Record<Exclude<FeedKind, 'best'>, { title: string; description: string }> = {
  all:        { title: '하이라이트는 회원 전용', description: '클러치샷·경기 클립 영상은 가입 승인된 회원만 볼 수 있어요.' },
  classics:   { title: '명경기는 회원 전용',     description: '월별 명경기와 선정 이유는 가입 승인된 회원만 볼 수 있어요.' },
  milestones: { title: '마일스톤은 회원 전용',   description: '선수들의 누적 기록 추적은 가입 승인된 회원만 볼 수 있어요.' },
}

export default async function HighlightsFeedPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { orgSlug, leagueId } = await params
  const sp = await searchParams

  // 비공개 리그 raw HTML 누출 방지 — layout 만 막으면 page 가 병렬 렌더돼 RSC 청크로 샌다.
  if (await isLeaguePrivateGated(leagueId)) return null

  const fRaw = one(sp.f)
  const kind: FeedKind = fRaw === 'best' || fRaw === 'classics' || fRaw === 'milestones' ? fRaw : 'all'
  const dateRaw = one(sp.date)
  const date = kind === 'all' && dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : null
  const playerRaw = one(sp.player)
  const playerId = kind === 'all' || kind === 'best' ? playerRaw : null

  const base = `/league/${orgSlug}/${leagueId}`
  const hl = `${base}/highlights`
  const session = await getApprovedSession(leagueId)
  const approved = !!session
  const meId = session?.pid ?? null

  // 날짜 시트 — 클립이 있는 날만. 비회원에게는 날짜 목록도 싣지 않는다(옛 랜딩과 같은 문).
  const landing = approved ? await getLandingCached(leagueId)() : null
  const days = (landing?.rounds ?? []).filter(r => r.status === 'ready').map(r => ({ date: r.date, clips: r.clips_count }))

  // 선수 모드는 로더가 이름을 주므로 따로 묻지 않는다
  const playerData = approved && kind === 'all' && !date && playerId ? await getPlayerCached(leagueId, playerId)() : null
  const knownPlayer: FeedPlayerLabel | null = playerData
    ? { id: playerData.player.id, name: playerData.player.name, number: playerData.player.number, photo_url: playerData.player.photo_url }
    : playerId ? await loadPlayerLabel(leagueId, playerId) : null

  const header = (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Film size={24} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
        <h1 className="font-black text-2xl lg:text-3xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          하이라이트
        </h1>
      </div>
      <HighlightsFeedChips leagueId={leagueId} days={days} knownPlayer={knownPlayer} />
    </div>
  )

  if (kind !== 'best' && !approved) {
    return (
      <div className="space-y-4 mm-brand">
        {header}
        <StatGate fullPage {...GATE_COPY[kind]} />
      </div>
    )
  }

  let body: React.ReactNode

  if (kind === 'best') {
    const detail = await getBestCached(leagueId)()
    const pinner = playerId ? detail.players.find(p => p.id === playerId) ?? null : null
    if (detail.clips.length === 0) {
      body = (
        <EmptyState
          icon={Pin}
          title="아직 핀한 베스트샷이 없어요"
          description="선수 하이라이트 재생기 아래 농구공 슬롯(1/2/3)에서 내 베스트샷을 핀하면 여기에 모여요."
        />
      )
    } else if (playerId && !pinner) {
      body = (
        <EmptyState
          icon={Pin}
          title={`${knownPlayer?.name ?? '이 선수'}의 베스트샷이 아직 없어요`}
          description="선수 하이라이트에서 농구공 슬롯(1/2/3)으로 핀하면 여기에 모여요."
          action={<FeedLinks links={[
            { href: `${hl}?player=${encodeURIComponent(playerId)}`, label: '이 선수 클립 보기' },
            { href: `${hl}?f=best`, label: '모든 베스트샷' },
          ]} />}
        />
      )
    } else {
      body = (
        <>
          <ModeLine
            title={pinner ? <><PlayerName id={pinner.id} name={pinner.name} hitArea={false} /> · 베스트샷</> : '베스트샷'}
            sub={pinner ? `직접 핀한 시그니처 샷 ${pinner.count}개` : `선수들이 직접 핀한 시그니처 샷 · ${detail.players.length}명 · ${detail.clips.length}개 클립`}
            avatar={pinner ? { src: detail.photoMap[pinner.id] ?? null, name: pinner.name } : null}
          />
          <FeedKeyed>
            <HighlightsBrowser detail={detail} feed={{ preserveParams: ['f'] }} />
          </FeedKeyed>
        </>
      )
    }
  } else if (kind === 'classics') {
    const games = await getClassicsCached(leagueId)()
    body = (
      <>
        <ModeLine title="명경기" sub={`월별 1경기 · ${games.length}개월`} />
        {/* 기준을 화면에 적어 둔다. 왜 이 경기가 뽑혔는지 설명할 수 없으면 목록을 신뢰하지 않는다. */}
        <SectionCard variant="standalone" pad="base">
          <div className="text-sm leading-relaxed" style={{ color: 'var(--mm-ink-soft)' }}>
            <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>뽑는 방법 · </span>
            위닝샷 · 역전 3회 이상 · 2점 차 이내 · 총 38점 이상 — 이 넷 중{' '}
            <b style={{ color: 'var(--mm-ink)' }}>3개 이상</b>을 채운 경기를 그 달의 명경기로 골라요.
            3개를 채운 경기가 없는 달은 2개로 낮춰요. 같은 조건이면{' '}
            <b style={{ color: 'var(--mm-ink)' }}>위닝샷 → 역전 → 점수차 → 총득점</b> 순으로 앞서요.
          </div>
        </SectionCard>
        {games.length === 0 ? (
          <EmptyState icon={Trophy} title="아직 명경기가 없어요" description="경기가 쌓이면 달마다 한 경기씩 자동으로 골라요." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {games.map(g => <ClassicGameCard key={g.gameId} g={g} leagueId={leagueId} />)}
          </div>
        )}
      </>
    )
  } else if (kind === 'milestones') {
    const players = await getMilestonesCached(leagueId)()
    body = (
      <>
        <ModeLine title="커리어 마일스톤" sub="선수별 5대 지표 진행도 · 리그 기록에 맞춰 눈금이 늘어나요" />
        {players.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="아직 활동 기록이 없어요"
            description="경기가 진행되면 선수마다 누적 득점·리바운드·어시스트·스틸·블록 진행도가 여기 보여요."
          />
        ) : (
          <PlayerMilestoneChart players={players} orgSlug={orgSlug} leagueId={leagueId} />
        )}
      </>
    )
  } else if (date) {
    const detail = await getRoundCached(leagueId, date)()
    const playerMissing = !!playerId && !detail.clips.some(c => c.player_id === playerId)
    body = (
      <>
        <ModeLine
          title={formatFeedDate(date, true)}
          sub={`${detail.clips.length}개 클립 · ${detail.players.length}명 선수 · ${detail.teams.length}팀`}
        />
        {detail.clips.length === 0 ? (
          <EmptyState icon={Film} title="이 날에는 하이라이트가 없어요" description="YouTube 영상이 연결되고 영상 시각이 기록된 득점 장면만 보여요." />
        ) : playerMissing ? (
          <EmptyState
            icon={UserX}
            title={`이 날 ${knownPlayer?.name ?? '이 선수'}의 클립이 없어요`}
            action={<FeedLinks links={[
              { href: `${hl}?date=${date}`, label: '이 날 전체 클립' },
              { href: `${hl}?player=${encodeURIComponent(playerId!)}`, label: '이 선수 전체 클립' },
            ]} />}
          />
        ) : (
          <FeedKeyed>
            <HighlightsBrowser detail={detail} feed={{ preserveParams: ['date'] }} />
          </FeedKeyed>
        )}
      </>
    )
  } else if (playerId) {
    if (!playerData) {
      body = <EmptyState icon={UserX} title="선수를 찾을 수 없어요" description="명단에서 빠졌거나 잘못된 링크예요. 위 「선수」에서 다시 골라 주세요." />
    } else {
      // 핀 상태 · 편집 UI 초기값 (개인 상태라 캐시 밖). team_id 로 소속 확인 — 명단은 팀 소유.
      const sb = createClient()
      const teamId = await resolveTeamId(leagueId)
      const { data: pinRow } = await sb
        .from('league_players')
        .select('pinned_event_ids')
        .eq('id', playerId)
        .eq('team_id', teamId)
        .maybeSingle()
      const pinnedEventIds = (pinRow as { pinned_event_ids: string[] | null } | null)?.pinned_event_ids ?? []
      const p = playerData.player
      body = (
        <>
          <ModeLine
            title={<>{p.number != null ? `#${p.number} ` : ''}<PlayerName id={p.id} name={p.name} hitArea={false} /></>}
            sub={[
              `총 ${playerData.clips.length}개 클립`,
              playerData.quarters.length > 0 ? `${playerData.quarters.length}분기` : null,
              playerData.shotTypes.length > 0 ? `${playerData.shotTypes.length}유형` : null,
            ].filter(Boolean).join(' · ')}
            avatar={{ src: p.photo_url, name: p.name }}
          />
          {playerData.clips.length === 0 ? (
            <EmptyState icon={Film} title="이 선수의 하이라이트가 없어요" description="YouTube 영상이 연결되고 영상 시각이 기록된 득점 장면만 보여요." />
          ) : (
            <FeedKeyed>
              {playerId === meId && (() => {
                const m = summarizeMyClips(playerData)
                return m ? <MarkMyClipsSeen leagueId={leagueId} date={m.date} /> : null
              })()}
              <PlayerHighlightsBrowser
                player={p}
                clips={playerData.clips}
                quarters={playerData.quarters}
                shotTypes={playerData.shotTypes}
                orgSlug={orgSlug}
                leagueId={leagueId}
                initialPinnedEventIds={pinnedEventIds}
                feed={{ preserveParams: ['player'] }}
              />
            </FeedKeyed>
          )}
        </>
      )
    }
  } else {
    // 날짜 카드 격자 첫 칸 — 내 클립이 있는 가장 최근 경기일과 그날 클립 수 (선수 피드와 같은 클립 정의)
    const mine = meId ? summarizeMyClips(await getPlayerCached(leagueId, meId)().catch(() => null)) : null
    const lead = mine ? (
      <MyClipsCard
        leagueId={leagueId}
        href={`${hl}?player=${encodeURIComponent(meId!)}`}
        date={mine.date}
        count={mine.count}
        thumbVideoId={mine.thumbVideoId}
      />
    ) : null
    body = <DayCards hl={hl} rounds={landing?.rounds ?? []} records={landing?.records ?? {}} lead={lead} />
  }

  return (
    <div className="space-y-4 mm-brand">
      {header}
      {body}
    </div>
  )
}

// ── 조각들 ─────────────────────────────────────────────────────────

/** 선수 피드에서 「가장 최근 경기일 · 그날 클립 수 · 썸네일 영상」 — 클립이 없으면 null */
function summarizeMyClips(
  data: { clips: Array<{ game_date?: string; video_id: string }> } | null,
): { date: string; count: number; thumbVideoId: string | null } | null {
  if (!data) return null
  let date: string | null = null
  for (const c of data.clips) if (c.game_date && (!date || c.game_date > date)) date = c.game_date
  if (!date) return null
  const day = data.clips.filter(c => c.game_date === date)
  return { date, count: day.length, thumbVideoId: day.find(c => c.video_id)?.video_id ?? null }
}

function ModeLine({ title, sub, avatar }: { title: React.ReactNode; sub?: string; avatar?: { src: string | null; name: string } | null }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      {avatar && <Avatar src={avatar.src} name={avatar.name} size={40} decorative />}
      <div className="min-w-0">
        <h2 className="font-black text-lg lg:text-xl break-keep leading-snug" style={{ color: 'var(--mm-ink)' }}>{title}</h2>
        {sub && <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--mm-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

function FeedLinks({ links }: { links: Array<{ href: string; label: string }> }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {links.map(l => (
        <Link
          key={l.href}
          href={l.href}
          className="mm-press inline-flex items-center gap-1 min-h-11 px-4 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
          style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          {l.label} <ChevronRight size={14} aria-hidden />
        </Link>
      ))}
    </div>
  )
}

type LandingRound = Awaited<ReturnType<ReturnType<typeof getLandingCached>>>['rounds'][number]

function DayCards({ hl, rounds, records, lead }: { hl: string; rounds: LandingRound[]; records: Record<string, DayRecord>; lead?: React.ReactNode }) {
  if (rounds.length === 0 && !lead) {
    return (
      <EmptyState
        icon={Film}
        title="아직 경기한 날이 없어요"
        description="경기가 시작되면 날짜가 여기 보이고, 영상과 기록이 끝나면 바로 재생할 수 있어요."
      />
    )
  }
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lead}
        {rounds.map(r => {
          const isReady = r.status === 'ready'
          const isPendingRecord = r.status === 'pending_record'
          const teamRecords = records[r.date]?.teams ?? []
          const exhibitionOnly = records[r.date]?.exhibitionOnly ?? false
          const StatusIcon = isReady ? PlayCircle : isPendingRecord ? Clock : VideoOff
          const statusLabel = isReady ? null : isPendingRecord ? '기록 대기 중' : '영상 없음'
          const statusHint = isReady ? null : isPendingRecord
            ? '영상은 있지만 아직 장면 기록이 없어요'
            : '아직 영상이 올라오지 않았어요'
          const cardStyle: React.CSSProperties = {
            background: 'var(--mm-panel)',
            border: '1px solid var(--mm-rule)',
            borderRadius: 'var(--mm-radius-card)',
          }

          const inner = (
            <>
              {/* 썸네일 — 그날 첫 경기 대표 영상. 없으면 상태 아이콘 */}
              <div className="relative aspect-video overflow-hidden" style={{ background: 'var(--mm-panel-alt)', opacity: isReady ? 1 : 0.6 }}>
                {r.thumb_video_id ? (
                  // eslint-disable-next-line @next/next/no-img-element -- YouTube 썸네일(외부 호스트)
                  <img
                    src={`https://i.ytimg.com/vi/${r.thumb_video_id}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : null}
                <span className="absolute inset-0 flex items-center justify-center" style={{ background: r.thumb_video_id ? 'rgba(0,0,0,0.25)' : undefined }} aria-hidden>
                  <StatusIcon
                    size={40}
                    strokeWidth={1.75}
                    style={{ color: isReady ? 'var(--mm-yellow)' : 'var(--mm-muted)' }}
                    className={isReady ? 'transition-transform group-hover:scale-110 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]' : ''}
                  />
                </span>
                {isReady && (
                  <span
                    className="absolute bottom-2 right-2 text-xs font-bold px-2 py-0.5 tabular-nums"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
                  >
                    {r.clips_count}클립
                  </span>
                )}
              </div>

              <div className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-black text-lg" style={{ color: isReady ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>
                    {formatFeedDate(r.date, true)}
                  </div>
                  {statusLabel && (
                    <span
                      className="shrink-0 text-xs font-semibold px-2 py-0.5"
                      style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
                    >
                      {statusLabel}
                    </span>
                  )}
                </div>
                {statusHint && (
                  <p className="text-xs font-medium break-keep" style={{ color: 'var(--mm-muted)' }}>{statusHint}</p>
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--mm-muted)' }}>
                    경기 영상 <b className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>{r.games_with_video}</b>/{r.games_count}
                  </span>
                  {r.games_count > 0 && (
                    <ProgressBar
                      value={r.games_with_video}
                      max={r.games_count}
                      height={5}
                      className="flex-1 max-w-24"
                      label={`${r.games_count}경기 중 ${r.games_with_video}경기 영상`}
                    />
                  )}
                </div>

                {teamRecords.length > 0 ? (
                  // 팀별 W-L — 이긴 팀 노랑
                  <div className="flex items-center gap-1 flex-wrap">
                    {exhibitionOnly && (
                      <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>친선</span>
                    )}
                    {teamRecords.slice(0, 6).map(t => {
                      const isWinner = t.wins > t.losses
                      const rec = t.draws > 0 ? `${t.wins}-${t.losses}-${t.draws}` : `${t.wins}-${t.losses}`
                      return (
                        <span
                          key={t.key}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5"
                          style={{
                            background: isWinner ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                            color: isWinner ? 'var(--mm-black)' : 'var(--mm-muted)',
                            border: `1px solid ${isWinner ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                            borderRadius: 'var(--mm-radius-chip)',
                            lineHeight: 1.2,
                          }}
                          aria-label={`${t.name} ${rec}`}
                        >
                          <span className="max-w-[6em] truncate" title={t.name}>{t.name}</span>
                          <span className="tabular-nums font-bold">{rec}</span>
                        </span>
                      )
                    })}
                    {teamRecords.length > 6 && (
                      <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>+{teamRecords.length - 6}</span>
                    )}
                  </div>
                ) : r.team_names.length > 0 ? (
                  <div className="text-xs truncate" title={r.team_names.join(' · ')} style={{ color: 'var(--mm-muted)' }}>
                    {r.team_names.slice(0, 4).join(' · ')}
                    {r.team_names.length > 4 ? ` +${r.team_names.length - 4}` : ''}
                  </div>
                ) : null}
              </div>
            </>
          )

          return isReady ? (
            <Link
              key={r.date}
              href={`${hl}?date=${r.date}`}
              scroll
              className="group block overflow-hidden mm-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={cardStyle}
              aria-label={`${formatFeedDate(r.date, true)} 하이라이트 재생 (${r.clips_count}개 클립)`}
            >
              {inner}
            </Link>
          ) : (
            <div key={r.date} className="block overflow-hidden" style={cardStyle}>
              {inner}
            </div>
          )
        })}
      </div>
      {rounds.some(r => r.status !== 'ready') && (
        <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)', lineHeight: 1.6 }}>
          <span className="font-bold">클립</span>은 영상 속 시각이 함께 기록된 득점 장면만 세요. 영상이 없는 경기는 재생할 수 없어요.
        </p>
      )}
    </>
  )
}
