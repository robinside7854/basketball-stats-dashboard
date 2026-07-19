// 커리어 마일스톤 · 시즌 하이라이트 — 하이라이트 우산 하위 페이지
// - 홈 위젯(MilestoneFeed) 은 상위 6/6 미니뷰, 이 페이지는 전체 리스트 (기본 40/40)
// - 최근 달성 카드에 ▶ 로 그 순간 클립 재생 (모달)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { ChevronLeft, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import MilestonesBrowser from '@/components/league/MilestonesBrowser'
import { computeMilestones } from '@/lib/stats/milestones'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      // 전체 페이지 — 큰 리미트로 로드 (홈 위젯의 6/6 보다 넉넉히)
      return computeMilestones(sb, leagueId, { horizonDays: 365, maxUpcoming: 60, maxRecent: 60 })
    },
    ['highlights-milestones-page-v2', leagueId],
    {
      tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`],
      revalidate: 60,
    },
  )

export default async function MilestonesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const base = `/league/${orgSlug}/${leagueId}`

  const { upcoming, recent } = await getCached(leagueId)()

  const groupTabs = [
    { href: `${base}/highlights`, label: '하이라이트', active: true },
  ]

  const isEmpty = upcoming.length === 0 && recent.length === 0

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
              누적 임계값 달성 순간 · 그 순간 영상 재생
            </p>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <EmptyState
          Icon={Trophy}
          title="아직 달성된 마일스톤이 없습니다"
          description="경기가 진행되면 임계값(100득점 · 25도움 등)에 도달한 순간을 자동으로 여기서 추적합니다."
        />
      ) : (
        <MilestonesBrowser leagueId={leagueId} upcoming={upcoming} recent={recent} />
      )}

      {/* 각주 */}
      {!isEmpty && (
        <p
          className="text-[11px] pt-2"
          style={{ color: 'var(--mm-muted)', lineHeight: 1.6 }}
        >
          <span className="font-bold">영상 없음</span> 배지는 유튜브 매핑 또는 타임스탬프 기록이 없어 재생 불가한 순간입니다.
          기록이 채워지면 자동으로 ▶ 활성화됩니다.
        </p>
      )}
    </div>
  )
}
