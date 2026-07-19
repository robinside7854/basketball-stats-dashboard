// 하이라이트 랜딩 — 최근 라운드 카드 그리드 (Server Component + unstable_cache)
// 상위 하이라이트 우산 (아카이브 → 하이라이트 격상 · Stathead 삭제 · 2026-07-19)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { Film, PlayCircle, ChevronRight, Clock, VideoOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import HighlightsPlayerPicker from '@/components/highlights/HighlightsPlayerPicker'
import { loadRecentRounds } from '@/lib/highlights/loader'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'

// 라운드 카드 W-L 뱃지용 팀 레코드
// · 홈 페이지 computeRecentRounds 와 동일한 승패 산정 방식 (완료된 경기만)
// · 친선 포함 — 라운드 카드가 이미 친선을 포함해 노출하므로 일관성 유지
type RoundTeamRecord = {
  key: string
  name: string
  wins: number
  losses: number
  draws: number
}

// dates 배열에 대해 date → 팀별 W-L 맵 계산
// · is_complete=true 만 대상 (스코어 미기록 라운드는 자연스럽게 빈 배열)
// · 분기별 팀명 override 반영 (loadIdentityResolver)
async function computeRoundRecords(
  supabase: SupabaseClient,
  leagueId: string,
  dates: string[],
): Promise<Record<string, RoundTeamRecord[]>> {
  if (dates.length === 0) return {}
  const [{ data: games }, resolver] = await Promise.all([
    supabase
      .from('league_games')
      .select('date, home_team_id, away_team_id, home_score, away_score, quarter_id')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
      .in('date', dates),
    loadIdentityResolver(supabase, leagueId),
  ])
  const byDate: Record<string, Map<string, RoundTeamRecord>> = {}
  for (const g of (games ?? []) as Array<{
    date: string
    home_team_id: string | null
    away_team_id: string | null
    home_score: number | null
    away_score: number | null
    quarter_id: string | null
  }>) {
    if (!byDate[g.date]) byDate[g.date] = new Map()
    const agg = byDate[g.date]
    const ensure = (teamId: string | null, quarterId: string | null) => {
      const id = resolver(teamId, quarterId)
      if (!id) return null
      let t = agg.get(id.key)
      if (!t) {
        t = { key: id.key, name: id.display_name, wins: 0, losses: 0, draws: 0 }
        agg.set(id.key, t)
      }
      return t
    }
    const h = ensure(g.home_team_id, g.quarter_id)
    const a = ensure(g.away_team_id, g.quarter_id)
    if (!h || !a) continue
    const hs = g.home_score ?? 0
    const as_ = g.away_score ?? 0
    if (hs > as_) { h.wins++; a.losses++ }
    else if (hs < as_) { a.wins++; h.losses++ }
    else { h.draws++; a.draws++ }
  }
  const result: Record<string, RoundTeamRecord[]> = {}
  for (const [date, agg] of Object.entries(byDate)) {
    result[date] = [...agg.values()]
      .filter(t => t.wins + t.losses + t.draws > 0)
      // 승리 많은 팀 → 패배 적은 팀 순
      .sort((a, b) => (b.wins - a.wins) || (a.losses - b.losses) || a.name.localeCompare(b.name))
  }
  return result
}

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      // 시즌 전체 라운드 로드 (한 시즌 최대 ~50 라운드 · 여유롭게 60)
      const rounds = await loadRecentRounds(sb, leagueId, 60)
      const records = await computeRoundRecords(sb, leagueId, rounds.map(r => r.date))
      return { rounds, records }
    },
    // v3: W-L 뱃지 데이터 추가 (구 v2 캐시 자동 무효화)
    ['highlights-landing-v3', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export default async function HighlightsLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const base = `/league/${orgSlug}/${leagueId}`
  // 시즌 전체 라운드 노출
  const { rounds, records } = await getCached(leagueId)()

  const groupTabs = [
    { href: `${base}/highlights`,             label: '경기별 하이라이트', active: true },
    { href: `${base}/highlights/milestones`,  label: '커리어 마일스톤',  active: false },
    { href: `${base}/highlights/best-shots`,  label: '베스트샷',         active: false },
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

      {/* 선수별 하이라이트 진입 (경기별 하이라이트 우산 안에 포함) */}
      <HighlightsPlayerPicker leagueId={leagueId} orgSlug={orgSlug} />

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
            // 이 라운드에서 완료된 리그경기의 팀별 W-L (0이면 뱃지 숨김)
            const teamRecords = records[r.date] ?? []

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

                {teamRecords.length > 0 ? (
                  // 팀별 W-L 뱃지 — 승리팀 노란색, 패배팀(losses>wins)/무승부 회색
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    {teamRecords.slice(0, 6).map(t => {
                      const isWinner = t.wins > t.losses
                      const rec = t.draws > 0
                        ? `${t.wins}-${t.losses}-${t.draws}`
                        : `${t.wins}-${t.losses}`
                      return (
                        <span
                          key={t.key}
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-1.5 py-0.5 rounded"
                          style={{
                            background: isWinner ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                            color: isWinner ? 'var(--mm-black)' : 'var(--mm-muted)',
                            border: `1px solid ${isWinner ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                            letterSpacing: '0.06em',
                            lineHeight: 1.2,
                          }}
                          aria-label={`${t.name} ${rec}`}
                        >
                          <span className="max-w-[6em] truncate">{t.name}</span>
                          <span className="font-jersey tabular-nums tracking-normal">{rec}</span>
                        </span>
                      )
                    })}
                    {teamRecords.length > 6 && (
                      <span className="text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>
                        +{teamRecords.length - 6}
                      </span>
                    )}
                  </div>
                ) : r.team_names.length > 0 ? (
                  // W-L 데이터 없을 때 fallback — 팀명만 텍스트로 나열
                  <div className="mt-2 text-[11px] truncate" style={{ color: 'var(--mm-muted)' }}>
                    {r.team_names.slice(0, 4).join(' · ')}
                    {r.team_names.length > 4 ? ` +${r.team_names.length - 4}` : ''}
                  </div>
                ) : null}

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
