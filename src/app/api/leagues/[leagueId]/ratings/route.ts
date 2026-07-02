import { NextResponse } from 'next/server'
import { computeRatings } from '@/lib/rating/computeRating'
import type { PlayerStat } from '@/types/league'

// GET /api/leagues/[leagueId]/ratings?quarterId=...&playerId=...
//
// 내부적으로 기존 stats API 를 호출해서 재사용 (compute 로직 중복 방지).
// playerId 를 주면 해당 선수 rating 만 반환 (리그 컨텍스트로 percentile 계산 후 필터).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const quarterId = sp.get('quarterId')
  const playerId = sp.get('playerId')

  // 내부 stats API 호출 — 같은 origin 사용
  const origin = new URL(req.url).origin
  const statsUrl = `${origin}/api/leagues/${leagueId}/stats${quarterId ? `?quarterId=${quarterId}` : ''}`
  const statsRes = await fetch(statsUrl, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  if (!statsRes.ok) {
    return NextResponse.json({ error: 'stats fetch failed' }, { status: statsRes.status })
  }
  const statsJson = await statsRes.json() as { players?: PlayerStat[] }
  const players = statsJson.players ?? []

  const ratings = computeRatings(players)

  if (playerId) {
    const r = ratings.find(r => r.player_id === playerId)
    return NextResponse.json({ rating: r ?? null })
  }

  return NextResponse.json({ ratings })
}
