import { notFound } from 'next/navigation'
import Link from 'next/link'
import { CalendarX, ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import EmptyState from '@/components/league/EmptyState'
import { isLeaguePrivateGated } from '@/lib/auth/guard'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'

type Params = { orgSlug: string; leagueId: string }
type SearchParams = { page?: string; quarter?: string }

const PAGE_SIZE = 5

function formatKorean(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

type GameRow = {
  id: string
  date: string
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  quarter_id: string | null
}

// 박스스코어 우산 진입점 — 일자별 목록 (Task 2, 2026-08-08).
// 예전엔 최근 완료 경기로 즉시 redirect 해 '일정' 서브탭과 화면이 겹쳐 보였다.
// 이제 일자 목록 + 5일씩 페이지네이션(?page=) + 분기 필터(?quarter=) 를 서버에서 처리한다.
// 신규 쿼리를 발명하지 않고 리그 홈 page.tsx 의 게임/분기 조회 패턴, boxscore/[date]/page.tsx 의
// 게이트·리그 유효성 검증 패턴을 그대로 따른다. /boxscore/[date] 자체는 건드리지 않는다.
export default async function BoxscoreIndexPage({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
}) {
  const { orgSlug, leagueId } = await params
  const sp = await searchParams

  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 만으론 layout·page 병렬 렌더 때문에
  // 이 페이지 자체의 DB 조회·렌더를 막지 못한다. 형제 페이지들과 동일하게 데이터 fetch 전에
  // 맨 위에서 확인하고 조기 return 한다.
  if (await isLeaguePrivateGated(leagueId)) return null

  const supabase = createClient()

  const [{ data: league, error: leagueError }, { data: quarters, error: quarterError }] = await Promise.all([
    supabase.from('leagues').select('id').eq('id', leagueId).eq('org_slug', orgSlug).maybeSingle(),
    supabase
      .from('league_quarters')
      .select('id, year, quarter, is_current')
      .eq('league_id', leagueId)
      .order('year', { ascending: false })
      .order('quarter', { ascending: false }),
  ])
  // 조회 실패를 빈 결과로 삼키면 "리그 없음"과 "조회 실패"가 같은 경로로 흡수된다 —
  // error 는 문맥과 함께 throw, notFound() 는 data 가 null 일 때만.
  if (leagueError) {
    throw new Error(`[boxscore index] 리그 조회 실패 (league=${leagueId}, org=${orgSlug}): ${leagueError.message}`)
  }
  if (!league) notFound()
  if (quarterError) {
    throw new Error(`[boxscore index] 분기 조회 실패 (league=${leagueId}): ${quarterError.message}`)
  }
  const quarterList = quarters ?? []
  const selectedQuarterId = sp.quarter && quarterList.some(q => q.id === sp.quarter) ? sp.quarter : null

  // 완료 경기 전체를 1000행 상한 없이 청크(1000행)로 끝까지 모은다 — 그냥 .limit()/기본 select 로
  // 받아 length 를 세면 기간이 길 때 과소 집계되는 함정(PostgREST 1000행 truncation)에 빠진다.
  // 날짜 distinct 집계 자체가 목적이라 전체를 받아야 하고, .range() 로 완주시켜 안전하게 처리한다.
  const allGames: GameRow[] = []
  const CHUNK = 1000
  for (let offset = 0; ; offset += CHUNK) {
    let gameQuery = supabase
      .from('league_games')
      .select('id, date, home_team_id, away_team_id, home_score, away_score, quarter_id')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
      .eq('is_exhibition', false)
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + CHUNK - 1)
    if (selectedQuarterId) gameQuery = gameQuery.eq('quarter_id', selectedQuarterId)
    const { data, error } = await gameQuery
    if (error) {
      throw new Error(`[boxscore index] 완료 경기 조회 실패 (league=${leagueId}): ${error.message}`)
    }
    allGames.push(...((data ?? []) as GameRow[]))
    if (!data || data.length < CHUNK) break
  }

  const byDate = new Map<string, GameRow[]>()
  for (const g of allGames) {
    const list = byDate.get(g.date)
    if (list) list.push(g)
    else byDate.set(g.date, [g])
  }
  const allDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a))
  const totalDates = allDates.length
  const totalPages = Math.max(1, Math.ceil(totalDates / PAGE_SIZE))
  const rawPage = Number(sp.page)
  const pageNum = Number.isFinite(rawPage) && rawPage >= 1 ? Math.min(Math.floor(rawPage), totalPages) : 1
  const pageDates = allDates.slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE)

  // 그날 맞붙은 팀 요약 — 리그 홈 page.tsx 와 동일하게 identity resolver 재사용(분기별 이름 override 반영).
  const resolver = totalDates > 0 ? await loadIdentityResolver(supabase, leagueId) : null
  const rows = pageDates.map(date => {
    const games = byDate.get(date) ?? []
    const matchups = games.map(g => {
      const home = resolver?.(g.home_team_id, g.quarter_id)
      const away = resolver?.(g.away_team_id, g.quarter_id)
      return `${home?.display_name ?? '팀'} vs ${away?.display_name ?? '팀'}`
    })
    return { date, count: games.length, matchups }
  })

  const basePath = `/league/${orgSlug}/${leagueId}/boxscore`
  function buildHref(page: number, quarterId: string | null): string {
    const qs = new URLSearchParams()
    if (quarterId) qs.set('quarter', quarterId)
    if (page > 1) qs.set('page', String(page))
    const s = qs.toString()
    return s ? `${basePath}?${s}` : basePath
  }

  const prevDisabled = pageNum <= 1
  const nextDisabled = pageNum >= totalPages

  return (
    <div className="mm-brand space-y-6">
      {/* 경기 우산 서브탭 — 완료 경기 0건이어도 반드시 유지(없으면 사용자가 갇힌다) */}
      <LeagueSubTabs group="games" />

      {quarterList.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="분기 필터">
          <Link
            href={buildHref(1, null)}
            role="tab"
            aria-selected={selectedQuarterId === null}
            className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] min-w-[44px] text-[11px] font-black tracking-widest uppercase transition-colors cursor-pointer"
            style={{
              background: selectedQuarterId === null ? 'var(--mm-yellow)' : 'var(--mm-panel)',
              color: selectedQuarterId === null ? 'var(--mm-black)' : 'var(--mm-muted)',
              border: selectedQuarterId === null ? '1px solid var(--mm-yellow)' : '1px solid var(--mm-rule)',
              borderRadius: 'var(--mm-radius-chip)',
            }}
          >
            전체
          </Link>
          {quarterList.map(q => {
            const active = selectedQuarterId === q.id
            return (
              <Link
                key={q.id}
                href={buildHref(1, q.id)}
                role="tab"
                aria-selected={active}
                className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] min-w-[44px] text-[11px] font-black tracking-widest uppercase transition-colors cursor-pointer"
                style={{
                  background: active ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                  color: active ? 'var(--mm-black)' : 'var(--mm-muted)',
                  border: active ? '1px solid var(--mm-yellow)' : '1px solid var(--mm-rule)',
                  borderRadius: 'var(--mm-radius-chip)',
                }}
              >
                {String(q.year).slice(2)}.{q.quarter}Q
              </Link>
            )
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          Icon={CalendarX}
          title="완료된 경기가 아직 없습니다"
          description={
            selectedQuarterId
              ? '이 분기엔 완료된 경기가 없습니다. 다른 분기를 선택해 보세요.'
              : '경기가 마감되면 박스스코어가 여기에 표시됩니다.'
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {rows.map(row => (
              <Link
                key={row.date}
                href={`${basePath}/${row.date}`}
                className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 transition-colors duration-200 cursor-pointer hover:bg-[color:var(--mm-panel-alt)]"
                style={{
                  background: 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                  borderRadius: 'var(--mm-radius-card)',
                }}
              >
                <div className="min-w-0">
                  <p
                    className="font-bold break-keep"
                    style={{ color: 'var(--mm-ink)', fontSize: 'clamp(16px, 4.4vw, 19px)', letterSpacing: '-0.005em', lineHeight: 1.2 }}
                  >
                    {formatKorean(row.date)}
                  </p>
                  <p className="text-[12px] sm:text-[13px] mt-1 truncate" style={{ color: 'var(--mm-muted)' }}>
                    {row.matchups.join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-black tracking-widest uppercase px-3 py-1.5"
                    style={{
                      background: 'var(--mm-yellow-soft)',
                      color: 'var(--mm-yellow-strong)',
                      border: '1px solid var(--mm-yellow)',
                      borderRadius: 'var(--mm-radius-chip)',
                    }}
                  >
                    <Users size={12} aria-hidden />
                    {row.count}경기
                  </span>
                  <ChevronRight size={18} aria-hidden style={{ color: 'var(--mm-muted)' }} />
                </div>
              </Link>
            ))}
          </div>

          {/* 페이지네이션 — 최근 5일씩, ?page= 서버 처리. 경계에서 시각(opacity/cursor)·의미(aria-disabled) 양쪽 비활성. */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {prevDisabled ? (
              <span
                aria-disabled="true"
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-4 text-[12px] font-bold uppercase tracking-widest opacity-40 cursor-not-allowed select-none"
                style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                <ChevronLeft size={14} aria-hidden />이전
              </span>
            ) : (
              <Link
                href={buildHref(pageNum - 1, selectedQuarterId)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-4 text-[12px] font-bold uppercase tracking-widest cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                <ChevronLeft size={14} aria-hidden />이전
              </Link>
            )}

            <span className="text-[12px] font-bold tracking-widest uppercase" style={{ color: 'var(--mm-muted)' }}>
              {pageNum} / {totalPages}
            </span>

            {nextDisabled ? (
              <span
                aria-disabled="true"
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-4 text-[12px] font-bold uppercase tracking-widest opacity-40 cursor-not-allowed select-none"
                style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                다음<ChevronRight size={14} aria-hidden />
              </span>
            ) : (
              <Link
                href={buildHref(pageNum + 1, selectedQuarterId)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-4 text-[12px] font-bold uppercase tracking-widest cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                다음<ChevronRight size={14} aria-hidden />
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  )
}
