// 클러치 스탯 API (Clutch Splits)
//
// GET /api/leagues/[id]/clutch
//   → { splits: PlayerClutchSplit[], config: { timeWindowSeconds, marginBeforeMax, marginAfterMax, minGames } }
//
// GET /api/leagues/[id]/clutch?playerId=X
//   → { split: PlayerClutchSplit | null, config: {...} }
//
// 정의:
//   - 매 경기 마지막 2분 (video_timestamp 기준)
//   - 점수차 3점 이내 (원 포제션)
//   - 최소 3게임 표본 (qualified 판정)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { computeClutchStats, CLUTCH_CONFIG } from '@/lib/stats/clutchStats'
import { canViewStats } from '@/lib/auth/guard'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const playerId = sp.get('playerId')
  const quarterId = sp.get('quarterId')

  const supabase = createClient()
  const splits = await computeClutchStats(supabase, leagueId, { quarterId })

  if (playerId) {
    const split = splits.find(s => s.player_id === playerId) ?? null
    return NextResponse.json({ split, config: CLUTCH_CONFIG })
  }

  return NextResponse.json({ splits, config: CLUTCH_CONFIG })
}
