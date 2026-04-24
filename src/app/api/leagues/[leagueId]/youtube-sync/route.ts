import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

const YT_API = 'https://www.googleapis.com/youtube/v3'

// 채널 핸들(@xxx), 채널 URL(youtube.com/@xxx), 채널 ID(UCxxx) 모두 처리
async function getChannelId(input: string, apiKey: string): Promise<{ id: string | null; debug: string[] }> {
  const debug: string[] = []

  // 이미 채널 ID (UC로 시작하는 24자)
  if (/^UC[\w-]{22}$/.test(input.trim())) {
    debug.push(`direct channelId: ${input.trim()}`)
    return { id: input.trim(), debug }
  }

  // URL에서 핸들/ID 추출
  // youtube.com/@handle, youtube.com/channel/UCxxx, youtube.com/c/name
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

  // forHandle (최신 API)
  let res = await fetch(`${YT_API}/channels?part=id&forHandle=${encodeURIComponent('@' + clean)}&key=${apiKey}`)
  let json = await res.json()
  debug.push(`forHandle(@${clean}): ${res.status}, items:${json.items?.length ?? 0}${json.error ? ` err:${json.error.message}` : ''}`)
  if (json.items?.length) return { id: json.items[0].id, debug }

  // forUsername fallback
  res = await fetch(`${YT_API}/channels?part=id&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`)
  json = await res.json()
  debug.push(`forUsername(${clean}): ${res.status}, items:${json.items?.length ?? 0}`)
  if (json.items?.length) return { id: json.items[0].id, debug }

  // 채널 검색 fallback
  res = await fetch(`${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=5&key=${apiKey}`)
  json = await res.json()
  debug.push(`search(${handle}): ${res.status}, items:${json.items?.length ?? 0}`)
  if (json.items?.length) return { id: json.items[0].snippet.channelId, debug }

  return { id: null, debug }
}

async function searchVideos(channelId: string, dateStr: string, apiKey: string) {
  // YYMMDD 형태의 검색어 추출
  const parts = dateStr.split('-')
  const yymmdd = parts[0].slice(2) + parts[1] + parts[2] // e.g. 260418
  const query = `${yymmdd} 경기`

  // 업로드 날짜 범위 (전후 7일) — 녹화일과 업로드일이 다를 수 있음
  const after = new Date(dateStr)
  after.setDate(after.getDate() - 7)
  const before = new Date(dateStr)
  before.setDate(before.getDate() + 30)

  const url = `${YT_API}/search?part=snippet&channelId=${channelId}&q=${encodeURIComponent(query)}&type=video&maxResults=50&publishedAfter=${after.toISOString()}&publishedBefore=${before.toISOString()}&key=${apiKey}`
  const res = await fetch(url)
  const json = await res.json()
  return json.items ?? []
}

// Health check — confirms route is registered
export async function GET() {
  return NextResponse.json({ ok: true, route: 'youtube-sync' })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  try {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized — X-League-Pin 헤더 확인' }, { status: 401 })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube API 키 미설정 — Vercel 환경변수에 YOUTUBE_API_KEY를 추가하세요' }, { status: 500 })

  let body: { channelHandle?: string; date?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'request body 파싱 실패' }, { status: 400 }) }
  const { channelHandle, date } = body
  if (!channelHandle || !date) return NextResponse.json({ error: '채널명과 날짜를 입력하세요' }, { status: 400 })

  // 1. 채널 ID 조회
  const { id: channelId, debug: channelDebug } = await getChannelId(channelHandle, apiKey)
  if (!channelId) return NextResponse.json({ error: `채널을 찾을 수 없습니다: ${channelHandle}`, debug: channelDebug }, { status: 404 })

  // 2. 영상 목록 검색
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos: any[] = await searchVideos(channelId, date, apiKey)

  // 3. 제목에서 경기 번호 추출
  // 규칙: 6자리 날짜를 제외한 1~2자리 숫자(1-9) = 경기 번호
  // 중복 gameNum: YouTube가 컴필레이션·하이라이트 영상도 반환할 수 있음
  //   → 첫 번째 등장한 영상만 사용 (YouTube는 관련성 높은 순 반환)
  type VideoMatch = { videoId: string; title: string; gameNum: number; url: string }
  const matched: VideoMatch[] = []
  const seenGameNums = new Set<number>()

  for (const item of videos) {
    const title: string = item.snippet?.title ?? ''
    const videoId: string = item.id?.videoId ?? ''
    if (!videoId) continue

    const allNums = title.match(/\d+/g) ?? []
    const candidates = allNums.filter(n => n.length <= 2).map(Number).filter(n => n >= 1 && n <= 9)
    if (candidates.length === 0) continue

    const gameNum = candidates[candidates.length - 1]

    // 중복 gameNum이면 건너뜀 (첫 번째 영상이 가장 관련성 높음)
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const foundTitles: string[] = videos.slice(0, 10).map((v: any) => v.snippet?.title ?? '')
    return NextResponse.json({
      error: `경기 번호가 포함된 영상을 찾지 못했습니다. 채널: ${channelHandle}, 날짜: ${date}`,
      hint: '영상 제목에 "경기1", "경기 1" 형식이 포함되어야 합니다',
      channelId,
      searched_videos: videos.length,
      found_titles: foundTitles,
    }, { status: 404 })
  }

  // 4. 해당 날짜의 모든 기존 슬랏 조회
  const supabase = createClient()
  const { data: existingGames, error: gErr } = await supabase
    .from('league_games')
    .select('id, slot_num')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('id', { ascending: true }) // 중복 slot_num 있을 경우 첫 번째 row 우선

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  // slot_num → 첫 번째 game id (중복 row 방어)
  const slotToId = new Map<number, string>()
  for (const g of existingGames ?? []) {
    if (!slotToId.has(g.slot_num)) slotToId.set(g.slot_num, g.id)
  }

  // 5. 각 영상에 대해 slot_num으로 update (없으면 insert)
  const results: { gameNum: number; title: string; url: string; action: string }[] = []

  for (const v of matched) {
    if (slotToId.has(v.gameNum)) {
      // 기존 슬랏: slot_num 기준으로 직접 update (ID 오염 방지)
      const { error } = await supabase
        .from('league_games')
        .update({ youtube_url: v.url })
        .eq('league_id', leagueId)
        .eq('date', date)
        .eq('slot_num', v.gameNum)
      results.push({ gameNum: v.gameNum, title: v.title, url: v.url, action: error ? `err:${error.message}` : 'updated' })
    } else {
      // 없는 슬랏: 신규 insert
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
      results.push({ gameNum: v.gameNum, title: v.title, url: v.url, action: error ? `err:${error.message}` : 'created' })
    }
  }

  // 6. 업데이트 후 DB 재조회 — 실제 저장된 값 검증
  const { data: verifyGames } = await supabase
    .from('league_games')
    .select('slot_num, youtube_url')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('slot_num', { ascending: true })

  return NextResponse.json({
    mapped: results.filter(r => !r.action.startsWith('err')).length,
    total_videos: matched.length,
    details: results,
    db_state: (verifyGames ?? []).map(g => ({
      slot: g.slot_num,
      has_url: !!g.youtube_url,
      url_tail: g.youtube_url ? g.youtube_url.slice(-12) : null,
    })),
  })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[youtube-sync] unhandled error:', msg)
    return NextResponse.json({ error: `서버 오류: ${msg}` }, { status: 500 })
  }
}
