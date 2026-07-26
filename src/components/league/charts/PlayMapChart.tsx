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

type Combo = 'volEff' | 'zoneEff'
type Quadrant = 'tr' | 'br' | 'tl' | 'bl'

// ── 축 산식 (stats 페이지와 동일) ────────────────────────────────
const possOf = (p: PlayerStat) => p.fga + 0.44 * p.fta + p.tov
const usgPct = (p: PlayerStat) => (p.team_poss_in_games ?? 0) > 0 ? possOf(p) / (p.team_poss_in_games ?? 1) * 100 : 0
const tsPct = (p: PlayerStat) => (p.fga + 0.44 * p.fta) > 0 ? p.pts / (2 * (p.fga + 0.44 * p.fta)) * 100 : 0
// 외곽 성향(0~100): 3점=1.0 / 미드=0.5 / 레이업=0.15 / 골밑=0 가중, 총 시도 대비
const outsideTendency = (p: PlayerStat) => {
  const denom = (p.ds_a ?? 0) + (p.lu_a ?? 0) + (p.md_a ?? 0) + (p.fg3a ?? 0)
  if (denom <= 0) return 0
  return ((p.fg3a ?? 0) * 1.0 + (p.md_a ?? 0) * 0.5 + (p.lu_a ?? 0) * 0.15) / denom * 100
}

type ComboDef = {
  label: string
  xLabel: string; yLabel: string
  xUnit: string; yUnit: string
  xOf: (p: PlayerStat) => number
  yOf: (p: PlayerStat) => number
  names: Record<Quadrant, string>
  hint: Record<Quadrant, string>
}

const COMBOS: Record<Combo, ComboDef> = {
  volEff: {
    label: '볼륨 × 효율',
    xLabel: 'USG% · 공격 점유율', yLabel: 'TS% · 효율',
    xUnit: '%', yUnit: '%',
    xOf: usgPct, yOf: tsPct,
    names: { tr: '에이스', br: '볼륨 슈터', tl: '알짜 해결사', bl: '롤플레이어' },
    hint: {
      tr: '많이 짊어지고도 효율적',
      br: '공격을 짊어지지만 효율은 아래',
      tl: '적게 관여해도 넣을 땐 넣는다',
      bl: '적은 관여 · 궂은일 담당',
    },
  },
  zoneEff: {
    label: '슛존 × 효율',
    xLabel: '외곽 성향', yLabel: 'eFG% · 효율',
    xUnit: '', yUnit: '%',
    xOf: outsideTendency, yOf: (p) => p.efg_pct ?? 0,
    names: { tr: '스나이퍼', br: '도전하는 슈터', tl: '페인트 지배자', bl: '림 파이터' },
    hint: {
      tr: '외곽에서 높은 확률',
      br: '외곽을 즐기지만 확률은 아래',
      tl: '골밑에서 확실하게',
      bl: '골밑 위주 · 확률은 아래',
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

const MIN_FGA = 10  // 성공률 fluke 방지 — 산점도는 위치 자체가 낙인이라 리더보드(5)보다 엄격

export default function PlayMapChart({
  players, minGP, quarterLabel, onSelectPlayer,
}: {
  players: PlayerStat[]
  minGP: number
  quarterLabel?: string
  onSelectPlayer: (id: string, name: string) => void
}) {
  const [combo, setCombo] = useState<Combo>('volEff')
  const [showRef, setShowRef] = useState(false)
  const def = COMBOS[combo]

  const { pts, mx, my, eligibleCount } = useMemo(() => {
    const eligible = players.filter(p => p.gp >= minGP && p.fga >= MIN_FGA)
    const mx = median(eligible.map(def.xOf))
    const my = median(eligible.map(def.yOf))
    const pts: Pt[] = players.map(p => {
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
          {quarterLabel ? `${quarterLabel} · ` : ''}중앙값 {def.xLabel.split(' ')[0]} {mx.toFixed(1)}{def.xUnit} · {def.yLabel.split(' ')[0]} {my.toFixed(1)}{def.yUnit}
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
                    <div className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{def.xLabel.split(' ')[0]} {d.x}{def.xUnit} · {def.yLabel.split(' ')[0]} {d.y}{def.yUnit}</div>
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
        · 리그 중앙값 기준 4분할 · 우상단(노랑)이 목표 구역입니다. 출전 상황·역할에 따른 <b style={{ color: 'var(--mm-ink-soft)' }}>공격 성향 지도</b>이며 순위가 아닙니다. 수비 스탯은 반영되지 않습니다.
      </p>
    </div>
  )
}
