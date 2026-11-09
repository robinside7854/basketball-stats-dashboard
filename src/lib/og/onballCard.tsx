import { ImageResponse } from 'next/og'
import { glyphSet, loadKoreanFont } from '@/lib/og/font'

// 온볼 공용 미리보기 카드 그리기 — app/opengraph-image.tsx(루트)와 리그 카드의 비공개 폴백이 함께 쓴다.
const size = { width: 1200, height: 630 }

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

/**
 * 온볼 공용 카드. logo 를 넘기면 오른쪽에 동호회 로고만 얹는다(이름은 넣지 않는다).
 *   — 2026-11-08 운영진: 비공개 리그 링크도 「로고만」 보이게. 이름·기록은 여전히 넣지 않는다.
 */
export async function renderOnballCard(logo?: string | null) {
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
            로고 파일과 같은 형태를 쓴다. */}
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

        {/* 동호회 로고(있을 때만) — 오른쪽 가운데. 태그라인(왼쪽, 약 560px)과 겹치지 않는 자리 */}
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- satori(ImageResponse) 는 img 만 받는다
          <img src={logo} width={320} height={320} alt="" style={{ position: 'absolute', right: 80, top: 150 }} />
        )}

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
