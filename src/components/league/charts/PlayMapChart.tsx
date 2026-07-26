'use client'
/* eslint-disable react-hooks/immutability -- 라벨 겹침 회피: 렌더마다 새로 만드는 지역 스크래치 배열에
   실제 픽셀 좌표 기준으로 배치 박스를 누적(결정적, 부수효과 없음). 겹치면 렌더 스킵해 '절대 겹치지 않음'을
   실제 렌더 좌표로 보장 — 데이터공간 근사로는 반응형 크기에서 겹침 보장 불가하므로 이 패턴이 필요. */
// 플레이 맵 — 공격 스타일별 (야투 시도수 × 성공률) 4사분면 산점도 (2026-07-27)
//   · 공격 스타일 필터칩: 골밑슛 / 레이업 / 미들슛 / 3점슛 (단일 선택)
//   · X=선택 스타일 시도수 · Y=선택 스타일 성공률 · 리그 중앙값으로 4분할
//   · 표본 적은 선수(해당 스타일 시도<MIN_ATT)는 '참고 선수' 토글로만 (반투명, 중앙값 제외)
//   · 원 크기는 균일(정보 인코딩 없음 — 시도수는 X축이 담당) · 선수 이름은 겹치면 숨김(절대 안 겹침)
//   · 버블/행 클릭 → PlayerQuickViewModal
import { useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, ReferenceLine,
  ReferenceArea, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import type { PlayerStat } from '@/types/league'

type Category = 'post' | 'layup' | 'mid' | 'three'
type Quadrant = 'tr' | 'br' | 'tl' | 'bl'

// 공격 스타일 4종 — 각 스타일의 시도수·성공수 추출 (존별 슛 분포 필드)
const CATEGORIES: { key: Category; label: string; att: (p: PlayerStat) => number; made: (p: PlayerStat) => number }[] = [
  { key: 'post',  label: '골밑슛', att: p => p.ds_a ?? 0, made: p => p.ds_m ?? 0 },
  { key: 'layup', label: '레이업', att: p => p.lu_a ?? 0, made: p => p.lu_m ?? 0 },
  { key: 'mid',   label: '미들슛', att: p => p.md_a ?? 0, made: p => p.md_m ?? 0 },
  { key: 'three', label: '3점슛', att: p => p.fg3a ?? 0, made: p => p.fg3m ?? 0 },
]

// 사분면(시도수 × 성공률) 아키타입 — 카테고리 무관 공통
const QUAD_NAME: Record<Quadrant, string> = { tr: '주무기', br: '많이 시도', tl: '한 방', bl: '비주력' }
const QUAD_HINT: Record<Quadrant, string> = {
  tr: '많이 쏘고 잘 넣음', br: '많이 쏘지만 성공률 낮음', tl: '적게 쏘지만 정확', bl: '적게·성공률 낮음',
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
  id: string; name: string; number: number | null
  x: number; y: number; att: number; made: number; gp: number
  eligible: boolean; quadrant: Quadrant; z: number
}

const MIN_ATT = 3  // 해당 스타일 시도 최소치 — 미만은 '참고'(반투명, 중앙값 제외)

export default function PlayMapChart({
  players, minGP, quarterLabel, onSelectPlayer,
}: {
  players: PlayerStat[]
  minGP: number
  quarterLabel?: string
  onSelectPlayer: (id: string, name: string) => void
}) {
  void minGP  // 자격 기준은 스타일별 시도수(MIN_ATT)로 판정 — minGP 는 미사용
  const [cat, setCat] = useState<Category>('three')
  const [showRef, setShowRef] = useState(true)
  const catDef = CATEGORIES.find(c => c.key === cat)!

  const { eligiblePts, refPts, mx, my, eligibleCount } = useMemo(() => {
    const rows = players
      .map(p => {
        const att = catDef.att(p)
        const made = catDef.made(p)
        return { p, att, made, pct: att > 0 ? +(made / att * 100).toFixed(1) : 0 }
      })
      .filter(r => r.att > 0)  // 이 스타일을 아예 안 쓰면 제외
    const elig = rows.filter(r => r.att >= MIN_ATT)
    const mx = median(elig.map(r => r.att))
    const my = median(elig.map(r => r.pct))
    const toPt = (r: { p: PlayerStat; att: number; made: number; pct: number }): Pt => ({
      id: r.p.player_id, name: r.p.name, number: r.p.number,
      x: r.att, y: r.pct, att: r.att, made: r.made, gp: r.p.gp,
      eligible: r.att >= MIN_ATT, quadrant: quadrantOf(r.att, r.pct, mx, my), z: 1,
    })
    // 라벨 우선순위: 시도 많은 순 (겹칠 때 많이 쏘는 선수 이름을 우선 표기)
    const eligiblePts = elig.map(toPt).sort((a, b) => b.x - a.x)
    const refPts = rows.filter(r => r.att < MIN_ATT).map(toPt)
    return { eligiblePts, refPts, mx, my, eligibleCount: elig.length }
  }, [players, catDef])

  const allShown = [...eligiblePts, ...(showRef ? refPts : [])]
  const xs = allShown.map(p => p.x)
  const pad = (arr: number[], r: number): [number, number] => {
    if (arr.length === 0) return [0, 10]
    const lo = Math.min(...arr), hi = Math.max(...arr)
    const gap = Math.max((hi - lo) * r, 1)
    return [Math.max(0, Math.floor(lo - gap)), Math.ceil(hi + gap)]
  }
  const xDomain = pad(xs, 0.15)
  const yDomain: [number, number] = [0, 100]

  // 라벨 겹침 방지용 배치 박스 — 렌더마다 새 배열(ref 아님, 렌더 중 mutation 안전).
  // renderName 이 이 배열을 클로저로 공유하며, 시도 많은 순으로 배치하고 겹치면 스킵.
  const placedBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = []

  if (eligibleCount < 3) {
    return (
      <div className="text-center py-16" style={{ color: 'var(--mm-muted)' }}>
        <p className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{catDef.label} 표본이 부족합니다</p>
        <p className="text-xs mt-1">{catDef.label} 시도 {MIN_ATT}회 이상 선수가 3명 이상 모이면 표시됩니다 (현재 {eligibleCount}명)</p>
        <p className="text-xs mt-3">다른 스타일 칩을 눌러보세요.</p>
      </div>
    )
  }

  const cornerLabel = (q: Quadrant, pos: string, align: string) => (
    <div className={`absolute ${pos} pointer-events-none select-none z-10 ${align}`}>
      <div className="font-jersey font-black uppercase leading-none" style={{ color: 'var(--mm-ink-soft)', fontSize: '13px', letterSpacing: '0.06em' }}>{QUAD_NAME[q]}</div>
      <div className="text-[9px] font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>{QUAD_HINT[q]}</div>
    </div>
  )

  // recharts LabelList custom content — 4방향 후보 중 안 겹치는 곳에 배치, 다 겹치면 렌더 스킵
  const renderName = (props: { x?: number | string; y?: number | string; value?: unknown; index?: number }) => {
    const x = Number(props.x), y = Number(props.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    const text = String(props.value ?? '')
    const w = text.length * 8 + 4, h = 13
    const candidates = [
      { lx: x + 9, ly: y, anchor: 'start' as const },
      { lx: x, ly: y - 12, anchor: 'middle' as const },
      { lx: x, ly: y + 16, anchor: 'middle' as const },
      { lx: x - 9, ly: y, anchor: 'end' as const },
    ]
    for (const c of candidates) {
      const bx1 = c.anchor === 'start' ? c.lx : c.anchor === 'end' ? c.lx - w : c.lx - w / 2
      const box = { x1: bx1, y1: c.ly - h / 2, x2: bx1 + w, y2: c.ly + h / 2 }
      const hit = placedBoxes.some(b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2))
      if (!hit) {
        placedBoxes.push(box)
        return (
          <text x={c.lx} y={c.ly} dy={4} textAnchor={c.anchor}
            style={{ fontSize: 11, fontWeight: 800, fill: 'var(--mm-ink)', paintOrder: 'stroke', stroke: 'var(--mm-panel)', strokeWidth: 3 }}>
            {text}
          </text>
        )
      }
    }
    return null
  }

  return (
    <div className="space-y-4">
      {/* 공격 스타일 필터칩 + 참고선수 토글 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setCat(c.key)}
              aria-pressed={cat === c.key}
              className="px-3.5 py-2 text-xs sm:text-sm font-black uppercase tracking-[0.06em] cursor-pointer transition-colors min-h-[44px] rounded-md border"
              style={cat === c.key
                ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderColor: 'var(--mm-ink)' }
                : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', borderColor: 'var(--mm-rule)' }}>
              {c.label}
            </button>
          ))}
        </div>
        {refPts.length > 0 && (
          <button onClick={() => setShowRef(v => !v)}
            aria-pressed={showRef}
            className="px-2.5 py-1 text-xs font-black uppercase cursor-pointer transition-all flex items-center gap-1.5 min-h-[40px] rounded-md"
            style={{ background: 'var(--mm-panel)', color: showRef ? 'var(--mm-ink)' : 'var(--mm-muted)', border: `1px solid ${showRef ? 'var(--color-hoop-orange-500)' : 'var(--mm-rule)'}` }}
            title={`${catDef.label} 시도 ${MIN_ATT}회 미만 선수 (반투명 · 중앙값 제외)`}>
            <span className="inline-block w-3 h-3 rounded-full border" style={{ background: showRef ? 'var(--color-hoop-orange-500)' : 'transparent', borderColor: showRef ? 'var(--color-hoop-orange-500)' : 'var(--mm-muted)' }} />
            참고 선수 ({refPts.length})
          </button>
        )}
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] ml-auto" style={{ color: 'var(--mm-muted)' }}>
          {quarterLabel ? `${quarterLabel} · ` : ''}중앙값 시도 {mx.toFixed(1)} · 성공률 {my.toFixed(1)}%
        </span>
      </div>

      {/* 산점도 (크게) */}
      <div className="relative w-full h-[440px] sm:h-[580px]">
        {cornerLabel('tl', 'top-1 left-12', 'text-left')}
        {cornerLabel('tr', 'top-1 right-2', 'text-right')}
        {cornerLabel('bl', 'bottom-10 left-12', 'text-left')}
        {cornerLabel('br', 'bottom-10 right-2', 'text-right')}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 18, right: 22, bottom: 30, left: 8 }}>
            {/* 우상단(주무기) 사분면만 브랜드 노랑 틴트 */}
            <ReferenceArea x1={mx} x2={xDomain[1]} y1={my} y2={yDomain[1]} fill="var(--mm-yellow-soft)" fillOpacity={1} stroke="none" />
            <XAxis
              type="number" dataKey="x" domain={xDomain} allowDecimals={false}
              tick={{ fill: 'var(--mm-muted)', fontSize: 11 }} stroke="var(--mm-rule)"
              label={{ value: `${catDef.label} 시도수 →`, position: 'insideBottom', offset: -14, fill: 'var(--mm-ink-soft)', fontSize: 12, fontWeight: 700 }}
            />
            <YAxis
              type="number" dataKey="y" domain={yDomain} width={46}
              tick={{ fill: 'var(--mm-muted)', fontSize: 11 }} stroke="var(--mm-rule)"
              tickFormatter={(v) => `${v}%`}
              label={{ value: `${catDef.label} 성공률`, angle: -90, position: 'insideLeft', offset: 16, fill: 'var(--mm-ink-soft)', fontSize: 12, fontWeight: 700, style: { textAnchor: 'middle' } }}
            />
            <ZAxis type="number" dataKey="z" range={[170, 170]} />
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
                    <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--color-hoop-orange-500)', marginTop: 2 }}>{catDef.label} · {QUAD_NAME[d.quadrant]}{!d.eligible && ' · 참고'}</div>
                    <div className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>시도 {d.att} · 성공 {d.made} · 성공률 {d.y}%</div>
                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--mm-muted)' }}>{d.gp}경기</div>
                  </div>
                )
              }}
            />
            {/* 참고 선수(반투명, 라벨 없음) */}
            {showRef && refPts.length > 0 && (
              <Scatter data={refPts} isAnimationActive={false}
                onClick={(node) => { const d = (node as unknown as { payload?: Pt }).payload; if (d) onSelectPlayer(d.id, d.name) }}
                style={{ cursor: 'pointer' }}>
                {refPts.map(p => (
                  <Cell key={p.id} fill="transparent" stroke="var(--mm-muted)" strokeOpacity={0.5} strokeWidth={1} />
                ))}
              </Scatter>
            )}
            {/* 자격 선수(솔리드 + 이름 라벨) */}
            <Scatter data={eligiblePts} isAnimationActive={false}
              onClick={(node) => { const d = (node as unknown as { payload?: Pt }).payload; if (d) onSelectPlayer(d.id, d.name) }}
              style={{ cursor: 'pointer' }}>
              {eligiblePts.map(p => (
                <Cell key={p.id} fill="var(--mm-ink)" fillOpacity={0.82} stroke="var(--mm-panel)" strokeWidth={1.5} />
              ))}
              <LabelList dataKey="name" content={renderName} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* 사분면별 그룹 리스트 — 산점도가 안 읽혀도 정보 손실 0 (모바일 대안 겸용) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {(['tr', 'tl', 'br', 'bl'] as Quadrant[]).map(q => {
          const members = eligiblePts.filter(p => p.quadrant === q).sort((a, b) => b.x - a.x)
          const isGoal = q === 'tr'
          return (
            <div key={q} className="rounded-md border overflow-hidden" style={{ borderColor: isGoal ? 'var(--color-hoop-orange-500)' : 'var(--mm-rule)', background: isGoal ? 'var(--mm-yellow-soft)' : 'var(--mm-panel)' }}>
              <div className="px-3 py-2 flex items-baseline justify-between gap-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: 15, letterSpacing: '0.04em' }}>{QUAD_NAME[q]}</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>{QUAD_HINT[q]}</span>
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
                        <span className="shrink-0 tabular-nums text-xs font-black" style={{ color: 'var(--mm-ink-soft)' }}>{p.att}회</span>
                        <span className="shrink-0 text-[10px]" style={{ color: 'var(--mm-muted)' }}>·</span>
                        <span className="shrink-0 tabular-nums text-xs font-black" style={{ color: 'var(--mm-ink-soft)' }}>{p.y}%</span>
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
        · <b style={{ color: 'var(--mm-ink-soft)' }}>{catDef.label}</b> 기준 · 가로축 = <b style={{ color: 'var(--mm-ink-soft)' }}>시도수</b>(우측일수록 많이 시도) · 세로축 = <b style={{ color: 'var(--mm-ink-soft)' }}>성공률</b>. 리그 중앙값으로 4분할, 우상단(노랑)=많이 쏘고 잘 넣는 <b style={{ color: 'var(--mm-ink-soft)' }}>주무기</b>. 원 크기는 균일(정보 없음). 표본 적은 선수는 별도(참고 선수)로 구분됩니다.
      </p>
    </div>
  )
}
