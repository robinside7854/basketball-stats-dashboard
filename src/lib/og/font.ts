// OG 카드(ImageResponse/satori)용 한글 폰트 로더 — 루트 카드와 리그 카드가 공유한다.
//
// satori 는 시스템 폰트를 전혀 못 쓴다(브라우저가 아니라 순수 렌더러). 폰트를 직접 넘기지
// 않으면 한글이 전부 두부(□)로 나온다. 그렇다고 Noto Sans KR 전체를 받으면 수 MB라
// 메신저 크롤러의 짧은 타임아웃 안에 카드가 못 만들어진다 — 그래서 카드에 실제로 쓰이는
// 글자만 `&text=` 로 서브셋 요청한다(보통 수 KB).
//
// ⚠ 구형 User-Agent 로 요청하는 이유: Google Fonts 는 최신 UA 에게 woff2 를 주는데
//   satori 는 woff2 를 못 읽는다. 구형 UA 로 요청해야 truetype/opentype 을 받는다.
export async function loadKoreanFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`
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
    // 폰트를 못 받아도 카드 자체는 나와야 한다 — 호출부가 fonts: undefined 로 폴백한다.
    return null
  }
}

// 카드에 등장하는 문자열들에서 중복 없는 글리프 집합을 만든다(서브셋 요청용).
export function glyphSet(...texts: string[]): string {
  return Array.from(new Set(texts.join('').split(''))).join('')
}
