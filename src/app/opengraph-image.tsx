import { ImageResponse } from 'next/og'
import { glyphSet, loadKoreanFont } from '@/lib/og/font'

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
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = '온볼 — 공이 온 순간은, 사라지지 않는다'

// 다크 팔레트 하드코딩 이유: ImageResponse(satori)는 애플리케이션 스타일시트를 전혀 읽지 않고
// react 트리의 inline style만 본다. 그래서 --mm-* 변수를 그대로 못 쓰고, globals.css .dark
// 블록의 실제 hex 값을 그대로 옮겨왔다 (mm-ground/mm-ink/mm-yellow/mm-muted, 2026-08 기준).
const COLOR = {
  // 2026-08-10: 앱 전역 웜톤 통일에 맞춰 배경만 --mm-ground(dark) 현행값으로 교체.
  // 리그 카드(app/league/.../opengraph-image.tsx)와 같은 배경이어야 두 카드가 한 세트로 보인다.
  ground: '#191714',
  ink: '#F2EEE6',
  muted: '#A9A294',
  // 로고 파일(onball-logo.svg)이 다크 배경용으로 지정한 브랜드 옐로.
  // 앱 UI 토큰(--mm-yellow #F5C95C)과는 일부러 다르다 — UI 안에서 읽히는 색과
  // 브랜드 마크의 색은 역할이 다르고, 스플래시도 같은 #EAB308 을 쓴다.
  yellow: '#EAB308',
}

// 한글 서브셋 폰트 로더는 리그 카드와 공유한다 → src/lib/og/font.ts

const BRAND = 'ONBALL'
const TAGLINE_LINE1 = '공이 온 순간은,'
const TAGLINE_LINE2 = '사라지지 않는다'
const SUBLINE = '구기 동호회 경기 기록 · 하이라이트 플랫폼'

export default async function Image() {
  const glyphs = glyphSet(BRAND, TAGLINE_LINE1, TAGLINE_LINE2, SUBLINE)
  const fontData = await loadKoreanFont(glyphs, 700)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: COLOR.ground,
          padding: '80px 88px',
          position: 'relative',
        }}
      >
        {/* 브랜드 옐로 글로우 — 인트로 화면과 동일한 톤 */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -160,
            width: 680,
            height: 680,
            borderRadius: '50%',
            background: COLOR.yellow,
            opacity: 0.16,
            filter: 'blur(60px)',
          }}
        />

        {/* 상단 락업 — 브랜드 가이드의 onball-symbol.svg 패스 + 워드마크 + 밑줄.
            스플래시(globals.css .splash-*)·로고 파일과 같은 형태를 쓴다. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <svg width={70} height={61} viewBox="0 0 152 132" fill="none" stroke={COLOR.yellow} strokeWidth={8} strokeLinecap="round">
            <circle cx="76" cy="66" r="52" />
            <path d="M25 66 H127" />
            <path d="M76 14 V118" />
            <path d="M41 25 C 60 45, 60 87, 41 107" />
            <path d="M111 25 C 92 45, 92 87, 111 107" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: COLOR.ink, letterSpacing: 1, lineHeight: 1 }}>{BRAND}</div>
            <div style={{ display: 'flex', height: 4, marginTop: 5, background: COLOR.yellow, borderRadius: 2 }} />
          </div>
        </div>

        {/* 태그라인 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, color: COLOR.ink, lineHeight: 1.28, letterSpacing: -1 }}>
            {TAGLINE_LINE1}
          </div>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 700, color: COLOR.ink, lineHeight: 1.28, letterSpacing: -1 }}>
            {TAGLINE_LINE2}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: COLOR.muted, marginTop: 28, fontWeight: 700 }}>
            {SUBLINE}
          </div>
        </div>

        {/* 하단 강조 바 */}
        <div style={{ display: 'flex', width: '100%', height: 12, background: COLOR.yellow, borderRadius: 6 }} />
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: 'Noto Sans KR', data: fontData, weight: 700, style: 'normal' }]
        : undefined,
    }
  )
}
