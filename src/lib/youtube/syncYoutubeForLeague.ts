// YouTube 자동 매핑 로직 — 리그의 채널 핸들 + 날짜 → 해당 날짜 league_games 에 youtube_url 채우기
//
// 사용처
//   1. POST /api/leagues/[leagueId]/youtube-sync (수동, PIN 검증)
//   2. GET  /api/cron/youtube-sync                (매주 토 22:00 KST 자동)
//   3. PATCH /api/leagues/[leagueId]/games       (게임 저장 시 백그라운드 시도)
//
// 반환값 규격 통일 — 로깅/응답 재사용에 필요.
//
// 주의: YOUTUBE_API_KEY 쿼터 절약을 위해 caller 가 스킵 조건(youtube_channel 유무·오늘 게임 유무)을 미리 필터링해야 한다.

import type { SupabaseClient } from '@supabase/supabase-js'

const YT_API = 'https://www.googleapis.com/youtube/v3'

export type SyncOutcome =
  | { ok: true; mapped: number; totalVideos: number; channelId: string; details: SyncDetail[] }
  | { ok: false; reason: string; channelId?: string; searchedVideos?: number; foundTitles?: string[] }

export interface SyncDetail {
  gameNum: number
  title: string
  url: string
  action: string
}

// 채널 핸들(@xxx), 채널 URL(youtube.com/@xxx), 채널 ID(UCxxx) 모두 처리
export async function getChannelId(
  input: string,
  apiKey: string
): Promise<{ id: string | null; debug: string[] }> {
  const debug: string[] = []

  if (/^UC[\w-]{22}$/.test(input.trim())) {
    debug.push(`direct channelId: ${input.trim()}`)
    return { id: input.trim(), debug }
  }

  let handle = input.trim()
  const urlMatch = input.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|(?:@|c\/)?([\w가-힣.-]+))/)
  if (urlMatch) {
    if (urlMatch[1]) {
      debug.push(`extracted channelId from URL: ${urlMatch[1]}`)
      return { id: urlMatch[1], debug }
    }
    handle = '@' + urlMatch[2].replace(/^@/, '')
  }

  const clean = handle.replace(/^@/, '')

  let res = await fetch(`${YT_API}/channels?part=id&forHandle=${encodeURIComponent('@' + clean)}&key=${apiKey}`)
  let json = await res.json()
  debug.push(`forHandle(@${clean}): ${res.status}, items:${json.items?.length ?? 0}${json.error ? ` err:${json.error.message}` : ''}`)
  if (json.items?.length) return { id: json.items[0].id, debug }

  res = await fetch(`${YT_API}/channels?part=id&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`)
  json = await res.json()
  debug.push(`forUsername(${clean}): ${res.status}, items:${json.items?.length ?? 0}`)
  if (json.items?.length) return { id: json.items[0].id, debug }

  res = await fetch(`${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=5&key=${apiKey}`)
  json = await res.json()
  debug.push(`search(${handle}): ${res.status}, items:${json.items?.length ?? 0}`)
  if (json.items?.length) return { id: json.items[0].snippet.channelId, debug }

  return { id: null, debug }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchVideos(channelId: string, dateStr: string, apiKey: string): Promise<any[]> {
  const parts = dateStr.split('-')
  const yymmdd = parts[0].slice(2) + parts[1] + parts[2] // e.g. 260418
  const query = `${yymmdd} 경기`

  const after = new Date(dateStr)
  after.setDate(after.getDate() - 7)
  const before = new Date(dateStr)
  before.setDate(before.getDate() + 30)

  const url = `${YT_API}/search?part=snippet&channelId=${channelId}&q=${encodeURIComponent(query)}&type=video&maxResults=50&publishedAfter=${after.toISOString()}&publishedBefore=${before.toISOString()}&key=${apiKey}`
  const res = await fetch(url)
  const json = await res.json()
  return json.items ?? []
}

/**
 * 지정 리그의 channelHandle + date 조합으로 영상 매핑 → league_games.youtube_url 채우기.
 * 이미 매핑된 게임은 덮어씀 (idempotent — 같은 검색어라면 같은 결과).
 *
 * @param supabase Service Role 클라이언트 (createClient() from '@/lib/supabase/admin')
 * @param leagueId 리그 UUID
 * @param channelHandle 채널 핸들/URL/ID
 * @param date YYYY-MM-DD
 * @param apiKey process.env.YOUTUBE_API_KEY
 */
export async function syncYoutubeForLeague(
  supabase: SupabaseClient,
  leagueId: string,
  channelHandle: string,
  date: string,
  apiKey: string
): Promise<SyncOutcome> {
  // 1. 채널 ID
  const { id: channelId } = await getChannelId(channelHandle, apiKey)
  if (!channelId) return { ok: false, reason: `채널을 찾을 수 없습니다: ${channelHandle}` }

  // 2. 영상 목록 검색
  const videos = await searchVideos(channelId, date, apiKey)

  // 3. 제목에서 경기 번호 추출
  type VideoMatch = { videoId: string; title: string; gameNum: number; url: string }
  const matched: VideoMatch[] = []
  const seenGameNums = new Set<number>()

  for (const item of videos) {
    const title: string = item.snippet?.title ?? ''
    const videoId: string = item.id?.videoId ?? ''
    if (!videoId) continue

    let gameNum: number | null = null
    const explicit = title.match(/경기\s*(\d+)/)
    if (explicit) {
      const n = parseInt(explicit[1], 10)
      if (n >= 1 && n <= 9) gameNum = n
    }

    if (gameNum == null) {
      const allNums = title.match(/\d+/g) ?? []
      const candidates = allNums.filter(n => n.length <= 2).map(Number).filter(n => n >= 1 && n <= 9)
      if (candidates.length > 0) gameNum = candidates[0]
    }

    if (gameNum == null) continue
    if (seenGameNums.has(gameNum)) continue
    seenGameNums.add(gameNum)

    matched.push({
      videoId,
      title,
      gameNum,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    })
  }

  if (matched.length === 0) {
    const foundTitles: string[] = videos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .slice(0, 10).map((v: any) => v.snippet?.title ?? '')
    return {
      ok: false,
      reason: `경기 번호가 포함된 영상 없음 (channel=${channelHandle}, date=${date})`,
      channelId,
      searchedVideos: videos.length,
      foundTitles,
    }
  }

  // 4. 기존 슬랏 조회
  const { data: existingGames, error: gErr } = await supabase
    .from('league_games')
    .select('id, slot_num')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('id', { ascending: true })

  if (gErr) return { ok: false, reason: `DB error: ${gErr.message}` }

  const slotToId = new Map<number, string>()
  for (const g of (existingGames ?? []) as { id: string; slot_num: number }[]) {
    if (!slotToId.has(g.slot_num)) slotToId.set(g.slot_num, g.id)
  }

  // 5. update or insert per gameNum
  const details: SyncDetail[] = []
  for (const v of matched) {
    if (slotToId.has(v.gameNum)) {
      const { error } = await supabase
        .from('league_games')
        .update({ youtube_url: v.url })
        .eq('league_id', leagueId)
        .eq('date', date)
        .eq('slot_num', v.gameNum)
      details.push({ gameNum: v.gameNum, title: v.title, url: v.url, action: error ? `err:${error.message}` : 'updated' })
    } else {
      const { error } = await supabase
        .from('league_games')
        .insert({
          league_id: leagueId,
          date,
          slot_num: v.gameNum,
          round_num: v.gameNum,
          youtube_url: v.url,
          home_score: 0,
          away_score: 0,
          is_complete: false,
          is_started: false,
        })
      slotToId.set(v.gameNum, 'new')
      details.push({ gameNum: v.gameNum, title: v.title, url: v.url, action: error ? `err:${error.message}` : 'created' })
    }
  }

  const mapped = details.filter(d => !d.action.startsWith('err')).length
  return { ok: true, mapped, totalVideos: matched.length, channelId, details }
}
