export function extractYouTubeId(url: string): string | null {
  if (!url) return null
  const trimmed = url.trim()
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,       // https://youtu.be/ID
    /[?&]v=([a-zA-Z0-9_-]{11})/,             // ?v=ID or &v=ID (watch, m.youtube 등)
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,  // 라이브 스트림
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) return match[1]
  }
  return null
}

export function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// 기록 화면·하이라이트 플레이어가 같은 ±초 이동을 쓰도록 한 곳에 둔다.
// 0 미만으로 보내면 영상 앞 구간에서 위치가 튀는 대신 처음에 멈추게 clamp.
export function seekBy(player: YT.Player, delta: number): void {
  player.seekTo(Math.max(0, (player.getCurrentTime() ?? 0) + delta), true)
}
