// POST /api/leagues/[leagueId]/schedule-dates/video-sync  { dryRun?: boolean }
//
// 일정 탭 「영상으로 일정 맞추기」 — 영상이 올라온 날짜를 일정에 넣고(영상 연동 포함),
// 아무 흔적 없는 날짜(예정·영상 없는 지난 날)를 빈 슬롯째 지운다. 규칙은 `lib/league/videoSchedule.ts`.
// 화면은 dryRun 으로 먼저 할 일을 보여 주고 확인을 받은 뒤 실행한다.
// 매일 밤 cron(`/api/cron/video-schedule`)도 같은 함수를 부른다.

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'
import { reconcileScheduleWithVideos } from '@/lib/league/videoSchedule'

export const maxDuration = 300

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const dryRun = body?.dryRun === true

  const supabase = createClient()
  const result = await reconcileScheduleWithVideos(supabase, leagueId, process.env.YOUTUBE_API_KEY, { dryRun })

  if (!dryRun) {
    if (result.pruned.length > 0 || result.added.length > 0) {
      await logAudit({
        req, action: 'schedule_date.video_reconcile', targetTable: 'league_schedule_dates', targetId: leagueId,
        leagueId, detail: { added: result.added, pruned: result.pruned },
      })
    }
    revalidateTag(`league-${leagueId}`, 'max')
    revalidateTag(`league-${leagueId}-games`, 'max')
  }
  return NextResponse.json({ ...result, dryRun })
}
