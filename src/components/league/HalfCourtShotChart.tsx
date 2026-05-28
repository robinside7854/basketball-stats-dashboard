'use client'
import { useState } from 'react'

// 하프코트 슛 차트 — FIBA 표준 비례 적용
//
// 좌표계: viewBox 400 × 380, 1m ≈ 27px
//   - 코트 폭: 15m × 27 ≈ 400  (사이드라인 = x=0, x=400)
//   - 베이스라인 → 하프코트: 14m × 27 ≈ 378  (베이스라인 = y=0)
//   - 림 중심: (200, 35)
//   - 페인트(키): 4.9m × 5.8m → x=134~266, y=0~160
//   - 자유투 라인: y=160
//   - 자유투 호: r=49 (1.8m), center (200, 160)
//   - 3점 코너 직선: x=24, x=376 (사이드라인에서 0.9m)
//   - 3점 호: r=180 (6.75m), 림에서. 시작 (24, 76) → 정점 (200, 215) → (376, 76)
//   - 제한 구역 (DS): r=34 (1.25m) 반원 around rim

interface Zone {
  m: number
  a: number
  fg_pct: number
}

interface Props {
  zones: {
    post: Zone   // 골밑 (Dunk Spot)
    layup: Zone  // 레이업+드라이브
    mid: Zone    // 미드레인지
    three: Zone  // 3점
  }
  size?: number  // 너비 (높이는 자동 비율)
}

// FG% → 색상 강도 (배경 베이스 + opacity)
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

// SVG 좌표 상수 — 위 주석의 FIBA 비례 기반
const RIM_X = 200
const RIM_Y = 35
const RIM_R = 9           // 림 표시용 (시각용, 실제 0.45m=12px 보다 약간 작게)
const DS_R = 34           // 골밑 zone 반경 (1.25m)
const LU_BOTTOM = 115     // 레이업 zone 의 아래쪽 한계 — 자유투 라인까지 가지 않게 컷
const PAINT_LEFT = 134
const PAINT_RIGHT = 266
const PAINT_BOTTOM = 160  // 자유투 라인
const FT_CIRCLE_R = 49    // 자유투 호 반경 (1.8m)
const THREE_R = 180       // 3점 호 반경 (6.75m)
const CORNER_X_L = 24     // 좌측 코너-3 직선 (사이드라인에서 0.9m)
const CORNER_X_R = 376    // 우측 코너-3 직선
const CORNER_Y = 76       // 코너-3 직선이 호와 만나는 y 좌표
const ARC_BOTTOM_Y = RIM_Y + THREE_R  // 215 — 호의 정점 (코트 안쪽으로 가장 깊은 곳)

export default function HalfCourtShotChart({ zones, size = 360 }: Props) {
  const [hover, setHover] = useState<keyof typeof COLORS | null>(null)

  const aspectRatio = 380 / 400

  return (
    <div className="relative" style={{ width: size, maxWidth: '100%' }}>
      <svg
        viewBox="0 0 400 380"
        width="100%"
        height={size * aspectRatio}
        className="block"
        role="img"
        aria-label="하프코트 슛 차트"
      >
        <defs>
          <radialGradient id="hoopGlow" cx="50%" cy="9%" r="40%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 하드우드 배경 ── */}
        <rect x="0" y="0" width="400" height="380" fill="#0a0a0c" />
        <rect x="0" y="0" width="400" height="380" fill="url(#hoopGlow)" />
        {/* 가로 우드 라인 (희미) */}
        {[60, 120, 180, 240, 300, 360].map(y => (
          <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#5c2e0e" strokeWidth="0.5" opacity="0.20" />
        ))}

        {/* ── 슛 존 색상 (FG% 강도 매핑) ── */}

        {/* 3P — 코트 외곽 ~ 3점 라인 바깥 */}
        {(() => {
          const t = pctToFill(zones.three.fg_pct, COLORS.three)
          const path = `
            M 0 0
            L ${CORNER_X_L} 0
            L ${CORNER_X_L} ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            L ${CORNER_X_R} 0
            L 400 0
            L 400 380
            L 0 380
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

        {/* MD — 3점 라인 안쪽 ~ 레이업 사각형(하부 페인트) 바깥 (즉, 2-pt 전체 − LU) */}
        {(() => {
          const m = pctToFill(zones.mid.fg_pct, COLORS.mid)
          // 2-pt U-shape (3점 라인 안쪽 영역) + LU 사각형 구멍 (evenodd)
          const path = `
            M ${CORNER_X_L} 0
            L ${CORNER_X_L} ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            L ${CORNER_X_R} 0
            Z
            M ${PAINT_LEFT} 0
            L ${PAINT_RIGHT} 0
            L ${PAINT_RIGHT} ${LU_BOTTOM}
            L ${PAINT_LEFT} ${LU_BOTTOM}
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

        {/* LU — 페인트 하부 (자유투 라인까지 가지 않음) — 윗쪽 일부분 */}
        {(() => {
          const l = pctToFill(zones.layup.fg_pct, COLORS.layup)
          const path = `
            M ${PAINT_LEFT} 0
            L ${PAINT_RIGHT} 0
            L ${PAINT_RIGHT} ${LU_BOTTOM}
            L ${PAINT_LEFT} ${LU_BOTTOM}
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

        {/* DS — 림 주변 제한구역 (반원, 코트 안쪽 방향) */}
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

        {/* ── 코트 라인 (존 위에 그려짐) ── */}
        {/* 외곽 */}
        <rect x="0" y="0" width="400" height="380" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
        {/* 백보드 (위쪽 끝선) */}
        <line x1="170" y1="18" x2="230" y2="18" stroke="#fff" strokeWidth="3" opacity="0.9" />
        {/* 림 */}
        <circle cx={RIM_X} cy={RIM_Y} r={RIM_R} fill="none" stroke="#ea580c" strokeWidth="2" />
        {/* 키(paint) */}
        <rect x={PAINT_LEFT} y="0" width={PAINT_RIGHT - PAINT_LEFT} height={PAINT_BOTTOM} fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.55" />
        {/* 자유투 라인 */}
        <line x1={PAINT_LEFT} y1={PAINT_BOTTOM} x2={PAINT_RIGHT} y2={PAINT_BOTTOM} stroke="#fff" strokeWidth="1.5" opacity="0.55" />
        {/* 자유투 호 (하부 반원 — 페인트 바깥, 실선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.55"
        />
        {/* 자유투 호 (상부 반원 — 페인트 안쪽, 점선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.30" strokeDasharray="3 3"
        />
        {/* 제한구역(restricted area) 호 */}
        <path
          d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}`}
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.40"
        />
        {/* LU 경계선 (가로 점선 — 레이업/미드레인지 분할선) */}
        <line
          x1={PAINT_LEFT} y1={LU_BOTTOM} x2={PAINT_RIGHT} y2={LU_BOTTOM}
          stroke="#fff" strokeWidth="0.8" opacity="0.20" strokeDasharray="3 3"
        />
        {/* 3점 코너 직선 */}
        <line x1={CORNER_X_L} y1="0" x2={CORNER_X_L} y2={CORNER_Y} stroke="#fff" strokeWidth="1.5" opacity="0.65" />
        <line x1={CORNER_X_R} y1="0" x2={CORNER_X_R} y2={CORNER_Y} stroke="#fff" strokeWidth="1.5" opacity="0.65" />
        {/* 3점 호 */}
        <path
          d={`M ${CORNER_X_L} ${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.65"
        />

        {/* ── 존 라벨 ── */}
        {/* DS — 림 바로 아래 */}
        <g pointerEvents="none">
          <text x={RIM_X} y={RIM_Y + 16} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 11, letterSpacing: 0.5 }} opacity={hover === 'post' ? 1 : 0.9}>DS</text>
          <text x={RIM_X} y={RIM_Y + 30} textAnchor="middle" className="fill-white" style={{ fontSize: 11, fontWeight: 800 }} opacity={hover === 'post' ? 1 : 0.95}>
            {zones.post.fg_pct > 0 ? `${zones.post.fg_pct}%` : '—'}
          </text>
          <text x={RIM_X} y={RIM_Y + 44} textAnchor="middle" className="fill-gray-300" style={{ fontSize: 9 }}>{zones.post.m}/{zones.post.a}</text>
        </g>
        {/* LU — 페인트 하부 중앙 */}
        <g pointerEvents="none">
          <text x={RIM_X} y={88} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'layup' ? 1 : 0.95}>LU</text>
          <text x={RIM_X} y={107} textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 800 }} opacity={hover === 'layup' ? 1 : 0.95}>
            {zones.layup.fg_pct > 0 ? `${zones.layup.fg_pct}%` : '—'}
          </text>
        </g>
        {/* MD — 좌측 윙 (가장 큰 미드레인지 영역) */}
        <g pointerEvents="none">
          <text x="78" y="160" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'mid' ? 1 : 0.92}>MD</text>
          <text x="78" y="180" textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 800 }} opacity={hover === 'mid' ? 1 : 0.95}>
            {zones.mid.fg_pct > 0 ? `${zones.mid.fg_pct}%` : '—'}
          </text>
          <text x="78" y="194" textAnchor="middle" className="fill-gray-300" style={{ fontSize: 9 }}>{zones.mid.m}/{zones.mid.a}</text>
        </g>
        {/* 3P — 호 바깥 하단 중앙 */}
        <g pointerEvents="none">
          <text x={RIM_X} y="265" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 15, letterSpacing: 0.5 }} opacity={hover === 'three' ? 1 : 0.95}>3P</text>
          <text x={RIM_X} y="285" textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'three' ? 1 : 0.95}>
            {zones.three.fg_pct > 0 ? `${zones.three.fg_pct}%` : '—'}
          </text>
          <text x={RIM_X} y="301" textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.three.m}/{zones.three.a}</text>
        </g>
      </svg>

      {/* 호버 상세 — 차트 하단 */}
      <div className="mt-2 min-h-[28px] text-center text-[11px]">
        {hover ? (() => {
          const z = zones[hover]
          const labelMap = { post: '골밑 (DS) · 제한구역', layup: '레이업·드라이브 (LU) · 페인트 하부', mid: '미드레인지 (MD) · 윙·엘보·탑오브키', three: '3점 (3P)' }
          return (
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-900/80 border border-gray-700/50">
              <span className="font-bold" style={{ color: COLORS[hover] }}>{labelMap[hover]}</span>
              <span className="text-gray-400">{z.m}/{z.a}</span>
              <span className={`font-black ${pctTextColor(z.fg_pct)}`}>{z.fg_pct}%</span>
            </div>
          )
        })() : (
          <span className="text-gray-600">존 위에 마우스 올려 상세 보기</span>
        )}
      </div>
    </div>
  )
}
