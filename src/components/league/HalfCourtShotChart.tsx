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

// ViewBox: 300 × 270
// Basket at top (y=28), half-court extends downward
// All coordinates are in the 300×270 space

const COURT_W = 300
const COURT_H = 270

// 3-point arc: cx=150 cy=28 r=137
// Corner straights: x=20, x=280 from y=0 to y=77
// Paint: x=110 to x=190, y=0 to y=107
// FT line y=107

const ARC_CX = 150
const ARC_CY = 28
const ARC_R = 137

// Zone definitions — each zone is a SVG path string
// We use clipPath with the arc to separate mid from 3pt regions

const ZONE_PATHS: Record<string, string> = {
  // ── 3-point zones ──────────────────────────────────────────
  '3p_corner_l':  'M 0,0 L 20,0 L 20,77 L 0,77 Z',
  '3p_corner_r':  'M 280,0 L 300,0 L 300,77 L 280,77 Z',
  // Wing L: from x=0 to arc, between y=77 and the arc sweep, left of x=150
  // Approximated as a clipped region — drawn as polygon with arc boundary approximated
  '3p_wing_l':    'M 0,77 L 20,77 A 137,137 0 0,1 90,200 L 0,200 Z',
  '3p_wing_r':    'M 280,77 A 137,137 0 0,0 210,200 L 300,200 L 300,77 Z',
  // Top 3: the arc region above/behind mid zones, center
  '3p_top':       'M 90,200 A 137,137 0 0,1 210,200 L 190,107 L 110,107 Z',
  // ── Mid-range zones ─────────────────────────────────────────
  'mid_baseline_l': 'M 0,0 L 110,0 L 110,107 L 0,107 Z',
  'mid_baseline_r': 'M 190,0 L 300,0 L 300,107 L 190,107 Z',
  // Elbow L: left of paint, upper half of the "mid baseline" region, but we split vertically
  // We split mid_baseline at y=53 (midpoint of 0..107) into elbow (top) and baseline (bottom)
  'mid_elbow_l':    'M 0,0 L 110,0 L 110,53 L 0,53 Z',
  'mid_elbow_r':    'M 190,0 L 300,0 L 300,53 L 190,53 Z',
  // mid_top: top-of-key / FT area — inside arc, above paint top, between the two elbows
  'mid_top':        'M 110,0 L 190,0 L 190,107 L 110,107 Z',
}

// Overrides for the split mid zones (baseline = lower half)
const ZONE_PATHS_OVERRIDE: Record<string, string> = {
  'mid_baseline_l': 'M 0,53 L 110,53 L 110,107 L 0,107 Z',
  'mid_baseline_r': 'M 190,53 L 300,53 L 300,107 L 190,107 Z',
}

// Zone label anchor points (cx, cy) for text overlay
const ZONE_LABEL_POS: Record<string, [number, number]> = {
  '3p_corner_l':    [10, 45],
  '3p_corner_r':    [290, 45],
  '3p_wing_l':      [28, 145],
  '3p_wing_r':      [272, 145],
  '3p_top':         [150, 215],
  'mid_baseline_l': [55, 85],
  'mid_baseline_r': [245, 85],
  'mid_elbow_l':    [55, 28],
  'mid_elbow_r':    [245, 28],
  'mid_top':        [150, 60],
}

// Zone Korean labels for interactive mode
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

function fgColor(m: number, a: number, dark = true): string {
  if (a === 0) return dark ? '#1e3a5f' : '#e2e8f0'
  const pct = m / a
  if (pct < 0.30) return '#fca5a5'
  if (pct < 0.40) return '#fdba74'
  if (pct < 0.50) return '#fde047'
  return '#86efac'
}

function fgTextColor(m: number, a: number): string {
  if (a === 0) return '#94a3b8'
  const pct = m / a
  if (pct < 0.30) return '#991b1b'
  if (pct < 0.40) return '#92400e'
  if (pct < 0.50) return '#713f12'
  return '#14532d'
}

// Approximate centroid for small zones to place text
function getPath(zone: string): string {
  return ZONE_PATHS_OVERRIDE[zone] ?? ZONE_PATHS[zone] ?? ''
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
  const scale = width / COURT_W

  // Determine which zones are selectable in interactive mode
  function isSelectable(zone: string): boolean {
    if (!interactive) return false
    if (!shotType) return true
    if (shotType === 'shot_2p_mid') return MID_ZONES.has(zone)
    if (shotType === 'shot_3p') return THREE_ZONES.has(zone)
    return false
  }

  return (
    <div
      style={{ width, height }}
      className="relative rounded-xl overflow-hidden bg-gray-950 dark:bg-gray-950"
      aria-label="슛 차트"
    >
      <svg
        viewBox={`0 0 ${COURT_W} ${COURT_H}`}
        width={width}
        height={height}
        className="block"
        style={{ display: 'block' }}
      >
        {/* ── Clip paths ─────────────────────────────────────────── */}
        <defs>
          {/* inside 3-point line (half court) */}
          <clipPath id="insideArc">
            <path d={`M 20,0 L 20,77 A ${ARC_R},${ARC_R} 0 0,1 280,77 L 280,0 Z`} />
          </clipPath>
          {/* outside 3-point line */}
          <clipPath id="outsideArc">
            <rect x="0" y="0" width={COURT_W} height={COURT_H} />
          </clipPath>
        </defs>

        {/* ── Court background ─────────────────────────────────── */}
        <rect x="0" y="0" width={COURT_W} height={COURT_H} fill="#0f172a" />

        {/* ── Zone fills ───────────────────────────────────────── */}
        {ALL_ZONES.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          const selectable = isSelectable(zone)
          const isSelected = interactive && selectedZone === zone
          const dimmed = interactive && !selectable

          let fill: string
          if (interactive) {
            if (isSelected) {
              fill = '#f59e0b' // amber-400
            } else if (THREE_ZONES.has(zone)) {
              fill = selectable ? '#1d4ed8' : '#1e3a5f'
            } else {
              fill = selectable ? '#92400e' : '#1e293b'
            }
          } else {
            fill = fgColor(m, a, true)
          }

          const pathD = getPath(zone)
          if (!pathD) return null

          return (
            <path
              key={zone}
              d={pathD}
              fill={fill}
              fillOpacity={dimmed ? 0.25 : interactive && selectable ? 0.75 : 0.8}
              stroke="#1e3a5f"
              strokeWidth="1"
              className={selectable ? 'cursor-pointer' : undefined}
              onClick={selectable ? () => onZoneClick?.(zone) : undefined}
              onMouseEnter={selectable ? (e) => {
                ;(e.currentTarget as SVGPathElement).style.fillOpacity = '0.95'
              } : undefined}
              onMouseLeave={selectable ? (e) => {
                ;(e.currentTarget as SVGPathElement).style.fillOpacity = isSelected ? '1' : '0.75'
              } : undefined}
              role={selectable ? 'button' : undefined}
              aria-label={selectable ? `${ZONE_SHORT[zone]} 선택` : undefined}
              aria-pressed={selectable ? isSelected : undefined}
            />
          )
        })}

        {/* ── Court markings ───────────────────────────────────── */}
        {/* Outer boundary */}
        <rect x="1" y="1" width={COURT_W - 2} height={COURT_H - 2}
          fill="none" stroke="#334155" strokeWidth="1.5" />

        {/* Paint rectangle */}
        <rect x="110" y="0" width="80" height="107"
          fill="none" stroke="#334155" strokeWidth="1.5" />

        {/* Free throw circle (top half only, clipped to court) */}
        <clipPath id="ftClip">
          <rect x="0" y="107" width={COURT_W} height={COURT_H - 107} />
        </clipPath>
        <circle cx="150" cy="107" r="30"
          fill="none" stroke="#334155" strokeWidth="1.5" clipPath="url(#ftClip)" />
        {/* FT circle top half (dashed, above FT line) */}
        <clipPath id="ftTopClip">
          <rect x="0" y="0" width={COURT_W} height="107" />
        </clipPath>
        <circle cx="150" cy="107" r="30"
          fill="none" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 3"
          clipPath="url(#ftTopClip)" />

        {/* Restricted area arc (small, r=20) */}
        <path
          d={`M 130,28 A 20,20 0 0,1 170,28`}
          fill="none" stroke="#334155" strokeWidth="1.5" />

        {/* 3-point arc + corner lines */}
        {/* Corner lines (straight) */}
        <line x1="20" y1="0" x2="20" y2="77" stroke="#334155" strokeWidth="1.5" />
        <line x1="280" y1="0" x2="280" y2="77" stroke="#334155" strokeWidth="1.5" />
        {/* Arc */}
        <path
          d={`M 20,77 A ${ARC_R},${ARC_R} 0 0,1 280,77`}
          fill="none" stroke="#334155" strokeWidth="1.5" />

        {/* Basket backboard */}
        <line x1="128" y1="0" x2="172" y2="0" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />

        {/* Basket circle */}
        <circle cx={ARC_CX} cy={ARC_CY} r="7"
          fill="none" stroke="#64748b" strokeWidth="1.5" />
        {/* Basket center dot */}
        <circle cx={ARC_CX} cy={ARC_CY} r="1.5" fill="#64748b" />

        {/* ── Zone stat labels (display mode) ──────────────────── */}
        {!interactive && ALL_ZONES.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          if (a === 0) return null
          const [cx, cy] = ZONE_LABEL_POS[zone] ?? [0, 0]
          const pct = Math.round(m / a * 100)
          const textCol = fgTextColor(m, a)
          // skip if zone label pos not defined
          if (!cx && !cy) return null

          return (
            <g key={`label-${zone}`} aria-hidden="true">
              <text
                x={cx} y={cy - 4}
                textAnchor="middle"
                fontSize="8.5"
                fontWeight="700"
                fill={textCol}
                style={{ userSelect: 'none' }}
              >
                {m}/{a}
              </text>
              <text
                x={cx} y={cy + 7}
                textAnchor="middle"
                fontSize="8"
                fontWeight="600"
                fill={textCol}
                style={{ userSelect: 'none' }}
              >
                {pct}%
              </text>
            </g>
          )
        })}

        {/* ── Zone short labels (interactive mode) ─────────────── */}
        {interactive && ALL_ZONES.map(zone => {
          const selectable = isSelectable(zone)
          if (!selectable) return null
          const [cx, cy] = ZONE_LABEL_POS[zone] ?? [0, 0]
          if (!cx && !cy) return null
          return (
            <text
              key={`ilabel-${zone}`}
              x={cx} y={cy + 4}
              textAnchor="middle"
              fontSize="8"
              fontWeight="700"
              fill={selectedZone === zone ? '#fff' : '#e2e8f0'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {ZONE_SHORT[zone]}
            </text>
          )
        })}

        {/* ── Legend dots for display mode: no data zones ──────── */}
        {!interactive && ALL_ZONES.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          if (a > 0) return null
          const [cx, cy] = ZONE_LABEL_POS[zone] ?? [0, 0]
          if (!cx && !cy) return null
          return (
            <text
              key={`empty-${zone}`}
              x={cx} y={cy + 4}
              textAnchor="middle"
              fontSize="8"
              fill="#334155"
              style={{ userSelect: 'none' }}
              aria-hidden="true"
            >
              —
            </text>
          )
        })}
      </svg>

      {/* Colour legend (display mode only) */}
      {!interactive && (
        <div
          className="absolute bottom-1.5 right-2 flex items-center gap-1.5"
          aria-hidden="true"
        >
          {[
            { color: '#fca5a5', label: '<30%' },
            { color: '#fdba74', label: '30-40%' },
            { color: '#fde047', label: '40-50%' },
            { color: '#86efac', label: '>50%' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-0.5">
              <div
                className="w-2 h-2 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <span className="text-[8px] text-slate-500 leading-none">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
