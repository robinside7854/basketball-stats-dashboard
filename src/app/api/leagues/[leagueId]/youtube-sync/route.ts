// POST /api/leagues/[leagueId]/youtube-sync
// 수동 실행 — 관리자가 채널 핸들 + 날짜를 넣으면 해당 날짜 league_games 에 youtube_url 매핑.
// 로직은 lib/youtube/syncYoutubeForLeague 로 추출되어 있음 (cron/게임저장 훅과 공유).

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { syncYoutubeForLeague, type TitleRule } from '@/lib/youtube/syncYoutubeForLeague'

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

    let body: { channelHandle?: string; date?: string; dryRun?: boolean; titleRule?: string } = {}
    try { body = await req.json() } catch { return NextResponse.json({ error: 'request body 파싱 실패' }, { status: 400 }) }
    const { channelHandle, date } = body
    if (!channelHandle || !date) return NextResponse.json({ error: '채널명과 날짜를 입력하세요' }, { status: 400 })

    // dryRun — 아무것도 저장하지 않고 "무엇을 하려 했는지"만 돌려준다.
    //   제목 규칙이 바뀔 때마다 운영 데이터로 먼저 확인하기 위한 통로다(2026-09-07).
    const dryRun = body.dryRun === true

    // titleRule — 제목 해석 규칙을 손으로 고른다. 기본은 'auto'(그날 영상을 보고 고름).
    //   업로더의 제목 습관이 날마다 다르다(9/5 쿼터형 · 9/19 번호형). 제목이 섞여 올라온 날에는
    //   자동 판정이 쿼터형을 택하므로, 화면에서 번호형으로 되돌릴 수 있어야 한다.
    const RULES: TitleRule[] = ['auto', 'quarter', 'legacy']
    const titleRule: TitleRule = RULES.includes(body.titleRule as TitleRule)
      ? (body.titleRule as TitleRule)
      : 'auto'

    const supabase = createClient()
    const outcome = await syncYoutubeForLeague(supabase, leagueId, channelHandle, date, apiKey, { dryRun, titleRule })

    if (!outcome.ok) {
      return NextResponse.json({
        error: outcome.reason,
        channelId: outcome.channelId,
        searched_videos: outcome.searchedVideos,
        found_titles: outcome.foundTitles,
        // 실패했을 때야말로 "다른 규칙이면 몇 개가 읽히는가"가 조치를 알려 준다.
        rule_counts: outcome.ruleCounts,
        need_slots: outcome.needSlots,
        requested_rule: titleRule,
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
      // 부분 성공을 성공으로 보고하지 않기 위한 값 — 화면은 이 둘을 반드시 함께 보여준다.
      skipped: outcome.skipped,
      skipped_reasons: outcome.skippedReasons,
      // 'quarter' = 대진+쿼터 제목 / 'legacy' = 옛 `경기 N` 제목. 왜 그렇게 붙었는지 설명하는 값이다.
      mode: outcome.mode,
      // 어느 규칙을 요청했는지 + 각 규칙으로 읽히는 제목 수. 화면이 "다른 규칙으로 다시 연동"을
      //   권할지 판단한다 — 규칙이 둘이라는 사실 자체를 운영자가 알 수 있어야 한다.
      requested_rule: titleRule,
      rule_counts: outcome.ruleCounts,
      // 0 보다 크면 그 날짜에 칸이 모자라 못 붙인 것이 있다는 뜻.
      need_slots: outcome.needSlots,
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
