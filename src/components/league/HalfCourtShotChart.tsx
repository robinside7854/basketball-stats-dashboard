'use client'
import { useState } from 'react'

// 하프코트 슛 차트 — FIBA 실측 비례 기반
//
// 관측 기준: 베이스라인(림 위치)이 하단, 하프코트 라인이 상단
// (NBA.com/StatMuse/basketball-reference 표준 방향)
//
// viewBox 500 × 470 (FIBA 15m × 14m 반코트, 33.33 px/m)
//
// 좌표 (실측 FIBA):
//   림 중심: (250, 417.5)          — 베이스라인에서 1.575m
//   백보드:  y=430, x=220~280      — 폭 1.8m
//   페인트: x=168.5~331.5, y=277~470 — 4.9m × 5.8m
//   자유투 라인: y=277
//   자유투 원 반지름: 60 (1.8m)
//   노차지 반원 반지름: 41.67 (1.25m)
//   3점 라인 반지름: 225 (6.75m)
//   3점 코너 직선: x=30 / x=470, y=470→370.33
//
// 4 존 (효율 컬러):
//   DS (골밑/덩크스팟) — 노차지 제한구역
//   LU (레이업)         — 페인트 안 (DS 제외)
//   MD (미들레인지)     — 페인트 밖 · 3점 라인 안
//   3P (3점슛)          — 3점 라인 바깥 (상단으로 페이드)
//
// 색상 (신호등 방식):
//   ≥45%: 초록 (핫)
//   30-44%: 노랑 (중간)
//   <30%: 빨강 (콜드)
//   시도 <3: 회색 (표본 부족)

interface Zone {
  m: number
  a: number
  fg_pct: number
}

interface Props {
  zones: {
    post: Zone
    layup: Zone
    mid: Zone
    three: Zone
  }
  size?: number
}

// ── 좌표 상수 ─────────────────────────────────────
const VBW = 500
const VBH = 470
const RIM_X = 250
const RIM_Y = 417.5
const RIM_R = 7.5
const BACKBOARD_Y = 430
const BACKBOARD_HALF_W = 30
const DS_R = 41.67
const PAINT_LEFT = 168.5
const PAINT_RIGHT = 331.5
const PAINT_TOP = 277           // 자유투 라인 (= 페인트 상단 = FT line)
const FT_CIRCLE_R = 60
const THREE_R = 225
const CORNER_X_L = 30
const CORNER_X_R = 470
const CORNER_Y = 370.33         // 3점 코너 직선-아크 교점

// ── 효율 → 컬러 ─────────────────────────────────
function tierOf(pct: number, attempts: number): 'high' | 'mid' | 'low' | 'none' {
  if (attempts < 3) return 'none'
  if (pct >= 45) return 'high'
  if (pct >= 30) return 'mid'
  return 'low'
}
const TIER_COLORS: Record<'high' | 'mid' | 'low' | 'none', { fill: string; text: string; label: string }> = {
  high: { fill: '#16a34a', text: 'text-emerald-100', label: '핫'    },
  mid:  { fill: '#f59e0b', text: 'text-yellow-100',  label: '중간'  },
  low:  { fill: '#dc2626', text: 'text-red-100',     label: '콜드'  },
  none: { fill: '#6b7280', text: 'text-gray-300',    label: '표본 부족' },
}

export default function HalfCourtShotChart({ zones, size = 400 }: Props) {
  const [hover, setHover] = useState<'post' | 'layup' | 'mid' | 'three' | null>(null)

  const totalAttempts = zones.post.a + zones.layup.a + zones.mid.a + zones.three.a
  const volumePct = (z: Zone) => totalAttempts === 0 ? 0 : Math.round(z.a / totalAttempts * 100)

  const dsT = tierOf(zones.post.fg_pct, zones.post.a)
  const luT = tierOf(zones.layup.fg_pct, zones.layup.a)
  const mdT = tierOf(zones.mid.fg_pct, zones.mid.a)
  const thT = tierOf(zones.three.fg_pct, zones.three.a)

  const dsC = TIER_COLORS[dsT]
  const luC = TIER_COLORS[luT]
  const mdC = TIER_COLORS[mdT]
  const thC = TIER_COLORS[thT]

  return (
    <div className="relative w-full" style={{ maxWidth: size }}>
      <div style={{ width: '100%', aspectRatio: `${VBW} / ${VBH}` }}>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block rounded-lg overflow-hidden"
        role="img"
        aria-label="하프코트 슛 차트"
      >
        <defs>
          {/* 하드우드 바닥 (밝은 원목톤) */}
          <linearGradient id="hardwood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c4a173" />
            <stop offset="60%" stopColor="#a68352" />
            <stop offset="100%" stopColor="#8a6a3d" />
          </linearGradient>
          {/* 3P 존 페이드 — 상단(y=0)은 흐리게, 아크 근처(y≈192)는 진하게 */}
          <linearGradient id="threePFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={thC.fill} stopOpacity="0.15" />
            <stop offset="35%" stopColor={thC.fill} stopOpacity="0.60" />
            <stop offset="100%" stopColor={thC.fill} stopOpacity="0.70" />
          </linearGradient>
          {/* 라벨용 그림자 */}
          <filter id="labelShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* ─── 하드우드 바닥 ─── */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#hardwood)" />
        {/* 나뭇결 세로 라인 (실제 코트 마루 방향) */}
        {[50, 110, 175, 240, 305, 370, 430].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2={VBH} stroke="#5a3f22" strokeWidth="1" opacity="0.32" />
        ))}
        {[80, 150, 210, 280, 340, 400].map(x => (
          <line key={`hl-${x}`} x1={x} y1="0" x2={x} y2={VBH} stroke="#e8c896" strokeWidth="0.5" opacity="0.18" />
        ))}

        {/* ═══════════════════════════════════════════ */}
        {/* 존 채우기 (드로우 순서: 3P → MD → LU → DS)   */}
        {/* ═══════════════════════════════════════════ */}

        {/* 3P — 전체 차트 마이너스 인아크 영역 (radial gradient 로 상단 페이드) */}
        <path
          d={`
            M 0 0 H ${VBW} V ${VBH} H 0 Z
            M ${CORNER_X_L} ${VBH} V ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            V ${VBH} Z
          `}
          fill="url(#threePFade)"
          fillRule="evenodd"
          onMouseEnter={() => setHover('three')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'three' ? 0.35 : 1 }}
        />

        {/* MD — 인아크 영역 마이너스 페인트 */}
        <path
          d={`
            M ${CORNER_X_L} ${VBH} V ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            V ${VBH} Z
            M ${PAINT_LEFT} ${VBH} V ${PAINT_TOP} H ${PAINT_RIGHT} V ${VBH} Z
          `}
          fill={mdC.fill}
          fillOpacity="0.65"
          fillRule="evenodd"
          onMouseEnter={() => setHover('mid')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'mid' ? 0.35 : 1 }}
        />

        {/* LU — 페인트 마이너스 노차지 반원 */}
        <path
          d={`
            M ${PAINT_LEFT} ${VBH} V ${PAINT_TOP} H ${PAINT_RIGHT} V ${VBH} Z
            M ${RIM_X - DS_R} ${VBH} V ${RIM_Y}
            A ${DS_R} ${DS_R} 0 0 1 ${RIM_X + DS_R} ${RIM_Y}
            V ${VBH} Z
          `}
          fill={luC.fill}
          fillOpacity="0.70"
          fillRule="evenodd"
          onMouseEnter={() => setHover('layup')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'layup' ? 0.35 : 1 }}
        />

        {/* DS — 노차지 제한구역 ("D" 모양) */}
        <path
          d={`
            M ${RIM_X - DS_R} ${VBH} V ${RIM_Y}
            A ${DS_R} ${DS_R} 0 0 1 ${RIM_X + DS_R} ${RIM_Y}
            V ${VBH} Z
          `}
          fill={dsC.fill}
          fillOpacity="0.80"
          onMouseEnter={() => setHover('post')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'post' ? 0.35 : 1 }}
        />

        {/* ═══════════════════════════════════════════ */}
        {/* 코트 라인 (흰색)                             */}
        {/* ═══════════════════════════════════════════ */}
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* 외곽 프레임 */}
          <rect x="0" y="0" width={VBW} height={VBH} fill="none" stroke="#fff" strokeWidth="3" opacity="0.95" />
          {/* 하프코트 라인 (상단) */}
          <line x1="0" y1="0" x2={VBW} y2="0" stroke="#fff" strokeWidth="3" opacity="0.95" />
          {/* 센터 서클 (하단만 보임 — 반원) */}
          <path d={`M ${RIM_X - FT_CIRCLE_R} 0 A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${RIM_X + FT_CIRCLE_R} 0`}
                fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.9" />
          {/* 페인트 사각형 */}
          <rect x={PAINT_LEFT} y={PAINT_TOP} width={PAINT_RIGHT - PAINT_LEFT} height={VBH - PAINT_TOP}
                fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.95" />
          {/* 자유투 라인 (강조) */}
          <line x1={PAINT_LEFT} y1={PAINT_TOP} x2={PAINT_RIGHT} y2={PAINT_TOP} stroke="#fff" strokeWidth="2.5" opacity="0.95" />
          {/* 자유투 원 — 상단 반원 (실선, MD 존 안에 있음) */}
          <path d={`M ${RIM_X - FT_CIRCLE_R} ${PAINT_TOP} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${RIM_X + FT_CIRCLE_R} ${PAINT_TOP}`}
                fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.95" />
          {/* 자유투 원 — 하단 반원 (점선, 페인트 안) */}
          <path d={`M ${RIM_X - FT_CIRCLE_R} ${PAINT_TOP} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${RIM_X + FT_CIRCLE_R} ${PAINT_TOP}`}
                fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.65" strokeDasharray="5 4" />
          {/* 3점 코너 직선 (하단 → 아크 만남점) */}
          <line x1={CORNER_X_L} y1={VBH} x2={CORNER_X_L} y2={CORNER_Y} stroke="#fff" strokeWidth="2.5" opacity="0.95" />
          <line x1={CORNER_X_R} y1={VBH} x2={CORNER_X_R} y2={CORNER_Y} stroke="#fff" strokeWidth="2.5" opacity="0.95" />
          {/* 3점 아크 (가장 강조 — MD/3P 구분의 핵심) */}
          <path d={`M ${CORNER_X_L} ${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}`}
                fill="none" stroke="#fff" strokeWidth="3.5" opacity="1" />
          {/* 노차지 반원 */}
          <path d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 1 ${RIM_X + DS_R} ${RIM_Y}`}
                fill="none" stroke="#fff" strokeWidth="2" opacity="0.9" />
          {/* 백보드 */}
          <line x1={RIM_X - BACKBOARD_HALF_W} y1={BACKBOARD_Y}
                x2={RIM_X + BACKBOARD_HALF_W} y2={BACKBOARD_Y}
                stroke="#fff" strokeWidth="4" opacity="1" />
          {/* 백보드 → 림 연결 */}
          <line x1={RIM_X} y1={BACKBOARD_Y} x2={RIM_X} y2={RIM_Y + RIM_R}
                stroke="#fff" strokeWidth="1.5" opacity="0.7" />
          {/* 림 (오렌지 원) */}
          <circle cx={RIM_X} cy={RIM_Y} r={RIM_R} fill="#f97316" stroke="#fff" strokeWidth="1" opacity="1" />
        </g>

        {/* ═══════════════════════════════════════════ */}
        {/* 라벨 (효율 % + M/A + 비중)                    */}
        {/* ═══════════════════════════════════════════ */}
        {(() => {
          const labels: { x: number; y: number; w: number; h: number; zone: 'post' | 'layup' | 'mid' | 'three'; small?: boolean }[] = [
            { x: RIM_X - 24, y: 442,   w: 48, h: 22, zone: 'post', small: true },
            { x: RIM_X - 34, y: 355,   w: 68, h: 44, zone: 'layup' },
            { x: RIM_X - 40, y: 210,   w: 80, h: 60, zone: 'mid'   },
            { x: RIM_X - 40, y: 110,   w: 80, h: 60, zone: 'three' },
          ]
          const values = { post: zones.post, layup: zones.layup, mid: zones.mid, three: zones.three }
          const colors = { post: dsC, layup: luC, mid: mdC, three: thC }
          const codes  = { post: 'DS', layup: 'LU', mid: 'MD', three: '3P' }
          return labels.map(({ x, y, w, h, zone, small }) => {
            const z = values[zone]
            const c = colors[zone]
            const active = hover === zone
            return (
              <g key={zone} pointerEvents="none" filter="url(#labelShadow)">
                <rect x={x} y={y} width={w} height={h} rx={6}
                      fill="#0f172a" fillOpacity={active ? 0.95 : 0.85}
                      stroke={c.fill} strokeWidth={active ? 2 : 1.4} strokeOpacity="0.95" />
                {/* 존 코드 */}
                <text x={x + w / 2} y={y + (small ? 10 : 14)} textAnchor="middle"
                      style={{ fontSize: small ? 9 : 10, fontWeight: 800, letterSpacing: 0.7 }}
                      fill="#e2e8f0">
                  {codes[zone]}
                </text>
                {/* FG% */}
                <text x={x + w / 2} y={y + (small ? 20 : 32)} textAnchor="middle"
                      style={{ fontSize: small ? 11 : 18, fontWeight: 900 }}
                      className={c.text}
                      fill="currentColor">
                  {z.a > 0 ? `${z.fg_pct.toFixed(0)}%` : '—'}
                </text>
                {!small && (
                  <>
                    <text x={x + w / 2} y={y + 46} textAnchor="middle"
                          style={{ fontSize: 9.5, fontWeight: 700 }}
                          fill="#cbd5e1">
                      {z.m}/{z.a}
                    </text>
                    {totalAttempts > 0 && (
                      <text x={x + w / 2} y={y + 58} textAnchor="middle"
                            style={{ fontSize: 8.5, fontWeight: 700 }}
                            fill="#94a3b8">
                        비중 {volumePct(z)}%
                      </text>
                    )}
                  </>
                )}
              </g>
            )
          })
        })()}
      </svg>
      </div>

      {/* 범례 + 호버 상세 */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-center gap-3 text-[10px] flex-wrap">
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#16a34a', opacity: 0.85 }} />
            <span className="text-emerald-300 font-semibold">핫 ≥45%</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#f59e0b', opacity: 0.85 }} />
            <span className="text-yellow-300 font-semibold">중간 30–44%</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#dc2626', opacity: 0.85 }} />
            <span className="text-red-300 font-semibold">콜드 &lt;30%</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#6b7280', opacity: 0.65 }} />
            <span className="text-gray-400 font-semibold">시도&lt;3</span>
          </div>
        </div>
        <div className="min-h-[24px] text-center text-[11px]">
          {hover ? (() => {
            const z = zones[hover]
            const c = { post: dsC, layup: luC, mid: mdC, three: thC }[hover]
            const label = { post: '골밑 (DS · 노차지 제한구역)', layup: '레이업·드라이브 (LU · 페인트 안)', mid: '미드레인지 (MD · 페인트 밖 · 3점 안)', three: '3점 (3P · 코너 + 아크)' }[hover]
            return (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-900/90 border border-gray-700/60 flex-wrap">
                <span className="font-bold text-white">{label}</span>
                <span className="text-gray-400">{z.m}/{z.a}</span>
                <span className={`font-black ${c.text}`}>{z.a > 0 ? `${z.fg_pct}%` : '—'}</span>
                <span className="text-gray-500">· {c.label}</span>
                {totalAttempts > 0 && (
                  <span className="text-gray-500">· 비중 <span className="font-bold text-white">{volumePct(z)}%</span></span>
                )}
              </div>
            )
          })() : (
            <span className="text-gray-600">존 위에 마우스 올려 상세 보기</span>
          )}
        </div>
      </div>
    </div>
  )
}
