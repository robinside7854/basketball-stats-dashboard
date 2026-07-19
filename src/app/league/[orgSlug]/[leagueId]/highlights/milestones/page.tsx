// 커리어 마일스톤 — 선수별 5대 지표 진행도 뷰 (2026-07-19 재설계)
//   · 이전: upcoming/recent 리스트 (MilestonesBrowser)
//   · 신규: 선수별 카드 · PTS/REB/AST/STL/BLK 세로 막대 · 임계값 자동 확장
// 상위: 하이라이트 우산 · 서브탭 3 (경기별 하이라이트 · 커리어 마일스톤 · 베스트샷)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { ChevronLeft, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import PlayerMilestoneChart, { type PlayerMilestoneData } from '@/components/league/highlights/PlayerMilestoneChart'
import { computeLeagueStats } from '@/lib/stats/leagueStats'

const getCachedPlayerStats = (leagueId: string) =>
  unstable_cache(
    async (): Promise<PlayerMilestoneData[]> => {
      const sb = createClient()
      // 시즌 전체 누적 (필터 없음) · 게스트 제외는 아래에서
      const { players } = await computeLeagueStats(sb, leagueId)
      // is_guest 정보 필요 → league_players 에서 조회
      const { data: pMeta } = await sb
        .from('league_players')
        .select('id, is_guest')
        .eq('league_id', leagueId)
      const guestIds = new Set(((pMeta ?? []) as Array<{ id: string; is_guest: boolean | null }>).filter(p => p.is_guest).map(p => p.id))
      return players
        .filter(p => !guestIds.has(p.player_id))
        .map(p => ({
          player_id: p.player_id,
          name: p.name,
          number: p.number,
          position: p.position,
          photo_url: p.photo_url ?? null,
          pts: p.pts,
          reb: p.reb,
          ast: p.ast,
          stl: p.stl,
          blk: p.blk,
        }))
    },
    ['highlights-milestones-players-v1', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const base = `/league/${orgSlug}/${leagueId}`

  const players = await getCachedPlayerStats(leagueId)()

  const groupTabs = [
    { href: `${base}/highlights`,             label: '경기별 하이라이트', active: false },
    { href: `${base}/highlights/milestones`,  label: '커리어 마일스톤',  active: true },
    { href: `${base}/highlights/best-shots`,  label: '베스트샷',         active: false },
  ]

  const isEmpty = players.length === 0

  return (
    <div className="space-y-4 mm-brand">
      <LeagueGroupTabs tabs={groupTabs} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`${base}/highlights`}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer transition-colors"
            style={{
              background: 'var(--mm-panel)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-ink-soft)',
              borderRadius: '4px',
            }}
            aria-label="하이라이트 랜딩으로"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Trophy size={22} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
              <h1
                className="font-jersey font-black uppercase text-2xl lg:text-3xl truncate"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                커리어 <span style={{ color: 'var(--mm-yellow-strong)' }}>마일스톤</span>
              </h1>
            </div>
            <p
              className="text-[11px] lg:text-xs mt-1 font-bold uppercase"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
            >
              선수별 5대 지표 진행도 · 임계값 자동 확장
            </p>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          Icon={Trophy}
          title="아직 활동 기록이 없습니다"
          description="경기가 진행되면 각 선수의 누적 PTS · REB · AST · STL · BLK 진행도가 여기 표시됩니다."
        />
      ) : (
        <PlayerMilestoneChart
          players={players}
          orgSlug={orgSlug}
          leagueId={leagueId}
        />
      )}

      {/* 각주 */}
      {!isEmpty && (
        <p
          className="text-[11px] pt-2"
          style={{ color: 'var(--mm-muted)', lineHeight: 1.6 }}
        >
          <span className="font-bold">임계값</span>은 각 지표의 기본 사다리 (예: PTS 100·250·500·1000·2000) 에서 시작하며,
          리그 최다치가 상한을 넘어서면 자동으로 두 배씩 확장됩니다.
        </p>
      )}
    </div>
  )
}
