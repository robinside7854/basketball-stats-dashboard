// 대회 하이라이트 상세 — Server 로드(unstable_cache) → HighlightsBrowser(리그와 공용) 재사용
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { ChevronLeft, Film } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import HighlightsBrowser from '@/components/highlights/HighlightsBrowser'
import { loadTournamentHighlightDetail } from '@/lib/highlights/teamLoader'
import { TEAM_HIGHLIGHT_META } from '@/lib/highlights/teamMeta'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const getCached = (org: string, team: string, tournamentId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      const { data: teamRow } = await sb
        .from('teams')
        .select('id')
        .eq('org_slug', org)
        .eq('sub_slug', team)
        .maybeSingle()
      if (!teamRow) return null
      const meta = TEAM_HIGHLIGHT_META[team]
      return loadTournamentHighlightDetail(sb, teamRow.id as string, tournamentId, meta.label, meta.color)
    },
    ['team-highlights-tournament', org, team, tournamentId],
    { tags: [`team-${org}-${team}-highlights`], revalidate: 60 },
  )

export default async function TournamentHighlightsPage({
  params,
}: {
  params: Promise<{ org: string; team: string; tournamentId: string }>
}) {
  const { org, team, tournamentId } = await params
  if (!TEAM_HIGHLIGHT_META[team] || !UUID_RE.test(tournamentId)) notFound()

  const data = await getCached(org, team, tournamentId)()
  if (!data) notFound()
  const { tournament, detail } = data

  const base = `/${org}/${team}`

  return (
    <div className="space-y-4 mm-brand">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`${base}/highlights`}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer transition-colors"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', borderRadius: '4px' }}
            aria-label="대회 목록으로"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Film size={20} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
              <h1
                className="font-jersey font-black uppercase text-2xl lg:text-3xl truncate"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                {tournament.name}
                <span className="text-base ml-2" style={{ color: 'var(--mm-muted)' }}>{tournament.year}</span>
              </h1>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
              {detail.clips.length}개 클립 · {detail.players.length}명 선수
            </p>
          </div>
        </div>
      </div>

      {detail.clips.length === 0 ? (
        <div
          className="rounded p-8 text-center"
          style={{ background: 'var(--mm-panel)', border: '1px dashed var(--mm-rule)' }}
        >
          <Film size={32} className="mx-auto mb-2" style={{ color: 'var(--mm-muted)' }} aria-hidden />
          <p className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>이 대회에는 하이라이트가 없습니다</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
            YouTube 영상 연동 + 타임스탬프 기록된 성공 슛만 표시됩니다.
          </p>
        </div>
      ) : (
        <HighlightsBrowser
          detail={detail}
          teamSectionLabel="상대"
          hideCategories={['andones']}
          clutchTitle="4쿼터 마지막 2분 · 최종 6점차 이내 접전 경기"
        />
      )}
    </div>
  )
}
