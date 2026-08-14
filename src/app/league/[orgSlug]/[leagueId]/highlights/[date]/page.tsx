// 하이라이트 라운드 상세 — Server 로 데이터 로드(unstable_cache) → Client Browser 로 인터랙션
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { ChevronLeft, Film } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import HighlightsBrowser from '@/components/highlights/HighlightsBrowser'
import { loadRoundDetail } from '@/lib/highlights/loader'
import StatGate from '@/components/league/auth/StatGate'
import { getApprovedSession } from '@/lib/auth/guard'

const getCached = (leagueId: string, date: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadRoundDetail(sb, leagueId, date)
    },
    ['highlights-round-detail', leagueId, date],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export default async function HighlightsRoundPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string; date: string }>
}) {
  const { orgSlug, leagueId, date } = await params

  // 스탯 게이팅 — 승인 회원 전용 (2026-07-28)
  if (!(await getApprovedSession(leagueId))) {
    return <StatGate fullPage title="하이라이트는 회원 전용" description="클러치샷·경기 클립 영상은 가입 승인된 회원만 볼 수 있어요." />
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()

  const base = `/league/${orgSlug}/${leagueId}`
  const detail = await getCached(leagueId, date)()

  const d = new Date(date + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']

  const groupTabs = [
    { href: `${base}/highlights`,             label: '경기별 하이라이트', active: true },
    { href: `${base}/highlights/classics`,    label: '명경기',           active: false },
    { href: `${base}/highlights/milestones`,  label: '커리어 마일스톤',  active: false },
    { href: `${base}/highlights/best-shots`,  label: '베스트샷',         active: false },
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
            aria-label="라운드 목록으로"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Film size={20} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
              <h1
                className="font-bold text-2xl lg:text-3xl truncate"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                {d.getFullYear()}.{String(d.getMonth() + 1).padStart(2, '0')}.{String(d.getDate()).padStart(2, '0')}
                <span className="text-base ml-2" style={{ color: 'var(--mm-muted)' }}>({days[d.getDay()]})</span>
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              {detail.clips.length}개 클립 · {detail.players.length}명 선수 · {detail.teams.length}팀
            </p>
          </div>
        </div>
      </div>

      {detail.clips.length === 0 ? (
        <EmptyState
          Icon={Film}
          title="이 라운드에는 하이라이트가 없습니다"
          description="YouTube 영상 연동 + 타임스탬프 기록된 성공 슛만 표시됩니다."
        />
      ) : (
        <HighlightsBrowser detail={detail} />
      )}
    </div>
  )
}
