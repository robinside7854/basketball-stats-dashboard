import { NextResponse } from 'next/server'

const CHANNEL_HANDLE = 'basket-lab'
const YT_BASE = 'https://www.googleapis.com/youtube/v3'

// 서버 인스턴스 내 채널 ID 캐싱 (재배포 전까지 유지)
let cachedChannelId: string | null = null

async function getChannelId(apiKey: string): Promise<string | null> {
  if (cachedChannelId) return cachedChannelId
  const res = await fetch(`${YT_BASE}/channels?part=id&forHandle=${CHANNEL_HANDLE}&key=${apiKey}`)
  const data = await res.json()
  const id = data.items?.[0]?.id ?? null
  if (id) cachedChannelId = id
  return id
}

// 제목 파싱: [라운드] 파란날개 : 상대팀 [대회명] YYYY/MM/DD
function parseTitle(title: string) {
  const match = title.match(
    /\[([^\]]+)\]\s*(.*?)\s*:\s*(.*?)\s*\[([^\]]+)\]\s*(\d{4}\/\d{2}\/\d{2})/
  )
  if (!match) return {}
  const [, round, team1, team2, tournament, dateRaw] = match
  const isPalanFirst = team1.includes('파란날개')
  const opponent = (isPalanFirst ? team2 : team1).trim()
  return { round, opponent, tournament, date: dateRaw.replace(/\//g, '-') }
}

// 상대팀 이름 유사도 (포함 여부 기준)
function opponentScore(parsed: ReturnType<typeof parseTitle>, opponent: string): number {
  if (!parsed.opponent) return 0
  if (parsed.opponent === opponent) return 10
  if (parsed.opponent.includes(opponent) || opponent.includes(parsed.opponent)) return 5
  return 0
}

export async function GET(req: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY가 설정되지 않았습니다. .env.local에 추가해주세요.' },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // YYYY-MM-DD
  const opponent = searchParams.get('opponent') ?? ''

  const channelId = await getChannelId(apiKey)
  if (!channelId) {
    return NextResponse.json({ error: '@basket-lab 채널을 찾을 수 없습니다' }, { status: 404 })
  }

  // 경기일 -3일 ~ +14일 범위 검색 (영상 업로드 지연 고려)
  const gameDate = date ? new Date(date) : new Date()
  const after = new Date(gameDate)
  after.setDate(after.getDate() - 3)
  const before = new Date(gameDate)
  before.setDate(before.getDate() + 14)

  const q = `파란날개 ${opponent}`.trim()
  const url = [
    `${YT_BASE}/search`,
    `?part=snippet`,
    `&channelId=${channelId}`,
    `&q=${encodeURIComponent(q)}`,
    `&type=video`,
    `&publishedAfter=${after.toISOString()}`,
    `&publishedBefore=${before.toISOString()}`,
    `&maxResults=10`,
    `&key=${apiKey}`,
  ].join('')

  const res = await fetch(url)
  const data = await res.json()

  if (!res.ok) {
    return NextResponse.json(
      { error: data.error?.message ?? 'YouTube API 오류' },
      { status: 500 }
    )
  }

  type YTItem = {
    id: { videoId: string }
    snippet: { title: string; publishedAt: string; thumbnails: { default: { url: string } } }
  }

  const videos = (data.items ?? []).map((item: YTItem) => {
    const videoId = item.id.videoId
    const title = item.snippet.title
    const parsed = parseTitle(title)
    const score = opponentScore(parsed, opponent) + (parsed.date === date ? 5 : 0)
    return {
      video_id: videoId,
      title,
      published_at: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.default?.url ?? null,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      parsed,
      score,
    }
  })

  // 점수 높은 순 정렬
  videos.sort((a: { score: number }, b: { score: number }) => b.score - a.score)

  return NextResponse.json({ videos })
}
