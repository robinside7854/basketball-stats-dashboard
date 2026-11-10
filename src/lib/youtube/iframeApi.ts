// YouTube 재생기 준비 — 여러 재생기가 같이 기다려도 서로 덮어쓰지 않게(2026-11-10 리뷰).
//   종전엔 하이라이트 재생기와 기록 화면 재생기가 각자 `window.onYouTubeIframeAPIReady` 를 덮어써,
//   둘이 같은 화면에 있으면 먼저 건 쪽은 영영 불리지 않을 수 있었다.
const SRC = 'https://www.youtube.com/iframe_api'
const waiting: Array<() => void> = []

type YTWindow = Window & { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void }

/** 준비되면 cb 를 부른다. 이미 준비돼 있으면 바로. 돌려준 함수를 부르면 기다림을 취소한다. */
export function whenYouTubeReady(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const w = window as YTWindow
  if (w.YT && w.YT.Player) { cb(); return () => {} }
  waiting.push(cb)
  const prev = w.onYouTubeIframeAPIReady
  if (!(prev as { __mm?: boolean } | undefined)?.__mm) {
    const fire = () => {
      if (typeof prev === 'function') { try { prev() } catch { /* ignore */ } }
      for (const f of waiting.splice(0)) { try { f() } catch { /* ignore */ } }
    }
    ;(fire as { __mm?: boolean }).__mm = true
    w.onYouTubeIframeAPIReady = fire
  }
  preloadYouTubeIframeApi()
  return () => { const i = waiting.indexOf(cb); if (i >= 0) waiting.splice(i, 1) }
}

/** 스크립트만 미리 붙여 둔다(한 번만). */
export function preloadYouTubeIframeApi(): void {
  if (typeof document === 'undefined') return
  const w = window as YTWindow
  if (w.YT && w.YT.Player) return
  if (document.querySelector(`script[src="${SRC}"]`)) return
  const tag = document.createElement('script')
  tag.src = SRC
  document.head.appendChild(tag)
}
