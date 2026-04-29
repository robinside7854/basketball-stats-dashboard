'use client'
import React from 'react'

interface Props {
  zoneStats: Record<string, { m: number; a: number }>
  interactive?: boolean
  selectedZone?: string | null
  onZoneClick?: (zone: string) => void
  width?: number
  shotType?: string
}

const COURT_W = 300
const COURT_H = 270
const ARC_CX = 150
const ARC_CY = 28
const ARC_R = 137

// 코트 색상 — 밝은 라인으로 가시성 확보
const LINE_COLOR = '#94a3b8'       // 밝은 슬레이트 — 코트 라인
const LINE_W = '1.8'
const PAINT_FILL = 'rgba(30,64,175,0.25)'  // 파란색 페인트 구역
const BASKET_COLOR = '#f97316'     // 오렌지 — 링
const BACKBOARD_COLOR = '#cbd5e1'  // 밝은 백보드

const ZONE_PATHS: Record<string, string> = {
  '3p_corner_l':    'M 0,0 L 20,0 L 20,77 L 0,77 Z',
  '3p_corner_r':    'M 280,0 L 300,0 L 300,77 L 280,77 Z',
  '3p_wing_l':      'M 0,77 L 20,77 A 137,137 0 0,1 90,200 L 0,200 Z',
  '3p_wing_r':      'M 280,77 A 137,137 0 0,0 210,200 L 300,200 L 300,77 Z',
  '3p_top':         'M 90,200 A 137,137 0 0,1 210,200 L 190,107 L 110,107 Z',
  'mid_baseline_l': 'M 0,53 L 110,53 L 110,107 L 0,107 Z',
  'mid_baseline_r': 'M 190,53 L 300,53 L 300,107 L 190,107 Z',
  'mid_elbow_l':    'M 0,0 L 110,0 L 110,53 L 0,53 Z',
  'mid_elbow_r':    'M 190,0 L 300,0 L 300,53 L 190,53 Z',
  'mid_top':        'M 110,0 L 190,0 L 190,107 L 110,107 Z',
}

const ZONE_LABEL_POS: Record<string, [number, number]> = {
  '3p_corner_l':    [10, 40],
  '3p_corner_r':    [290, 40],
  '3p_wing_l':      [28, 148],
  '3p_wing_r':      [272, 148],
  '3p_top':         [150, 218],
  'mid_baseline_l': [55, 85],
  'mid_baseline_r': [245, 85],
  'mid_elbow_l':    [55, 28],
  'mid_elbow_r':    [245, 28],
  'mid_top':        [150, 58],
}

const ZONE_SHORT: Record<string, string> = {
  '3p_corner_l':    '좌코너',
  '3p_corner_r':    '우코너',
  '3p_wing_l':      '좌윙',
  '3p_wing_r':      '우윙',
  '3p_top':         '탑3P',
  'mid_baseline_l': '좌베이스',
  'mid_baseline_r': '우베이스',
  'mid_elbow_l':    '좌엘보',
  'mid_elbow_r':    '우엘보',
  'mid_top':        'FT라인',
}

const MID_ZONES = new Set(['mid_baseline_l', 'mid_elbow_l', 'mid_top', 'mid_elbow_r', 'mid_baseline_r'])
const THREE_ZONES = new Set(['3p_corner_l', '3p_wing_l', '3p_top', '3p_wing_r', '3p_corner_r'])
const ALL_ZONES = [...MID_ZONES, ...THREE_ZONES]

function fgColor(m: number, a: number): string {
  if (a === 0) return 'rgba(15,23,42,0)'   // 데이터 없음 → 투명 (코트 바닥 보임)
  const pct = m / a
  if (pct < 0.30) return 'rgba(239,68,68,0.75)'    // red-500
  if (pct < 0.40) return 'rgba(249,115,22,0.75)'   // orange-500
  if (pct < 0.50) return 'rgba(234,179,8,0.75)'    // yellow-500
  return 'rgba(34,197,94,0.75)'                     // green-500
}

function getPath(zone: string): string {
  return ZONE_PATHS[zone] ?? ''
}

export default function HalfCourtShotChart({
  zoneStats,
  interactive = false,
  selectedZone,
  onZoneClick,
  width = 300,
  shotType,
}: Props) {
  const height = Math.round((COURT_H / COURT_W) * width)

  function isSelectable(zone: string): boolean {
    if (!interactive) return false
    if (!shotType) return true
    if (shotType === 'shot_2p_mid') return MID_ZONES.has(zone)
    if (shotType === 'shot_3p') return THREE_ZONES.has(zone)
    return false
  }

  return (
    <div
      style={{ width, height, background: '#0f172a' }}
      className="relative rounded-xl overflow-hidden"
      aria-label="슛 차트"
    >
      <svg
        viewBox={`0 0 ${COURT_W} ${COURT_H}`}
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        <defs>
          <clipPath id="ftClip">
            <rect x="0" y="107" width={COURT_W} height={COURT_H - 107} />
          </clipPath>
          <clipPath id="ftTopClip">
            <rect x="0" y="0" width={COURT_W} height="107" />
          </clipPath>
        </defs>

        {/* 코트 배경 */}
        <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#0f172a" />

        {/* 페인트 구역 채움 (파란색) */}
        <rect x="110" y="0" width="80" height="107" fill={PAINT_FILL} />

        {/* ── 존 채움 ────────────────────────────────────────── */}
        {ALL_ZONES.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          const selectable = isSelectable(zone)
          const isSelected = interactive && selectedZone === zone
          const dimmed = interactive && !selectable

          let fill: string
          if (interactive) {
            if (isSelected) fill = 'rgba(245,158,11,0.85)'
            else if (THREE_ZONES.has(zone)) fill = selectable ? 'rgba(29,78,216,0.6)' : 'rgba(15,23,42,0.3)'
            else fill = selectable ? 'rgba(146,64,14,0.6)' : 'rgba(15,23,42,0.3)'
          } else {
            fill = fgColor(m, a)
          }

          const pathD = getPath(zone)
          if (!pathD) return null

          return (
            <path
              key={zone}
              d={pathD}
              fill={fill}
              fillOpacity={dimmed ? 0.2 : 1}
              stroke={LINE_COLOR}
              strokeWidth="0.5"
              strokeOpacity="0.4"
              className={selectable ? 'cursor-pointer' : undefined}
              onClick={selectable ? () => onZoneClick?.(zone) : undefined}
              onMouseEnter={selectable ? (e) => {
                ;(e.currentTarget as SVGPathElement).style.filter = 'brightness(1.3)'
              } : undefined}
              onMouseLeave={selectable ? (e) => {
                ;(e.currentTarget as SVGPathElement).style.filter = ''
              } : undefined}
              role={selectable ? 'button' : undefined}
              aria-label={selectable ? `${ZONE_SHORT[zone]} 선택` : undefined}
              aria-pressed={selectable ? isSelected : undefined}
            />
          )
        })}

        {/* ── 코트 라인 (밝은 색으로) ─────────────────────────── */}
        {/* 외곽선 */}
        <rect x="1" y="1" width={COURT_W - 2} height={COURT_H - 2}
          fill="none" stroke={LINE_COLOR} strokeWidth={LINE_W} />

        {/* 페인트 구역 테두리 */}
        <rect x="110" y="0" width="80" height="107"
          fill="none" stroke={LINE_COLOR} strokeWidth={LINE_W} />

        {/* FT 서클 — 아랫반원 (실선) */}
        <circle cx="150" cy="107" r="30"
          fill="none" stroke={LINE_COLOR} strokeWidth={LINE_W}
          clipPath="url(#ftClip)" />
        {/* FT 서클 — 윗반원 (점선) */}
        <circle cx="150" cy="107" r="30"
          fill="none" stroke={LINE_COLOR} strokeWidth={LINE_W}
          strokeDasharray="5 4" clipPath="url(#ftTopClip)" />

        {/* 제한구역 아크 */}
        <path d={`M 130,28 A 20,20 0 0,1 170,28`}
          fill="none" stroke={LINE_COLOR} strokeWidth={LINE_W} />

        {/* 3점 코너 수직선 */}
        <line x1="20" y1="0" x2="20" y2="77" stroke={LINE_COLOR} strokeWidth={LINE_W} />
        <line x1="280" y1="0" x2="280" y2="77" stroke={LINE_COLOR} strokeWidth={LINE_W} />

        {/* 3점 아크 */}
        <path d={`M 20,77 A ${ARC_R},${ARC_R} 0 0,1 280,77`}
          fill="none" stroke={LINE_COLOR} strokeWidth={LINE_W} />

        {/* 백보드 */}
        <line x1="125" y1="4" x2="175" y2="4"
          stroke={BACKBOARD_COLOR} strokeWidth="3" strokeLinecap="round" />

        {/* 링 (오렌지) */}
        <circle cx={ARC_CX} cy={ARC_CY} r="8"
          fill="none" stroke={BASKET_COLOR} strokeWidth="2.5" />
        {/* 골대 연결선 */}
        <line x1={ARC_CX} y1="4" x2={ARC_CX} y2={ARC_CY - 8}
          stroke={BASKET_COLOR} strokeWidth="1.5" />

        {/* ── 존 텍스트 레이블 (표시 모드) ───────────────────── */}
        {!interactive && ALL_ZONES.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          const [cx, cy] = ZONE_LABEL_POS[zone] ?? [0, 0]
          if (!cx && !cy) return null

          if (a === 0) {
            return (
              <text key={`empty-${zone}`} x={cx} y={cy + 4}
                textAnchor="middle" fontSize="9" fill="#475569"
                style={{ userSelect: 'none' }} aria-hidden="true">
                —
              </text>
            )
          }

          const pct = Math.round(m / a * 100)

          return (
            <g key={`label-${zone}`} aria-hidden="true">
              {/* 텍스트 가시성을 위한 반투명 배경 */}
              <rect
                x={cx - 16} y={cy - 13}
                width="32" height="20"
                rx="3" ry="3"
                fill="rgba(0,0,0,0.55)"
              />
              <text x={cx} y={cy - 3}
                textAnchor="middle" fontSize="7.5" fontWeight="700"
                fill="#ffffff" style={{ userSelect: 'none' }}>
                {m}/{a}
              </text>
              <text x={cx} y={cy + 6}
                textAnchor="middle" fontSize="7.5" fontWeight="800"
                fill="#ffffff" style={{ userSelect: 'none' }}>
                {pct}%
              </text>
            </g>
          )
        })}

        {/* ── 존 텍스트 (인터랙티브 모드) ─────────────────────── */}
        {interactive && ALL_ZONES.map(zone => {
          const selectable = isSelectable(zone)
          if (!selectable) return null
          const [cx, cy] = ZONE_LABEL_POS[zone] ?? [0, 0]
          if (!cx && !cy) return null
          return (
            <text key={`ilabel-${zone}`}
              x={cx} y={cy + 4}
              textAnchor="middle" fontSize="8.5" fontWeight="700"
              fill={selectedZone === zone ? '#fff' : '#e2e8f0'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
              aria-hidden="true">
              {ZONE_SHORT[zone]}
            </text>
          )
        })}
      </svg>

      {/* 범례 */}
      {!interactive && (
        <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-2.5"
          aria-hidden="true">
          {[
            { color: 'rgba(239,68,68,0.85)',  label: '<30%' },
            { color: 'rgba(249,115,22,0.85)', label: '30-40%' },
            { color: 'rgba(234,179,8,0.85)',  label: '40-50%' },
            { color: 'rgba(34,197,94,0.85)',  label: '>50%' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }} />
              <span className="text-[9px] text-slate-300 leading-none font-medium">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
