'use client'
import { useState } from 'react'

// 하프코트 슛 차트 — NBA.com/Stats 스타일 (하드우드 + 아크 밴드 3P)
//
// viewBox 500 × 470 (FIBA 15m × 14m 반코트, 33.3 px/m).
// 상단: 림/백보드
// 하단: 하프코트 라인
//
// 4 존 (효율 컬러):
//   DS  (골밑/덩크스팟)   — 노차지 반원 (림 옆 1.25m)
//   LU  (레이업/드라이브) — 페인트 안 (DS 제외)
//   MD  (미들레인지)       — 페인트 밖 · 3점 라인 안쪽
//   3P  (3점슛)            — 3점 라인 바깥 아크 밴드 (하단은 원목 노출)
//
// 효율 컬러:
//   ≥ 45% : 초록 (핫)
//   30-44%: 노랑 (중간)
//   < 30% : 빨강 (콜드)

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

// ── 좌표 상수 (FIBA 실측 33.3 px/m) ─────────────────
const VBW = 500
const VBH = 470
const RIM_X = 250
const RIM_Y = 52
const RIM_R = 8
const BACKBOARD_Y = 40
const BACKBOARD_HALF_W = 30
const DS_R = 42
const PAINT_LEFT = 168
const PAINT_RIGHT = 332
const PAINT_BOTTOM = 193
const FT_CIRCLE_R = 60
const THREE_R = 225
const OUTER_3P_BAND = 60          // 3점 라인 바깥 밴드 두께
const CORNER_X_L = 30
const CORNER_X_R = 470
const CORNER_Y = 99                // 3P 코너 직선-아크 교점
const ARC_TOP_Y = RIM_Y + THREE_R  // 277 (3점 아크 정점)

// ── 효율 → 컬러 ────────────────────────────────────
function efficiencyColor(pct: number, attempts: number): { fill: string; textClass: string; label: string } {
  if (attempts === 0) return { fill: '#374151', textClass: 'text-gray-400', label: '—' }
  if (pct >= 45) return { fill: '#16a34a', textClass: 'text-emerald-200', label: '핫' }
  if (pct >= 30) return { fill: '#eab308', textClass: 'text-yellow-200', label: '중간' }
  return             { fill: '#dc2626', textClass: 'text-red-200', label: '콜드' }
}

export default function HalfCourtShotChart({ zones, size = 400 }: Props) {
  const [hover, setHover] = useState<'post' | 'layup' | 'mid' | 'three' | null>(null)

  const totalAttempts = zones.post.a + zones.layup.a + zones.mid.a + zones.three.a
  const volumePct = (z: Zone): number => totalAttempts === 0 ? 0 : Math.round(z.a / totalAttempts * 100)

  const dsC = efficiencyColor(zones.post.fg_pct, zones.post.a)
  const luC = efficiencyColor(zones.layup.fg_pct, zones.layup.a)
  const mdC = efficiencyColor(zones.mid.fg_pct, zones.mid.a)
  const thC = efficiencyColor(zones.three.fg_pct, zones.three.a)

  return (
    <div className="relative w-full" style={{ maxWidth: size }}>
      <div style={{ width: '100%', aspectRatio: `${VBW} / ${VBH}` }}>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        className="block rounded-lg"
        role="img"
        aria-label="하프코트 슛 차트"
      >
        <defs>
          {/* 하드우드 그라디언트 */}
          <linearGradient id="hardwood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a7550" />
            <stop offset="50%" stopColor="#7c5a38" />
            <stop offset="100%" stopColor="#5e4423" />
          </linearGradient>
          {/* 3P 존 페이드 (상단 짙게, 아크 밴드 밖으로 나갈수록 옅어짐) */}
          <radialGradient id="threePFade" cx={`${RIM_X / VBW * 100}%`} cy={`${RIM_Y / VBH * 100}%`} r={`${(THREE_R + OUTER_3P_BAND) / VBW * 100}%`}>
            <stop offset={`${(THREE_R - 5) / (THREE_R + OUTER_3P_BAND) * 100}%`} stopColor={thC.fill} stopOpacity="0" />
            <stop offset={`${THREE_R / (THREE_R + OUTER_3P_BAND) * 100}%`} stopColor={thC.fill} stopOpacity="0.65" />
            <stop offset="80%" stopColor={thC.fill} stopOpacity="0.55" />
            <stop offset="100%" stopColor={thC.fill} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 하드우드 바닥 ── */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#hardwood)" />
        {/* 나뭇결 세로 라인 */}
        {[45, 105, 175, 250, 325, 395, 455].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2={VBH} stroke="#3a2a18" strokeWidth="1" opacity="0.35" />
        ))}
        {[90, 220, 380].map(x => (
          <line key={`m-${x}`} x1={x} y1="0" x2={x} y2={VBH} stroke="#c19670" strokeWidth="0.5" opacity="0.12" />
        ))}

        {/* ── 3P 코너 존 ── */}
        <rect x="0" y="0" width={CORNER_X_L} height={CORNER_Y} fill={thC.fill} fillOpacity="0.62"
              onMouseEnter={() => setHover('three')} onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'three' ? 0.30 : 1 }} />
        <rect x={CORNER_X_R} y="0" width={VBW - CORNER_X_R} height={CORNER_Y} fill={thC.fill} fillOpacity="0.62"
              onMouseEnter={() => setHover('three')} onMouseLeave={() => setHover(null)}
              className="cursor-pointer transition-opacity"
              style={{ opacity: hover && hover !== 'three' ? 0.30 : 1 }} />

        {/* ── 3P 아크 밴드 (radial gradient fade) ── */}
        <path
          d={`
            M 0 0
            L CORNER_X_L 0
            L ${CORNER_X_L} ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            L ${CORNER_X_R} 0
            L ${VBW} 0
            L ${VBW} ${VBH}
            L 0 ${VBH}
            Z
          `.replace('CORNER_X_L 0', `${CORNER_X_L} 0`)}
          fill="url(#threePFade)"
          onMouseEnter={() => setHover('three')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'three' ? 0.30 : 1 }}
        />

        {/* ── MD 존 (3P 안쪽 · 페인트 바깥) ── */}
        <path
          d={`
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
          `}
          fill={mdC.fill}
          fillOpacity="0.62"
          fillRule="evenodd"
          onMouseEnter={() => setHover('mid')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'mid' ? 0.30 : 1 }}
        />

        {/* ── LU 존 (페인트) ── */}
        <rect
          x={PAINT_LEFT} y="0"
          width={PAINT_RIGHT - PAINT_LEFT} height={PAINT_BOTTOM}
          fill={luC.fill}
          fillOpacity="0.65"
          onMouseEnter={() => setHover('layup')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'layup' ? 0.30 : 1 }}
        />

        {/* ── DS 존 (림 옆 노차지 반원) ── */}
        <path
          d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y} Z`}
          fill={dsC.fill}
          fillOpacity="0.75"
          onMouseEnter={() => setHover('post')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'post' ? 0.30 : 1 }}
        />

        {/* ═══ 코트 라인 (흰색 · 매우 선명하게) ═══ */}
        {/* 외곽 프레임 */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="none" stroke="#fff" strokeWidth="3" />
        {/* 페인트 사각형 */}
        <rect
          x={PAINT_LEFT} y="0"
          width={PAINT_RIGHT - PAINT_LEFT} height={PAINT_BOTTOM}
          fill="none" stroke="#fff" strokeWidth="2.5"
        />
        {/* 자유투 라인 */}
        <line x1={PAINT_LEFT} y1={PAINT_BOTTOM} x2={PAINT_RIGHT} y2={PAINT_BOTTOM} stroke="#fff" strokeWidth="2.5" />
        {/* 자유투 원 · 페인트 바깥 (실선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="2.5"
        />
        {/* 자유투 원 · 페인트 안 (점선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7"
        />
        {/* 노차지 반원 */}
        <path
          d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}`}
          fill="none" stroke="#fff" strokeWidth="2"
        />
        {/* 백보드 */}
        <line
          x1={RIM_X - BACKBOARD_HALF_W} y1={BACKBOARD_Y}
          x2={RIM_X + BACKBOARD_HALF_W} y2={BACKBOARD_Y}
          stroke="#fff" strokeWidth="4"
        />
        {/* 림 */}
        <circle cx={RIM_X} cy={RIM_Y} r={RIM_R} fill="none" stroke="#f97316" strokeWidth="3" />
        {/* 3점 코너 라인 (매우 두껍게) */}
        <line x1={CORNER_X_L} y1="0" x2={CORNER_X_L} y2={CORNER_Y} stroke="#fff" strokeWidth="3" />
        <line x1={CORNER_X_R} y1="0" x2={CORNER_X_R} y2={CORNER_Y} stroke="#fff" strokeWidth="3" />
        {/* 3점 아크 (가장 두껍게 — MD/3P 구분의 핵심) */}
        <path
          d={`M ${CORNER_X_L} ${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}`}
          fill="none" stroke="#fff" strokeWidth="3.5"
        />
        {/* 하프코트 라인 */}
        <line x1="0" y1={VBH - 2} x2={VBW} y2={VBH - 2} stroke="#fff" strokeWidth="3" />
        {/* 센터 서클 (상단 반원) */}
        <path
          d={`M ${RIM_X - 60} ${VBH} A 60 60 0 0 1 ${RIM_X + 60} ${VBH}`}
          fill="none" stroke="#fff" strokeWidth="2.5"
        />

        {/* ═══ 라벨 박스 ═══ */}
        {(() => {
          const labels: { x: number; y: number; w: number; h: number; zone: 'post' | 'layup' | 'mid' | 'three' }[] = [
            { x: RIM_X - 22, y: RIM_Y + 6,  w: 44, h: 24, zone: 'post' },
            { x: RIM_X - 34, y: 108,        w: 68, h: 60, zone: 'layup' },
            { x: 45,         y: 130,        w: 74, h: 66, zone: 'mid' },
            { x: RIM_X - 44, y: ARC_TOP_Y + 20, w: 88, h: 66, zone: 'three' },
          ]
          const values = { post: zones.post, layup: zones.layup, mid: zones.mid, three: zones.three }
          const colors = { post: dsC, layup: luC, mid: mdC, three: thC }
          const shortLabels = { post: 'DS', layup: 'LU', mid: 'MD', three: '3P' }
          return labels.map(({ x, y, w, h, zone }) => {
            const z = values[zone]
            const c = colors[zone]
            const active = hover === zone
            const isSmall = zone === 'post'
            return (
              <g key={zone} pointerEvents="none">
                <rect x={x} y={y} width={w} height={h} rx={6}
                      fill="#0f172a" fillOpacity={active ? 0.95 : 0.82}
                      stroke={c.fill} strokeWidth={active ? 2 : 1.2} strokeOpacity="0.9" />
                {/* 존 코드 (상단) */}
                <text x={x + w / 2} y={y + (isSmall ? 9 : 13)} textAnchor="middle"
                      style={{ fontSize: isSmall ? 8 : 10, fontWeight: 800, letterSpacing: 0.7 }}
                      fill="#e2e8f0">
                  {shortLabels[zone]}
                </text>
                {/* FG% (큰 숫자) */}
                <text x={x + w / 2} y={y + (isSmall ? 20 : 30)} textAnchor="middle"
                      style={{ fontSize: isSmall ? 11 : 17, fontWeight: 900 }}
                      className={c.textClass}
                      fill="currentColor">
                  {z.a > 0 ? `${z.fg_pct.toFixed(0)}%` : '—'}
                </text>
                {!isSmall && (
                  <>
                    {/* M/A */}
                    <text x={x + w / 2} y={y + 46} textAnchor="middle"
                          style={{ fontSize: 9.5, fontWeight: 700 }}
                          fill="#cbd5e1">
                      {z.m}/{z.a}
                    </text>
                    {/* 비중 */}
                    {totalAttempts > 0 && (
                      <text x={x + w / 2} y={y + 59} textAnchor="middle"
                            style={{ fontSize: 9, fontWeight: 700 }}
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
            <div className="w-3 h-3 rounded" style={{ background: '#eab308', opacity: 0.85 }} />
            <span className="text-yellow-300 font-semibold">중간 30–44%</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#dc2626', opacity: 0.85 }} />
            <span className="text-red-300 font-semibold">콜드 &lt;30%</span>
          </div>
        </div>
        <div className="min-h-[24px] text-center text-[11px]">
          {hover ? (() => {
            const z = zones[hover]
            const c = { post: dsC, layup: luC, mid: mdC, three: thC }[hover]
            const label = { post: '골밑 (DS · 노차지 제한구역)', layup: '레이업·드라이브 (LU · 페인트 안)', mid: '미드레인지 (MD · 윙·엘보·탑오브키)', three: '3점 (3P · 코너 + 아크)' }[hover]
            return (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-900/85 border border-gray-700/60 flex-wrap">
                <span className="font-bold text-white">{label}</span>
                <span className="text-gray-400">{z.m}/{z.a}</span>
                <span className={`font-black ${c.textClass}`}>{z.a > 0 ? `${z.fg_pct}%` : '—'}</span>
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
