// POST /api/leagues/[leagueId]/highlights/clips-by-events
// 이벤트 UUID 배열 → HighlightClip[] (위닝샷 배지·베스트샷 핀 재생)
// POST body: { eventIds: string[]; forceClutch?: boolean }
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { loadClipsByEventIds } from '@/lib/highlights/loader'
import { canViewStats } from '@/lib/auth/guard'

const MAX_IDS = 50   // 남용 방지 (배지·핀 실제 사용은 3~10건)

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  let body: { eventIds?: unknown; forceClutch?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const eventIds = Array.isArray(body.eventIds)
    ? body.eventIds.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, MAX_IDS)
    : []
  const forceClutch = body.forceClutch === true

  if (eventIds.length === 0) return NextResponse.json({ clips: [] })

  try {
    const sb = createClient()
    const clips = await loadClipsByEventIds(sb, leagueId, eventIds, { forceClutch })
    return NextResponse.json({ clips })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 })
  }
}
