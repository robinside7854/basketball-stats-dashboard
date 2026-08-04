import { ImageResponse } from 'next/og'

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
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = '온볼 — 공이 온 순간은, 사라지지 않는다'

// 다크 팔레트 하드코딩 이유: ImageResponse(satori)는 애플리케이션 스타일시트를 전혀 읽지 않고
// react 트리의 inline style만 본다. 그래서 --mm-* 변수를 그대로 못 쓰고, globals.css .dark
// 블록의 실제 hex 값을 그대로 옮겨왔다 (mm-ground/mm-ink/mm-yellow/mm-muted, 2026-08 기준).
const COLOR = {
  ground: '#0A0A0A',
  ink: '#FAFAFA',
  muted: '#C4C4CB',
  yellow: '#FDE047',
}

// 카드에 쓰이는 한글 글자만 모아 Noto Sans KR 서브셋을 받아온다 — 전체 폰트를 받으면
// 수 MB라 요청마다 지연이 커진다. 정적 카드라 텍스트가 고정이므로 빌드 시 한 번만 계산해도
// 되지만, Next 파일 컨벤션 특성상 요청마다 도는 함수 안에서 fetch — 응답은 Next가 캐시한다.
async function loadKoreanFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`
    // 구형 User-Agent로 요청해 woff2 대신 truetype을 받는다 (satori는 woff2 미지원).
    const cssRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:1.9)' },
    })
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    const src = css.match(/src:\s*url\((.+?)\)\s*format\(['"](?:opentype|truetype)['"]\)/)
    if (!src) return null
    const fontRes = await fetch(src[1])
    if (!fontRes.ok) return null
    return await fontRes.arrayBuffer()
  } catch {
    return null
  }
}

const BRAND = 'ONBALL'
const TAGLINE_LINE1 = '공이 온 순간은,'
const TAGLINE_LINE2 = '사라지지 않는다'
const SUBLINE = '구기 동호회 경기 기록 · 하이라이트 플랫폼'

export default async function Image() {
  const glyphs = Array.from(new Set((BRAND + TAGLINE_LINE1 + TAGLINE_LINE2 + SUBLINE).split(''))).join('')
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

        {/* 상단 워드마크 — 농구공 아이콘 + ONBALL */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={COLOR.yellow} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="2" x2="12" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M5 5 Q12 12 5 19" />
            <path d="M19 5 Q12 12 19 19" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, color: COLOR.ink, letterSpacing: 6 }}>{BRAND}</div>
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
