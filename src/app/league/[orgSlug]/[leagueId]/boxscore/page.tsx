import { redirect, notFound } from 'next/navigation'
import { CalendarX } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import EmptyState from '@/components/league/EmptyState'
import { isLeaguePrivateGated } from '@/lib/auth/guard'

type Params = { orgSlug: string; leagueId: string }

// 박스스코어 우산 진입점(D4 뎁스 단축, Task 3) — 가장 최근 완료된 경기로 redirect.
// 신규 쿼리를 발명하지 않고 리그 홈 page.tsx 의 게임 조회(is_exhibition=false·is_complete=true)와
// boxscore/[date]/page.tsx 의 게이트·리그 유효성 검증 패턴을 그대로 따른다.
export default async function BoxscoreIndexPage({ params }: { params: Promise<Params> }) {
  const { orgSlug, leagueId } = await params

  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 만으론 layout·page 병렬 렌더 때문에
  // 이 페이지 자체의 DB 조회·렌더를 막지 못한다. 형제 boxscore/[date]/page.tsx, 리그 홈
  // page.tsx 와 동일하게 맨 위에서 확인하고 조기 return 한다.
  if (await isLeaguePrivateGated(leagueId)) return null

  const supabase = createClient()

  const [{ data: league, error: leagueError }, { data: game, error: gameError }] = await Promise.all([
    supabase
      .from('leagues')
      .select('id')
      .eq('id', leagueId)
      .eq('org_slug', orgSlug)
      .maybeSingle(),
    supabase
      .from('league_games')
      .select('date')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
      .eq('is_exhibition', false)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  // 조회 실패를 빈 결과로 삼키면 "리그 없음"과 "조회 실패"가 같은 경로(notFound)로 흡수된다
  // (Task 3 리뷰 지적) — error 는 문맥과 함께 throw, notFound() 는 data 가 null 일 때만.
  if (leagueError) {
    throw new Error(`[boxscore index] 리그 조회 실패 (league=${leagueId}, org=${orgSlug}): ${leagueError.message}`)
  }
  if (!league) notFound()
  if (gameError) {
    throw new Error(`[boxscore index] 최근 완료 경기 조회 실패 (league=${leagueId}): ${gameError.message}`)
  }

  if (game?.date) {
    redirect(`/league/${orgSlug}/${leagueId}/boxscore/${game.date}`)
  }

  // 완료된 경기가 하나도 없음 — 정상 상태. 리다이렉트하지 않고 빈 상태 안내로 처리.
  return (
    <div className="mm-brand space-y-6">
      <LeagueSubTabs group="games" />
      <EmptyState
        Icon={CalendarX}
        title="완료된 경기가 아직 없습니다"
        description="경기가 마감되면 박스스코어가 여기에 표시됩니다."
      />
    </div>
  )
}
