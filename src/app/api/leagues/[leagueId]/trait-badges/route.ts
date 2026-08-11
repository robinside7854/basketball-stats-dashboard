// GET /api/leagues/[leagueId]/trait-badges
//   → { players: {id,name,number,photo_url}[], badges: { [playerId]: EarnedTrait[] } }
//
// 개인특성 배지는 **모집단 안 순위**로 판정하므로 한 선수만 따로 계산할 수 없다.
// 리그 전원을 한 번에 계산해 내려주고, 화면이 필요한 선수만 골라 쓴다
// (선수 45명 × 배지 3개 수준이라 응답이 작다).
import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { fetchTraitDataset } from '@/lib/badges/traitData'
import { evaluateTraitBadges } from '@/lib/badges/traitBadges'

const load = (leagueId: string) =>
  unstable_cache(
    async () => {
      const { players, inputs } = await fetchTraitDataset(createClient(), leagueId)
      const earned = evaluateTraitBadges(inputs)
      return {
        players,
        badges: Object.fromEntries([...earned].filter(([, list]) => list.length > 0)),
      }
    },
    ['league-trait-badges-v1', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-events`], revalidate: 300 },
  )

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 비공개 리그는 명단·기록이 새면 안 된다 — 스탯 API 와 같은 가드
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  return NextResponse.json(await load(leagueId)())
}
