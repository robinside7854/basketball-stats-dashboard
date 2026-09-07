// POST /api/leagues/[leagueId]/youtube-sync
// 수동 실행 — 관리자가 채널 핸들 + 날짜를 넣으면 해당 날짜 league_games 에 youtube_url 매핑.
// 로직은 lib/youtube/syncYoutubeForLeague 로 추출되어 있음 (cron/게임저장 훅과 공유).

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { syncYoutubeForLeague } from '@/lib/youtube/syncYoutubeForLeague'

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
    if (!await canEditLeague(req, leagueId)) {
      return NextResponse.json({ error: 'Unauthorized — X-League-Pin 헤더 확인' }, { status: 401 })
    }

    const apiKey = process.env.YOUTUBE_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'YouTube API 키 미설정 — Vercel 환경변수에 YOUTUBE_API_KEY를 추가하세요' }, { status: 500 })
    }

    let body: { channelHandle?: string; date?: string; dryRun?: boolean } = {}
    try { body = await req.json() } catch { return NextResponse.json({ error: 'request body 파싱 실패' }, { status: 400 }) }
    const { channelHandle, date } = body
    if (!channelHandle || !date) return NextResponse.json({ error: '채널명과 날짜를 입력하세요' }, { status: 400 })

    // dryRun — 아무것도 저장하지 않고 "무엇을 하려 했는지"만 돌려준다.
    //   제목 규칙이 바뀔 때마다 운영 데이터로 먼저 확인하기 위한 통로다(2026-09-07).
    const dryRun = body.dryRun === true

    const supabase = createClient()
    const outcome = await syncYoutubeForLeague(supabase, leagueId, channelHandle, date, apiKey, { dryRun })

    if (!outcome.ok) {
      return NextResponse.json({
        error: outcome.reason,
        channelId: outcome.channelId,
        searched_videos: outcome.searchedVideos,
        found_titles: outcome.foundTitles,
      }, { status: 404 })
    }

    // 저장 후 DB 재조회 — 실제 저장된 값 검증
    const { data: verifyGames } = await supabase
      .from('league_games')
      .select('slot_num, youtube_url')
      .eq('league_id', leagueId)
      .eq('date', date)
      .order('slot_num', { ascending: true })

    return NextResponse.json({
      mapped: outcome.mapped,
      total_videos: outcome.totalVideos,
      // 'quarter' = 대진+쿼터 제목 / 'legacy' = 옛 `경기 N` 제목. 왜 그렇게 붙었는지 설명하는 값이다.
      mode: outcome.mode,
      dry_run: outcome.dryRun ?? false,
      details: outcome.details,
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
