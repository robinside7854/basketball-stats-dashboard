// GET /api/cron/video-schedule — Vercel Cron, 매일 KST 23:30 (UTC 14:30).
//
// 「영상이 올라오면 자동으로 등록」(2026-10-12 운영진 결정). 유튜브 채널이 설정된 리그(대회 제외)마다
// `reconcileScheduleWithVideos` 를 돌린다 — 영상이 올라온 날짜를 일정에 넣고 영상을 붙이며,
// 흔적 없는 날짜를 정리한다. 규칙은 `lib/league/videoSchedule.ts` 한 곳.
//
// 인증: Authorization: Bearer ${CRON_SECRET} (Vercel Cron 자동 주입)

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { reconcileScheduleWithVideos } from '@/lib/league/videoSchedule'

export const maxDuration = 300

export async function GET(req: Request) {
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || (req.headers.get('authorization') ?? '') !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const supabase = createClient()
  const { data: leagues, error } = await supabase
    .from('leagues')
    .select('id, mode, youtube_channel')
    .not('youtube_channel', 'is', null)
    .neq('youtube_channel', '')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const results: Array<{ leagueId: string; added: number; synced: number; pruned: number; error?: string }> = []
  for (const lg of (leagues ?? []) as Array<{ id: string; mode: string | null }>) {
    if (lg.mode === 'tournament') continue
    try {
      const r = await reconcileScheduleWithVideos(supabase, lg.id, process.env.YOUTUBE_API_KEY)
      results.push({ leagueId: lg.id, added: r.added.length, synced: r.synced.length, pruned: r.pruned.length, error: r.error })
      revalidateTag(`league-${lg.id}`, 'max')
      revalidateTag(`league-${lg.id}-games`, 'max')
    } catch (e) {
      results.push({ leagueId: lg.id, added: 0, synced: 0, pruned: 0, error: e instanceof Error ? e.message : 'failed' })
    }
  }
  return NextResponse.json({ ok: true, results })
}
