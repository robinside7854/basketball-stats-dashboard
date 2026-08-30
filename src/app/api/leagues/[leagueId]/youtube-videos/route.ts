import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { getChannelId } from '@/lib/youtube/syncYoutubeForLeague'

const YT_API = 'https://www.googleapis.com/youtube/v3'

/**
 * GET /api/leagues/[leagueId]/youtube-videos?date=YYYY-MM-DD
 *
 * 그 날짜에 올라온 이 리그 채널의 영상 목록을 **해석 없이 그대로** 돌려준다.
 *
 * 왜 자동 매핑(`/youtube-sync`)과 따로 두는가
 *   자동 매핑은 제목에서 경기 번호를 읽어 슬롯에 꽂는다. 제목 규칙이 깨지면 아무것도 못 붙이거나
 *   (2026-08-22 처럼) 엉뚱한 슬롯에 붙는다. 그때 기록원에게 필요한 건 더 똑똑한 추측이 아니라
 *   **눈으로 보고 고르는 목록**이다. 여기서는 번호를 추측하지 않는다 — 제목을 그대로 보여준다.
 *
 * ⚠ 편집 권한 게이트인 이유는 권한이 아니라 **쿼터(quota)** 다. search.list 는 호출당 100 유닛이라
 *   열람자에게 열어 두면 하루 한도가 조회로 소진돼 정작 연동이 멈춘다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const date = new URL(req.url).searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date 는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY 가 설정되지 않았습니다' }, { status: 503 })
  }

  const supabase = createClient()
  const { data: league, error: lErr } = await supabase
    .from('leagues')
    .select('youtube_channel, team_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (lErr) return NextResponse.json({ error: '리그를 확인하지 못했습니다' }, { status: 500 })

  let handle = league?.youtube_channel ?? null

  // 형제 묶음 폴백 — 채널은 **팀의 것**이지 묶음의 것이 아니다.
  //   대회 묶음(mode='tournament')은 리그와 같은 팀·같은 채널에 영상을 올리는데
  //   leagues.youtube_channel 이 묶음마다 따로 있어 대회 쪽은 비어 있다. 그대로 두면
  //   "설정에서 채널을 지정하세요" 로 끝나 대회에서는 목록 고르기를 아예 쓸 수 없다.
  //   같은 팀의 다른 묶음에 채널이 있으면 그것을 쓴다.
  if (!handle && league?.team_id) {
    const { data: sibling } = await supabase
      .from('leagues')
      .select('youtube_channel')
      .eq('team_id', league.team_id)
      .not('youtube_channel', 'is', null)
      .limit(1)
      .maybeSingle()
    handle = sibling?.youtube_channel ?? null
  }

  if (!handle) {
    return NextResponse.json({ error: '설정 탭에서 YouTube 채널을 먼저 지정하세요' }, { status: 400 })
  }

  const { id: channelId } = await getChannelId(handle, apiKey)
  if (!channelId) {
    return NextResponse.json({ error: `채널을 찾을 수 없습니다: ${handle}` }, { status: 404 })
  }

  // 검색어는 날짜(yymmdd) 하나뿐 — "경기" 같은 단어를 붙이면 제목 규칙이 다른 날 영상이 통째로 빠진다.
  //   (자동 매핑이 이번에 2개밖에 못 찾은 이유가 정확히 그것이다)
  const yymmdd = date.slice(2, 4) + date.slice(5, 7) + date.slice(8, 10)
  const after = new Date(date); after.setDate(after.getDate() - 7)
  const before = new Date(date); before.setDate(before.getDate() + 30)

  const url = `${YT_API}/search?part=snippet&channelId=${channelId}`
    + `&q=${encodeURIComponent(yymmdd)}&type=video&maxResults=50&order=date`
    + `&publishedAfter=${after.toISOString()}&publishedBefore=${before.toISOString()}&key=${apiKey}`

  const res = await fetch(url)
  const json = await res.json()
  if (!res.ok) {
    const msg = json?.error?.message ?? `YouTube 검색 실패 (${res.status})`
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const videos = (json.items ?? []).map((it: any) => ({
    video_id: it.id?.videoId as string,
    // NFC 정규화 — YouTube 는 한글 제목을 NFD 로 준다. 정렬·검색·비교가 전부 어긋난다.
    title: ((it.snippet?.title ?? '') as string).normalize('NFC'),
    published_at: (it.snippet?.publishedAt ?? '') as string,
    thumbnail: (it.snippet?.thumbnails?.default?.url ?? null) as string | null,
    url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })).filter((v: any) => !!v.video_id)

  // 제목 오름차순 — 같은 매치업의 1~4쿼터가 붙어 나와야 고르기 쉽다(업로드 순은 뒤섞여 있다).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videos.sort((a: any, b: any) => a.title.localeCompare(b.title, 'ko'))

  return NextResponse.json({ channel: handle, count: videos.length, videos })
}
