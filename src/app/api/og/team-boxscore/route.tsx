import { loadShareInfo } from '@/lib/og/teamBoxscoreShare'
import { renderShareCard } from '@/lib/og/teamBoxscoreCard'
import RootOnballCard from '@/app/opengraph-image'

// 파란날개 박스스코어 공유 카드 — GET /api/og/team-boxscore?org=&team=&t=<대회id>[&g=<경기id>]
//   카드 모양은 lib/og/teamBoxscoreCard.tsx, 공개 여부·조회는 lib/og/teamBoxscoreShare.ts.
//   opengraph-image.tsx 파일 규칙은 쿼리스트링을 못 읽어서(경기·대회가 ?t=&g= 로 갈린다) 라우트로 만들었고,
//   boxscore/page.tsx 의 generateMetadata 가 이 URL 을 og:image 로 건다.
//   공개 팀이 아니거나 못 찾으면 온볼 공용 카드.
export const revalidate = 60

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const info = await loadShareInfo(sp.get('org') ?? '', sp.get('team') ?? '', sp.get('t') ?? undefined, sp.get('g') ?? undefined)
  if (!info) return RootOnballCard()
  return renderShareCard(info)
}
