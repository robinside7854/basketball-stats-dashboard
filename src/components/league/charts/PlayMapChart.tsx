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

type Star = 'att' | 'succ' | 'both' | null
type Pt = {
  id: string; name: string; number: number | null
  x: number; y: number; att: number; made: number; gp: number
  quadrant: Quadrant; z: number; star: Star
}

const MIN_ATT = 3  // 해당 스타일 시도 최소치 — 미만은 '참고'(반투명, 중앙값 제외)

// 하이라이트 색 — 시도 상위 2명(주황) / 성공률 상위 2명(에메랄드), 각각 다른 색
const STAR_FILL_ATT = 'var(--color-hoop-orange-500)'
const STAR_FILL_SUCC = 'var(--mm-positive)'
const fillOfStar = (star: Star) => star === 'succ' ? STAR_FILL_SUCC : star ? STAR_FILL_ATT : 'var(--mm-ink)'

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
  const catDef = CATEGORIES.find(c => c.key === cat)!

  const { eligiblePts, mx, my, eligibleCount, excludedCount } = useMemo(() => {
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
    // 시도·성공률 상위 2명 (하이라이트 대상)
    const topAtt = new Set([...elig].sort((a, b) => b.att - a.att).slice(0, 2).map(r => r.p.player_id))
    const topSucc = new Set([...elig].sort((a, b) => b.pct - a.pct).slice(0, 2).map(r => r.p.player_id))
    const starOf = (id: string): Star => {
      const a = topAtt.has(id), s = topSucc.has(id)
      return a && s ? 'both' : a ? 'att' : s ? 'succ' : null
    }
    const toPt = (r: { p: PlayerStat; att: number; made: number; pct: number }): Pt => {
      const star = starOf(r.p.player_id)
      return {
        id: r.p.player_id, name: r.p.name, number: r.p.number,
        x: r.att, y: r.pct, att: r.att, made: r.made, gp: r.p.gp,
        quadrant: quadrantOf(r.att, r.pct, mx, my),
        z: star ? 2.6 : 1, star,
      }
    }
    const allElig = elig.map(toPt)
    // 라벨·z-order 우선순위: 하이라이트 선수 먼저 → 그 다음 시도 많은 순
    const eligiblePts = [
      ...allElig.filter(p => p.star).sort((a, b) => b.x - a.x),
      ...allElig.filter(p => !p.star).sort((a, b) => b.x - a.x),
    ]
    // 표본 부족(해당 스타일 시도 < MIN_ATT)은 맵에서 완전 제외 — 제외 인원만 카운트.
    const excludedCount = rows.length - elig.length
    return { eligiblePts, mx, my, eligibleCount: elig.length, excludedCount }
  }, [players, catDef])

  const maxAtt = eligiblePts.length ? Math.max(...eligiblePts.map(p => p.x)) : 10
  // X축 sqrt 스케일 — 시도수 분포가 우편향(소수 다작 선수)이라, 저시도 구간이 왼쪽에 뭉치는
  // 과밀을 완화한다(저값은 넓게, 고값은 압축). 도메인은 0부터.
  const xDomain: [number, number] = [0, Math.ceil(maxAtt * 1.05)]
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

  // recharts LabelList custom content — 4방향 후보 중 안 겹치는 곳에 배치.
  //   · 하이라이트 선수(star)는 항상 표기(색상 강조) · 일반 선수는 겹치면 스킵(절대 안 겹침)
  const renderName = (props: { x?: number | string; y?: number | string; value?: unknown; index?: number }) => {
    const x = Number(props.x), y = Number(props.y)
    if (!Number.isFinite(x) || !Number.isFinite(y) || props.index == null) return null
    const p = eligiblePts[props.index]
    const text = String(props.value ?? '')
    const star = p?.star ?? null
    const color = star ? fillOfStar(star) : 'var(--mm-ink)'
    const weight = star ? 900 : 800
    const size = star ? 12 : 11
    const w = text.length * (star ? 9 : 8) + 4, h = star ? 15 : 13
    const candidates = [
      { lx: x + (star ? 11 : 9), ly: y, anchor: 'start' as const },
      { lx: x, ly: y - (star ? 14 : 12), anchor: 'middle' as const },
      { lx: x, ly: y + (star ? 18 : 16), anchor: 'middle' as const },
      { lx: x - (star ? 11 : 9), ly: y, anchor: 'end' as const },
    ]
    const draw = (c: typeof candidates[number]) => (
      <text x={c.lx} y={c.ly} dy={4} textAnchor={c.anchor}
        style={{ fontSize: size, fontWeight: weight, fill: color, paintOrder: 'stroke', stroke: 'var(--mm-panel)', strokeWidth: star ? 3.5 : 3 }}>
        {text}
      </text>
    )
    for (const c of candidates) {
      const bx1 = c.anchor === 'start' ? c.lx : c.anchor === 'end' ? c.lx - w : c.lx - w / 2
      const box = { x1: bx1, y1: c.ly - h / 2, x2: bx1 + w, y2: c.ly + h / 2 }
      const hit = placedBoxes.some(b => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2))
      if (!hit) {
        placedBoxes.push(box)
        return draw(c)
      }
    }
    // 하이라이트 선수는 4방향 다 겹쳐도 강제 표기(첫 후보 위치)
    if (star) return draw(candidates[0])
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
        {excludedCount > 0 && (
          <span
            className="text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: 'var(--mm-muted)' }}
            title={`${catDef.label} 시도 ${MIN_ATT}회 미만 — 표본 부족으로 맵에서 제외`}>
            표본 부족 {excludedCount}명 제외
          </span>
        )}
        <span className="text-[11px] font-bold uppercase tracking-[0.1em] ml-auto" style={{ color: 'var(--mm-muted)' }}>
          {quarterLabel ? `${quarterLabel} · ` : ''}중앙값 시도 {mx.toFixed(1)} · 성공률 {my.toFixed(1)}%
        </span>
      </div>

      {/* 하이라이트 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold">
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STAR_FILL_ATT }} /> 시도 상위 2
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
          <span aria-hidden className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: STAR_FILL_SUCC }} /> 성공률 상위 2
        </span>
        <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--mm-muted)' }}>
          <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: 'var(--mm-ink)', opacity: 0.55 }} /> 그 외 선수
        </span>
      </div>

      {/* 산점도 (크게 — 직관적으로 한눈에) */}
      <div className="relative w-full h-[540px] sm:h-[700px]">
        {cornerLabel('tl', 'top-1 left-12', 'text-left')}
        {cornerLabel('tr', 'top-1 right-2', 'text-right')}
        {cornerLabel('bl', 'bottom-10 left-12', 'text-left')}
        {cornerLabel('br', 'bottom-10 right-2', 'text-right')}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 18, right: 22, bottom: 30, left: 8 }}>
            {/* 우상단(주무기) 사분면만 브랜드 노랑 틴트 */}
            <ReferenceArea x1={mx} x2={xDomain[1]} y1={my} y2={yDomain[1]} fill="var(--mm-yellow-soft)" fillOpacity={1} stroke="none" />
            <XAxis
              type="number" dataKey="x" domain={xDomain} allowDecimals={false} scale="sqrt"
              tick={{ fill: 'var(--mm-muted)', fontSize: 11 }} stroke="var(--mm-rule)"
              label={{ value: `${catDef.label} 시도수 → (저시도 구간 확대)`, position: 'insideBottom', offset: -14, fill: 'var(--mm-ink-soft)', fontSize: 12, fontWeight: 700 }}
            />
            <YAxis
              type="number" dataKey="y" domain={yDomain} width={46}
              tick={{ fill: 'var(--mm-muted)', fontSize: 11 }} stroke="var(--mm-rule)"
              tickFormatter={(v) => `${v}%`}
              label={{ value: `${catDef.label} 성공률`, angle: -90, position: 'insideLeft', offset: 16, fill: 'var(--mm-ink-soft)', fontSize: 12, fontWeight: 700, style: { textAnchor: 'middle' } }}
            />
            <ZAxis type="number" dataKey="z" range={[70, 360]} />
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
                    <div className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--color-hoop-orange-500)', marginTop: 2 }}>{catDef.label} · {QUAD_NAME[d.quadrant]}</div>
                    <div className="text-xs mt-1.5 tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>시도 {d.att} · 성공 {d.made} · 성공률 {d.y}%</div>
                    <div className="text-[11px] tabular-nums" style={{ color: 'var(--mm-muted)' }}>{d.gp}경기</div>
                  </div>
                )
              }}
            />
            {/* 자격 선수 — 하이라이트(시도/성공률 상위 2명)는 색상·크게, 그 외는 뉴트럴 반투명 */}
            <Scatter data={eligiblePts} isAnimationActive={false}
              onClick={(node) => { const d = (node as unknown as { payload?: Pt }).payload; if (d) onSelectPlayer(d.id, d.name) }}
              style={{ cursor: 'pointer' }}>
              {eligiblePts.map(p => (
                <Cell key={p.id}
                  fill={fillOfStar(p.star)}
                  fillOpacity={p.star ? 1 : 0.6}
                  stroke={p.star === 'both' ? STAR_FILL_SUCC : 'var(--mm-panel)'}
                  strokeWidth={p.star === 'both' ? 2.5 : p.star ? 1.5 : 1}
                />
              ))}
              <LabelList dataKey="name" content={renderName} />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
        · <b style={{ color: 'var(--mm-ink-soft)' }}>{catDef.label}</b> 기준 · 가로축 = <b style={{ color: 'var(--mm-ink-soft)' }}>시도수</b>(우측일수록 많이 시도, 저시도 구간은 넓게 펼쳐 표시) · 세로축 = <b style={{ color: 'var(--mm-ink-soft)' }}>성공률</b>. 리그 중앙값으로 4분할, 우상단(노랑)=많이 쏘고 잘 넣는 <b style={{ color: 'var(--mm-ink-soft)' }}>주무기</b>. 버블 클릭 시 선수 상세. 해당 스타일 시도 {MIN_ATT}회 미만은 <b style={{ color: 'var(--mm-ink-soft)' }}>표본 부족으로 맵에서 제외</b>됩니다.
      </p>
    </div>
  )
}
