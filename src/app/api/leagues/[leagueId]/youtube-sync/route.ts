import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

const YT_API = 'https://www.googleapis.com/youtube/v3'

// YYMMDD → YYYY-MM-DD (e.g. 260418 → 2026-04-18)
function parseYymmdd(s: string): string | null {
  if (!/^\d{6}$/.test(s)) return null
  const yy = s.slice(0, 2)
  const mm = s.slice(2, 4)
  const dd = s.slice(4, 6)
  const year = Number(yy) >= 50 ? `19${yy}` : `20${yy}`
  return `${year}-${mm}-${dd}`
}

// 제목에서 날짜(YYMMDD)와 경기 번호를 독립적으로 파싱
// 지원: "260103 경기1", "260103 경기 9", "26.01.03 경기9", "2경기 260103" 등
function parseTitle(title: string): { date: string; gameNum: number } | null {
  // 1. 제목에서 6자리 숫자(날짜) 추출
  const dateM = title.match(/(\d{6})/)
  if (!dateM) return null
  const date = parseYymmdd(dateM[1])
  if (!date) return null

  // 2. "경기" 다음 숫자 추출 (경기1, 경기 1, 경기#1 모두 지원)
  const gameM = title.match(/경기\s*#?(\d+)/)
  if (gameM) return { date, gameNum: Number(gameM[1]) }

  // 3. 숫자 먼저 오는 경우: "1경기", "9번째경기"
  const reverseM = title.match(/(\d+)\s*(?:번째)?\s*경기/)
  if (reverseM) return { date, gameNum: Number(reverseM[1]) }

  return null
}

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

  // 3. 제목에서 경기 번호만 추출 (날짜 비교 없음 — 검색 쿼리가 이미 날짜 필터)
  type VideoMatch = { videoId: string; title: string; gameNum: number; url: string }
  const matched: VideoMatch[] = []
  for (const item of videos) {
    const title: string = item.snippet?.title ?? ''
    // "경기1", "경기 1", "경기#1" 형식에서 숫자 추출
    const gameM = title.match(/경기\s*#?(\d+)/)
    if (!gameM) continue
    matched.push({
      videoId: item.id?.videoId ?? '',
      title,
      gameNum: Number(gameM[1]),
      url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
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

  // 4. 해당 날짜의 league_games 조회 (slot_num 오름차순)
  const supabase = createClient()
  const { data: games, error } = await supabase
    .from('league_games')
    .select('id, slot_num, home_team_id, away_team_id')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('slot_num', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!games || games.length === 0) {
    return NextResponse.json({ error: `${date}에 등록된 경기 일정이 없습니다` }, { status: 404 })
  }

  // 5. gameNum 기준으로 매핑 (경기 1 → games[0], 경기 9 → games[8])
  const updates: { gameId: string; url: string; gameNum: number; title: string }[] = []
  for (const v of matched) {
    const idx = v.gameNum - 1
    if (idx >= 0 && idx < games.length) {
      updates.push({ gameId: games[idx].id, url: v.url, gameNum: v.gameNum, title: v.title })
    }
  }

  // 6. league_games.youtube_url 업데이트
  await Promise.all(
    updates.map(u =>
      supabase
        .from('league_games')
        .update({ youtube_url: u.url })
        .eq('id', u.gameId)
    )
  )

  return NextResponse.json({
    mapped: updates.length,
    total_videos: matched.length,
    total_games: games.length,
    details: updates,
  })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[youtube-sync] unhandled error:', msg)
    return NextResponse.json({ error: `서버 오류: ${msg}` }, { status: 500 })
  }
}
