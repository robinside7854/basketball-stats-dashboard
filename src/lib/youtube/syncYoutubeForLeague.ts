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
    // ⚠ NFC 정규화 필수 — YouTube API 는 한글 제목을 **NFD(자모 분리형)** 으로 돌려준다.
    //   화면에는 똑같이 '쿼터' 로 보이지만 문자열로는 U+110F U+116F U+1110 U+1165 라
    //   소스에 적은 완성형 '쿼터'(U+CFFC U+D130) 와 절대 일치하지 않는다.
    //   2026-08-22 에 쿼터 가드를 넣고도 그대로 뚫린 원인이 이것이었다 — 정규식은 맞았고
    //   비교 대상이 다른 표현이었을 뿐이라 로그만 봐서는 원인이 드러나지 않는다.
    const title: string = (item.snippet?.title ?? '').normalize('NFC')
    const videoId: string = item.id?.videoId ?? ''
    if (!videoId) continue

    let gameNum: number | null = null
    const explicit = title.match(/경기\s*(\d+)/)
    if (explicit) {
      const n = parseInt(explicit[1], 10)
      if (n >= 1 && n <= 9) gameNum = n
    }

    // 폴백: 제목에 경기 번호가 명시돼 있지 않을 때 첫 한두 자리 숫자를 경기 번호로 본다.
    //   ⚠ 제목에 쿼터 표기가 있으면 이 폴백을 쓰지 않는다 (2026-08-22 사고).
    //   "260822 준비팀vs대항팀B 1쿼터" 같은 제목에서 폴백이 돌면 **쿼터 번호가 경기 번호로 읽힌다** —
    //   같은 경기의 1쿼터·4쿼터가 1경기 슬롯과 4경기 슬롯에 따로 붙었고, 아무 경고도 없었다.
    //   쿼터 단위로 쪼갠 영상은 애초에 "슬롯 1개 = 영상 1개" 모델에 안 맞으므로 기록 화면에서
    //   손으로 붙이게 두는 편이 낫다. 틀리게 붙이느니 안 붙이는 게 낫다.
    const looksLikeQuarter = /\d\s*쿼터/.test(title) || /\d\s*Q(?![a-z])/i.test(title) || /quarter/i.test(title)
    if (gameNum == null && !looksLikeQuarter) {
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
      reason: `제목에서 경기 번호를 읽을 수 있는 영상이 없습니다 (${videos.length}개 검색됨). `
        + `기록 화면에서 슬롯을 고른 뒤 "목록에서 고르기"로 직접 연결하세요.`,
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

  // 슬롯이 이미 짜여 있는 날에는 영상 때문에 슬롯을 새로 만들지 않는다 (2026-08-22 사고).
  //   insert 경로는 is_exhibition 을 넘기지 않아 DB 기본값 false 로 들어간다 — 친선전 날짜에
  //   **정규전 슬롯이 하나 생기고**, 거기에 기록하면 리그 순위·개인 스탯에 그대로 섞인다.
  //   슬롯이 0개인 날(일정을 아직 안 연 날)에는 종전대로 만들어 준다.
  const hasAnySlot = (existingGames ?? []).length > 0

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
    } else if (hasAnySlot) {
      details.push({ gameNum: v.gameNum, title: v.title, url: v.url, action: `skipped:슬롯 ${v.gameNum} 없음(일정에 없는 번호라 새로 만들지 않음)` })
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

  const mapped = details.filter(d => !d.action.startsWith('err') && !d.action.startsWith('skipped')).length
  return { ok: true, mapped, totalVideos: matched.length, channelId, details }
}
