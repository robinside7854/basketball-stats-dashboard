import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import HighlightBanner, { type HighlightPlayer } from '@/components/league/HighlightBanner'
import LeagueLeadersGrid from '@/components/league/LeagueLeadersGrid'
import StreakSpotlight from '@/components/league/StreakSpotlight'
import MilestoneFeed from '@/components/league/MilestoneFeed'
import ClutchLeadersCard from '@/components/league/ClutchLeadersCard'
import type { League } from '@/types/league'

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

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const supabase = createClient()

  const [{ data: league }, { data: allLeagues }, highlights] = await Promise.all([
    supabase.from('leagues').select('*').eq('id', leagueId).eq('org_slug', orgSlug).single(),
    supabase.from('leagues').select('id, name, status, season_year').eq('org_slug', orgSlug).order('created_at', { ascending: false }),
    computeHighlights(supabase, leagueId, 7),
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

      {/* 이 주의 하이라이트 (최근 7일 MVP + Hot Hand) */}
      <HighlightBanner
        leagueId={leagueId}
        mvp={highlights.mvp}
        hotHand={highlights.hotHand}
        dateRangeLabel={highlights.rangeLabel}
      />

      {/* 리그 리더 카드 그리드 (8개 카테고리 Top-5) */}
      <LeagueLeadersGrid leagueId={leagueId} />

      {/* 스토리텔링 — 진행 중 연속 기록 + 커리어 마일스톤 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <StreakSpotlight leagueId={leagueId} maxEntries={8} />
        <MilestoneFeed leagueId={leagueId} />
      </div>

      {/* 클러치 리더 — 마지막 2분·3점 이내 접전 상황 */}
      <ClutchLeadersCard leagueId={leagueId} maxEntries={6} />
    </div>
  )
}
