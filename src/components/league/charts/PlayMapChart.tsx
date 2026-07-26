'use client'
// 플레이 맵 — 선수 공격 스타일 × 효율 4사분면 산점도 (2026-07-27)
//   · 축 A(기본): X=USG%(공격 점유율) · Y=TS%(진실 야투율)  ← 기존 stats 페이지 calcAdv/calcShoot 와 동일 산식
//   · 축 B(토글): X=외곽 성향(거리 가중) · Y=eFG%
//   · 리그 중앙값으로 4분할 → 사분면별 아키타입 네이밍
//   · 자격(gp>=minGP & fga>=10)만 중앙값 계산·정배치 · 미달자는 '참고 선수'(반투명) 토글로만
//   · 버블 클릭 → PlayerQuickViewModal (onSelectPlayer)
import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine,
  ReferenceArea, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { PlayerStat } from '@/types/league'

type Combo = 'styleEff' | 'threeDep'
type Quadrant = 'tr' | 'br' | 'tl' | 'bl'

// ── 축 산식 ────────────────────────────────
// 공격 스타일(0~100): 순수 골밑=0 → 순수 외곽=100. 존별 시도를 거리 가중(3점 1.0 / 미드 0.5 / 레이업 0.15 / 골밑 0).
const outsideTendency = (p: PlayerStat) => {
  const denom = (p.ds_a ?? 0) + (p.lu_a ?? 0) + (p.md_a ?? 0) + (p.fg3a ?? 0)
  if (denom <= 0) return 0
  return ((p.fg3a ?? 0) * 1.0 + (p.md_a ?? 0) * 0.5 + (p.lu_a ?? 0) * 0.15) / denom * 100
}
// 3점 의존도(0~100): 전체 야투 중 3점 시도 비중
const threeShare = (p: PlayerStat) => (p.fga ?? 0) > 0 ? (p.fg3a ?? 0) / p.fga * 100 : 0
// eFG% (성공률) — 3점 가중 유효 야투율
const efgPct = (p: PlayerStat) => p.efg_pct ?? 0

type ComboDef = {
  label: string
  xLabel: string; yLabel: string
  xShort: string; yShort: string
  xUnit: string; yUnit: string
  xOf: (p: PlayerStat) => number
  yOf: (p: PlayerStat) => number
  names: Record<Quadrant, string>
  hint: Record<Quadrant, string>
}

// 두 조합 모두 Y=성공률(eFG%) · X=공격 스타일(우측일수록 외곽 지향). 볼륨은 축에서 배제.
const COMBOS: Record<Combo, ComboDef> = {
  styleEff: {
    label: '거리 성향',
    xLabel: '공격 스타일 · 골밑 ← → 외곽', yLabel: '성공률 · eFG%',
    xShort: '외곽성향', yShort: 'eFG',
    xUnit: '', yUnit: '%',
    xOf: outsideTendency, yOf: efgPct,
    names: { tr: '외곽 스나이퍼', br: '외곽 도전자', tl: '골밑 지배자', bl: '골밑 파이터' },
    hint: {
      tr: '외곽 위주 · 성공률 높음',
      br: '외곽 위주 · 성공률 낮음',
      tl: '골밑 위주 · 성공률 높음',
      bl: '골밑 위주 · 성공률 낮음',
    },
  },
  threeDep: {
    label: '3점 의존',
    xLabel: '3점 의존도 · 낮음 ← → 높음', yLabel: '성공률 · eFG%',
    xShort: '3점의존', yShort: 'eFG',
    xUnit: '%', yUnit: '%',
    xOf: threeShare, yOf: efgPct,
    names: { tr: '3점 슈터', br: '3점 도전자', tl: '골밑 해결사', bl: '골밑 위주' },
    hint: {
      tr: '3점 많이 · 성공률 높음',
      br: '3점 많이 · 성공률 낮음',
      tl: '3점 적게 · 성공률 높음',
      bl: '3점 적게 · 성공률 낮음',
    },
  },
}

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

const quadrantOf = (x: number, y: number, mx: number, my: number): Quadrant =>
  x >= mx ? (y >= my ? 'tr' : 'br') : (y >= my ? 'tl' : 'bl')

type Pt = {
  id: string; name: string; number: number | null; photo?: string | null
  x: number; y: number; pts: number; gp: number
  eligible: boolean; quadrant: Quadrant
}

const MIN_FGA = 5  // 성공률 중앙값 계산·정배치 최소 표본 (선수단 전체를 분류하되 소표본은 '참고'로 구분)

export default function PlayMapChart({
  players, minGP, quarterLabel, onSelectPlayer,
}: {
  players: PlayerStat[]
  minGP: number
  quarterLabel?: string
  onSelectPlayer: (id: string, name: string) => void
}) {
  const [combo, setCombo] = useState<Combo>('styleEff')
  const [showRef, setShowRef] = useState(true)  // 선수단 전체 분류가 목표 → 기본 표시(소표본은 반투명)
  const def = COMBOS[combo]

  const { pts, mx, my, eligibleCount } = useMemo(() => {
    // 야투를 한 번도 시도 안 한 선수는 공격 스타일 정의 불가 → 제외
    const shooters = players.filter(p => (p.fga ?? 0) > 0)
    const eligible = shooters.filter(p => p.gp >= minGP && p.fga >= MIN_FGA)
    const mx = median(eligible.map(def.xOf))
    const my = median(eligible.map(def.yOf))
    const pts: Pt[] = shooters.map(p => {
      const x = +def.xOf(p).toFixed(1)
      const y = +def.yOf(p).toFixed(1)
      const eligible = p.gp >= minGP && p.fga >= MIN_FGA
      return {
        id: p.player_id, name: p.name, number: p.number, photo: p.photo_url,
        x, y, pts: p.pts, gp: p.gp,
        eligible, quadrant: quadrantOf(x, y, mx, my),
      }
    })
    return { pts, mx, my, eligibleCount: eligible.length }
  }, [players, minGP, def])

  const shown = showRef ? pts : pts.filter(p => p.eligible)
  const refCount = pts.length - pts.filter(p => p.eligible).length

  // 축 도메인 — 데이터 min/max ± 여유
  const xs = shown.map(p => p.x), ys = shown.map(p => p.y)
  const pad = (arr: number[], r: number): [number, number] => {
    if (arr.length === 0) return [0, 100]
    const lo = Math.min(...arr), hi = Math.max(...arr)
    const gap = Math.max((hi - lo) * r, 2)
    return [Math.max(0, +(lo - gap).toFixed(1)), +(hi + gap).toFixed(1)]
  }
  const xDomain = pad(xs, 0.12), yDomain = pad(ys, 0.12)

  if (eligibleCount < 3) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--mm-muted)' }}>
        <p className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}>플레이 맵을 그리기엔 표본이 부족합니다</p>
        <p className="text-xs mt-1">최소 {minGP}경기 · 야투 {MIN_FGA}회 이상 선수가 3명 이상 모이면 자동으로 표시됩니다 (현재 {eligibleCount}명)</p>
      </div>
    )
  }

  const cornerLabel = (q: Quadrant, pos: string) => (
    <div className={`absolute ${pos} pointer-events-none select-none z-10`}>
      <div className="font-jersey font-black uppercase leading-none" style={{ color: 'var(--mm-ink-soft)', fontSize: '13px', letterSpacing: '0.06em' }}>{def.names[q]}</div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* 컨트롤 — 축 조합 토글 + 참고선수 토글 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden shrink-0" style={{ border: '1px solid var(--mm-rule)' }}>
          {(Object.keys(COMBOS) as Combo[]).map(k => (
            <button key={k} onClick={() => setCombo(k)}
              className="px-3 py-2 text-xs font-black uppercase cursor-pointer transition-colors min-h-[40px]"
              style={combo === k
                ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', letterSpacing: '0.06em' }
                : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', letterSpacing: '0.06em' }}>
              {COMBOS[k].label}
            </button>
          ))}
        </div>
        {refCount > 0 && (
          <button onClick={() => setShowRef(v => !v)}
            aria-pressed={showRef}
            className="px-2.5 py-1 text-xs font-black uppercase cursor-pointer transition-all flex items-center gap-1.5 min-h-[40px]"
            style={{ background: 'var(--mm-panel)', color: showRef ? 'var(--mm-ink)' : 'var(--mm-muted)', border: `1px solid ${showRef ? 'var(--color-hoop-orange-500)' : 'var(--mm-rule)'}` }}
            title={`자격 미달(${minGP}경기·야투 ${MIN_FGA} 미만) 선수 반투명 표시`}>
            <span className="inline-block w-3 h-3 rounded-full border" style={{ background: showRef ? 'var(--color-hoop-orange-500)' : 'transparent', borderColor: showRef ? 'var(--color-hoop-orange-500)' : 'var(--mm-muted)' }} />
            참고 선수 ({refCount})
          </button>
        )}
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] ml-auto" style={{ color: 'var(--mm-muted)' }}>
          {quarterLabel ? `${quarterLabel} · ` : ''}중앙값 {def.xShort} {mx.toFixed(1)}{def.xUnit} · {def.yShort} {my.toFixed(1)}{def.yUnit}
        </span>
      </div>

      {/* 산점도 */}
      <div className="relative" style={{ width: '100%', height: 380 }}>
        {cornerLabel('tl', 'top-1 left-10')}
        {cornerLabel('tr', 'top-1 right-2')}
        {cornerLabel('bl', 'bottom-8 left-10')}
        {cornerLabel('br', 'bottom-8 right-2')}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 16, right: 16, bottom: 24, left: 4 }}>
            {/* 우상단(목표) 사분면만 브랜드 노랑 틴트 */}
            <ReferenceArea x1={mx} x2={xDomain[1]} y1={my} y2={yDomain[1]} fill="var(--mm-yellow-soft)" fillOpacity={1} stroke="none" />
            <XAxis
              type="number" dataKey="x" name={def.xLabel} domain={xDomain}
              tick={{ fill: 'var(--mm-muted)', fontSize: 11 }} stroke="var(--mm-rule)"
              tickFormatter={(v) => `${v}${def.xUnit}`}
              label={{ value: def.xLabel, position: 'insideBottom', offset: -12, fill: 'var(--mm-ink-soft)', fontSize: 11, fontWeight: 700 }}
            />
            <YAxis
              type="number" dataKey="y" name={def.yLabel} domain={yDomain}
              tick={{ fill: 'var(--mm-muted)', fontSize: 11 }} stroke="var(--mm-rule)"
              tickFormatter={(v) => `${v}${def.yUnit}`} width={44}
              label={{ value: def.yLabel, angle: -90, position: 'insideLeft', offset: 14, fill: 'var(--mm-ink-soft)', fontSize: 11, fontWeight: 700, style: { textAnchor: 'middle' } }}
            />
            <ZAxis type="number" dataKey="pts" range={[50, 420]} name="득점" />
            <ReferenceLine x={mx} stroke="var(--mm-muted)" strokeDasharray="4 4" />
            <ReferenceLine y={my} stroke="var(--mm-muted)" strokeDasharray="4 4" />
            <Tooltip
              cursor={{ strokeDasharray: '3 3', stroke: 'var(--mm-rule)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const d = payload[0].payload as Pt
                return (
                  <div style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 6, padding: '8px 10px', boxShadow: '0 8px 28px -8px rgba(0,0,0,0.25)' }}>
                    <div className="font-jersey font-black" style={{ color: 'var(--mm-ink)', fontSize: 14 }}>
                      {d.name}{d.number != null && <span style={{ color: 'var(--mm-muted)', marginLeft: 4 }}>#{d.number}</span>}
                    </div>
                    <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--color-hoop-orange-500)', marginTop: 2 }}>{def.names[d.quadrant]}{!d.eligible && ' · 참고'}</div>
                    <div className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{def.xShort} {d.x}{def.xUnit} · {def.yShort} {d.y}{def.yUnit}</div>
                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--mm-muted)' }}>PTS {d.pts} · {d.gp}경기</div>
                  </div>
                )
              }}
            />
            <Scatter
              data={shown}
              onClick={(node) => { const d = (node as unknown as { payload?: Pt }).payload; if (d) onSelectPlayer(d.id, d.name) }}
              style={{ cursor: 'pointer' }}
              isAnimationActive={false}
            >
              {shown.map(p => (
                <Cell key={p.id}
                  fill={p.eligible ? 'var(--mm-ink)' : 'transparent'}
                  fillOpacity={p.eligible ? 0.82 : 0}
                  stroke={p.eligible ? 'var(--mm-panel)' : 'var(--mm-muted)'}
                  strokeOpacity={p.eligible ? 1 : 0.5}
                  strokeWidth={p.eligible ? 1.5 : 1}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* 사분면별 그룹 리스트 — 산점도가 안 읽혀도 정보 손실 0 (모바일 대안 겸용) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {(['tr', 'tl', 'br', 'bl'] as Quadrant[]).map(q => {
          const members = pts.filter(p => p.eligible && p.quadrant === q).sort((a, b) => b.pts - a.pts)
          const isGoal = q === 'tr'
          return (
            <div key={q} className="rounded-md border overflow-hidden" style={{ borderColor: isGoal ? 'var(--color-hoop-orange-500)' : 'var(--mm-rule)', background: isGoal ? 'var(--mm-yellow-soft)' : 'var(--mm-panel)' }}>
              <div className="px-3 py-2 flex items-baseline justify-between gap-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: 15, letterSpacing: '0.04em' }}>{def.names[q]}</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>{def.hint[q]}</span>
              </div>
              {members.length === 0 ? (
                <div className="px-3 py-3 text-xs" style={{ color: 'var(--mm-muted)' }}>해당 선수 없음</div>
              ) : (
                <ul>
                  {members.map((p, i) => (
                    <li key={p.id}>
                      <button onClick={() => onSelectPlayer(p.id, p.name)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer transition-colors min-h-[44px] hover:bg-[color:var(--mm-panel-alt)]">
                        <span className="w-4 shrink-0 text-center font-jersey font-black tabular-nums text-xs" style={{ color: 'var(--mm-muted)' }}>{i + 1}</span>
                        <span className="flex-1 min-w-0 truncate font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>
                          {p.name}{p.number != null && <span className="tabular-nums" style={{ color: 'var(--mm-muted)', marginLeft: 4, fontSize: 11 }}>#{p.number}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-xs font-black" style={{ color: 'var(--mm-ink-soft)' }}>{p.x}{def.xUnit}</span>
                        <span className="shrink-0 text-[10px]" style={{ color: 'var(--mm-muted)' }}>·</span>
                        <span className="shrink-0 tabular-nums text-xs font-black" style={{ color: 'var(--mm-ink-soft)' }}>{p.y}{def.yUnit}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
        · 가로축 = <b style={{ color: 'var(--mm-ink-soft)' }}>공격 스타일</b>(우측일수록 외곽 지향) · 세로축 = <b style={{ color: 'var(--mm-ink-soft)' }}>성공률(eFG%)</b>. 리그 중앙값으로 4분할, 우상단(노랑)=외곽 위주+성공률 높음. 공격 <b style={{ color: 'var(--mm-ink-soft)' }}>성향 지도</b>이며 순위가 아니고 수비는 반영되지 않습니다.
      </p>
    </div>
  )
}
