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

// 제목에서 날짜(YYMMDD)와 경기 번호 파싱
// 예: "260418 경기 9" → { date: '2026-04-18', gameNum: 9 }
function parseTitle(title: string): { date: string; gameNum: number } | null {
  const match = title.match(/(\d{6})\s*[가-힣]*\s*경기\s*(\d+)/)
  if (!match) return null
  const date = parseYymmdd(match[1])
  if (!date) return null
  return { date, gameNum: Number(match[2]) }
}

async function getChannelId(handle: string, apiKey: string): Promise<string | null> {
  const clean = handle.replace(/^@/, '')
  // Try forHandle first (newer API)
  let res = await fetch(`${YT_API}/channels?part=id&forHandle=${encodeURIComponent('@' + clean)}&key=${apiKey}`)
  let json = await res.json()
  if (json.items?.length) return json.items[0].id

  // Fallback: forUsername
  res = await fetch(`${YT_API}/channels?part=id&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`)
  json = await res.json()
  if (json.items?.length) return json.items[0].id

  // Fallback: search
  res = await fetch(`${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=5&key=${apiKey}`)
  json = await res.json()
  if (json.items?.length) return json.items[0].snippet.channelId

  return null
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'YouTube API 키가 설정되지 않았습니다' }, { status: 500 })

  const { channelHandle, date } = await req.json()
  if (!channelHandle || !date) return NextResponse.json({ error: '채널명과 날짜를 입력하세요' }, { status: 400 })

  // 1. 채널 ID 조회
  const channelId = await getChannelId(channelHandle, apiKey)
  if (!channelId) return NextResponse.json({ error: `채널을 찾을 수 없습니다: ${channelHandle}` }, { status: 404 })

  // 2. 영상 목록 검색
  const videos = await searchVideos(channelId, date, apiKey)

  // 3. 제목 파싱 — 해당 날짜의 경기만 필터
  type VideoMatch = { videoId: string; title: string; date: string; gameNum: number; url: string }
  const matched: VideoMatch[] = []
  for (const item of videos) {
    const title: string = item.snippet?.title ?? ''
    const parsed = parseTitle(title)
    if (!parsed || parsed.date !== date) continue
    matched.push({
      videoId: item.id.videoId,
      title,
      date: parsed.date,
      gameNum: parsed.gameNum,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    })
  }

  if (matched.length === 0) {
    return NextResponse.json({ error: `${date} 날짜의 경기 영상을 찾지 못했습니다`, channelId }, { status: 404 })
  }

  // 4. 해당 날짜의 league_games 조회 (round_num 오름차순)
  const supabase = createClient()
  const { data: games, error } = await supabase
    .from('league_games')
    .select('id, round_num, home_team_id, away_team_id')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('round_num', { ascending: true })

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
}
