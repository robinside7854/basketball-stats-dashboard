// 선수별 하이라이트 페이지 — Server 로드 → Client Browser
import Link from 'next/link'
import Image from 'next/image'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { ChevronLeft, Film, UserSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import PlayerHighlightsBrowser from '@/components/highlights/PlayerHighlightsBrowser'
import { loadPlayerHighlights } from '@/lib/highlights/loader'
import StatGate from '@/components/league/auth/StatGate'
import { getApprovedSession } from '@/lib/auth/guard'
import { resolveTeamId } from '@/lib/league/teamScope'

const getCached = (leagueId: string, playerId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadPlayerHighlights(sb, leagueId, playerId)
    },
    ['highlights-player-page', leagueId, playerId],
    {
      tags: [
        `league-${leagueId}`,
        `league-${leagueId}-events`,
        `league-${leagueId}-players-${playerId}`,
      ],
      revalidate: 60,
    },
  )

export default async function PlayerHighlightsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string; playerId: string }>
}) {
  const { orgSlug, leagueId, playerId } = await params

  // 스탯 게이팅 — 승인 회원 전용 (2026-07-28)
  if (!(await getApprovedSession(leagueId))) {
    return <StatGate fullPage title="하이라이트는 회원 전용" description="선수별 하이라이트 영상은 가입 승인된 회원만 볼 수 있어요." />
  }
  const base = `/league/${orgSlug}/${leagueId}`

  const data = await getCached(leagueId, playerId)()
  if (!data) notFound()

  // 핀 상태 · 편집 UI 활성화용 (초기값만 서버에서 · 이후 클라이언트 상태)
  // team_id 로 소속을 확인한다 — 명단은 팀 소유라 이 선수 행의 출생 league_id 가
  // 지금 보고 있는 leagueId 와 다를 수 있다.
  const sb = createClient()
  const teamId = await resolveTeamId(leagueId)
  const { data: pinRow } = await sb
    .from('league_players')
    .select('pinned_event_ids')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  const pinnedEventIds = (pinRow as { pinned_event_ids: string[] | null } | null)?.pinned_event_ids ?? []

  const groupTabs = [
    { href: `${base}/highlights`,             label: '경기별 하이라이트', active: true },
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

          {/* 선수 사진 (있으면) */}
          <div
            className="relative shrink-0 rounded overflow-hidden flex items-center justify-center"
            style={{
              width: 56, height: 70,
              background: 'var(--mm-panel-alt)',
              border: '1px solid var(--mm-rule)',
            }}
            aria-hidden
          >
            {data.player.photo_url ? (
              <Image
                src={data.player.photo_url}
                alt=""
                fill
                sizes="56px"
                className="object-cover object-top"
              />
            ) : (
              <UserSquare size={28} style={{ color: 'var(--mm-muted)' }} />
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Film size={18} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
              <h1
                className="font-bold text-2xl lg:text-3xl truncate"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                {data.player.number != null && (
                  <span className="mr-1.5" style={{ color: 'var(--mm-muted)' }}>#{data.player.number}</span>
                )}
                {data.player.name}
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              총 {data.clips.length}개 클립
              {data.quarters.length > 0 && <> · {data.quarters.length}분기</>}
              {data.shotTypes.length > 0 && <> · {data.shotTypes.length}유형</>}
            </p>
          </div>
        </div>
      </div>

      {data.clips.length === 0 ? (
        <EmptyState
          Icon={Film}
          title="이 선수의 하이라이트가 없습니다"
          description="YouTube 영상 연동 + 타임스탬프 기록된 성공 슛만 표시됩니다."
        />
      ) : (
        <PlayerHighlightsBrowser
          player={data.player}
          clips={data.clips}
          quarters={data.quarters}
          shotTypes={data.shotTypes}
          orgSlug={orgSlug}
          leagueId={leagueId}
          initialPinnedEventIds={pinnedEventIds}
        />
      )}
    </div>
  )
}
