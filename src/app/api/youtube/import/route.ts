import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/client'

const YT_BASE = 'https://www.googleapis.com/youtube/v3'

const channelIdCache = new Map<string, string>()

async function getChannelId(apiKey: string, handle: string): Promise<string | null> {
  if (channelIdCache.has(handle)) return channelIdCache.get(handle)!
  const res = await fetch(`${YT_BASE}/channels?part=id&forHandle=${handle}&key=${apiKey}`)
  const data = await res.json()
  const id = data.items?.[0]?.id ?? null
  if (id) channelIdCache.set(handle, id)
  return id
}

// 패턴 1: [라운드] {팀명} : 상대팀 [대회명] YYYY/MM/DD  (결승/4강 등)
// 패턴 2: {팀명} : 상대팀 [대회명] YYYY/MM/DD           (예선, 라운드 표기 없음)
function parseTitle(title: string, teamName: string) {
  // 패턴 1 — 라운드 브래킷 있음
  const m1 = title.match(
    /\[([^\]]+)\]\s*(.*?)\s*:\s*(.*?)\s*\[([^\]]+)\]\s*(\d{4}\/\d{2}\/\d{2})/
  )
  if (m1) {
    const [, round, team1, team2, tournamentName, dateRaw] = m1
    const opponent = (team1.includes(teamName) ? team2 : team1).trim()
    const date = dateRaw.replace(/\//g, '-')
    return { round: round.trim(), opponent, tournament_name: tournamentName.trim(), date, year: parseInt(date.slice(0, 4)) }
  }

  // 패턴 2 — 라운드 브래킷 없이 팀 : 팀 [대회명] 날짜
  const m2 = title.match(
    /^(.*?)\s*:\s*(.*?)\s*\[([^\]]+)\]\s*(\d{4}\/\d{2}\/\d{2})/
  )
  if (m2) {
    const [, team1, team2, tournamentName, dateRaw] = m2
    const isPalanFirst = team1.includes(teamName)
    if (!isPalanFirst && !team2.includes(teamName)) return null // 팀명 없으면 무시
    const opponent = (isPalanFirst ? team2 : team1).trim()
    const date = dateRaw.replace(/\//g, '-')
    return { round: '', opponent, tournament_name: tournamentName.trim(), date, year: parseInt(date.slice(0, 4)) }
  }

  return null
}

const ROUND_PRIORITY: Record<string, number> = {
  '결승': 0, '4강': 1, '준결승': 1, '8강': 2, '16강': 3, '조별예선': 4,
}

export interface GameData {
  video_id: string
  title: string
  url: string
  date: string
  opponent: string
  round: string
  already_registered: boolean
}

export interface TournamentGroup {
  tournament_name: string
  year: number
  existing_tournament: { id: string; name: string; year: number; type: string } | null
  games: GameData[]
}

export async function GET(req: Request) {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY가 설정되지 않았습니다' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const after = searchParams.get('after')   // YYYY-MM-DD
  const before = searchParams.get('before') // YYYY-MM-DD
  const team = searchParams.get('team') ?? 'youth'
  const org  = searchParams.get('org') ?? 'paranalgae'
  const channelHandle = searchParams.get('channel') ?? 'basket-lab'
  const teamName = searchParams.get('teamName') ?? '파란날개'

  const channelId = await getChannelId(apiKey, channelHandle)
  if (!channelId) {
    return NextResponse.json({ error: `@${channelHandle} 채널을 찾을 수 없습니다` }, { status: 404 })
  }

  // 기간 파라미터 계산 (before는 +1일 하여 당일 포함)
  const afterISO = after ? new Date(after).toISOString() : undefined
  const beforeDate = before ? new Date(before) : new Date()
  beforeDate.setDate(beforeDate.getDate() + 1)
  const beforeISO = beforeDate.toISOString()

  // 페이지네이션 포함 전체 수집
  const rawVideos: Array<{
    video_id: string
    title: string
    url: string
    published_at: string
    parsed: NonNullable<ReturnType<typeof parseTitle>>
  }> = []

  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      part: 'snippet',
      channelId,
      q: teamName,
      type: 'video',
      // eventType 제한 없음 — 라이브 스트림 + 일반 업로드 모두 포함
      maxResults: '50',
      key: apiKey,
      ...(afterISO ? { publishedAfter: afterISO } : {}),
      publishedBefore: beforeISO,
      ...(pageToken ? { pageToken } : {}),
    })

    const res = await fetch(`${YT_BASE}/search?${params}`)
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error?.message ?? 'YouTube API 오류' },
        { status: 500 }
      )
    }

    type YTSearchItem = {
      id: { videoId: string }
      snippet: { title: string; publishedAt: string }
    }

    for (const item of (data.items ?? []) as YTSearchItem[]) {
      const videoId = item.id.videoId
      const title = item.snippet.title
      if (!title.includes(teamName)) continue
      const parsed = parseTitle(title, teamName)
      if (!parsed) continue
      rawVideos.push({
        video_id: videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published_at: item.snippet.publishedAt,
        parsed,
      })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  // 대회명 기준 그룹핑
  const groupMap = new Map<string, typeof rawVideos>()
  for (const v of rawVideos) {
    const key = v.parsed.tournament_name
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(v)
  }

  // DB에서 기존 대회 + 기등록 경기 조회
  const supabase = createClient()
  const { getTeamId } = await import('@/lib/supabase/get-team-id')
  const teamId = await getTeamId(org, team)
  const { data: existingTournaments } = teamId
    ? await supabase.from('tournaments').select('id, name, year, type').eq('team_id', teamId)
    : { data: [] }

  const teamTournamentIds = (existingTournaments ?? []).map(t => t.id)

  // 기등록 경기 조회 (youtube_url + date + opponent)
  const { data: existingGames } = teamTournamentIds.length > 0
    ? await supabase
        .from('games')
        .select('youtube_url, date, opponent')
        .in('tournament_id', teamTournamentIds)
    : { data: [] }

  // 감지 방법 1: video ID 매칭
  const registeredVideoIds = new Set(
    (existingGames ?? [])
      .filter(g => g.youtube_url)
      .map(g => {
        const m = (g.youtube_url as string).match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
        return m ? m[1] : null
      })
      .filter(Boolean) as string[]
  )

  // 감지 방법 2: 날짜 + 상대팀 매칭 (youtube_url 없이 수동 등록된 경기 대응)
  const registeredDateOpponent = new Set(
    (existingGames ?? []).map(g =>
      `${g.date}__${(g.opponent as string ?? '').toLowerCase().trim()}`
    )
  )

  function isAlreadyRegistered(videoId: string, date: string, opponent: string): boolean {
    if (registeredVideoIds.has(videoId)) return true
    return registeredDateOpponent.has(`${date}__${opponent.toLowerCase().trim()}`)
  }

  const groups: TournamentGroup[] = Array.from(groupMap.entries()).map(([tournament_name, vids]) => {
    const year = vids[0].parsed.year

    // 기존 대회 이름 매칭 (부분 포함)
    const existing = existingTournaments?.find(t =>
      t.name === tournament_name ||
      t.name.includes(tournament_name) ||
      tournament_name.includes(t.name)
    ) ?? null

    const games: GameData[] = vids
      .map(v => ({
        video_id: v.video_id,
        title: v.title,
        url: v.url,
        date: v.parsed.date,
        opponent: v.parsed.opponent,
        round: v.parsed.round,
        already_registered: isAlreadyRegistered(v.video_id, v.parsed.date, v.parsed.opponent),
      }))
      .sort((a, b) => {
        const ra = ROUND_PRIORITY[a.round] ?? 9
        const rb = ROUND_PRIORITY[b.round] ?? 9
        if (ra !== rb) return ra - rb
        return b.date.localeCompare(a.date)
      })

    return { tournament_name, year, existing_tournament: existing, games }
  })

  // 연도 내림차순 정렬
  groups.sort((a, b) => b.year - a.year)

  return NextResponse.json({ groups, total: rawVideos.length })
}
