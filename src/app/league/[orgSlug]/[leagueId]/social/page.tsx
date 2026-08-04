// 인스타 매거진 카드 생성기 (운영자용 · 설정에서 진입, 직접 URL 도 가능)
//   /league/[org]/[id]/social?date=YYYY-MM-DD
//   라운드(경기 날짜) 단위. 기본 = 최근 완료 라운드.
import { getRoundMagazineData, getRoundDates } from '@/lib/social/weeklyData'
import SocialCardStudio from '@/components/league/social/SocialCardStudio'

export default async function LeagueSocialPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { leagueId } = await params
  const { date: qDate } = await searchParams

  const roundDates = await getRoundDates(leagueId)
  const date = qDate ?? roundDates[0] ?? new Date().toISOString().slice(0, 10)
  const [data] = await Promise.all([
    getRoundMagazineData(leagueId, date),
  ])

  return (
    <div className="max-w-6xl mx-auto">
      <SocialCardStudio data={data} roundDates={roundDates} />
    </div>
  )
}
