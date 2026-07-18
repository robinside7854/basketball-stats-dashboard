// 베스트샷 릴 — 핀을 지정한 모든 선수의 베스트샷 모음 (Server 로드 → HighlightsBrowser 재사용)
// 진입: 하이라이트 랜딩 카드 · 선수 chip 으로 "누가 핀했는지" 한눈에 확인 + 선수별 필터
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { ChevronLeft, Pin } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import HighlightsBrowser from '@/components/highlights/HighlightsBrowser'
import { NumberedBasketball } from '@/components/league/BasketballIcons'
import { loadLeagueBestShots } from '@/lib/highlights/loader'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadLeagueBestShots(sb, leagueId)
    },
    ['highlights-best-shots', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-events`, `league-${leagueId}-pins`], revalidate: 60 },
  )

export default async function BestShotsReelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const base = `/league/${orgSlug}/${leagueId}`
  const detail = await getCached(leagueId)()

  const groupTabs = [
    { href: `${base}/stathead`,   label: 'Stathead',  active: false },
    { href: `${base}/highlights`, label: '하이라이트', active: true },
  ]

  return (
    <div className="space-y-4 mm-brand">
      <LeagueGroupTabs tabs={groupTabs} />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`${base}/highlights`}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer transition-colors"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', borderRadius: '4px' }}
            aria-label="하이라이트 목록으로"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-0.5" aria-hidden>
                <NumberedBasketball size={20} number={1} filled />
                <NumberedBasketball size={20} number={2} filled />
                <NumberedBasketball size={20} number={3} filled />
              </span>
              <h1
                className="font-jersey font-black uppercase text-2xl lg:text-3xl truncate"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                베스트샷 릴
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              선수들이 직접 핀한 시그니처 샷 · {detail.players.length}명 · {detail.clips.length}개 클립 · 등번호 순 연속재생
            </p>
          </div>
        </div>
      </div>

      {detail.clips.length === 0 ? (
        <EmptyState
          Icon={Pin}
          title="아직 핀된 베스트샷이 없습니다"
          description="선수 하이라이트 페이지 재생기 하단의 농구공 슬롯(1/2/3)에서 내 베스트샷을 핀하면 여기에 모입니다."
        />
      ) : (
        <HighlightsBrowser detail={detail} />
      )}
    </div>
  )
}
