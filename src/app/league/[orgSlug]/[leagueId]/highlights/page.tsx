// 하이라이트 랜딩 — 최근 라운드 카드 그리드 (Server Component + unstable_cache)
// 아카이브 우산 아래 서브탭 (매거진 · Stathead · 하이라이트)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { Film, PlayCircle, ChevronRight, Clock, VideoOff, Trophy } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import HighlightsPlayerPicker from '@/components/highlights/HighlightsPlayerPicker'
import { loadRecentRounds } from '@/lib/highlights/loader'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      // 시즌 전체 라운드 로드 (한 시즌 최대 ~50 라운드 · 여유롭게 60)
      return loadRecentRounds(sb, leagueId, 60)
    },
    ['highlights-landing-v2', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export default async function HighlightsLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const base = `/league/${orgSlug}/${leagueId}`
  // 시즌 전체 라운드 노출 (기존 .slice(0, 12) 로 1-3월 데이터 잘림 → 전체 표시)
  const rounds = await getCached(leagueId)()

  const groupTabs = [
    { href: `${base}/stathead`,   label: 'Stathead',  active: false },
    { href: `${base}/highlights`, label: '하이라이트', active: true },
  ]

  return (
    <div className="space-y-5 mm-brand">
      <LeagueGroupTabs tabs={groupTabs} />

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
            라운드별 득점 하이라이트 · 선수·팀·유형별 필터
          </p>
        </div>
      </div>

      {/* 선수별 하이라이트 진입 */}
      <HighlightsPlayerPicker leagueId={leagueId} orgSlug={orgSlug} />

      {/* 커리어 마일스톤 · 시즌 하이라이트 카드 진입 */}
      <Link
        href={`${base}/highlights/milestones`}
        className="group flex items-center justify-between gap-3 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderRadius: '4px',
        }}
        aria-label="커리어 마일스톤 전체 보기"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Trophy size={28} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden className="shrink-0" />
          <div className="min-w-0">
            <h2
              className="font-jersey font-black uppercase text-lg lg:text-xl"
              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
            >
              커리어 마일스톤
            </h2>
            <p className="text-[11px] mt-0.5 font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
              누적 임계값 달성 순간 · 그 순간 재생
            </p>
          </div>
        </div>
        <ChevronRight size={20} style={{ color: 'var(--mm-yellow-strong)' }} className="shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>

      {rounds.length === 0 ? (
        <EmptyState
          Icon={Film}
          title="아직 라운드가 없습니다"
          description="경기가 시작되면 라운드가 여기에 표시되고, 영상 · 기록이 완료되면 자동으로 재생 가능해집니다."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rounds.map(r => {
            const d = new Date(r.date + 'T00:00:00')
            const days = ['일', '월', '화', '수', '목', '금', '토']
            const isReady = r.status === 'ready'
            const isPendingRecord = r.status === 'pending_record'
            const isPendingVideo = r.status === 'pending_video'

            // 상태별 CSS · 재생 안 되는 라운드는 muted + 클릭 비활성
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
                      className="font-jersey font-black uppercase text-2xl"
                      style={{ color: isReady ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', letterSpacing: '-0.005em' }}
                    >
                      {d.getMonth() + 1}.{d.getDate()}
                      <span className="text-sm ml-1.5" style={{ color: 'var(--mm-muted)' }}>
                        ({days[d.getDay()]})
                      </span>
                    </div>
                    <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
                      {d.getFullYear()}년
                    </div>
                  </div>
                  <StatusIcon
                    size={32}
                    style={{ color: iconColor }}
                    className={isReady ? 'transition-transform group-hover:scale-110' : ''}
                    aria-hidden
                  />
                </div>

                {/* 상태 배지 */}
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
                    <span className="text-lg font-black" style={{ color: 'var(--mm-ink)' }}>{r.clips_count}</span>
                    <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>클립</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black" style={{ color: 'var(--mm-ink)' }}>
                      {r.games_with_video}
                      <span className="text-[11px] font-normal" style={{ color: 'var(--mm-muted)' }}>/{r.games_count}</span>
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>영상 매핑</span>
                  </div>
                </div>

                {r.team_names.length > 0 && (
                  <div className="mt-2 text-[11px] truncate" style={{ color: 'var(--mm-muted)' }}>
                    {r.team_names.slice(0, 4).join(' · ')}
                    {r.team_names.length > 4 ? ` +${r.team_names.length - 4}` : ''}
                  </div>
                )}

                {isReady && (
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>
                    재생 <ChevronRight size={12} />
                  </div>
                )}
              </>
            )

            if (isReady) {
              return (
                <Link
                  key={r.date}
                  href={`${base}/highlights/${r.date}`}
                  className="group block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                  style={cardStyle}
                  aria-label={`${r.date} 하이라이트 재생 (${r.clips_count}개 클립)`}
                >
                  {cardInner}
                </Link>
              )
            }
            return (
              <div
                key={r.date}
                className="block p-4"
                style={cardStyle}
                aria-label={`${r.date} · ${statusLabel} (재생 불가)`}
                title={statusHint ?? undefined}
              >
                {cardInner}
              </div>
            )
          })}
        </div>
      )}

      {/* 각주 안내 */}
      {rounds.some(r => r.status !== 'ready') && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--mm-muted)', lineHeight: 1.6 }}>
          <span className="font-bold">클립 수</span>는 유튜브 영상 시각과 매핑된 성공 슛(video_timestamp)만 집계합니다.
          영상 매핑 없는 게임은 재생 불가.
        </p>
      )}
    </div>
  )
}
