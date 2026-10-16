'use client'
// 기록실 — 스탯 우산의 세 번째 서브탭 (2026-10-16 승격).
// 종전엔 리더보드(/stats) 의 모드 칩 「기록실」(?mode=records)이었다. 옛 링크는 /stats 가 이리로 보낸다.
// 재료: 분기 없이 부른 스탯 = 리그 전체 기간 정규 경기(친선전 제외) — computeLeagueStats 결과 그대로
//   (「선수 숫자는 한 벌」). 회원 전용 게이트는 /stats 와 같다(401 → StatGate).
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import { getStatsGroupTabs } from '@/components/league/statsTabs'
import SectionCard from '@/components/league/ui/SectionCard'
import StatGate from '@/components/league/auth/StatGate'
import CareerLeadersBoard from '@/components/league/stats/CareerLeadersBoard'
import type { PlayerStat } from '@/types/league'

export default function LeagueRecordsPage() {
  const { orgSlug, leagueId } = useParams<{ orgSlug: string; leagueId: string }>()
  const [players, setPlayers] = useState<PlayerStat[]>([])
  const [loading, setLoading] = useState(true)
  const [gated, setGated] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/leagues/${leagueId}/stats`)
      .then(r => {
        if (r.status === 401) { if (alive) setGated(true); return null }
        return r.ok ? r.json() : null
      })
      .then(d => { if (alive && d) setPlayers(d.players ?? []) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [leagueId])

  if (gated) {
    return <StatGate fullPage title="기록실은 회원 전용" description="통산 기록은 가입 승인된 회원만 볼 수 있어요." />
  }

  const base = `/league/${orgSlug}/${leagueId}`
  return (
    <div className="mm-brand space-y-4 lg:space-y-5">
      {/* 스탯 우산 서브탭 — 리더보드 · 팀 · 기록실 */}
      <LeagueGroupTabs tabs={getStatsGroupTabs(base, 'records')} />
      <SectionCard variant="standalone">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="font-black" style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em', lineHeight: 1.15 }}>기록실</h2>
          <span className="text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>· 통산 누적 (친선전 제외)</span>
        </div>
        <p className="mt-1 text-sm" style={{ color: 'var(--mm-ink-soft)' }}>부문별 1위를 누르면 그 부문 순위가 아래에 나와요.</p>
      </SectionCard>
      <CareerLeadersBoard players={players} loading={loading} />
    </div>
  )
}
