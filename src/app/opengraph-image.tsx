import { renderOnballCard } from '@/lib/og/onballCard'

// 링크 공유(카톡/메신저/SNS) 미리보기 카드 — 전 라우트 공통 폴백.
//
// 예전엔 src/app/opengraph-image.png(정적 5.9MB PNG) 였다. 메신저 미리보기 크롤러는
// 짧은 타임아웃 안에 이미지를 가져오는데, 5.9MB는 그 안에 못 받아오는 경우가 흔해
// 카드가 아예 안 뜨거나 깨지는 원인이 됐다 — 코드로 생성하는 작은 PNG(수십 KB대)로 교체.
//
// 이 파일은 라우트 세그먼트 트리 최상단(app/)에 있으므로, 자기 opengraph-image 를
// 따로 두지 않은 모든 하위 경로(/league/... 포함)가 이 이미지를 그대로 물려받는다.
//
// ⚠ 클럽/동호회 이름·색상 등 개별화 요소를 절대 넣지 않는다 — 온볼은 서비스 정체성이고
//   클럽 커스터마이징은 사이트 안에서만 보여준다는 원칙(2026-08). 예전엔 팀별 accent
//   컬러를 입힌 카드가 따로 있었는데(app/(main)/[org]/[team]/opengraph-image.tsx),
//   그게 바로 이 원칙에 어긋나는 "바깥으로 새는 클럽 커스터마이징"이라 삭제했다.
//   비공개 리그의 링크를 공유해도 이 이미지엔 애초에 클럽 정보가 없으니 그 자체로 안전하다.
//
// 📌 2026-08-10 예외 신설: /league/[orgSlug]/[leagueId] 아래는 "온볼 × {팀이름}" 카드를 쓴다
//   (app/league/[orgSlug]/[leagueId]/opengraph-image.tsx). 위 원칙을 사용자 판단으로 완화한
//   것이며, 안전장치로 **공개 리그(teams.is_public = true)일 때만** 팀 이름을 넣고 비공개·조회
//   실패 시에는 이 파일의 카드로 폴백한다. 즉 이 파일은 여전히 "클럽 정보가 0인" 카드여야 한다 —
//   여기에 개별화 요소를 넣으면 비공개 리그의 폴백까지 오염되므로 절대 넣지 말 것.
//
// 📌 2026-11-08 운영진: 비공개 리그 폴백에는 동호회 **로고만** 얹는다(이름·기록 없음).
//   리그 카드가 renderOnballCard(logo) 로 따로 부른다 — 이 파일(루트)은 여전히 로고 없이 그린다.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = '온볼 — 공이 온 순간은, 사라지지 않는다'

// 그리는 코드는 lib/og/onballCard.tsx 로 옮겼다(2026-11-08 — 리그 카드가 로고만 얹어 같은 카드를 쓰도록).
export default async function Image() {
  return renderOnballCard()
}
