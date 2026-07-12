import { NextResponse } from 'next/server'
import { computeLeagueStats, type LeagueStatsUnit } from '@/lib/stats/leagueStats'

// GET /api/leagues/[leagueId]/stats
// 쿼리 파라미터: quarterId, quarterIds(comma), teamId, playerId, from, to, unit
// 실제 집계 로직은 `@/lib/stats/leagueStats` 로 추출 — SSR 프리페치와 공유.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const quarterIdsRaw = sp.get('quarterIds')
  const quarterIds = quarterIdsRaw ? quarterIdsRaw.split(',').filter(Boolean) : null
  const unit = (sp.get('unit') ?? 'round') as LeagueStatsUnit

  try {
    const result = await computeLeagueStats(null, leagueId, {
      quarterId: sp.get('quarterId'),
      quarterIds,
      teamId: sp.get('teamId'),
      playerId: sp.get('playerId'),
      from: sp.get('from'),
      to: sp.get('to'),
      unit,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
