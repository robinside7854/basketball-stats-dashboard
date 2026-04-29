'use client'
import type { ShotZone } from '@/types/database'
import { SHOT_ZONE_LABELS } from '@/types/database'

interface ZoneStat { made: number; attempted: number; pct: number }
interface Props {
  zones: Record<string, ZoneStat>
  totalAttempts?: number
  untaggedAttempts?: number
  /** 핫/콜드 zone 감지 최소 시도 수 (기본 3) */
  minAttempts?: number
}

// SVG 좌표계: 500 (가로) x 470 (세로), 베이스라인 y=470
// 11개 zone을 사각형으로 분할 (코트 정확도보다 가독성 우선)
type ZoneDef = { id: ShotZone; x: number; y: number; w: number; h: number; cx: number; cy: number }

const ZONES: ZoneDef[] = [
  // 3-point
  { id: '3p_top',         x: 0,   y: 0,   w: 500, h: 170, cx: 250, cy: 90  },
  { id: '3p_wing_l',      x: 0,   y: 170, w: 100, h: 210, cx: 50,  cy: 280 },
  { id: '3p_wing_r',      x: 400, y: 170, w: 100, h: 210, cx: 450, cy: 280 },
  { id: '3p_corner_l',    x: 0,   y: 380, w: 100, h: 90,  cx: 50,  cy: 425 },
  { id: '3p_corner_r',    x: 400, y: 380, w: 100, h: 90,  cx: 450, cy: 425 },
  // Mid-range
  { id: 'mid_top',        x: 180, y: 170, w: 140, h: 90,  cx: 250, cy: 215 },
  { id: 'mid_elbow_l',    x: 100, y: 170, w: 80,  h: 210, cx: 140, cy: 280 },
  { id: 'mid_elbow_r',    x: 320, y: 170, w: 80,  h: 210, cx: 360, cy: 280 },
  { id: 'mid_baseline_l', x: 100, y: 380, w: 80,  h: 90,  cx: 140, cy: 425 },
  { id: 'mid_baseline_r', x: 320, y: 380, w: 80,  h: 90,  cx: 360, cy: 425 },
  // Paint
  { id: 'paint',          x: 180, y: 260, w: 140, h: 210, cx: 250, cy: 365 },
]

function fillFor(stat: ZoneStat | undefined): string {
  if (!stat || stat.attempted === 0) return '#1f2937'
  if (stat.pct < 30) return '#7f1d1d'   // red-900
  if (stat.pct < 45) return '#9a3412'   // orange-900
  if (stat.pct < 55) return '#854d0e'   // yellow-800
  return '#166534'                       // green-800
}

// 핫/콜드 zone 감지 (최소 시도 수 기준)
function detectHotCold(zones: Record<string, ZoneStat>, minAttempts: number): { hot: Set<string>; cold: Set<string> } {
  const eligible = Object.entries(zones).filter(([, s]) => s.attempted >= minAttempts)
  const hot = new Set<string>()
  const cold = new Set<string>()
  if (eligible.length === 0) return { hot, cold }

  // hot: 상위 2개 (50% 이상)
  const sortedDesc = [...eligible].sort((a, b) => b[1].pct - a[1].pct)
  for (const [k, s] of sortedDesc.slice(0, 2)) {
    if (s.pct >= 50) hot.add(k)
  }
  // cold: 하위 2개 (35% 미만, 핫과 겹치지 않음)
  const sortedAsc = [...eligible].sort((a, b) => a[1].pct - b[1].pct)
  for (const [k, s] of sortedAsc.slice(0, 2)) {
    if (s.pct < 35 && !hot.has(k)) cold.add(k)
  }
  return { hot, cold }
}

export default function HalfCourtChart({ zones, totalAttempts = 0, untaggedAttempts = 0, minAttempts = 3 }: Props) {
  const { hot, cold } = detectHotCold(zones, minAttempts)

  return (
    <div className="w-full">
      <div className="relative w-full max-w-[420px] mx-auto">
        <svg
          viewBox="0 0 500 470"
          className="w-full h-auto"
          style={{ background: '#0a0f1a' }}
        >
          {/* 핫존 글로우 필터 정의 */}
          <defs>
            <filter id="hot-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="cold-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ===== 11개 zone 사각형 ===== */}
          {ZONES.map(z => {
            const stat = zones[z.id]
            const baseFill = fillFor(stat)
            const isHot = hot.has(z.id)
            const isCold = cold.has(z.id)
            // 핫: 더 밝은 녹색 / 콜드: 청록 톤으로 강조
            const fill = isHot ? '#22c55e' : isCold ? '#1d4ed8' : baseFill
            const stroke = isHot ? '#86efac' : isCold ? '#60a5fa' : '#374151'
            const strokeW = isHot || isCold ? 2.5 : 1
            const filter = isHot ? 'url(#hot-glow)' : isCold ? 'url(#cold-glow)' : undefined
            return (
              <g key={z.id}>
                <rect
                  x={z.x} y={z.y} width={z.w} height={z.h}
                  fill={fill} stroke={stroke} strokeWidth={strokeW}
                  opacity={isHot || isCold ? 0.95 : 0.85}
                  filter={filter}
                >
                  <title>
                    {SHOT_ZONE_LABELS[z.id]}
                    {stat && stat.attempted > 0 ? `\n${stat.made}/${stat.attempted} (${stat.pct.toFixed(1)}%)` : '\n시도 없음'}
                    {isHot ? ' · HOT 🔥' : isCold ? ' · COLD ❄️' : ''}
                  </title>
                </rect>
                {/* 핫/콜드 배지 (zone 좌상단 코너) */}
                {(isHot || isCold) && (
                  <text
                    x={z.x + 6} y={z.y + 16}
                    style={{ fontSize: '14px', fontFamily: 'sans-serif' }}
                  >
                    {isHot ? '🔥' : '❄️'}
                  </text>
                )}
                {/* 라벨: 시도 있을 때만 */}
                {stat && stat.attempted > 0 && (
                  <>
                    <text
                      x={z.cx} y={z.cy - 6}
                      textAnchor="middle"
                      className="fill-white"
                      style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'monospace' }}
                    >
                      {stat.pct.toFixed(0)}%
                    </text>
                    <text
                      x={z.cx} y={z.cy + 14}
                      textAnchor="middle"
                      className="fill-gray-200"
                      style={{ fontSize: '13px', fontFamily: 'monospace' }}
                    >
                      {stat.made}/{stat.attempted}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {/* ===== 코트 라인 (장식) ===== */}
          <g fill="none" stroke="#9ca3af" strokeWidth={1.5} opacity={0.55}>
            <rect x={1} y={1} width={498} height={468} />
            <rect x={180} y={260} width={140} height={210} />
            <path d="M 200 260 A 50 50 0 0 1 300 260" />
            <path d="M 200 260 A 50 50 0 0 0 300 260" strokeDasharray="4 4" />
            <circle cx={250} cy={450} r={9} />
            <line x1={220} y1={460} x2={280} y2={460} strokeWidth={2.5} />
            <line x1={100} y1={380} x2={100} y2={470} />
            <line x1={400} y1={380} x2={400} y2={470} />
            <path d="M 100 380 A 215 215 0 0 1 400 380" />
            <path d="M 230 470 L 230 445 A 20 20 0 0 1 270 445 L 270 470" />
          </g>
        </svg>
      </div>

      {/* 범례 + 메타 */}
      <div className="mt-3 space-y-2">
        {/* 핫/콜드 강조 범례 */}
        {(hot.size > 0 || cold.size > 0) && (
          <div className="flex items-center gap-3 flex-wrap text-[11px]">
            {hot.size > 0 && (
              <div className="flex items-center gap-1.5 text-green-400 font-semibold">
                🔥 핫존: {[...hot].map(z => SHOT_ZONE_LABELS[z as ShotZone]).join(' · ')}
              </div>
            )}
            {cold.size > 0 && (
              <div className="flex items-center gap-1.5 text-blue-400 font-semibold">
                ❄️ 콜드존: {[...cold].map(z => SHOT_ZONE_LABELS[z as ShotZone]).join(' · ')}
              </div>
            )}
          </div>
        )}
        {/* 색상 범례 + 메타 */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: '#7f1d1d' }} />&lt;30%
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: '#9a3412' }} />30-45%
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: '#854d0e' }} />45-55%
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: '#166534' }} />≥55%
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-3 h-3 rounded" style={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />시도 없음
            </div>
          </div>
          <div className="text-[11px] text-gray-600">
            {totalAttempts > 0 ? `${totalAttempts}회 위치 기록` : '기록된 위치 없음'}
            {untaggedAttempts > 0 && <span className="ml-2 text-gray-700">· {untaggedAttempts}회 미지정</span>}
          </div>
        </div>
        <p className="text-[10px] text-gray-700">핫/콜드는 최소 {minAttempts}회 시도 기준</p>
      </div>
    </div>
  )
}

