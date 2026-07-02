'use client'
import { useState } from 'react'

// 하프코트 슛 차트 — FIBA 표준 코트 비례 (15m × 14m half-court)
//
// viewBox 400 × 373 (aspect = 15:14). 1m = 26.67 px.
// 좌표계: 베이스라인 = y=0 (위쪽에 림), 하프코트 라인 = y=373 (아래쪽).
//
// 실제 FIBA 규격 → 픽셀:
//   - 코트: 15m 폭 × 14m 반코트 (28m 전장의 절반)
//   - 림 중심: 베이스라인에서 1.575m 안쪽 → y=42
//   - 백보드: 베이스라인에서 1.2m 안쪽, 폭 1.8m → y=32, x=176~224
//   - 페인트(제한구역): 폭 4.9m × 길이 5.8m → x=135~265, y=0~155
//   - 자유투 라인: 페인트 끝 → y=155
//   - 자유투 원: 반경 1.8m → r=48
//   - 노차지 제한구역(RA): 반경 1.25m → r=33
//   - 3점 코너 라인: 사이드라인에서 0.9m → x=24, x=376
//   - 3점 아크: 림에서 6.75m → r=180
//   - 코너-3 직선 길이: 베이스라인 → 아크 만나는 지점 (y=80)
//   - 3점 아크 정점: y = 42 + 180 = 222 (탑 오브 키 위)
//
// Zone 매핑:
//   - DS  (post):   림 바로 아래 제한구역 반원 (0-1.25m)
//   - LU  (layup):  페인트 안 (RA 제외 영역)
//   - MD  (mid):    페인트 밖 × 3점 라인 안쪽
//   - 3P  (three):  3점 라인 바깥

interface Zone {
  m: number
  a: number
  fg_pct: number
}

interface Props {
  zones: {
    post: Zone   // DS — 골밑슛
    layup: Zone  // LU — 레이업+드라이브
    mid: Zone    // MD — 미드레인지
    three: Zone  // 3P — 3점슛
  }
  size?: number
}

function pctToFill(pct: number, baseColor: string): { fill: string; opacity: number } {
  if (pct <= 0) return { fill: baseColor, opacity: 0.10 }
  let opacity = 0.25
  if (pct >= 45) opacity = 0.75
  else if (pct >= 35) opacity = 0.55
  else if (pct >= 25) opacity = 0.40
  return { fill: baseColor, opacity }
}

function pctTextColor(pct: number): string {
  if (pct >= 45) return 'text-emerald-300'
  if (pct >= 30) return 'text-yellow-300'
  if (pct > 0)   return 'text-red-300'
  return 'text-gray-500'
}

const COLORS = {
  post:  '#ef4444',
  layup: '#f97316',
  mid:   '#eab308',
  three: '#3b82f6',
}

// ── SVG 좌표 상수 (FIBA 비례 · 26.67 px/m) ───────────────────────
const VBW = 400
const VBH = 373
const RIM_X = 200
const RIM_Y = 42                // 1.575m from baseline
const RIM_R = 6                 // 0.225m radius (실 크기 45cm)
const BACKBOARD_Y = 32          // 1.2m from baseline
const BACKBOARD_HALF_W = 24     // 0.9m each side (총 1.8m)
const DS_R = 33                 // no-charge arc 1.25m
const PAINT_LEFT = 135          // (200 - 2.45m × 26.67)
const PAINT_RIGHT = 265         // (200 + 2.45m × 26.67)
const PAINT_BOTTOM = 155        // FT line, 5.8m from baseline
const FT_CIRCLE_R = 48          // 1.8m radius
const THREE_R = 180             // 6.75m from rim
const CORNER_X_L = 24           // 0.9m from sideline
const CORNER_X_R = 376
// 3점 직선-아크 교점 y: √(THREE_R² - (RIM_X - CORNER_X_L)²) + RIM_Y
//   = √(180² - 176²) + 42 = √(1424) + 42 ≈ 37.7 + 42 = 79.7
const CORNER_Y = 80
const ARC_TOP_Y = RIM_Y + THREE_R  // 222 — 3점 호 정점

export default function HalfCourtShotChart({ zones, size = 360 }: Props) {
  const [hover, setHover] = useState<keyof typeof COLORS | null>(null)

  const aspectRatio = VBH / VBW
  const totalAttempts = zones.post.a + zones.layup.a + zones.mid.a + zones.three.a
  function volumePct(z: Zone): number {
    if (totalAttempts === 0) return 0
    return +(z.a / totalAttempts * 100).toFixed(0)
  }

  return (
    <div className="relative" style={{ width: size, maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        height={size * aspectRatio}
        className="block"
        role="img"
        aria-label="하프코트 슛 차트"
      >
        <defs>
          <radialGradient id="hoopGlow" cx="50%" cy="11%" r="42%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 하드우드 배경 ── */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="#0a0a0c" />
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#hoopGlow)" />
        {[70, 140, 210, 280, 350].map(y => (
          <line key={y} x1="0" y1={y} x2={VBW} y2={y} stroke="#5c2e0e" strokeWidth="0.5" opacity="0.18" />
        ))}

        {/* ── 슛 존 색상 ── */}

        {/* 3P — 코트 외곽 ~ 3점 라인 바깥 (하프코트 라인 위쪽 전체) */}
        {(() => {
          const t = pctToFill(zones.three.fg_pct, COLORS.three)
          const path = `
            M 0 0
            L ${CORNER_X_L} 0
            L ${CORNER_X_L} ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            L ${CORNER_X_R} 0
            L ${VBW} 0
            L ${VBW} ${VBH}
            L 0 ${VBH}
            Z
          `
          return (
            <path
              d={path}
              fill={t.fill}
              fillOpacity={t.opacity}
              onMouseEnter={() => setHover('three')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'three' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* MD — 3점 라인 안쪽 ~ 페인트 바깥 (윙 + 엘보 + 탑오브키) */}
        {(() => {
          const m = pctToFill(zones.mid.fg_pct, COLORS.mid)
          // 3점 안쪽 전체 → 페인트 사각형 구멍 (evenodd)
          const path = `
            M ${CORNER_X_L} 0
            L ${CORNER_X_L} ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            L ${CORNER_X_R} 0
            Z
            M ${PAINT_LEFT} 0
            L ${PAINT_RIGHT} 0
            L ${PAINT_RIGHT} ${PAINT_BOTTOM}
            L ${PAINT_LEFT} ${PAINT_BOTTOM}
            Z
          `
          return (
            <path
              d={path}
              fill={m.fill}
              fillOpacity={m.opacity}
              fillRule="evenodd"
              onMouseEnter={() => setHover('mid')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'mid' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* LU — 페인트 전체 (DS 는 위에 덮어쓰기) */}
        {(() => {
          const l = pctToFill(zones.layup.fg_pct, COLORS.layup)
          const path = `
            M ${PAINT_LEFT} 0
            L ${PAINT_RIGHT} 0
            L ${PAINT_RIGHT} ${PAINT_BOTTOM}
            L ${PAINT_LEFT} ${PAINT_BOTTOM}
            Z
          `
          return (
            <path
              d={path}
              fill={l.fill}
              fillOpacity={l.opacity}
              onMouseEnter={() => setHover('layup')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'layup' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* DS — 노차지 제한구역 반원 (림 옆) */}
        {(() => {
          const p = pctToFill(zones.post.fg_pct, COLORS.post)
          const path = `
            M ${RIM_X - DS_R} ${RIM_Y}
            A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}
            Z
          `
          return (
            <path
              d={path}
              fill={p.fill}
              fillOpacity={p.opacity}
              onMouseEnter={() => setHover('post')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'post' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* ── 코트 라인 ── */}
        {/* 외곽 */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
        {/* 백보드 */}
        <line
          x1={RIM_X - BACKBOARD_HALF_W} y1={BACKBOARD_Y}
          x2={RIM_X + BACKBOARD_HALF_W} y2={BACKBOARD_Y}
          stroke="#fff" strokeWidth="3" opacity="0.9"
        />
        {/* 백보드 -> 림 연결 */}
        <line
          x1={RIM_X} y1={BACKBOARD_Y}
          x2={RIM_X} y2={RIM_Y - RIM_R}
          stroke="#fff" strokeWidth="1" opacity="0.5"
        />
        {/* 림 */}
        <circle cx={RIM_X} cy={RIM_Y} r={RIM_R} fill="none" stroke="#ea580c" strokeWidth="2.2" />
        {/* 페인트 */}
        <rect
          x={PAINT_LEFT} y="0"
          width={PAINT_RIGHT - PAINT_LEFT} height={PAINT_BOTTOM}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7"
        />
        {/* 자유투 라인 */}
        <line x1={PAINT_LEFT} y1={PAINT_BOTTOM} x2={PAINT_RIGHT} y2={PAINT_BOTTOM} stroke="#fff" strokeWidth="1.5" opacity="0.7" />
        {/* 자유투 원 (페인트 바깥 실선 - 위쪽 반원) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7"
        />
        {/* 자유투 원 (페인트 안쪽 점선 - 아래쪽 반원) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.35" strokeDasharray="3 3"
        />
        {/* 노차지 반원 */}
        <path
          d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}`}
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.5"
        />
        {/* 3점 코너 직선 */}
        <line x1={CORNER_X_L} y1="0" x2={CORNER_X_L} y2={CORNER_Y} stroke="#fff" strokeWidth="1.5" opacity="0.75" />
        <line x1={CORNER_X_R} y1="0" x2={CORNER_X_R} y2={CORNER_Y} stroke="#fff" strokeWidth="1.5" opacity="0.75" />
        {/* 3점 아크 */}
        <path
          d={`M ${CORNER_X_L} ${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.75"
        />
        {/* 하프코트 라인 */}
        <line x1="0" y1={VBH - 1} x2={VBW} y2={VBH - 1} stroke="#fff" strokeWidth="1.5" opacity="0.6" />
        {/* 센터 서클 (반원만) */}
        <path
          d={`M ${RIM_X - 48} ${VBH} A 48 48 0 0 1 ${RIM_X + 48} ${VBH}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6"
        />

        {/* ── 존 라벨 ── */}
        {/* DS — 림 바로 옆 */}
        <g pointerEvents="none">
          <text x={RIM_X} y={RIM_Y + 14} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 10, letterSpacing: 0.5 }} opacity={hover === 'post' ? 1 : 0.9}>DS</text>
          <text x={RIM_X} y={RIM_Y + 26} textAnchor="middle" className="fill-white" style={{ fontSize: 10, fontWeight: 800 }} opacity={hover === 'post' ? 1 : 0.95}>
            {zones.post.fg_pct > 0 ? `${zones.post.fg_pct}%` : '—'}
          </text>
        </g>
        {/* LU — 페인트 중앙 */}
        <g pointerEvents="none">
          <text x={RIM_X} y={95} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'layup' ? 1 : 0.95}>LU</text>
          <text x={RIM_X} y={115} textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'layup' ? 1 : 0.95}>
            {zones.layup.fg_pct > 0 ? `${zones.layup.fg_pct}%` : '—'}
          </text>
          <text x={RIM_X} y={132} textAnchor="middle" className="fill-gray-200" style={{ fontSize: 10 }}>{zones.layup.m}/{zones.layup.a}</text>
          {totalAttempts > 0 && (
            <text x={RIM_X} y={146} textAnchor="middle" className="fill-orange-300" style={{ fontSize: 10, fontWeight: 800 }}>비중 {volumePct(zones.layup)}%</text>
          )}
        </g>
        {/* MD — 좌측 윙 (넓은 영역) */}
        <g pointerEvents="none">
          <text x="68" y="110" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'mid' ? 1 : 0.92}>MD</text>
          <text x="68" y="130" textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 800 }} opacity={hover === 'mid' ? 1 : 0.95}>
            {zones.mid.fg_pct > 0 ? `${zones.mid.fg_pct}%` : '—'}
          </text>
          <text x="68" y="146" textAnchor="middle" className="fill-gray-200" style={{ fontSize: 10 }}>{zones.mid.m}/{zones.mid.a}</text>
          {totalAttempts > 0 && (
            <text x="68" y="160" textAnchor="middle" className="fill-yellow-300" style={{ fontSize: 10, fontWeight: 800 }}>비중 {volumePct(zones.mid)}%</text>
          )}
        </g>
        {/* 3P — 탑 오브 키 위 */}
        <g pointerEvents="none">
          <text x={RIM_X} y={ARC_TOP_Y + 32} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 15, letterSpacing: 0.5 }} opacity={hover === 'three' ? 1 : 0.95}>3P</text>
          <text x={RIM_X} y={ARC_TOP_Y + 52} textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'three' ? 1 : 0.95}>
            {zones.three.fg_pct > 0 ? `${zones.three.fg_pct}%` : '—'}
          </text>
          <text x={RIM_X} y={ARC_TOP_Y + 68} textAnchor="middle" className="fill-gray-200" style={{ fontSize: 10 }}>{zones.three.m}/{zones.three.a}</text>
          {totalAttempts > 0 && (
            <text x={RIM_X} y={ARC_TOP_Y + 82} textAnchor="middle" className="fill-blue-300" style={{ fontSize: 10, fontWeight: 800 }}>비중 {volumePct(zones.three)}%</text>
          )}
        </g>
      </svg>

      {/* 호버 상세 */}
      <div className="mt-2 min-h-[28px] text-center text-[11px]">
        {hover ? (() => {
          const z = zones[hover]
          const labelMap = { post: '골밑 (DS) · 노차지 제한구역', layup: '레이업·드라이브 (LU) · 페인트 안', mid: '미드레인지 (MD) · 윙·엘보·탑오브키', three: '3점 (3P)' }
          return (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-900/80 border border-gray-700/50 flex-wrap">
              <span className="font-bold" style={{ color: COLORS[hover] }}>{labelMap[hover]}</span>
              <span className="text-gray-400">{z.m}/{z.a}</span>
              <span className={`font-black ${pctTextColor(z.fg_pct)}`}>{z.fg_pct}%</span>
              {totalAttempts > 0 && (
                <span className="text-gray-500">· 전체 대비 <span className="font-bold text-white">{volumePct(z)}%</span></span>
              )}
            </div>
          )
        })() : (
          <span className="text-gray-600">존 위에 마우스 올려 상세 보기</span>
        )}
      </div>
    </div>
  )
}
