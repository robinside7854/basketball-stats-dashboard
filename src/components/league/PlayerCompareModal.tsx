'use client'
// 선수 비교 — 모바일 바텀시트 / PC 가운데 창 (리뉴얼 3단계, 2026-10-12).
//
// 배경: 종전엔 PC 표의 체크박스 두 개로만 열 수 있어 휴대폰에서는 비교 자체가 불가능했다.
//   이제 시트 안에서 빈 칸 두 개를 눌러 선수를 고른다 — 표 체크로 이미 골랐으면 그 둘로 바로 열린다.
// 규칙
//   · 숫자 계산은 종전 그대로다 — `players/[id]/detail` 의 player_stats·rankings, 레이더 = 리그 백분위.
//   · 두 선수의 색은 --mm-series-1(A) · --mm-series-3(B). 색만으로 승패를 전하지 않는다 — 앞선 쪽 숫자를 굵게.
//   · 라벨은 한국어, 약어(FG% 등)는 StatHeader 툴팁 안에만.
//   · (2026-10-14) 「맞대결」 — 두 선수가 상대편으로 만난 경기의 전적과 그 경기들의 하루 평균,
//     같은 팀으로 뛴 경기의 전적. `players/head-to-head` (lib/stats/playerHeadToHead.ts).

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Search, ArrowLeftRight } from 'lucide-react'
import Sheet from '@/components/league/ui/Sheet'
import Avatar from '@/components/league/ui/Avatar'
import PlayerName from '@/components/league/ui/PlayerName'
import { VersusBar } from '@/components/league/ui/viz'
import StatHeader from '@/components/league/StatHeader'

// 레이더 — 2026-10-12 리뉴얼 5단계에서 recharts 를 자체 인라인 SVG 로 바꿔 바로 import 한다.
import PlayerCompareRadarChart from '@/components/league/charts/PlayerCompareCharts'
import type { PlayerHeadToHead } from '@/lib/stats/playerHeadToHead'

type Detail = {
  player_stats: {
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
    fg_pct: number; fg3_pct: number; ft_pct: number
  } | null
  rankings?: {
    ppg?: number; rpg?: number; apg?: number; spg?: number; bpg?: number
    total?: number
  }
}

export interface CompareCandidate {
  id: string
  name: string
  photo_url?: string | null
  team_name?: string | null
  team_color?: string | null
  /** 출전일 수 — 고르기 목록 보조 정보 */
  gp?: number
}

interface Props {
  leagueId: string
  /** 고를 수 있는 선수(보통 스탯 목록 전원) */
  candidates: CompareCandidate[]
  /** 미리 고른 선수(최대 2) — PC 표 체크 */
  initialIds?: string[]
  onClose: () => void
}

const COLOR1 = 'var(--mm-series-1)'
const COLOR2 = 'var(--mm-series-3)'

type Slot = 0 | 1

export default function PlayerCompareModal({ leagueId, candidates, initialIds = [], onClose }: Props) {
  const [ids, setIds] = useState<[string | null, string | null]>([initialIds[0] ?? null, initialIds[1] ?? null])
  // 고르는 중인 칸 — 두 칸이 다 비어 있으면 첫 칸부터 목록을 펼쳐 둔다
  const [picking, setPicking] = useState<Slot | null>(() => (!initialIds[0] ? 0 : !initialIds[1] ? 1 : null))
  const [query, setQuery] = useState('')

  const byId = useMemo(() => new Map(candidates.map(c => [c.id, c])), [candidates])
  const p1 = ids[0] ? byId.get(ids[0]) ?? null : null
  const p2 = ids[1] ? byId.get(ids[1]) ?? null : null
  const ready = !!(ids[0] && ids[1]) && picking === null

  const [d1, setD1] = useState<Detail | null>(null)
  const [d2, setD2] = useState<Detail | null>(null)
  const [h2h, setH2h] = useState<(PlayerHeadToHead & { a: string; b: string }) | null>(null)
  // 받아 둔 쌍 — 지금 고른 쌍과 다르면 로딩 중(effect 안에서 setLoading 을 부르지 않는다)
  const [loadedPair, setLoadedPair] = useState<string | null>(null)

  const id1 = ids[0], id2 = ids[1]
  const pairKey = id1 && id2 ? `${id1}:${id2}` : null
  const loading = pairKey !== null && loadedPair !== pairKey
  useEffect(() => {
    if (!id1 || !id2) return
    let cancelled = false
    Promise.all([
      fetch(`/api/leagues/${leagueId}/players/${id1}/detail`).then(r => r.ok ? r.json() : null),
      fetch(`/api/leagues/${leagueId}/players/${id2}/detail`).then(r => r.ok ? r.json() : null),
      fetch(`/api/leagues/${leagueId}/players/head-to-head?a=${id1}&b=${id2}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([a, b, h]) => {
      if (cancelled) return
      setD1(a); setD2(b); setH2h(h)
    }).catch(() => { /* 빈 값으로 보여 준다 */ })
      .finally(() => { if (!cancelled) setLoadedPair(`${id1}:${id2}`) })
    return () => { cancelled = true }
  }, [leagueId, id1, id2])

  function choose(slot: Slot, id: string) {
    setIds(prev => {
      const next: [string | null, string | null] = [prev[0], prev[1]]
      next[slot] = id
      return next
    })
    setQuery('')
    // 다른 칸이 비어 있으면 이어서 그 칸을 고른다
    const other: Slot = slot === 0 ? 1 : 0
    setPicking(ids[other] ? null : other)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const other = picking === 0 ? ids[1] : picking === 1 ? ids[0] : null
    return candidates
      .filter(c => c.id !== other)
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.team_name ?? '').toLowerCase().includes(q))
  }, [candidates, query, picking, ids])

  const ps1 = d1?.player_stats ?? null
  const ps2 = d2?.player_stats ?? null
  const name1 = p1?.name ?? 'A'
  const name2 = p2?.name ?? 'B'

  // 레이더 축 = 리그 백분위 (100 = 1위). 2026-08-15 수정.
  //   전에는 축마다 임의 배율(PPG×10 · RPG×15 · APG×20 · SPG×40 · BPG×50)을 곱해 100 에서
  //   잘랐다. 근거가 없는 배율이라 블록 0.8개와 득점 4점이 같은 반경으로 찍혔고, 레이더는
  //   "어느 축이 더 튀어나왔나"로 읽히므로 그 자체가 잘못된 비교를 만들었다.
  //   같은 리그 안의 '몇 등인가' 로 바꾸면 다섯 축이 전부 같은 뜻의 값이 된다 —
  //   선수 퀵뷰 모달의 레이더가 원래 쓰던 방식과 동일하게 맞춘 것이다.
  //   rank 0(최소 경기 수 미달로 순위 없음)은 퀵뷰와 같이 50 으로 둔다.
  const pctile = (rank: number | undefined, total: number | undefined) => {
    const t = total ?? 0
    const r = rank ?? 0
    return r > 0 && t > 0 ? Math.round((t - r + 1) / t * 100) : 50
  }
  const rk1 = d1?.rankings
  const rk2 = d2?.rankings
  // 같은 이름 두 명이면 레이더 dataKey 가 겹친다 — 뒤에 표식을 붙여 갈라 둔다
  const key1 = name1
  const key2 = name2 === name1 ? `${name2} (B)` : name2
  const axis = (label: string, key: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg') => ({
    stat: label,
    [key1]: pctile(rk1?.[key], rk1?.total),
    [key2]: pctile(rk2?.[key], rk2?.total),
  })
  const radarData = [
    axis('득점', 'ppg'),
    axis('리바운드', 'rpg'),
    axis('어시스트', 'apg'),
    axis('스틸', 'spg'),
    axis('블락', 'bpg'),
  ]

  type StatKey = 'gp' | 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fg_pct' | 'fg3_pct'
  // term = 툴팁(용어 사전) 키, label = 화면 글자
  const ROWS: { key: StatKey; term: string; label: string; isPct?: boolean }[] = [
    { key: 'gp',      term: 'R',    label: '출전일' },
    { key: 'ppg',     term: '득점', label: '득점' },
    { key: 'rpg',     term: '리바', label: '리바' },
    { key: 'apg',     term: '어시', label: '어시' },
    { key: 'spg',     term: '스틸', label: '스틸' },
    { key: 'bpg',     term: '블락', label: '블락' },
    { key: 'fg_pct',  term: 'FG%',  label: '야투율', isPct: true },
    { key: 'fg3_pct', term: '3P%',  label: '3점 성공률', isPct: true },
  ]

  const slotButton = (slot: Slot) => {
    const p = slot === 0 ? p1 : p2
    const color = slot === 0 ? COLOR1 : COLOR2
    const active = picking === slot
    return (
      <button
        type="button"
        onClick={() => { setPicking(active ? (ids[0] && ids[1] ? null : slot) : slot); setQuery('') }}
        aria-pressed={active}
        aria-label={p ? `${p.name} — 눌러서 다른 선수로 바꾸기` : `${slot === 0 ? '첫' : '두'} 번째 선수 고르기`}
        className="flex-1 min-w-0 min-h-[64px] flex items-center gap-2 px-2.5 py-2 cursor-pointer transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
        style={{
          borderRadius: 'var(--mm-radius-chip)',
          border: active ? '2px solid var(--mm-yellow)' : p ? `2px solid ${color}` : '2px dashed var(--mm-rule)',
          background: active ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
        }}
      >
        {p ? (
          <>
            <Avatar src={p.photo_url} name={p.name} size={40} ringColor={color} decorative />
            <span className="min-w-0">
              <span className="block font-black text-sm truncate" style={{ color: 'var(--mm-ink)' }}>{p.name}</span>
              <span className="block text-xs font-bold truncate" style={{ color: 'var(--mm-muted)' }}>{p.team_name ?? '바꾸려면 누르기'}</span>
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center justify-center shrink-0 rounded-full" style={{ width: 40, height: 40, border: '1px dashed var(--mm-muted)', color: 'var(--mm-muted)' }}>
              <Plus size={20} aria-hidden />
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>선수 고르기</span>
          </>
        )}
      </button>
    )
  }

  return (
    <Sheet open onClose={onClose} title="선수 비교" width="lg">
      {/* 두 칸 — 누르면 아래 목록에서 고른다 */}
      <div className="flex items-stretch gap-2">
        {slotButton(0)}
        <span className="self-center shrink-0 text-xs font-black" style={{ color: 'var(--mm-muted)' }} aria-hidden>VS</span>
        {slotButton(1)}
      </div>

      {picking !== null ? (
        <div className="mt-4">
          <label className="flex items-center gap-2 px-3 min-h-11" style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)', background: 'var(--mm-panel)' }}>
            <Search size={16} aria-hidden style={{ color: 'var(--mm-muted)' }} />
            <span className="sr-only">선수 이름 검색</span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름 · 팀으로 찾기"
              className="flex-1 min-w-0 bg-transparent outline-none text-base py-2"
              style={{ color: 'var(--mm-ink)' }}
            />
          </label>
          <p className="text-xs font-bold mt-2 mb-1" style={{ color: 'var(--mm-muted)' }}>
            {picking === 0 ? '첫' : '두'} 번째 선수 · {filtered.length}명
          </p>
          <ul className="divide-y" style={{ borderColor: 'var(--mm-rule)' }}>
            {filtered.map(c => {
              const selected = ids[picking] === c.id
              return (
                <li key={c.id} style={{ borderColor: 'var(--mm-rule)' }}>
                  <button
                    type="button"
                    onClick={() => choose(picking, c.id)}
                    aria-pressed={selected}
                    className="w-full min-h-[52px] flex items-center gap-3 px-1 py-1.5 text-left cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                    style={selected ? { background: 'var(--mm-yellow-soft)' } : undefined}
                  >
                    <Avatar src={c.photo_url} name={c.name} size={32} decorative />
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm truncate" style={{ color: 'var(--mm-ink)' }}>{c.name}</span>
                      {c.team_name && (
                        <span className="flex items-center gap-1 text-xs font-bold truncate" style={{ color: 'var(--mm-muted)' }}>
                          <span aria-hidden className="inline-block rounded-full shrink-0" style={{ width: 8, height: 8, background: c.team_color ?? 'var(--mm-rule)', border: '1px solid var(--mm-rule)' }} />
                          {c.team_name}
                        </span>
                      )}
                    </span>
                    {c.gp != null && <span className="t-num text-xs font-bold shrink-0" style={{ color: 'var(--mm-muted)' }}>{c.gp}일</span>}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="py-6 text-center text-sm" style={{ color: 'var(--mm-muted)' }}>찾는 선수가 없어요</li>
            )}
          </ul>
        </div>
      ) : !ready ? null : loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--mm-muted)' }} /></div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* 스탯 비교 — 숫자 + 양쪽 막대 */}
          <div className="rounded-[var(--mm-radius-card)] overflow-hidden" style={{ border: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            {ROWS.map(({ key, term, label, isPct }) => {
              const v1 = (ps1?.[key] ?? 0) as number
              const v2 = (ps2?.[key] ?? 0) as number
              const v1Better = v1 > v2
              const v2Better = v2 > v1
              const fmt = (v: number) => isPct ? `${v.toFixed(1)}%` : (key === 'gp' ? String(v) : v.toFixed(1))
              return (
                <div key={key} className="px-4 py-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <p className={`t-num text-base text-left ${v1Better ? 'font-black' : 'font-semibold'}`} style={{ color: v1Better ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>
                      {fmt(v1)}
                    </p>
                    <p className="text-xs font-bold text-center flex items-center justify-center" style={{ color: 'var(--mm-ink-soft)' }}>
                      <StatHeader term={term} label={label} />
                    </p>
                    <p className={`t-num text-base text-right ${v2Better ? 'font-black' : 'font-semibold'}`} style={{ color: v2Better ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>
                      {fmt(v2)}
                    </p>
                  </div>
                  <div className="mt-1.5">
                    <VersusBar a={v1} b={v2} aColor={COLOR1} bColor={COLOR2} height={8} aLabel={name1} bLabel={name2} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 맞대결 — 상대편으로 만난 경기만 */}
          {h2h && h2h.a === id1 && h2h.b === id2 && (
            <HeadToHeadCard data={h2h} name1={name1} name2={name2} id1={id1} id2={id2} />
          )}

          {/* 레이더 — 리그 백분위 */}
          <div className="rounded-[var(--mm-radius-card)] p-3" style={{ border: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            <PlayerCompareRadarChart
              data={radarData}
              player1Name={key1}
              player2Name={key2}
              color1={COLOR1}
              color2={COLOR2}
            />
            {/* 축이 무슨 값인지 밝힌다 — 안 밝히면 '득점 80' 을 80점으로 읽는다. */}
            <p className="text-xs text-center mt-0.5 font-bold" style={{ color: 'var(--mm-muted)' }}>
              리그 백분위 (100 = 1위)
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIds(([a, b]) => [b, a])}
            className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 text-sm font-bold cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)', color: 'var(--mm-ink-soft)' }}
          >
            <ArrowLeftRight size={16} aria-hidden /> 좌우 바꾸기
          </button>
        </div>
      )}
    </Sheet>
  )
}

// 선수 vs 선수 맞대결 카드 — 전적 + 그 경기들의 하루 평균 + 같은 팀 전적 한 줄
function HeadToHeadCard({ data, name1, name2, id1, id2 }: { data: PlayerHeadToHead; name1: string; name2: string; id1: string; id2: string }) {
  const o = data.opposite
  const t = data.teammates
  const days = Math.max(o.days, 1)
  const avg = (n: number) => (n / days).toFixed(1)
  const pct = (m: number, a: number) => (a > 0 ? `${(m / a * 100).toFixed(1)}%` : '–')
  const rows: { label: string; v1: string; v2: string; n1: number; n2: number }[] = [
    { label: '득점', v1: avg(o.a.pts), v2: avg(o.b.pts), n1: o.a.pts, n2: o.b.pts },
    { label: '리바', v1: avg(o.a.reb), v2: avg(o.b.reb), n1: o.a.reb, n2: o.b.reb },
    { label: '어시', v1: avg(o.a.ast), v2: avg(o.b.ast), n1: o.a.ast, n2: o.b.ast },
    { label: '스틸', v1: avg(o.a.stl), v2: avg(o.b.stl), n1: o.a.stl, n2: o.b.stl },
    { label: '블락', v1: avg(o.a.blk), v2: avg(o.b.blk), n1: o.a.blk, n2: o.b.blk },
    {
      label: '야투율', v1: pct(o.a.fgm, o.a.fga), v2: pct(o.b.fgm, o.b.fga),
      n1: o.a.fga > 0 ? o.a.fgm / o.a.fga : -1, n2: o.b.fga > 0 ? o.b.fgm / o.b.fga : -1,
    },
  ]
  return (
    <section
      aria-labelledby="h2h-title"
      className="rounded-[var(--mm-radius-card)] px-4 py-3"
      style={{ border: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
    >
      <h3 id="h2h-title" className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>맞대결</h3>
      {o.games === 0 ? (
        <p className="mt-1 text-sm" style={{ color: 'var(--mm-muted)' }}>상대편으로 만난 경기가 아직 없어요.</p>
      ) : (
        <>
          <p className="mt-1 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>상대편으로 {o.games}경기 · 마감된 정규전</p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <p className="min-w-0 text-left">
              <PlayerName id={id1} name={name1} hitArea={false} className="block w-full truncate text-xs font-bold" style={{ color: COLOR1 }} />
              <span className={`t-num text-2xl ${o.a_wins > o.b_wins ? 'font-black' : 'font-semibold'}`} style={{ color: 'var(--mm-ink)' }}>{o.a_wins}승</span>
            </p>
            <p className="text-xs font-bold text-center" style={{ color: 'var(--mm-muted)' }}>
              {o.draws > 0 ? `무 ${o.draws}` : 'VS'}
            </p>
            <p className="min-w-0 text-right">
              <PlayerName id={id2} name={name2} hitArea={false} className="block w-full truncate text-xs font-bold text-right" style={{ color: COLOR2 }} />
              <span className={`t-num text-2xl ${o.b_wins > o.a_wins ? 'font-black' : 'font-semibold'}`} style={{ color: 'var(--mm-ink)' }}>{o.b_wins}승</span>
            </p>
          </div>
          <div className="mt-2" style={{ borderTop: '1px solid var(--mm-rule)' }}>
            {rows.map(r => (
              <div key={r.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-1.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <span className={`t-num text-sm text-left ${r.n1 > r.n2 ? 'font-black' : 'font-semibold'}`} style={{ color: r.n1 > r.n2 ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{r.v1}</span>
                <span className="text-xs font-bold text-center" style={{ color: 'var(--mm-ink-soft)' }}>{r.label}</span>
                <span className={`t-num text-sm text-right ${r.n2 > r.n1 ? 'font-black' : 'font-semibold'}`} style={{ color: r.n2 > r.n1 ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{r.v2}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--mm-muted)' }}>
            맞대결한 {o.days}일 하루 평균 — 그날의 맞대결 경기 기록만
          </p>
        </>
      )}
      {t.games > 0 && (
        <p className="mt-2 text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
          같은 팀으로 {t.games}경기 {t.wins}승 {t.losses}패{t.draws > 0 ? ` ${t.draws}무` : ''}
        </p>
      )}
    </section>
  )
}
