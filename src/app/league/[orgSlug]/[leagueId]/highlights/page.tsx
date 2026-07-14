// 하이라이트 랜딩 — 최근 라운드 카드 그리드 (Server Component + unstable_cache)
// 아카이브 우산 아래 서브탭 (매거진 · Stathead · 하이라이트)
import Link from 'next/link'
import { unstable_cache } from 'next/cache'
import { Film, PlayCircle, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import EmptyState from '@/components/league/EmptyState'
import { loadRecentRounds } from '@/lib/highlights/loader'

const getCached = (leagueId: string) =>
  unstable_cache(
    async () => {
      const sb = createClient()
      return loadRecentRounds(sb, leagueId, 24)
    },
    ['highlights-landing', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`, `league-${leagueId}-events`], revalidate: 60 },
  )

export default async function HighlightsLandingPage({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params
  const base = `/league/${orgSlug}/${leagueId}`
  const rounds = (await getCached(leagueId)()).slice(0, 12)

  const groupTabs = [
    { href: `${base}/columns`,    label: '매거진',    active: false },
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

      {rounds.length === 0 ? (
        <EmptyState
          Icon={Film}
          title="아직 하이라이트가 없습니다"
          description="경기에 YouTube 영상이 연동되고 득점 이벤트가 기록되면 자동으로 여기에 표시됩니다."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rounds.map(r => {
            const d = new Date(r.date + 'T00:00:00')
            const days = ['일', '월', '화', '수', '목', '금', '토']
            return (
              <Link
                key={r.date}
                href={`${base}/highlights/${r.date}`}
                className="group block p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                aria-label={`${r.date} 하이라이트 재생`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div
                      className="font-jersey font-black uppercase text-2xl"
                      style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
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
                  <PlayCircle
                    size={32}
                    style={{ color: 'var(--mm-yellow-strong)' }}
                    className="transition-transform group-hover:scale-110"
                    aria-hidden
                  />
                </div>

                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black" style={{ color: 'var(--mm-ink)' }}>{r.made_events_count}</span>
                    <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>득점</span>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-black" style={{ color: 'var(--mm-ink)' }}>{r.games_count}</span>
                    <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>경기</span>
                  </div>
                </div>

                {r.team_names.length > 0 && (
                  <div className="mt-2 text-[11px] truncate" style={{ color: 'var(--mm-muted)' }}>
                    {r.team_names.slice(0, 4).join(' · ')}
                    {r.team_names.length > 4 ? ` +${r.team_names.length - 4}` : ''}
                  </div>
                )}

                <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>
                  재생 <ChevronRight size={12} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
