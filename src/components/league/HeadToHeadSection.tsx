'use client'
import { swatchEdge } from '@/lib/util/contrastColor'
// 팀 탭 「누적 맞대결」 (2026-10-10) — 날짜별 박스스코어의 「팀별 비교」를 분기·시즌 단위로 쌓아 보여 준다.
//   데이터: GET /api/leagues/[leagueId]/head-to-head?quarterId=  (마감된 정규전 · 실제로 맞붙은 경기만)
//   그림: HeadToHeadBars — 날짜별 화면과 같은 컴포넌트.
import { useEffect, useState } from 'react'
import HeadToHeadBars, { type H2HTotals } from '@/components/league/HeadToHeadBars'
import { ShimmerRows } from '@/components/league/teams/TeamsSkeleton'
import SectionCard from '@/components/league/ui/SectionCard'
import SectionHeader from '@/components/league/ui/SectionHeader'

type Side = { key: string; name: string; color: string; wins: number; totals: H2HTotals }
type Pair = { a: Side; b: Side; games: number; draws: number; lastDate: string }

// 2026-10-27 속도: 이 칸은 팀 탭 본문(team-identities)이 다 온 뒤에야 그려져서 요청이 줄줄이 나갔다.
//   페이지가 본문 요청과 같은 때 prefetchHeadToHead 를 불러 두면, 그려질 때 이미 받은(또는 받는 중인) 결과를 쓴다.
const pending = new Map<string, Promise<Pair[]>>()
function loadPairs(leagueId: string, quarterId: string): Promise<Pair[]> {
  const url = `/api/leagues/${leagueId}/head-to-head?quarterId=${encodeURIComponent(quarterId || 'all')}`
  let p = pending.get(url)
  if (!p) {
    p = fetch(url)
      .then(r => (r.ok ? r.json() : { pairs: [] }))
      .then((d: { pairs?: Pair[] }) => d.pairs ?? [])
    // 한 번 쓰고 나면 지운다 — 다음 방문·기록 수정 뒤엔 새로 받는다
    p.catch(() => {}).finally(() => setTimeout(() => pending.delete(url), 30_000))
    pending.set(url, p)
  }
  return p
}
export function prefetchHeadToHead(leagueId: string, quarterId: string) {
  void loadPairs(leagueId, quarterId).catch(() => {})
}

const hex = (c: string | null | undefined, fallback: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : fallback)

export default function HeadToHeadSection({ leagueId, quarterId, myTeamKey = null, focusKey = null }: {
  leagueId: string
  quarterId: string
  /** 라커룸(2026-11-12) — 이 팀이 낀 대진만, 이 팀을 늘 왼쪽에. 고르기 칩은 상대 이름만 */
  focusKey?: string | null
  /** 로그인한 회원의 팀 정체성 key — 있으면 그 팀이 낀 대진을 먼저 보여 준다(없으면 가장 최근 대진) */
  myTeamKey?: string | null
}) {
  const [pairs, setPairs] = useState<Pair[] | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadPairs(leagueId, quarterId)
      .then(list => {
        if (cancelled) return
        setPairs(list)
      })
      .catch(() => { if (!cancelled) setPairs([]) })
    return () => { cancelled = true }
  }, [leagueId, quarterId])

  const keyOf = (p: Pair) => `${p.a.key}|${p.b.key}`
  // 라커룸이면 그 팀 대진만 남기고 그 팀을 a(왼쪽)로 돌린다
  const shown = pairs && focusKey
    ? pairs.filter(p => p.a.key === focusKey || p.b.key === focusKey).map(p => p.a.key === focusKey ? p : { ...p, a: p.b, b: p.a })
    : pairs
  // 기본 선택: 내 팀이 낀 대진 중 가장 최근(목록이 최근순) → 없으면 가장 최근 대진. 고른 것이 있으면 그것.
  const mine = myTeamKey ? shown?.find(p => p.a.key === myTeamKey || p.b.key === myTeamKey) : undefined
  const active = shown?.find(p => keyOf(p) === activeKey) ?? mine ?? shown?.[0] ?? null

  return (
    <SectionCard variant="standalone" pad="none" ariaLabel="누적 맞대결">
      <SectionHeader
        title={focusKey ? '상대별 맞대결' : '누적 맞대결'}
        description={focusKey ? '이 팀이 다른 팀과 맞붙은 경기만 모은 합계 · 친선전 제외' : '두 팀이 실제로 맞붙은 경기만 모은 합계 · 친선전 제외'}
      />
      <div className="px-4 py-4 lg:px-6 lg:py-5 space-y-4">
        {pairs === null ? (
          <ShimmerRows rows={4} height={40} />
        ) : !shown || shown.length === 0 || !active ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--mm-muted)' }}>이 기간에 끝난 맞대결이 아직 없어요.</p>
        ) : (
          <>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {shown.map(p => {
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
                    {!focusKey && <>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex(p.a.color, '#C4362B'), boxShadow: swatchEdge(hex(p.a.color, '#C4362B')) }} />
                    <span className="truncate min-w-0">{p.a.name}</span>
                    </>}
                    <span className="opacity-70 shrink-0">vs</span>
                    <span className="truncate min-w-0">{p.b.name}</span>
                    {focusKey && <span className="shrink-0 tabular-nums tracking-normal">{p.a.wins}승{p.draws ? ` ${p.draws}무` : ''} {p.b.wins}패</span>}
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex(p.b.color, '#2563eb'), boxShadow: swatchEdge(hex(p.b.color, '#2563eb')) }} />
                  </button>
                )
              })}
            </div>
            {/* PC 전폭이면 가운데 항목명과 양끝 숫자가 너무 멀어 폭을 묶는다(2026-10-15) */}
            <div className="max-w-3xl mx-auto space-y-4">
            <HeadToHeadBars
              a={{ name: active.a.name, color: hex(active.a.color, '#C4362B'), sub: `${active.a.wins}승`, totals: active.a.totals }}
              b={{ name: active.b.name, color: hex(active.b.color, '#2563eb'), sub: `${active.b.wins}승`, totals: active.b.totals }}
              centerSub={`맞대결 ${active.games}경기${active.draws > 0 ? ` · ${active.draws}무` : ''}`}
            />
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
