// GET /api/cron/youtube-sync
// Vercel Cron — 매주 토요일 KST 22:00 (UTC 13:00, "0 13 * * 6") 자동 실행.
//
// 동작:
//   1. `leagues` 중 youtube_channel 이 세팅된 리그 전수 조회
//   2. 각 리그별로 오늘(KST) 날짜의 게임에 youtube_url 이 없는 슬랏이 있으면 syncYoutubeForLeague 호출
//   3. 결과 집계 (processed_leagues / videos_matched / skipped / failures)
//
// 인증: Authorization: Bearer ${CRON_SECRET} (Vercel Cron 자동 주입)
// vercel.json 참고.

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { syncYoutubeForLeague } from '@/lib/youtube/syncYoutubeForLeague'

export const maxDuration = 300

// KST 기준 오늘 날짜 YYYY-MM-DD 반환 — 서버 타임존 무관
function todayKST(): string {
  const now = new Date()
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000
  return new Date(kstMs).toISOString().split('T')[0]
}

interface LeagueLite {
  id: string
  name: string | null
  youtube_channel: string | null
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'YOUTUBE_API_KEY 미설정' }, { status: 500 })
  }

  const supabase = createClient()
  const date = todayKST()

  // 채널 세팅된 리그만
  const { data: leagues, error: lErr } = await supabase
    .from('leagues')
    .select('id, name, youtube_channel')
    .not('youtube_channel', 'is', null)
    .neq('youtube_channel', '')

  if (lErr) {
    return NextResponse.json({ ok: false, error: lErr.message }, { status: 500 })
  }

  const leagueRows = (leagues ?? []) as LeagueLite[]
  let processed = 0
  let skippedNoGame = 0
  let skippedAllMapped = 0
  let videosMatched = 0
  const failures: { leagueId: string; reason: string }[] = []

  for (const lg of leagueRows) {
    if (!lg.youtube_channel) continue

    // 오늘 날짜 게임 존재 여부 (youtube_url null 인 슬랏 우선)
    const { data: games, error: gErr } = await supabase
      .from('league_games')
      .select('id, youtube_url')
      .eq('league_id', lg.id)
      .eq('date', date)

    if (gErr) {
      failures.push({ leagueId: lg.id, reason: `games lookup: ${gErr.message}` })
      continue
    }
    const gameRows = games ?? []
    if (gameRows.length === 0) { skippedNoGame++; continue }
    const missing = gameRows.filter(g => !g.youtube_url).length
    if (missing === 0) { skippedAllMapped++; continue }

    try {
      const outcome = await syncYoutubeForLeague(supabase, lg.id, lg.youtube_channel, date, apiKey)
      if (outcome.ok) {
        processed++
        videosMatched += outcome.mapped
        console.log(`[cron/youtube-sync] league=${lg.id} name=${lg.name ?? '?'} mapped=${outcome.mapped}/${outcome.totalVideos}`)
      } else {
        failures.push({ leagueId: lg.id, reason: outcome.reason })
        console.log(`[cron/youtube-sync] league=${lg.id} no-match: ${outcome.reason}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failures.push({ leagueId: lg.id, reason: msg })
      console.error(`[cron/youtube-sync] league=${lg.id} error:`, msg)
    }
  }

  console.log(`[cron/youtube-sync] date=${date} leagues_total=${leagueRows.length} processed=${processed} videos_matched=${videosMatched} skipped_no_game=${skippedNoGame} skipped_all_mapped=${skippedAllMapped} failures=${failures.length}`)

  return NextResponse.json({
    ok: true,
    date,
    leagues_total: leagueRows.length,
    processed_leagues: processed,
    videos_matched: videosMatched,
    skipped_no_game: skippedNoGame,
    skipped_all_mapped: skippedAllMapped,
    failures,
  })
}
