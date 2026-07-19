// 팀 하이라이트 랜딩 — 대회 카드 그리드 (Server Component + unstable_cache)
// 리그 하이라이트 랜딩과 동일 UX · 그룹핑만 라운드(날짜) → 대회(tournament)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { Film, PlayCircle, ChevronRight, Clock, VideoOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import TeamHighlightsPlayerPicker from '@/components/highlights/TeamHighlightsPlayerPicker'
import VideoSubTabNav from '@/components/layout/VideoSubTabNav'
import { loadTeamTournamentHighlights } from '@/lib/highlights/teamLoader'
import { TEAM_HIGHLIGHT_META } from '@/lib/highlights/teamMeta'

const getCached = (org: string, team: string) =>
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
      return loadTeamTournamentHighlights(sb, teamRow.id as string)
    },
    ['team-highlights-landing', org, team],
    { tags: [`team-${org}-${team}-highlights`], revalidate: 60 },
  )

export default async function TeamHighlightsLandingPage({
  params,
}: {
  params: Promise<{ org: string; team: string }>
}) {
  const { org, team } = await params
  const meta = TEAM_HIGHLIGHT_META[team]
  if (!meta) notFound()

  const tournaments = await getCached(org, team)()
  if (tournaments === null) notFound()

  const base = `/${org}/${team}`

  return (
    <div className="space-y-5 mm-brand">
      <VideoSubTabNav />

      <div className="flex items-center gap-3">
        <Film size={28} className="lg:w-9 lg:h-9" style={{ color: 'var(--mm-yellow-strong)' }} />
        <div>
          <h1
            className="font-jersey font-black uppercase text-2xl lg:text-4xl"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            하이라이트
          </h1>
          <p
            className="text-xs lg:text-sm mt-1 font-bold uppercase"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
          >
            {meta.label} · 대회별 득점 하이라이트 · 선수·유형별 필터
          </p>
        </div>
      </div>

      {/* 선수별 하이라이트 진입 */}
      <TeamHighlightsPlayerPicker org={org} team={team} />

      {tournaments.length === 0 ? (
        <div
          className="rounded p-8 text-center"
          style={{ background: 'var(--mm-panel)', border: '1px dashed var(--mm-rule)' }}
        >
          <Film size={32} className="mx-auto mb-2" style={{ color: 'var(--mm-muted)' }} aria-hidden />
          <p className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>아직 대회가 없습니다</p>
          <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
            대회 관리에서 경기에 유튜브 영상을 연동하고 기록하면 자동으로 재생 가능해집니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map(t => {
            const isReady = t.status === 'ready'
            const isPendingRecord = t.status === 'pending_record'

            const cardStyle: React.CSSProperties = {
              background: 'var(--mm-panel)',
              border: '1px solid var(--mm-rule)',
              borderRadius: '4px',
              opacity: isReady ? 1 : 0.6,
              cursor: isReady ? 'pointer' : 'not-allowed',
            }
            const iconColor = isReady ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)'
            const StatusIcon = isReady ? PlayCircle : isPendingRecord ? Clock : VideoOff
            const statusLabel = isReady ? null : isPendingRecord ? '기록 대기 중' : '영상 없음'
            const statusHint = isReady ? null : isPendingRecord
              ? '영상은 있으나 유튜브 시각과 매핑된 성공 슛 없음'
              : '유튜브 영상 미매핑'

            const cardInner = (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="font-jersey font-black uppercase text-xl truncate"
                      style={{ color: isReady ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', letterSpacing: '-0.005em' }}
                    >
                      {t.name}
                    </div>
                    <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
                      {t.year}년
                    </div>
                  </div>
                  <StatusIcon
                    size={32}
                    style={{ color: iconColor }}
                    className={isReady ? 'transition-transform group-hover:scale-110 shrink-0' : 'shrink-0'}
                    aria-hidden
                  />
                </div>

                {statusLabel && (
                  <div
                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      color: 'var(--mm-muted)',
                      border: '1px solid var(--mm-rule)',
                      letterSpacing: '0.12em',
                    }}
                    title={statusHint ?? undefined}
                  >
                    {statusLabel}
                  </div>
                )}

                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black" style={{ color: 'var(--mm-ink)' }}>{t.clips_count}</span>
                    <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>클립</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black" style={{ color: 'var(--mm-ink)' }}>
                      {t.games_with_video}
                      <span className="text-[11px] font-normal" style={{ color: 'var(--mm-muted)' }}>/{t.games_count}</span>
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>영상 매핑</span>
                  </div>
                </div>

                {isReady && (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>
                    재생 <ChevronRight size={12} />
                  </div>
                )}
              </>
            )

            return isReady ? (
              <Link
                key={t.id}
                href={`${base}/highlights/${t.id}`}
                className="group block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={cardStyle}
                aria-label={`${t.name} 하이라이트 보기`}
              >
                {cardInner}
              </Link>
            ) : (
              <div key={t.id} className="p-4" style={cardStyle} aria-disabled>
                {cardInner}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
