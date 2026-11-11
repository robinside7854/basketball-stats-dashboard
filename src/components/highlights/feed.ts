// 리그 하이라이트 피드(리뉴얼 4단계, 2026-10-12) 전용 옵션 — 공용 브라우저(HighlightsBrowser ·
// PlayerHighlightsBrowser)는 파란날개 대회 화면도 쓰므로, 이 옵션을 넘긴 호출부만 모양·동작이 바뀐다.
//
// 피드가 바꾸는 것
//   · 재생기를 위에 고정(모바일 sticky · PC 왼쪽 sticky) + 「YouTube 앱으로 열기」 상시
//   · 목록은 모바일에서 자체 스크롤 대신 페이지 스크롤(고정된 재생기 아래로 흐른다)
//   · URL 동기화를 history.replaceState 로 — 클립을 넘길 때마다 서버 페이지를 다시 그리지 않고,
//     피드의 필터 파라미터(f·date·player)는 지우지 않고 보존한다.

export type HighlightsFeedOptions = {
  /** 브라우저가 URL 을 다시 쓸 때 그대로 남길 쿼리 키 (피드 필터) */
  preserveParams: string[]
}

/** 재생기 칸 — 모바일은 화면 높이가 넉넉할 때만 고정(가로 모드·작은 창에서 목록이 안 보이는 걸 막는다).
 *  top 은 리그 상단 바(44px) 바로 아래. 배경을 깔아 고정된 재생기 밑으로 목록이 비치지 않게 한다. */
export const FEED_PLAYER_COL =
  'lg:col-span-7 space-y-2 z-[5] -mx-4 px-4 py-2 lg:mx-0 lg:px-0 lg:py-0 ' +
  '[@media(min-height:560px)]:sticky [@media(min-height:560px)]:top-[44px] lg:sticky lg:top-[60px]'

export const FEED_LIST_COL = 'lg:col-span-5'

/** 목록 — 폰·PC 모두 상자 안에서만 넘긴다(2026-11-11 운영진 「페이지가 세로로 너무 길다」 —
 *  폰은 클립 수만큼 페이지가 늘어 100개면 수천 px 였다). 폰 상자 높이 = 화면에서 재생기·상단 바·하단 메뉴를 뺀 만큼(최소 260px).
 *  날짜 머리줄의 sticky 는 상자 안에서 그대로 붙는다. */
export const FEED_LIST_SCROLL =
  'overflow-y-auto overscroll-contain pr-1 [&_[data-clip-idx]]:scroll-mt-0 ' +
  'max-h-[max(260px,calc(100dvh-460px))] lg:max-h-[calc(100dvh-140px)]'

/** 피드 모드의 URL 동기화 — 보존 키는 현재 주소에서 가져오고, 브라우저 자기 키만 덮어쓴다. */
export function replaceFeedUrl(own: URLSearchParams, preserve: string[]) {
  if (typeof window === 'undefined') return
  const cur = new URLSearchParams(window.location.search)
  const next = new URLSearchParams()
  for (const k of preserve) {
    const v = cur.get(k)
    if (v) next.set(k, v)
  }
  own.forEach((v, k) => { if (!preserve.includes(k)) next.set(k, v) })
  const qs = next.toString()
  const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
  if (url !== `${window.location.pathname}${window.location.search}`) {
    window.history.replaceState(null, '', url)
  }
}
