// 날짜로 채널 영상 찾기 — 자동 연동(syncYoutubeForLeague)과 「목록에서 고르기」(youtube-videos)가
// **같은 함수**를 쓴다. 두 경로가 다른 검색어를 쓰면 한쪽에서만 보이는 영상이 생긴다.
//
// ⚠ 검색어는 **날짜뿐**이다. `경기` 같은 단어를 붙이면 제목 규칙이 바뀐 날 영상이 통째로 빠진다
//   (9/5 영상 10개가 하나도 안 걸린 원인 중 하나).
// ⚠ 날짜 표기가 두 가지라 **두 번** 검색한다 — `261010` / `20261010` (2026-10-10).
//   YouTube 검색은 단어 단위라 한쪽으로는 다른 쪽 제목이 안 걸린다. OR(`|`) 연산자 한 번으로
//   줄일 수도 있지만 동작을 여기서 검증할 수 없어, 확실한 두 번을 택했다.
//   search.list 는 호출당 100유닛 → 연동 1회 200유닛.

import { dateSearchKeys, isOtherDateTitle } from './videoTitle'

const YT_API = 'https://www.googleapis.com/youtube/v3'

export interface DateVideo {
  videoId: string
  /** NFC 정규화된 제목 */
  title: string
  publishedAt: string
  thumbnail: string | null
  url: string
}

export async function searchChannelVideosByDate(
  channelId: string,
  date: string, // YYYY-MM-DD
  apiKey: string,
): Promise<{ videos: DateVideo[]; error: string | null }> {
  const after = new Date(date); after.setDate(after.getDate() - 7)
  const before = new Date(date); before.setDate(before.getDate() + 30)
  const { short, long } = dateSearchKeys(date)

  const results = await Promise.all([short, long].map(async q => {
    const url = `${YT_API}/search?part=snippet&channelId=${channelId}`
      + `&q=${encodeURIComponent(q)}&type=video&maxResults=50&order=date`
      + `&publishedAfter=${after.toISOString()}&publishedBefore=${before.toISOString()}&key=${apiKey}`
    try {
      const res = await fetch(url)
      const json = await res.json()
      if (!res.ok) return { items: [], error: (json?.error?.message as string | undefined) ?? `YouTube 검색 실패 (${res.status})` }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { items: (json.items ?? []) as any[], error: null }
    } catch (e) {
      return { items: [], error: e instanceof Error ? e.message : 'YouTube 검색 실패' }
    }
  }))

  const byId = new Map<string, DateVideo>()
  for (const r of results) {
    for (const it of r.items) {
      const videoId = (it.id?.videoId ?? '') as string
      if (!videoId || byId.has(videoId)) continue
      // ⚠ NFC 정규화 필수 — YouTube API 는 한글 제목을 **NFD(자모 분리형)** 으로 돌려준다.
      //   화면에는 똑같이 보여도 소스에 적은 완성형과 문자열로 절대 일치하지 않는다(2026-08-22).
      const title = ((it.snippet?.title ?? '') as string).normalize('NFC')
      if (isOtherDateTitle(title, date)) continue
      byId.set(videoId, {
        videoId,
        title,
        publishedAt: (it.snippet?.publishedAt ?? '') as string,
        thumbnail: (it.snippet?.thumbnails?.default?.url ?? null) as string | null,
        url: `https://www.youtube.com/watch?v=${videoId}`,
      })
    }
  }

  // 한쪽만 실패하면 그 표기의 영상이 조용히 빠진다 — 결과가 있어도 오류를 함께 알린다.
  const error = results.find(r => r.error)?.error ?? null
  return { videos: [...byId.values()], error }
}
