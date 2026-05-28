'use client'
import { useState } from 'react'

// 하프코트 슛 차트 — 첨부된 표준 농구 코트 다이어그램 비례에 맞춤
//
// 좌표 (viewBox 400 × 400):
//   - 베이스라인 = y=0 (위), 하프코트 라인 ≈ y=380 (아래)
//   - 림 중심: (200, 40)
//   - 페인트(키): x=140~260, y=0~150 (페인트 전체 = LU 영역)
//   - 제한 구역 (DS): r=28 반원 around rim (페인트 안, 림 바로 옆 영역)
//   - 코너-3 직선: x=24, x=376 (사이드라인에서 0.9m 안쪽), 베이스라인부터 y=190 까지 길게
//   - 3점 호: r=235 from rim, 코너 직선 끝에서 시작, y=275 정점
//
// Zone 매핑 (첨부 이미지의 14개 spot 기준):
//   - DS  (13, 14): 림 바로 옆 (페인트 상부 중앙)
//   - LU  (11, 12): 페인트 안 (DS 제외 영역)
//   - MD  (6~10):   페인트 밖, 3점 라인 안쪽 (윙 · 엘보 · 탑오브키)
//   - 3P  (1~5):    3점 라인 바깥

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

// SVG 좌표 상수 — 첨부된 표준 코트 비례 기반
const VBW = 400
const VBH = 400
const RIM_X = 200
const RIM_Y = 40
const RIM_R = 9
const DS_R = 28
const PAINT_LEFT = 140
const PAINT_RIGHT = 260
const PAINT_BOTTOM = 150      // 자유투 라인
const FT_CIRCLE_R = 48
const THREE_R = 235           // 3점 호 반경 (실제 첨부도면 비례 매칭 — 6.75m 보다 약간 크게 시각화)
const CORNER_X_L = 24
const CORNER_X_R = 376
// 코너-3 직선과 호가 만나는 y 좌표
// 식: (CORNER_X_L - RIM_X)² + (CORNER_Y - RIM_Y)² = THREE_R²
//     176² + (CORNER_Y - 40)² = 235²  →  CORNER_Y = 40 + √(55225 - 30976) ≈ 40 + 155.7 ≈ 196
const CORNER_Y = 196
const ARC_BOTTOM_Y = RIM_Y + THREE_R  // 275 — 3점 호의 정점

export default function HalfCourtShotChart({ zones, size = 360 }: Props) {
  const [hover, setHover] = useState<keyof typeof COLORS | null>(null)

  const aspectRatio = VBH / VBW

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
          <radialGradient id="hoopGlow" cx="50%" cy="10%" r="40%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 하드우드 배경 ── */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="#0a0a0c" />
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#hoopGlow)" />
        {[60, 130, 200, 270, 340].map(y => (
          <line key={y} x1="0" y1={y} x2={VBW} y2={y} stroke="#5c2e0e" strokeWidth="0.5" opacity="0.18" />
        ))}

        {/* ── 슛 존 색상 ── */}

        {/* 3P — 코트 외곽 ~ 3점 라인 바깥 */}
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
          // 2-pt U-shape (3점 라인 안쪽 전체) - 페인트 사각형 구멍 (evenodd)
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

        {/* LU — 페인트 전체 (DS 제외 영역은 위에 DS 가 덮어쓰기) */}
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

        {/* DS — 림 옆 제한구역 (반원, 코트 안쪽 방향) */}
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
        <rect x="0" y="0" width={VBW} height={VBH} fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
        {/* 백보드 */}
        <line x1="170" y1="22" x2="230" y2="22" stroke="#fff" strokeWidth="3" opacity="0.9" />
        {/* 림 */}
        <circle cx={RIM_X} cy={RIM_Y} r={RIM_R} fill="none" stroke="#ea580c" strokeWidth="2" />
        {/* 키(paint) */}
        <rect x={PAINT_LEFT} y="0" width={PAINT_RIGHT - PAINT_LEFT} height={PAINT_BOTTOM} fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.65" />
        {/* 자유투 라인 */}
        <line x1={PAINT_LEFT} y1={PAINT_BOTTOM} x2={PAINT_RIGHT} y2={PAINT_BOTTOM} stroke="#fff" strokeWidth="1.5" opacity="0.65" />
        {/* 자유투 호 (페인트 바깥, 실선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.65"
        />
        {/* 자유투 호 (페인트 안쪽, 점선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.35" strokeDasharray="3 3"
        />
        {/* 제한구역(restricted area) 호 */}
        <path
          d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}`}
          fill="none" stroke="#fff" strokeWidth="1" opacity="0.45"
        />
        {/* 3점 코너 직선 */}
        <line x1={CORNER_X_L} y1="0" x2={CORNER_X_L} y2={CORNER_Y} stroke="#fff" strokeWidth="1.5" opacity="0.7" />
        <line x1={CORNER_X_R} y1="0" x2={CORNER_X_R} y2={CORNER_Y} stroke="#fff" strokeWidth="1.5" opacity="0.7" />
        {/* 3점 호 */}
        <path
          d={`M ${CORNER_X_L} ${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7"
        />
        {/* 하프코트 라인 (아래) — 절반만 보이는 센터 서클 */}
        <line x1="0" y1={VBH - 1} x2={VBW} y2={VBH - 1} stroke="#fff" strokeWidth="1.5" opacity="0.55" />
        <path
          d={`M ${RIM_X - 36} ${VBH} A 36 36 0 0 1 ${RIM_X + 36} ${VBH}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.55"
        />

        {/* ── 존 라벨 ── */}
        {/* DS — 림 바로 옆 */}
        <g pointerEvents="none">
          <text x={RIM_X} y={RIM_Y + 15} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 10, letterSpacing: 0.5 }} opacity={hover === 'post' ? 1 : 0.9}>DS</text>
          <text x={RIM_X} y={RIM_Y + 28} textAnchor="middle" className="fill-white" style={{ fontSize: 10, fontWeight: 800 }} opacity={hover === 'post' ? 1 : 0.95}>
            {zones.post.fg_pct > 0 ? `${zones.post.fg_pct}%` : '—'}
          </text>
        </g>
        {/* LU — 페인트 중앙 (DS 아래) */}
        <g pointerEvents="none">
          <text x={RIM_X} y={95} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'layup' ? 1 : 0.95}>LU</text>
          <text x={RIM_X} y={114} textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'layup' ? 1 : 0.95}>
            {zones.layup.fg_pct > 0 ? `${zones.layup.fg_pct}%` : '—'}
          </text>
          <text x={RIM_X} y={132} textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.layup.m}/{zones.layup.a}</text>
        </g>
        {/* MD — 좌측 윙 (가장 넓은 영역) */}
        <g pointerEvents="none">
          <text x="78" y="130" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'mid' ? 1 : 0.92}>MD</text>
          <text x="78" y="150" textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 800 }} opacity={hover === 'mid' ? 1 : 0.95}>
            {zones.mid.fg_pct > 0 ? `${zones.mid.fg_pct}%` : '—'}
          </text>
          <text x="78" y="166" textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.mid.m}/{zones.mid.a}</text>
        </g>
        {/* 3P — 호 바깥, 가운데 (탑오브키 3점 위치) */}
        <g pointerEvents="none">
          <text x={RIM_X} y={ARC_BOTTOM_Y + 28} textAnchor="middle" className="font-display fill-white" style={{ fontSize: 15, letterSpacing: 0.5 }} opacity={hover === 'three' ? 1 : 0.95}>3P</text>
          <text x={RIM_X} y={ARC_BOTTOM_Y + 48} textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'three' ? 1 : 0.95}>
            {zones.three.fg_pct > 0 ? `${zones.three.fg_pct}%` : '—'}
          </text>
          <text x={RIM_X} y={ARC_BOTTOM_Y + 64} textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.three.m}/{zones.three.a}</text>
        </g>
      </svg>

      {/* 호버 상세 */}
      <div className="mt-2 min-h-[28px] text-center text-[11px]">
        {hover ? (() => {
          const z = zones[hover]
          const labelMap = { post: '골밑 (DS) · 제한구역', layup: '레이업·드라이브 (LU) · 페인트 안', mid: '미드레인지 (MD) · 윙·엘보·탑오브키', three: '3점 (3P)' }
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
