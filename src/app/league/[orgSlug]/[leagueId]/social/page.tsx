// 인스타 매거진 카드 생성기 (운영자용 · 설정에서 진입, 직접 URL 도 가능)
//   /league/[org]/[id]/social?date=YYYY-MM-DD
//   라운드(경기 날짜) 단위. 기본 = 최근 완료 라운드.
import { getRoundMagazineData, getRoundDates } from '@/lib/social/weeklyData'
import { volumeForRound } from '@/lib/social/volume'
import SocialCardStudio from '@/components/league/social/SocialCardStudio'
import { isLeaguePrivateGated } from '@/lib/auth/guard'

export default async function LeagueSocialPage({
  params, searchParams,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { leagueId } = await params

  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 주석 참조 (Next 가 layout·page 병렬 렌더).
  if (await isLeaguePrivateGated(leagueId)) return null

  const { date: qDate } = await searchParams

  const roundDates = await getRoundDates(leagueId)
  const date = qDate ?? roundDates[0] ?? new Date().toISOString().slice(0, 10)
  const [data] = await Promise.all([
    getRoundMagazineData(leagueId, date),
  ])

  // VOL 은 라운드당 +1 로 서버에서 계산해 내려준다 — 손으로 적다가 번호가 겹치는 걸 막는다.
  // 화면에서는 여전히 고칠 수 있다(자동값이 어긋난 경우를 위해).
  const vol = volumeForRound(date, roundDates)

  return (
    <div className="max-w-6xl mx-auto">
      {/* key=date — 라운드를 바꾸면 컴포넌트를 새로 띄워 이전 라운드의 VOL·헤드라인이 남지 않게 한다 */}
      <SocialCardStudio key={date} data={data} roundDates={roundDates} initialVol={vol} />
    </div>
  )
}
