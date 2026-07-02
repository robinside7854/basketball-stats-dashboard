'use client'
import { useState } from 'react'

// 하프코트 슛 차트 — NBA.com/Stats 스타일 (우드 배경 + 효율 기반 컬러링)
//
// viewBox 500 × 470 (FIBA 15m × 14m 반코트, 33.3 px/m).
// 배경: 하드우드 (따뜻한 갈색 톤 + 나뭇결)
// 코트 라인: 흰색 실선
//
// 4 존:
//   DS  (골밑/덩크스팟)   — 노차지 반원 (림에서 1.25m)
//   LU  (레이업/드라이브) — 페인트 안 (DS 제외)
//   MD  (미들레인지)       — 페인트 밖 · 3점 라인 안쪽
//   3P  (3점슛)            — 3점 라인 바깥
//
// 존 색상 (야투 효율 기반):
//   ≥ 45% : 초록 (핫)
//   30-44%: 노랑 (중간)
//   < 30% : 빨강 (콜드)
//   시도 0: 회색 (데이터 없음)

interface Zone {
  m: number
  a: number
  fg_pct: number
}

interface Props {
  zones: {
    post: Zone   // DS
    layup: Zone  // LU
    mid: Zone    // MD
    three: Zone  // 3P
  }
  size?: number
}

// ── 실측 FIBA 좌표 (33.3 px/m) ──────────────────────────
const VBW = 500
const VBH = 470
const RIM_X = 250
const RIM_Y = 52                 // 1.575m from baseline
const RIM_R = 8                  // 22.5cm rim radius
const BACKBOARD_Y = 40           // 1.2m from baseline
const BACKBOARD_HALF_W = 30      // 0.9m each side (1.8m total)
const DS_R = 42                  // 1.25m no-charge arc
const PAINT_LEFT = 168           // (250 - 2.45m × 33.3)
const PAINT_RIGHT = 332          // (250 + 2.45m × 33.3)
const PAINT_BOTTOM = 193         // FT line, 5.8m from baseline
const FT_CIRCLE_R = 60           // 1.8m FT circle
const THREE_R = 225              // 6.75m 3-point arc from rim
const CORNER_X_L = 30            // 0.9m from sideline
const CORNER_X_R = 470
// 코너 3점 라인이 아크를 만나는 y:
//   sqrt(225² - 220²) + 52 = sqrt(50625 - 48400) + 52 = sqrt(2225) + 52 ≈ 47 + 52 = 99
const CORNER_Y = 99
const ARC_TOP_Y = RIM_Y + THREE_R  // 277 — 3점 호 정점

// ── 효율 → 색상 매핑 ─────────────────────────────────
function efficiencyColor(pct: number, attempts: number): { fill: string; opacity: number; textClass: string } {
  if (attempts === 0) return { fill: '#374151', opacity: 0.35, textClass: 'text-gray-500' }
  if (pct >= 45) return { fill: '#16a34a', opacity: 0.68, textClass: 'text-emerald-300' }  // 초록 (핫)
  if (pct >= 30) return { fill: '#eab308', opacity: 0.62, textClass: 'text-yellow-300' }    // 노랑
  return             { fill: '#dc2626', opacity: 0.60, textClass: 'text-red-300' }          // 빨강 (콜드)
}

function efficiencyLabel(pct: number, attempts: number): string {
  if (attempts === 0) return '—'
  if (pct >= 45) return '핫'
  if (pct >= 30) return '중간'
  return '콜드'
}

export default function HalfCourtShotChart({ zones, size = 400 }: Props) {
  const [hover, setHover] = useState<'post' | 'layup' | 'mid' | 'three' | null>(null)

  const aspectRatio = VBH / VBW
  const totalAttempts = zones.post.a + zones.layup.a + zones.mid.a + zones.three.a
  const volumePct = (z: Zone): number => totalAttempts === 0 ? 0 : Math.round(z.a / totalAttempts * 100)

  const dsC = efficiencyColor(zones.post.fg_pct, zones.post.a)
  const luC = efficiencyColor(zones.layup.fg_pct, zones.layup.a)
  const mdC = efficiencyColor(zones.mid.fg_pct, zones.mid.a)
  const thC = efficiencyColor(zones.three.fg_pct, zones.three.a)

  return (
    <div className="relative" style={{ width: size, maxWidth: '100%' }}>
      <svg
        viewBox={`0 0 ${VBW} ${VBH}`}
        width="100%"
        height={size * aspectRatio}
        className="block rounded-lg"
        role="img"
        aria-label="하프코트 슛 차트"
      >
        <defs>
          {/* 하드우드 배경 그라디언트 */}
          <linearGradient id="hardwood" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b6a45" />
            <stop offset="50%" stopColor="#6d4f2f" />
            <stop offset="100%" stopColor="#5a3f22" />
          </linearGradient>
          {/* 림 아래 은은한 오렌지 글로우 */}
          <radialGradient id="hoopGlow" cx="50%" cy="11%" r="35%">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── 하드우드 바닥 ── */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#hardwood)" />
        {/* 나뭇결 라인 */}
        {[40, 100, 160, 220, 280, 340, 400, 440].map(y => (
          <line key={y} x1="0" y1={y} x2={VBW} y2={y} stroke="#3b2818" strokeWidth="0.6" opacity="0.35" />
        ))}
        {[60, 130, 200, 270, 340, 410].map(y => (
          <line key={`h-${y}`} x1="0" y1={y} x2={VBW} y2={y} stroke="#a97c56" strokeWidth="0.4" opacity="0.15" />
        ))}
        <rect x="0" y="0" width={VBW} height={VBH} fill="url(#hoopGlow)" />

        {/* ── 존 색상 (효율 기반) ── */}

        {/* 3P — 3점 라인 바깥 (하프코트 라인까지 전체) */}
        <path
          d={`
            M 0 0
            L ${CORNER_X_L} 0
            L ${CORNER_X_L} ${CORNER_Y}
            A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}
            L ${CORNER_X_R} 0
            L ${VBW} 0
            L ${VBW} ${VBH}
            L 0 ${VBH}
            Z
          `}
          fill={thC.fill}
          fillOpacity={thC.opacity}
          onMouseEnter={() => setHover('three')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'three' ? 0.30 : 1 }}
        />

        {/* MD — 3점 안쪽 · 페인트 바깥 (evenodd 로 페인트 구멍) */}
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
          fillOpacity={mdC.opacity}
          fillRule="evenodd"
          onMouseEnter={() => setHover('mid')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'mid' ? 0.30 : 1 }}
        />

        {/* LU — 페인트 전체 (DS 는 위에 덮어쓰기) */}
        <path
          d={`
            M ${PAINT_LEFT} 0
            L ${PAINT_RIGHT} 0
            L ${PAINT_RIGHT} ${PAINT_BOTTOM}
            L ${PAINT_LEFT} ${PAINT_BOTTOM}
            Z
          `}
          fill={luC.fill}
          fillOpacity={luC.opacity}
          onMouseEnter={() => setHover('layup')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'layup' ? 0.30 : 1 }}
        />

        {/* DS — 노차지 반원 (림 옆) */}
        <path
          d={`
            M ${RIM_X - DS_R} ${RIM_Y}
            A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}
            Z
          `}
          fill={dsC.fill}
          fillOpacity={dsC.opacity}
          onMouseEnter={() => setHover('post')}
          onMouseLeave={() => setHover(null)}
          className="cursor-pointer transition-opacity"
          style={{ opacity: hover && hover !== 'post' ? 0.30 : 1 }}
        />

        {/* ── 코트 라인 (흰색) ── */}
        {/* 외곽 */}
        <rect x="0" y="0" width={VBW} height={VBH} fill="none" stroke="#fff" strokeWidth="2.5" opacity="0.95" />
        {/* 페인트 사각형 */}
        <rect
          x={PAINT_LEFT} y="0"
          width={PAINT_RIGHT - PAINT_LEFT} height={PAINT_BOTTOM}
          fill="none" stroke="#fff" strokeWidth="2" opacity="0.9"
        />
        {/* 자유투 라인 */}
        <line x1={PAINT_LEFT} y1={PAINT_BOTTOM} x2={PAINT_RIGHT} y2={PAINT_BOTTOM} stroke="#fff" strokeWidth="2" opacity="0.9" />
        {/* 자유투 원 (페인트 바깥 · 실선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 0 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="2" opacity="0.9"
        />
        {/* 자유투 원 (페인트 안 · 점선) */}
        <path
          d={`M ${PAINT_LEFT} ${PAINT_BOTTOM} A ${FT_CIRCLE_R} ${FT_CIRCLE_R} 0 0 1 ${PAINT_RIGHT} ${PAINT_BOTTOM}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.55" strokeDasharray="4 4"
        />
        {/* 노차지 반원 */}
        <path
          d={`M ${RIM_X - DS_R} ${RIM_Y} A ${DS_R} ${DS_R} 0 0 0 ${RIM_X + DS_R} ${RIM_Y}`}
          fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.7"
        />
        {/* 백보드 */}
        <line
          x1={RIM_X - BACKBOARD_HALF_W} y1={BACKBOARD_Y}
          x2={RIM_X + BACKBOARD_HALF_W} y2={BACKBOARD_Y}
          stroke="#fff" strokeWidth="3.5" opacity="1"
        />
        {/* 백보드 → 림 연결 */}
        <line x1={RIM_X} y1={BACKBOARD_Y} x2={RIM_X} y2={RIM_Y - RIM_R} stroke="#fff" strokeWidth="1.2" opacity="0.7" />
        {/* 림 */}
        <circle cx={RIM_X} cy={RIM_Y} r={RIM_R} fill="none" stroke="#f97316" strokeWidth="2.8" />
        {/* 3점 코너 직선 */}
        <line x1={CORNER_X_L} y1="0" x2={CORNER_X_L} y2={CORNER_Y} stroke="#fff" strokeWidth="2" opacity="0.9" />
        <line x1={CORNER_X_R} y1="0" x2={CORNER_X_R} y2={CORNER_Y} stroke="#fff" strokeWidth="2" opacity="0.9" />
        {/* 3점 아크 */}
        <path
          d={`M ${CORNER_X_L} ${CORNER_Y} A ${THREE_R} ${THREE_R} 0 0 1 ${CORNER_X_R} ${CORNER_Y}`}
          fill="none" stroke="#fff" strokeWidth="2" opacity="0.9"
        />
        {/* 하프코트 라인 */}
        <line x1="0" y1={VBH - 1} x2={VBW} y2={VBH - 1} stroke="#fff" strokeWidth="2" opacity="0.9" />
        {/* 센터 서클 (아래 반원) */}
        <path
          d={`M ${RIM_X - 60} ${VBH} A 60 60 0 0 1 ${RIM_X + 60} ${VBH}`}
          fill="none" stroke="#fff" strokeWidth="2" opacity="0.9"
        />

        {/* ── 라벨 박스 (반투명 검은 박스 + 흰 텍스트) ── */}
        {(() => {
          const labels: { x: number; y: number; w: number; h: number; zone: 'post' | 'layup' | 'mid' | 'three' }[] = [
            { x: RIM_X - 22, y: RIM_Y + 8,  w: 44, h: 22, zone: 'post' },
            { x: RIM_X - 30, y: 105,        w: 60, h: 42, zone: 'layup' },
            { x: 45,         y: 110,        w: 66, h: 60, zone: 'mid' },
            { x: RIM_X - 40, y: ARC_TOP_Y + 22, w: 80, h: 58, zone: 'three' },
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
                <rect x={x} y={y} width={w} height={h} rx={5}
                      fill="#0f172a" fillOpacity={active ? 0.92 : 0.78}
                      stroke={c.fill} strokeWidth={active ? 1.5 : 0.8} strokeOpacity="0.8" />
                {/* 존 코드 (좌상단) */}
                <text x={x + w / 2} y={y + (isSmall ? 8 : 11)} textAnchor="middle"
                      style={{ fontSize: isSmall ? 8 : 9, fontWeight: 800, letterSpacing: 0.6 }}
                      fill="#e2e8f0">
                  {shortLabels[zone]}
                </text>
                {/* FG% (큰 숫자) */}
                <text x={x + w / 2} y={y + (isSmall ? 18 : 26)} textAnchor="middle"
                      style={{ fontSize: isSmall ? 10 : 15, fontWeight: 900 }}
                      className={c.textClass}
                      fill="currentColor">
                  {z.a > 0 ? `${z.fg_pct.toFixed(0)}%` : '—'}
                </text>
                {!isSmall && (
                  <>
                    {/* M/A */}
                    <text x={x + w / 2} y={y + 40} textAnchor="middle"
                          style={{ fontSize: 8.5, fontWeight: 700 }}
                          fill="#cbd5e1">
                      {z.m}/{z.a}
                    </text>
                    {/* 비중 */}
                    {totalAttempts > 0 && (
                      <text x={x + w / 2} y={y + 52} textAnchor="middle"
                            style={{ fontSize: 8, fontWeight: 700 }}
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

      {/* 범례 + 호버 상세 */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-center gap-3 text-[10px]">
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#16a34a', opacity: 0.75 }} />
            <span className="text-emerald-300 font-semibold">핫 ≥45%</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#eab308', opacity: 0.75 }} />
            <span className="text-yellow-300 font-semibold">중간 30–44%</span>
          </div>
          <div className="inline-flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ background: '#dc2626', opacity: 0.75 }} />
            <span className="text-red-300 font-semibold">콜드 &lt;30%</span>
          </div>
        </div>
        <div className="min-h-[24px] text-center text-[11px]">
          {hover ? (() => {
            const z = zones[hover]
            const c = { post: dsC, layup: luC, mid: mdC, three: thC }[hover]
            const label = { post: '골밑 (DS · 노차지 제한구역)', layup: '레이업·드라이브 (LU · 페인트 안)', mid: '미드레인지 (MD · 윙·엘보·탑오브키)', three: '3점 (3P)' }[hover]
            return (
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-gray-900/85 border border-gray-700/60 flex-wrap">
                <span className="font-bold text-white">{label}</span>
                <span className="text-gray-400">{z.m}/{z.a}</span>
                <span className={`font-black ${c.textClass}`}>{z.a > 0 ? `${z.fg_pct}%` : '—'}</span>
                <span className="text-gray-500">· {efficiencyLabel(z.fg_pct, z.a)}</span>
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
