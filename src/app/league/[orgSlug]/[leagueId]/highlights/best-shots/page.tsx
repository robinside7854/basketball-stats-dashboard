// 베스트샷 릴 — 핀 지정 선수 카드 목록 → 클릭 → 모달 재생 (2026-07-19 재설계)
//   이전: HighlightsBrowser 로 곧바로 재생 UI
//   신규: 선수 갤러리 (프리뷰 3장 + 프로필) → 카드 클릭 → 그 선수 클립만 순차 재생
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { ChevronLeft, Pin } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import BestShotsGallery from '@/components/league/highlights/BestShotsGallery'
import { NumberedBasketball } from '@/components/league/BasketballIcons'
import { loadLeagueBestShots } from '@/lib/highlights/loader'
import { isLeaguePrivateGated } from '@/lib/auth/guard'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const detail = await loadLeagueBestShots(sb, leagueId)
      // 프로필 사진 맵 병합 (핀 지정 선수만)
      const pids = detail.players.map(p => p.id)
      let photoMap: Record<string, string | null> = {}
      if (pids.length > 0) {
        const { data } = await sb
          .from('league_players')
          .select('id, photo_url')
          .in('id', pids)
        photoMap = Object.fromEntries(((data ?? []) as Array<{ id: string; photo_url: string | null }>).map(r => [r.id, r.photo_url]))
      }
      return { ...detail, photoMap }
    },
    ['highlights-best-shots-v2', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-events`, `league-${leagueId}-pins`], revalidate: 60 },
  )

export default async function BestShotsReelPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 주석 참조 (Next 가 layout·page 병렬 렌더).
  if (await isLeaguePrivateGated(leagueId)) return null

  const base = `/league/${orgSlug}/${leagueId}`
  const detail = await getCached(leagueId)()

  const groupTabs = [
    { href: `${base}/highlights`,             label: '경기별 하이라이트', active: false },
    { href: `${base}/highlights/classics`,    label: '명경기',           active: false },
    { href: `${base}/highlights/milestones`,  label: '커리어 마일스톤',  active: false },
    { href: `${base}/highlights/best-shots`,  label: '베스트샷',         active: true },
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
                className="font-bold text-2xl lg:text-3xl truncate"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                베스트샷 릴
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              선수들이 직접 핀한 시그니처 샷 · {detail.players.length}명 · {detail.clips.length}개 클립
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
        <BestShotsGallery
          players={detail.players}
          clips={detail.clips}
          photoMap={detail.photoMap}
        />
      )}
    </div>
  )
}
