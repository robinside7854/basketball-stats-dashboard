// POST /api/leagues/[leagueId]/schedule-dates/sync
//
// '일정 등록'과 '영상 연동'을 한 번에 처리한다.
//
// 왜 합쳤나: 원래 두 기능이 다른 화면에 흩어져 있었다 — 일정 페이지의 '자동 일정 등록'과
//   기록 페이지의 '유튜브 일괄 연동'. 그런데 실제 운영에서는 항상 붙어서 일어난다.
//   경기를 하고 나면 날짜를 등록하고 영상을 붙인다. 두 번 들어가 두 번 누를 이유가 없었다.
//
// 순서가 중요하다:
//   1) 날짜 생성  — 영상을 붙일 날짜가 먼저 있어야 한다
//   2) 미실시 판정 — 안 모인 주를 접어야 3)에서 헛되이 다시 찾지 않는다
//   3) 영상 연동  — 남은 날짜만 대상
//
// 유튜브 키가 없거나 채널이 미설정이면 1·2 만 하고 조용히 끝낸다. 일정 등록까지 실패시킬
// 이유가 없다 — 채널 설정은 나중에 해도 되는 일이다.

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { syncYoutubeForLeague } from '@/lib/youtube/syncYoutubeForLeague'

/** 미실시로 접기까지 기다리는 기간. "다음 주가 되면" = 7일. */
const SKIP_AFTER_DAYS = 7

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()

  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('start_date, youtube_channel')
    .eq('id', leagueId)
    .single()
  if (leagueErr || !league) return NextResponse.json({ error: '리그를 찾을 수 없습니다' }, { status: 404 })
  if (!league.start_date) {
    return NextResponse.json({ error: '설정 탭에서 첫 정기 일정 날짜를 먼저 지정하세요' }, { status: 400 })
  }

  // ── 1) 날짜 생성 — start_date 부터 오늘까지 매주 ──────────────────────
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const wanted: string[] = []
  const cursor = new Date(league.start_date + 'T00:00:00')
  while (cursor <= today) {
    wanted.push(toYmd(cursor))
    cursor.setDate(cursor.getDate() + 7)
  }
  if (wanted.length === 0) {
    return NextResponse.json({ error: '첫 정기 일정 날짜가 오늘 이후입니다', inserted: 0 }, { status: 400 })
  }

  const { data: existingRows } = await supabase
    .from('league_schedule_dates')
    .select('date, is_skipped')
    .eq('league_id', leagueId)

  // 미실시로 접어둔 날짜도 '이미 있는 날짜'다 — 다시 만들면 지운 보람이 없다.
  const existing = new Map((existingRows ?? []).map((r: { date: string; is_skipped: boolean | null }) => [r.date, !!r.is_skipped]))
  const newDates = wanted.filter(d => !existing.has(d))

  if (newDates.length > 0) {
    const { error: insErr } = await supabase
      .from('league_schedule_dates')
      .insert(newDates.map(date => ({ league_id: leagueId, date })))
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // ── 2) 미실시 판정 ────────────────────────────────────────────────────
  // 영상 0개 AND 시작된 경기 0개 AND 7일 경과 → 안 모인 주로 본다.
  // ⚠ '시작된 경기 0개'를 반드시 함께 본다. 영상만 없는 날(경기는 했는데 업로드가 늦은 날)까지
  //   접으면 실제로 치른 라운드가 화면에서 사라지고 영상 연동 대상에서도 빠진다.
  const { data: gameRows } = await supabase
    .from('league_games')
    .select('date, youtube_url, is_started')
    .eq('league_id', leagueId)

  const byDate = new Map<string, { yt: number; started: number }>()
  for (const g of (gameRows ?? []) as Array<{ date: string; youtube_url: string | null; is_started: boolean | null }>) {
    const cur = byDate.get(g.date) ?? { yt: 0, started: 0 }
    if (g.youtube_url) cur.yt++
    if (g.is_started) cur.started++
    byDate.set(g.date, cur)
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - SKIP_AFTER_DAYS)
  const cutoffYmd = toYmd(cutoff)

  const allDates = [...new Set([...existing.keys(), ...newDates])]
  const newlySkipped = allDates.filter(d => {
    if (existing.get(d) === true) return false        // 이미 접힌 날짜
    if (d > cutoffYmd) return false                    // 아직 기다릴 만한 날짜
    const s = byDate.get(d)
    return !s || (s.yt === 0 && s.started === 0)
  })

  if (newlySkipped.length > 0) {
    const { error: skipErr } = await supabase
      .from('league_schedule_dates')
      .update({ is_skipped: true })
      .eq('league_id', leagueId)
      .in('date', newlySkipped)
    if (skipErr) return NextResponse.json({ error: skipErr.message }, { status: 500 })
  }

  // ── 3) 영상 연동 ──────────────────────────────────────────────────────
  const apiKey = process.env.YOUTUBE_API_KEY
  const channel = league.youtube_channel
  let syncedDates = 0
  let syncedVideos = 0
  let youtubeNote: string | null = null

  if (!apiKey) youtubeNote = 'YouTube API 키가 설정되지 않아 영상 연동은 건너뛰었습니다'
  else if (!channel) youtubeNote = '설정 탭에서 YouTube 채널을 지정하면 영상까지 자동 연동됩니다'
  else {
    const skippedSet = new Set([...newlySkipped, ...[...existing].filter(([, sk]) => sk).map(([d]) => d)])
    // 영상이 이미 다 붙은 날짜는 다시 찾지 않는다 — 유튜브 API 할당량을 아낀다.
    const targets = allDates
      .filter(d => !skippedSet.has(d))
      .filter(d => {
        const s = byDate.get(d)
        if (!s) return true                 // 경기가 아직 없는 날 — 영상이 먼저 올라온 경우가 있다
        return s.yt < Math.max(1, s.started) // 시작된 경기 수보다 영상이 적으면 대상
      })
      .sort()

    for (const date of targets) {
      try {
        const outcome = await syncYoutubeForLeague(supabase, leagueId, channel, date, apiKey)
        if (outcome.ok && outcome.mapped > 0) { syncedDates++; syncedVideos += outcome.mapped }
      } catch { /* 한 날짜가 실패해도 나머지는 계속 — 부분 성공이 전부 실패보다 낫다 */ }
    }
  }

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({
    inserted: newDates.length,
    skipped_marked: newlySkipped.length,
    synced_dates: syncedDates,
    synced_videos: syncedVideos,
    youtube_note: youtubeNote,
    from: wanted[0],
    to: wanted[wanted.length - 1],
  })
}
