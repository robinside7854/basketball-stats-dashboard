'use client'
// 팀 탭 「누적 맞대결」 (2026-10-10) — 날짜별 박스스코어의 「팀별 비교」를 분기·시즌 단위로 쌓아 보여 준다.
//   데이터: GET /api/leagues/[leagueId]/head-to-head?quarterId=  (마감된 정규전 · 실제로 맞붙은 경기만)
//   그림: HeadToHeadBars — 날짜별 화면과 같은 컴포넌트.
import { useEffect, useState } from 'react'
import HeadToHeadBars, { type H2HTotals } from '@/components/league/HeadToHeadBars'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import SectionCard from '@/components/league/ui/SectionCard'
import SectionHeader from '@/components/league/ui/SectionHeader'

type Side = { key: string; name: string; color: string; wins: number; totals: H2HTotals }
type Pair = { a: Side; b: Side; games: number; draws: number; lastDate: string }

const hex = (c: string | null | undefined, fallback: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback)

export default function HeadToHeadSection({ leagueId, quarterId, myTeamKey = null }: {
  leagueId: string
  quarterId: string
  /** 로그인한 회원의 팀 정체성 key — 있으면 그 팀이 낀 대진을 먼저 보여 준다(없으면 가장 최근 대진) */
  myTeamKey?: string | null
}) {
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/head-to-head?quarterId=${encodeURIComponent(quarterId || 'all')}`)
      .then(r => (r.ok ? r.json() : { pairs: [] }))
      .then((d: { pairs?: Pair[] }) => {
        if (cancelled) return
        setPairs(d.pairs ?? [])
        setActiveKey(null)
      })
      .catch(() => { if (!cancelled) setPairs([]) })
    return () => { cancelled = true }
  }, [leagueId, quarterId])

  const keyOf = (p: Pair) => `${p.a.key}|${p.b.key}`
  // 기본 선택: 내 팀이 낀 대진 중 가장 최근(목록이 최근순) → 없으면 가장 최근 대진. 고른 것이 있으면 그것.
  const mine = myTeamKey ? pairs?.find(p => p.a.key === myTeamKey || p.b.key === myTeamKey) : undefined
  const active = pairs?.find(p => keyOf(p) === activeKey) ?? mine ?? pairs?.[0] ?? null

  return (
    <SectionCard variant="standalone" pad="none" ariaLabel="누적 맞대결">
      <SectionHeader
        title="누적 맞대결"
        description="두 팀이 실제로 맞붙은 경기만 모은 합계 · 마감된 정규전 기준 (친선전 제외)"
      />
      <div className="px-4 py-4 lg:px-6 lg:py-5 space-y-4">
        {pairs === null ? (
          <div className="flex justify-center py-8"><BasketballLoader size={24} /></div>
        ) : pairs.length === 0 || !active ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--mm-muted)' }}>이 기간에 마감된 맞대결이 아직 없습니다.</p>
        ) : (
          <>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {pairs.map(p => {
                const on = keyOf(p) === keyOf(active)
                return (
                  <button
                    key={keyOf(p)}
                    type="button"
                    onClick={() => setActiveKey(keyOf(p))}
                    aria-pressed={on}
                    className="px-3 py-2.5 text-xs font-black tracking-widest rounded-[var(--mm-radius-ctl)] transition-colors duration-200 cursor-pointer flex items-center justify-center gap-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    style={on
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
                      : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex(p.a.color, '#C4362B') }} />
                    <span className="truncate min-w-0">{p.a.name}</span>
                    <span className="opacity-70 shrink-0">vs</span>
                    <span className="truncate min-w-0">{p.b.name}</span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex(p.b.color, '#2563eb') }} />
                  </button>
                )
              })}
            </div>
            <HeadToHeadBars
              a={{ name: active.a.name, color: hex(active.a.color, '#C4362B'), sub: `${active.a.wins}승`, totals: active.a.totals }}
              b={{ name: active.b.name, color: hex(active.b.color, '#2563eb'), sub: `${active.b.wins}승`, totals: active.b.totals }}
              centerSub={`맞대결 ${active.games}경기${active.draws > 0 ? ` · ${active.draws}무` : ''}`}
            />
          </>
        )}
      </div>
    </SectionCard>
  )
}
