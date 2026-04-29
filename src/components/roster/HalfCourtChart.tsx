'use client'
import type { ShotZone } from '@/types/database'
import { SHOT_ZONE_LABELS } from '@/types/database'

interface ZoneStat { made: number; attempted: number; pct: number }
interface Props {
  zones: Record<string, ZoneStat>
  totalAttempts?: number
  untaggedAttempts?: number
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

function fillFor(stat: ZoneStat | undefined): { fill: string; stroke: string; tone: 'none' | 'cold' | 'cool' | 'warm' | 'hot' } {
  if (!stat || stat.attempted === 0) return { fill: '#1f2937', stroke: '#374151', tone: 'none' }
  if (stat.pct < 30) return { fill: '#7f1d1d', stroke: '#991b1b', tone: 'cold' }      // red-900
  if (stat.pct < 45) return { fill: '#9a3412', stroke: '#b45309', tone: 'cool' }      // orange-900-ish
  if (stat.pct < 55) return { fill: '#854d0e', stroke: '#a16207', tone: 'warm' }      // yellow-800
  return                          { fill: '#166534', stroke: '#16a34a', tone: 'hot' } // green-800
}

export default function HalfCourtChart({ zones, totalAttempts = 0, untaggedAttempts = 0 }: Props) {
  return (
    <div className="w-full">
      <div className="relative w-full max-w-[420px] mx-auto">
        <svg
          viewBox="0 0 500 470"
          className="w-full h-auto"
          style={{ background: '#0a0f1a' }}
        >
          {/* ===== 11개 zone 사각형 (먼저 그려서 라인이 위에 오도록) ===== */}
          {ZONES.map(z => {
            const stat = zones[z.id]
            const { fill, stroke } = fillFor(stat)
            return (
              <g key={z.id}>
                <rect
                  x={z.x} y={z.y} width={z.w} height={z.h}
                  fill={fill} stroke={stroke} strokeWidth={1}
                  opacity={0.85}
                >
                  <title>
                    {SHOT_ZONE_LABELS[z.id]}
                    {stat && stat.attempted > 0 ? `\n${stat.made}/${stat.attempted} (${stat.pct.toFixed(1)}%)` : '\n시도 없음'}
                  </title>
                </rect>
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
                      className="fill-gray-300"
                      style={{ fontSize: '13px', fontFamily: 'monospace' }}
                    >
                      {stat.made}/{stat.attempted}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {/* ===== 코트 라인 (장식, 위에 그림) ===== */}
          <g fill="none" stroke="#9ca3af" strokeWidth={1.5} opacity={0.55}>
            {/* 베이스라인 + 사이드라인 + half-court line */}
            <rect x={1} y={1} width={498} height={468} />
            {/* 페인트 키 */}
            <rect x={180} y={260} width={140} height={210} />
            {/* 자유투 라인 (이미 paint 상단) */}
            {/* 자유투 원 (위쪽 반원만) */}
            <path d="M 200 260 A 50 50 0 0 1 300 260" />
            {/* 점선 자유투 원 (아래쪽) */}
            <path d="M 200 260 A 50 50 0 0 0 300 260" strokeDasharray="4 4" />
            {/* 림 */}
            <circle cx={250} cy={450} r={9} />
            {/* 백보드 */}
            <line x1={220} y1={460} x2={280} y2={460} strokeWidth={2.5} />
            {/* 3점 라인: 코너 두 직선 + 아치 */}
            <line x1={100} y1={380} x2={100} y2={470} />
            <line x1={400} y1={380} x2={400} y2={470} />
            {/* 3점 아치 (코너 끝점에서 코너 끝점까지 호) */}
            <path d="M 100 380 A 215 215 0 0 1 400 380" />
            {/* 제한구역 (림 주변) */}
            <path d="M 230 470 L 230 445 A 20 20 0 0 1 270 445 L 270 470" />
          </g>
        </svg>
      </div>

      {/* 범례 + 메타 */}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
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
    </div>
  )
}
