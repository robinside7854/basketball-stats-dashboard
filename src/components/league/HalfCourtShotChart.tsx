'use client'
import { useState } from 'react'

// 하프코트 + 4개 슛 존(골밑/레이업/미들/3점) 시각화
// 각 존은 위치에 대응하는 SVG path/circle 로 그려지며 FG% 에 따라 색이 진해진다.
// 좌표계: viewBox 0 0 400 380
//   - 백보드: y=0~16
//   - 림: cy=30 (가까운 곳)
//   - 키(paint): x=140~260, y=16~196
//   - 자유투 라인: y=196
//   - 3점 호: 림에서 반지름 ~170
//   - 코트 끝선: y=380

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
  // 30% 이하: 옅음 / 30~45%: 중간 / 45%+: 진함
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

export default function HalfCourtShotChart({ zones, size = 360 }: Props) {
  const [hover, setHover] = useState<keyof typeof COLORS | null>(null)

  const aspectRatio = 380 / 400  // height / width

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
        {/* ── 하드우드 배경 (옅은 톤) ── */}
        <defs>
          <radialGradient id="hoopGlow" cx="50%" cy="8%" r="40%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="400" height="380" fill="#0a0a0c" />
        <rect x="0" y="0" width="400" height="380" fill="url(#hoopGlow)" />

        {/* 가로 우드 라인 (희미) */}
        {[60, 120, 180, 240, 300, 360].map(y => (
          <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#5c2e0e" strokeWidth="0.5" opacity="0.20" />
        ))}

        {/* ── 슛 존 (배경 색) — FG% 기반 ── */}
        {/* 3점 영역: 코트 전체 - 3점 호 안쪽. 슛 호 바깥 영역을 path 로. */}
        {(() => {
          const t = pctToFill(zones.three.fg_pct, COLORS.three)
          return (
            <path
              d="M 0 380 L 0 30 L 400 30 L 400 380 Z M 60 30 Q 200 250 340 30 Z"
              fill={t.fill}
              fillOpacity={t.opacity}
              fillRule="evenodd"
              onMouseEnter={() => setHover('three')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'three' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* 미드레인지: 3점 호 안 ~ 키 영역 바깥 */}
        {(() => {
          const m = pctToFill(zones.mid.fg_pct, COLORS.mid)
          return (
            <path
              d="M 60 30 Q 200 250 340 30 L 260 30 L 260 196 L 140 196 L 140 30 Z"
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

        {/* 레이업/드라이브: 키(paint) 영역 + 자유투 호 */}
        {(() => {
          const l = pctToFill(zones.layup.fg_pct, COLORS.layup)
          return (
            <path
              d="M 140 30 L 140 196 Q 140 246 200 246 Q 260 246 260 196 L 260 30 Z"
              fill={l.fill}
              fillOpacity={l.opacity}
              onMouseEnter={() => setHover('layup')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'layup' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* 골밑 (림 주변 반원): 림에서 가까운 영역 */}
        {(() => {
          const p = pctToFill(zones.post.fg_pct, COLORS.post)
          return (
            <path
              d="M 150 30 A 50 50 0 0 0 250 30 Z"
              fill={p.fill}
              fillOpacity={p.opacity}
              onMouseEnter={() => setHover('post')}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'post' ? 0.35 : 1 }}
            />
          )
        })()}

        {/* ── 코트 라인 (모든 존 위에 그려짐) ── */}
        {/* 외곽 */}
        <rect x="0" y="0" width="400" height="380" fill="none" stroke="#fff" strokeWidth="2" opacity="0.7" />
        {/* 백보드 (위쪽 끝선) */}
        <line x1="170" y1="16" x2="230" y2="16" stroke="#fff" strokeWidth="3" opacity="0.9" />
        {/* 림 */}
        <circle cx="200" cy="28" r="9" fill="none" stroke="#ea580c" strokeWidth="2" />
        {/* 키(paint) — 자유투 라인 박스 */}
        <rect x="140" y="16" width="120" height="180" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.55" />
        {/* 자유투 라인 */}
        <line x1="140" y1="196" x2="260" y2="196" stroke="#fff" strokeWidth="1.5" opacity="0.55" />
        {/* 자유투 호 (하부 반원) */}
        <path d="M 140 196 Q 140 246 200 246 Q 260 246 260 196" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.55" strokeDasharray="4 2" />
        {/* 자유투 호 (상부 반원 — 점선) */}
        <path d="M 140 196 Q 140 146 200 146 Q 260 146 260 196" fill="none" stroke="#fff" strokeWidth="1" opacity="0.30" strokeDasharray="2 4" />
        {/* 림 아래 박스(restricted area 근사) — 반원 */}
        <path d="M 175 30 A 25 25 0 0 0 225 30" fill="none" stroke="#fff" strokeWidth="1" opacity="0.35" />
        {/* 3점 호 (실제 3점 라인) */}
        <path d="M 60 30 Q 200 250 340 30" fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.65" />

        {/* ── 존 라벨 (각 존 중앙에 배치) ── */}
        {/* 골밑 */}
        <g pointerEvents="none">
          <text x="200" y="22" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 13, letterSpacing: 0.5 }} opacity={hover === 'post' ? 1 : 0.85}>DS</text>
          <text x="200" y="50" textAnchor="middle" className="fill-white" style={{ fontSize: 12, fontWeight: 700 }} opacity={hover === 'post' ? 1 : 0.9}>
            {zones.post.fg_pct > 0 ? `${zones.post.fg_pct}%` : '—'}
          </text>
          <text x="200" y="64" textAnchor="middle" className="fill-gray-400" style={{ fontSize: 9 }}>{zones.post.m}/{zones.post.a}</text>
        </g>
        {/* 레이업 (키 중앙) */}
        <g pointerEvents="none">
          <text x="200" y="110" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 15, letterSpacing: 0.5 }} opacity={hover === 'layup' ? 1 : 0.95}>LU</text>
          <text x="200" y="135" textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'layup' ? 1 : 0.95}>
            {zones.layup.fg_pct > 0 ? `${zones.layup.fg_pct}%` : '—'}
          </text>
          <text x="200" y="152" textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.layup.m}/{zones.layup.a}</text>
        </g>
        {/* 미드레인지 (좌측 사이드) */}
        <g pointerEvents="none">
          <text x="85" y="155" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 14, letterSpacing: 0.5 }} opacity={hover === 'mid' ? 1 : 0.92}>MD</text>
          <text x="85" y="180" textAnchor="middle" className="fill-white" style={{ fontSize: 13, fontWeight: 800 }} opacity={hover === 'mid' ? 1 : 0.92}>
            {zones.mid.fg_pct > 0 ? `${zones.mid.fg_pct}%` : '—'}
          </text>
          <text x="85" y="196" textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.mid.m}/{zones.mid.a}</text>
        </g>
        {/* 3점 (하단 중앙) */}
        <g pointerEvents="none">
          <text x="200" y="320" textAnchor="middle" className="font-display fill-white" style={{ fontSize: 15, letterSpacing: 0.5 }} opacity={hover === 'three' ? 1 : 0.95}>3P</text>
          <text x="200" y="345" textAnchor="middle" className="fill-white" style={{ fontSize: 14, fontWeight: 800 }} opacity={hover === 'three' ? 1 : 0.95}>
            {zones.three.fg_pct > 0 ? `${zones.three.fg_pct}%` : '—'}
          </text>
          <text x="200" y="361" textAnchor="middle" className="fill-gray-300" style={{ fontSize: 10 }}>{zones.three.m}/{zones.three.a}</text>
        </g>
      </svg>

      {/* 호버 상세 — 차트 하단 */}
      <div className="mt-2 min-h-[28px] text-center text-[11px]">
        {hover ? (() => {
          const z = zones[hover]
          const labelMap = { post: '골밑 (DS)', layup: '레이업·드라이브 (LU)', mid: '미드레인지 (MD)', three: '3점 (3P)' }
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
