import type { ActiveVideo, GameSlot, QuarterVideoMap } from './types'

// 붙여넣은 값에서 videoId 를 뽑는다. watch?v= · youtu.be/ · shorts/ · embed/ · 순수 ID 를 받는다.
//   기록원이 주소창을 통째로 복사하면 `&t=` `?si=` 같은 꼬리가 붙는데, 그대로 저장하면
//   플레이어가 못 읽는 경우가 있어 여기서 ID 만 남긴다.
export function extractVideoId(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  if (/^[\w-]{11}$/.test(v)) return v
  const m = v.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)
  return m ? m[1] : null
}

// 지금 화면에서 재생해야 할 영상 — 기록 중인 쿼터의 영상, 없으면 경기 대표 영상.
//   판정 규칙은 서버의 gameVideo.ts 와 같다(쿼터 영상 우선 → 대표 폴백).
//
// ⚠ **폴백했다는 사실을 버리지 않는다** (2026-09-18).
//   예전에는 `{url, startOffset}` 만 돌려줘서, 1쿼터 영상이 없을 때 조용히 2쿼터 영상을
//   틀면서도 화면은 계속 "1쿼터"라고 말했다. 배지는 `currentQuarter` 를, 플레이어는 이
//   폴백 결과를 보니 **둘이 다른 변수**라 구조적으로 어긋났다. 운영자는 그걸 보고
//   "영상 연동이 깨졌다"고 신고했는데 DB 는 멀쩡했다.
//   배지·배너가 **이 값 하나만** 읽게 해서 어긋날 수 없게 만든다.
export function computeActiveVideo(
  selectedSlot: GameSlot | null,
  quarterVideos: QuarterVideoMap,
  currentQuarter: number,
): ActiveVideo | null {
  if (!selectedSlot) return null
  const q = quarterVideos[currentQuarter]
  if (q) return { url: q.url, startOffset: q.start_offset, source: 'quarter', representativeQuarter: null }
  if (!selectedSlot.youtube_url) return null

  // 대표 영상이 몇 쿼터 것인지 되짚는다. 서버(games/[gameId]/videos 의 syncRepresentative)가
  //   저장할 때마다 **가장 이른 쿼터**를 대표로 맞추고 URL 도 정규화하므로, 최소 쿼터의 URL 과
  //   문자열이 같으면 그 번호가 맞다. 정규화 이전에 저장된 옛 행이면 안 맞아 null 로 떨어진다.
  const keys = Object.keys(quarterVideos).map(Number).filter(Number.isFinite)
  const earliest = keys.length > 0 ? Math.min(...keys) : null
  const repQuarter = earliest != null && quarterVideos[earliest]?.url === selectedSlot.youtube_url
    ? earliest
    : null

  return {
    url: selectedSlot.youtube_url,
    startOffset: selectedSlot.youtube_start_offset ?? 0,
    source: 'representative',
    representativeQuarter: repQuarter,
  }
}
