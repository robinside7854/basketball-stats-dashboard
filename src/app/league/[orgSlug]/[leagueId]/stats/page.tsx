// 스탯 탭 — 서버가 「지금 분기」 스탯을 미리 계산해 실어 보낸다 (2026-10-27).
//   종전엔 화면 틀(뼈대)을 받은 뒤 브라우저가 /api/stats 를 따로 불러 뼈대가 두 번 떴다.
//   계산은 같은 캐시 항목(getCachedLeagueStats — /api/stats 라우트와 키 공유)이라 서버 일은 늘지 않는다.
//   · 승인 회원에게만 싣는다 — 비회원·편집 권한만 있는 운영자는 종전처럼 브라우저가 받는다(401 이면 잠금 화면).
//   · 기기에 다른 분기를 기억해 두었으면 브라우저가 그 분기를 다시 받는다(StatsPageClient 의 initialPending).
import { isLeaguePrivateGated, getApprovedSession } from '@/lib/auth/guard'
import { getLeagueQuarters } from '@/lib/league/loadQuarters'
import { pickCurrentQuarter } from '@/lib/league/currentQuarter'
import { getCachedLeagueStats } from '@/lib/stats/cachedLeagueStats'
import StatsPageClient, { type StatsInitial } from './StatsPageClient'

export default async function LeagueStatsPage({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { leagueId } = await params
  // 비공개 리그 raw HTML 누출 방지 — layout.tsx 주석 참조. 데이터를 읽기 전에 끊는다.
  if (await isLeaguePrivateGated(leagueId)) return null

  let initial: StatsInitial | null = null
  try {
    const [session, q] = await Promise.all([getApprovedSession(leagueId), getLeagueQuarters(leagueId)])
    const cur = session && q.quarters ? pickCurrentQuarter(q.quarters) : null
    if (cur) {
      const result = await getCachedLeagueStats(leagueId, { quarterId: cur.id, unit: 'round' })
      initial = { quarterId: cur.id, players: result.players ?? [], totalRounds: result.total_rounds ?? 0 }
    }
  } catch {
    initial = null // 실패하면 종전처럼 브라우저가 받는다
  }
  return <StatsPageClient initial={initial} />
}
