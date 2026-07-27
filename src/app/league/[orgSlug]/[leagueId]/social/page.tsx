// 인스타 위클리 매거진 카드 생성기 (운영자용 · 탭 네비 미노출, 직접 URL 접근)
//   /league/[org]/[id]/social?from=YYYY-MM-DD&to=YYYY-MM-DD
//   기본 주간 = 최근 완료 라운드 날짜를 끝으로 한 7일.
import { getWeeklyMagazineData } from '@/lib/social/weeklyData'
import SocialCardStudio from '@/components/league/social/SocialCardStudio'
import { createClient } from '@/lib/supabase/admin'

function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d)
}

export default async function LeagueSocialPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { leagueId } = await params
  const { from: qFrom, to: qTo } = await searchParams

  let from = qFrom
  let to = qTo
  if (!from || !to) {
    const sb = createClient()
    const { data } = await sb
      .from('league_games')
      .select('date')
      .eq('league_id', leagueId)
      .eq('is_complete', true)
      .eq('is_exhibition', false)
      .order('date', { ascending: false })
      .limit(1)
    const latest = (data?.[0]?.date as string | undefined) ?? isoDate(new Date())
    to = to ?? latest
    from = from ?? addDays(to, -6)
  }

  const dataPayload = await getWeeklyMagazineData(leagueId, from, to)

  return (
    <div className="max-w-6xl mx-auto">
      <SocialCardStudio data={dataPayload} />
    </div>
  )
}
