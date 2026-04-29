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

// viewBox: 500 × 470. Baseline at TOP, basket near top, half-court extends downward.
// Basket center: (250, 52). 3pt arc: r=238, centered at (250,52).
// Corner x=30: arc meets at y = 52 + sqrt(238²−220²) = 52+90.8 ≈ 143
// Paint box: x=170, y=0, w=160, h=190. FT line y=190. FT circle: cx=250, cy=190, r=60.

const VB_W = 500
const VB_H = 470
const ASPECT = VB_H / VB_W

const CORNER_L_X = 30
const CORNER_R_X = 470
const CORNER_Y = 143

const MID_ZONES = new Set(['mid_baseline_l', 'mid_elbow_l', 'mid_top', 'mid_elbow_r', 'mid_baseline_r'])
const THREE_ZONES = new Set(['3p_corner_l', '3p_wing_l', '3p_top', '3p_wing_r', '3p_corner_r'])
const ALL_ZONES = [...MID_ZONES, ...THREE_ZONES]

// Raw zone paths (clipping handles arc boundary)
// Mid zones sit outside paint box spatially (except mid_top which needs extra clip).
const ZONE_PATHS: Record<string, string> = {
  paint:          'M 170,0 L 330,0 L 330,190 L 170,190 Z',
  mid_baseline_l: 'M 30,0 L 170,0 L 170,190 L 30,190 Z',
  mid_elbow_l:    'M 30,190 L 170,190 L 170,330 L 30,330 Z',
  mid_top:        'M 170,190 L 330,190 L 330,330 L 170,330 Z',
  mid_elbow_r:    'M 330,190 L 470,190 L 470,330 L 330,330 Z',
  mid_baseline_r: 'M 330,0 L 470,0 L 470,190 L 330,190 Z',
  '3p_corner_l':  'M 0,0 L 30,0 L 30,143 L 0,143 Z',
  '3p_wing_l':    'M 0,143 L 30,143 L 30,470 L 0,470 Z',
  '3p_top':       'M 30,143 L 470,143 L 470,470 L 30,470 Z',
  '3p_wing_r':    'M 470,143 L 500,143 L 500,470 L 470,470 Z',
  '3p_corner_r':  'M 470,0 L 500,0 L 500,143 L 470,143 Z',
}

type ClipGroup = 'none' | 'inside3pt' | 'midtop' | 'outside3pt'
const ZONE_CLIP: Record<string, ClipGroup> = {
  paint:          'none',
  mid_baseline_l: 'inside3pt',
  mid_elbow_l:    'inside3pt',
  mid_top:        'midtop',
  mid_elbow_r:    'inside3pt',
  mid_baseline_r: 'inside3pt',
  '3p_corner_l':  'outside3pt',
  '3p_wing_l':    'outside3pt',
  '3p_top':       'outside3pt',
  '3p_wing_r':    'outside3pt',
  '3p_corner_r':  'outside3pt',
}

function getClipAttr(clip: ClipGroup): string | undefined {
  if (clip === 'inside3pt') return 'url(#clipInside3pt)'
  if (clip === 'midtop') return 'url(#clipMidTop)'
  if (clip === 'outside3pt') return 'url(#clipOutside3pt)'
  return undefined
}

const ZONE_LABEL_POS: Record<string, [number, number]> = {
  paint:          [250, 100],
  mid_baseline_l: [100,  65],
  mid_elbow_l:    [100, 220],
  mid_top:        [250, 260],
  mid_elbow_r:    [400, 220],
  mid_baseline_r: [400,  65],
  '3p_corner_l':  [ 15,  65],
  '3p_wing_l':    [ 55, 290],
  '3p_top':       [250, 420],
  '3p_wing_r':    [445, 290],
  '3p_corner_r':  [485,  65],
}

const ZONE_SHORT: Record<string, string> = {
  paint:          '페인트',
  mid_baseline_l: '좌베이스',
  mid_baseline_r: '우베이스',
  mid_elbow_l:    '좌엘보',
  mid_elbow_r:    '우엘보',
  mid_top:        'FT라인',
  '3p_corner_l':  '좌코너',
  '3p_corner_r':  '우코너',
  '3p_wing_l':    '좌윙',
  '3p_wing_r':    '우윙',
  '3p_top':       '탑3P',
}

function fgColor(m: number, a: number): string {
  if (a === 0) return 'rgba(80,80,80,0.25)'
  const pct = m / a
  if (pct < 0.33) return 'rgba(220,60,60,0.65)'
  if (pct < 0.40) return 'rgba(220,130,60,0.65)'
  if (pct < 0.47) return 'rgba(200,180,50,0.65)'
  return 'rgba(60,180,80,0.65)'
}

function interactiveFill(zone: string, selectable: boolean, selected: boolean): string {
  if (selected) return 'rgba(251,191,36,0.9)'
  if (!selectable) return 'rgba(80,80,80,0.2)'
  if (THREE_ZONES.has(zone)) return 'rgba(59,130,246,0.55)'
  return 'rgba(251,191,36,0.55)'
}

// SVG path for "inside 3pt" clip region:
// top edge (y=0) from x=30 to x=470, down to corner y=143, arc sweeping back
const INSIDE_3PT_PATH = `M 30,0 L 470,0 L 470,${CORNER_Y} A 238,238 0 0,0 30,${CORNER_Y} Z`

// "Outside 3pt" = full viewBox minus inside region (evenodd)
const OUTSIDE_3PT_PATH = `M 0,0 L ${VB_W},0 L ${VB_W},${VB_H} L 0,${VB_H} Z M 30,0 L 470,0 L 470,${CORNER_Y} A 238,238 0 0,0 30,${CORNER_Y} Z`

// "MidTop" clip = inside3pt minus paint box bottom area
const MIDTOP_PATH = `M 30,0 L 470,0 L 470,${CORNER_Y} A 238,238 0 0,0 30,${CORNER_Y} Z M 170,190 L 330,190 L 330,330 L 170,330 Z`

export default function HalfCourtShotChart({
  zoneStats,
  interactive = false,
  selectedZone,
  onZoneClick,
  width = 500,
  shotType,
}: Props) {
  const height = Math.round(ASPECT * width)

  function isSelectable(zone: string): boolean {
    if (!interactive) return false
    if (!shotType) return true
    if (shotType === 'shot_2p_mid') return MID_ZONES.has(zone)
    if (shotType === 'shot_3p') return THREE_ZONES.has(zone)
    return false
  }

  const interactiveZones = [...MID_ZONES, ...THREE_ZONES]
  const displayZones = ['paint', ...ALL_ZONES]

  return (
    <div
      style={{ width, height }}
      className="relative rounded-xl overflow-hidden"
      aria-label="슛 차트"
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={width}
        height={height}
        style={{ display: 'block' }}
      >
        <defs>
          <filter id="woodGrain" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="2" result="noise" />
            <feColorMatrix type="saturate" values="0.3" in="noise" result="desatNoise" />
            <feBlend in="SourceGraphic" in2="desatNoise" mode="multiply" />
          </filter>

          <filter id="courtShadow" x="-2%" y="-2%" width="104%" height="104%">
            <feDropShadow dx="0" dy="2" stdDeviation="6" floodColor="#000" floodOpacity="0.35" />
          </filter>

          <clipPath id="clipInside3pt">
            <path d={INSIDE_3PT_PATH} />
          </clipPath>

          <clipPath id="clipOutside3pt">
            <path fillRule="evenodd" d={OUTSIDE_3PT_PATH} />
          </clipPath>

          <clipPath id="clipMidTop">
            <path fillRule="evenodd" d={MIDTOP_PATH} />
          </clipPath>
        </defs>

        {/* Wooden court background */}
        <rect
          x="0" y="0" width={VB_W} height={VB_H}
          rx="12" ry="12"
          fill="#c8a060"
          filter="url(#courtShadow)"
        />

        {/* Wood grain horizontal lines */}
        {Array.from({ length: 28 }, (_, i) => (
          <line
            key={`g1-${i}`}
            x1="0" y1={i * 17}
            x2={VB_W} y2={i * 17 + 4}
            stroke="#b8924a" strokeWidth="0.6" opacity="0.28"
          />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <line
            key={`g2-${i}`}
            x1="0" y1={i * 34 + 8}
            x2={VB_W} y2={i * 34 + 12}
            stroke="#a07838" strokeWidth="0.4" opacity="0.18"
          />
        ))}

        {/* Paint box subtle tint */}
        <rect x="170" y="0" width="160" height="190" fill="rgba(180,130,60,0.3)" />

        {/* ── Heat map fills (display mode) ── */}
        {!interactive && displayZones.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          const pathD = ZONE_PATHS[zone]
          if (!pathD) return null
          const clip = ZONE_CLIP[zone] ?? 'none'
          const clipAttr = getClipAttr(clip)

          if (zone === 'paint') {
            return (
              <rect
                key="paint-fill"
                x="170" y="0" width="160" height="190"
                fill={fgColor(m, a)}
              />
            )
          }
          return (
            <path
              key={`fill-${zone}`}
              d={pathD}
              fill={fgColor(m, a)}
              clipPath={clipAttr}
            />
          )
        })}

        {/* ── Interactive zone fills ── */}
        {interactive && interactiveZones.map(zone => {
          const selectable = isSelectable(zone)
          const isSelected = selectedZone === zone
          const pathD = ZONE_PATHS[zone]
          if (!pathD) return null
          const clip = ZONE_CLIP[zone] ?? 'none'
          const clipAttr = getClipAttr(clip)
          const fill = interactiveFill(zone, selectable, isSelected)

          return (
            <path
              key={`interactive-${zone}`}
              d={pathD}
              fill={fill}
              clipPath={clipAttr}
              stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.15)'}
              strokeWidth={isSelected ? '2' : '0.5'}
              className={selectable ? 'cursor-pointer' : undefined}
              style={{ transition: 'fill 150ms ease' }}
              onClick={selectable ? () => onZoneClick?.(zone) : undefined}
              onMouseEnter={selectable ? (e) => {
                ;(e.currentTarget as SVGPathElement).style.filter = 'brightness(1.25)'
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

        {/* ── Court lines drawn over zone fills ── */}

        {/* 3-point corner vertical lines */}
        <line x1={CORNER_L_X} y1="0" x2={CORNER_L_X} y2={CORNER_Y}
          stroke="#ffffff" strokeWidth="2" />
        <line x1={CORNER_R_X} y1="0" x2={CORNER_R_X} y2={CORNER_Y}
          stroke="#ffffff" strokeWidth="2" />

        {/* 3-point arc */}
        <path
          d={`M ${CORNER_L_X},${CORNER_Y} A 238,238 0 0,1 ${CORNER_R_X},${CORNER_Y}`}
          fill="none" stroke="#ffffff" strokeWidth="2"
        />

        {/* Paint box (key) */}
        <rect x="170" y="0" width="160" height="190"
          fill="none" stroke="#ffffff" strokeWidth="2" />

        {/* Lane hash marks */}
        {([-80, 80] as const).map(offset => (
          <React.Fragment key={`hash-${offset}`}>
            <line x1={250 + offset} y1="120" x2={250 + offset} y2="132"
              stroke="#ffffff" strokeWidth="1.5" opacity="0.7" />
            <line x1={250 + offset} y1="153" x2={250 + offset} y2="165"
              stroke="#ffffff" strokeWidth="1.5" opacity="0.7" />
          </React.Fragment>
        ))}

        {/* FT circle — upper half dashed (inside paint) */}
        <path d="M 190,190 A 60,60 0 0,1 310,190"
          fill="none" stroke="#ffffff" strokeWidth="1.8" strokeDasharray="7 5" />
        {/* FT circle — lower half solid */}
        <path d="M 190,190 A 60,60 0 0,0 310,190"
          fill="none" stroke="#ffffff" strokeWidth="1.8" />

        {/* Restricted area arc */}
        <path d="M 210,52 A 40,40 0 0,1 290,52"
          fill="none" stroke="#ffffff" strokeWidth="1.8" />

        {/* Backboard */}
        <line x1="215" y1="30" x2="285" y2="30"
          stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" />

        {/* Basket pole */}
        <line x1="250" y1="30" x2="250" y2="40"
          stroke="#ffffff" strokeWidth="2" />

        {/* Basket rim */}
        <circle cx="250" cy="52" r="13"
          fill="none" stroke="#f97316" strokeWidth="2.5" />

        {/* ── Zone stat labels (display mode) ── */}
        {!interactive && displayZones.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          const pos = ZONE_LABEL_POS[zone]
          if (!pos) return null
          const [cx, cy] = pos

          if (a === 0) {
            return (
              <text key={`empty-${zone}`}
                x={cx} y={cy + 4}
                textAnchor="middle" fontSize="14" fill="rgba(30,20,10,0.45)"
                style={{ userSelect: 'none' }} aria-hidden="true">
                —
              </text>
            )
          }

          const pct = (m / a * 100).toFixed(1)

          return (
            <g key={`label-${zone}`} aria-hidden="true">
              <rect
                x={cx - 30} y={cy - 20}
                width="60" height="38"
                rx="5" ry="5"
                fill="rgba(15,15,15,0.80)"
              />
              <text
                x={cx} y={cy - 5}
                textAnchor="middle"
                fontSize="13" fontWeight="700"
                fill="#ffffff"
                style={{ userSelect: 'none' }}
              >
                {m}/{a}
              </text>
              <text
                x={cx} y={cy + 13}
                textAnchor="middle"
                fontSize="11" fontWeight="600"
                fill="#e2e8f0"
                style={{ userSelect: 'none' }}
              >
                {pct}%
              </text>
            </g>
          )
        })}

        {/* ── Zone name labels (interactive mode) ── */}
        {interactive && interactiveZones.map(zone => {
          const selectable = isSelectable(zone)
          if (!selectable) return null
          const pos = ZONE_LABEL_POS[zone]
          if (!pos) return null
          const [cx, cy] = pos
          const isSelected = selectedZone === zone

          return (
            <text key={`ilabel-${zone}`}
              x={cx} y={cy + 5}
              textAnchor="middle"
              fontSize="14" fontWeight="700"
              fill={isSelected ? '#ffffff' : 'rgba(255,255,255,0.88)'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {ZONE_SHORT[zone]}
            </text>
          )
        })}
      </svg>

      {/* Heat map legend */}
      {!interactive && (
        <div
          className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-3"
          aria-hidden="true"
        >
          {[
            { color: 'rgba(220,60,60,0.85)',   label: '<33%' },
            { color: 'rgba(220,130,60,0.85)',  label: '33–40%' },
            { color: 'rgba(200,180,50,0.85)',  label: '40–47%' },
            { color: 'rgba(60,180,80,0.85)',   label: '>47%' },
            { color: 'rgba(80,80,80,0.55)',    label: '기록없음' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] font-medium text-amber-900">
                {label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
