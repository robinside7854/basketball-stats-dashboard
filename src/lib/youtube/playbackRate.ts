// 기록 화면 영상 재생 속도 — 한 벌. 선택지·기억(localStorage)·다음/이전 단계 계산을 여기서만 한다.
// 실측(2026-11-03): 10분 경기를 8분에 기록 — 병목은 손이 아니라 영상 재생 시간이라 속도 버튼을 넣었다.
export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

const KEY = 'record:playbackRate'

export function loadPlaybackRate(): PlaybackRate {
  try {
    const v = Number(localStorage.getItem(KEY))
    return (PLAYBACK_RATES as readonly number[]).includes(v) ? (v as PlaybackRate) : 1
  } catch { return 1 }
}

export function savePlaybackRate(rate: PlaybackRate) {
  try { localStorage.setItem(KEY, String(rate)) } catch { /* 사생활 모드 등 — 기억만 못 할 뿐 */ }
}

/** 한 단계 빠르게/느리게. 끝에서는 그대로. */
export function stepPlaybackRate(current: PlaybackRate, dir: 1 | -1): PlaybackRate {
  const i = PLAYBACK_RATES.indexOf(current)
  const next = Math.min(PLAYBACK_RATES.length - 1, Math.max(0, i + dir))
  return PLAYBACK_RATES[next]
}

export function formatPlaybackRate(rate: PlaybackRate): string {
  return `${rate}×`
}
