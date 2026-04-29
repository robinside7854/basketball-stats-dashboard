'use client'
// NBA.com style shot chart. viewBox 500×470, basket (250,53), arc r=238.
// Zones: pie-slice geometry from basket outward, clipped to exclude paint for mid zones.
import React, { useState } from 'react'

interface Props {
  zoneStats: Record<string, { m: number; a: number }>
  interactive?: boolean
  selectedZone?: string | null
  onZoneClick?: (zone: string) => void
  width?: number
  shotType?: string
}

const ZONE_PATHS: Record<string, string> = {
  // Paint: the key rectangle
  paint: 'M 170,0 L 330,0 L 330,200 L 170,200 Z',

  // Mid zones: pie slices from basket to arc
  // (paint exclusion handled via clipPath)
  mid_baseline_l: 'M 250,53 L 30,144 A 238,238 0 0,1 82,221 Z',
  mid_elbow_l:    'M 250,53 L 82,221 A 238,238 0 0,1 161,274 Z',
  mid_top:        'M 250,53 L 161,274 A 238,238 0 0,1 339,274 Z',
  mid_elbow_r:    'M 250,53 L 339,274 A 238,238 0 0,1 418,221 Z',
  mid_baseline_r: 'M 250,53 L 418,221 A 238,238 0 0,1 470,144 Z',

  // 3pt zones: outside the arc
  '3p_corner_l': 'M 0,0 L 30,0 L 30,144 L 0,144 Z',
  '3p_wing_l':   'M 0,144 L 30,144 A 238,238 0 0,1 82,221 L 82,470 L 0,470 Z',
  '3p_top':      'M 82,221 A 238,238 0 0,1 418,221 L 418,470 L 82,470 Z',
  '3p_wing_r':   'M 418,221 A 238,238 0 0,1 470,144 L 500,144 L 500,470 L 418,470 Z',
  '3p_corner_r': 'M 470,0 L 500,0 L 500,144 L 470,144 Z',
}

const ZONE_CENTERS: Record<string, [number, number]> = {
  paint:          [250, 115],
  mid_baseline_l: [ 80,  75],
  mid_elbow_l:    [105, 210],
  mid_top:        [250, 255],
  mid_elbow_r:    [395, 210],
  mid_baseline_r: [420,  75],
  '3p_corner_l':  [ 15,  72],
  '3p_wing_l':    [ 38, 320],
  '3p_top':       [250, 390],
  '3p_wing_r':    [462, 320],
  '3p_corner_r':  [485,  72],
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

const MID_ZONES = new Set(['mid_baseline_l', 'mid_elbow_l', 'mid_top', 'mid_elbow_r', 'mid_baseline_r'])
const THREE_ZONES = new Set(['3p_corner_l', '3p_wing_l', '3p_top', '3p_wing_r', '3p_corner_r'])

function heatColor(m: number, a: number): string {
  if (a === 0) return 'rgba(100,100,100,0.25)'
  const p = m / a
  if (p < 0.33) return 'rgba(210,50,50,0.72)'
  if (p < 0.40) return 'rgba(210,120,50,0.72)'
  if (p < 0.47) return 'rgba(190,170,40,0.72)'
  return 'rgba(50,170,80,0.72)'
}

export default function HalfCourtShotChart({
  zoneStats,
  interactive = false,
  selectedZone,
  onZoneClick,
  width = 300,
  shotType,
}: Props) {
  const [hoveredZone, setHoveredZone] = useState<string | null>(null)

  const scale = (width ?? 300) / 500
  const svgHeight = Math.round((width ?? 300) * 470 / 500)

  function isSelectable(zone: string): boolean {
    if (!interactive) return false
    if (zone === 'paint') return false
    if (!shotType) return true
    if (shotType === 'shot_2p_mid') return MID_ZONES.has(zone)
    if (shotType === 'shot_3p') return THREE_ZONES.has(zone)
    return false
  }

  function getInteractiveFill(zone: string): string {
    const selectable = isSelectable(zone)
    const isSelected = selectedZone === zone
    const isHovered = hoveredZone === zone

    if (zone === 'paint') return 'rgba(80,80,80,0.25)'

    if (shotType === 'shot_2p_mid') {
      if (THREE_ZONES.has(zone)) return 'rgba(80,80,80,0.25)'
      if (isSelected) return 'rgba(251,191,36,0.92)'
      if (isHovered && selectable) return 'rgba(251,191,36,0.85)'
      return 'rgba(251,191,36,0.7)'
    }
    if (shotType === 'shot_3p') {
      if (MID_ZONES.has(zone)) return 'rgba(80,80,80,0.25)'
      if (isSelected) return 'rgba(59,130,246,0.92)'
      if (isHovered && selectable) return 'rgba(59,130,246,0.85)'
      return 'rgba(59,130,246,0.7)'
    }

    // no shotType: all selectable mid = amber, 3p = blue
    if (MID_ZONES.has(zone)) {
      if (isSelected) return 'rgba(251,191,36,0.92)'
      if (isHovered) return 'rgba(251,191,36,0.85)'
      return 'rgba(251,191,36,0.7)'
    }
    if (THREE_ZONES.has(zone)) {
      if (isSelected) return 'rgba(59,130,246,0.92)'
      if (isHovered) return 'rgba(59,130,246,0.85)'
      return 'rgba(59,130,246,0.7)'
    }
    return 'rgba(80,80,80,0.25)'
  }

  const allZones = Object.keys(ZONE_PATHS)
  const midZoneKeys = ['mid_baseline_l', 'mid_elbow_l', 'mid_top', 'mid_elbow_r', 'mid_baseline_r']
  const threePtZoneKeys = ['3p_corner_l', '3p_wing_l', '3p_top', '3p_wing_r', '3p_corner_r']
  const interactiveZoneKeys = [...midZoneKeys, ...threePtZoneKeys]

  return (
    <svg
      width={width}
      height={svgHeight}
      style={{ display: 'block' }}
      aria-label="슛 차트"
    >
      <g transform={`scale(${scale})`}>
        <defs>
          {/* clipPath: full viewBox minus paint rectangle (evenodd rule excludes paint area) */}
          <clipPath id="excludePaintClip">
            <path
              fillRule="evenodd"
              d="M 0,0 L 500,0 L 500,470 L 0,470 Z M 170,0 L 330,0 L 330,200 L 170,200 Z"
            />
          </clipPath>
        </defs>

        {/* Wooden court background */}
        <rect
          x="0" y="0" width="500" height="470"
          rx="14" ry="14"
          fill="#c8a060"
        />

        {/* Wood grain lines */}
        {Array.from({ length: 28 }, (_, i) => (
          <line
            key={`grain-a-${i}`}
            x1="0" y1={i * 17}
            x2="500" y2={i * 17 + 4}
            stroke="#b8924a" strokeWidth="0.6" opacity="0.28"
          />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <line
            key={`grain-b-${i}`}
            x1="0" y1={i * 34 + 8}
            x2="500" y2={i * 34 + 12}
            stroke="#a07838" strokeWidth="0.4" opacity="0.18"
          />
        ))}

        {/* ── DISPLAY MODE: heat map fills ── */}
        {!interactive && (
          <>
            {/* 3pt zone fills (no clip needed) */}
            {threePtZoneKeys.map(zone => {
              const stat = zoneStats[zone]
              const a = stat?.a ?? 0
              const m = stat?.m ?? 0
              return (
                <path
                  key={`fill-${zone}`}
                  d={ZONE_PATHS[zone]}
                  fill={heatColor(m, a)}
                />
              )
            })}

            {/* Mid zone fills clipped to exclude paint */}
            <g clipPath="url(#excludePaintClip)">
              {midZoneKeys.map(zone => {
                const stat = zoneStats[zone]
                const a = stat?.a ?? 0
                const m = stat?.m ?? 0
                return (
                  <path
                    key={`fill-${zone}`}
                    d={ZONE_PATHS[zone]}
                    fill={heatColor(m, a)}
                  />
                )
              })}
            </g>

            {/* Paint fill rendered on top */}
            {(() => {
              const stat = zoneStats['paint']
              const a = stat?.a ?? 0
              const m = stat?.m ?? 0
              return (
                <path
                  key="fill-paint"
                  d={ZONE_PATHS['paint']}
                  fill={heatColor(m, a)}
                />
              )
            })()}
          </>
        )}

        {/* ── INTERACTIVE MODE: zone fills ── */}
        {interactive && (
          <>
            {interactiveZoneKeys.map(zone => {
              const selectable = isSelectable(zone)
              const isSelected = selectedZone === zone
              const fill = getInteractiveFill(zone)
              const d = MID_ZONES.has(zone)
                ? undefined  // mid zones rendered inside clipPath group below
                : ZONE_PATHS[zone]

              if (MID_ZONES.has(zone)) return null

              return (
                <path
                  key={`interactive-${zone}`}
                  d={ZONE_PATHS[zone]}
                  fill={fill}
                  stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.15)'}
                  strokeWidth={isSelected ? '3' : '0.5'}
                  className={selectable ? 'cursor-pointer' : undefined}
                  style={{ transition: 'fill 150ms ease' }}
                  onClick={selectable ? () => onZoneClick?.(zone) : undefined}
                  onMouseEnter={selectable ? () => setHoveredZone(zone) : undefined}
                  onMouseLeave={selectable ? () => setHoveredZone(null) : undefined}
                  role={selectable ? 'button' : undefined}
                  aria-label={selectable ? `${ZONE_SHORT[zone]} 선택` : undefined}
                  aria-pressed={selectable ? isSelected : undefined}
                />
              )
            })}

            {/* Mid zones clipped to exclude paint */}
            <g clipPath="url(#excludePaintClip)">
              {midZoneKeys.map(zone => {
                const selectable = isSelectable(zone)
                const isSelected = selectedZone === zone
                const fill = getInteractiveFill(zone)
                return (
                  <path
                    key={`interactive-${zone}`}
                    d={ZONE_PATHS[zone]}
                    fill={fill}
                    stroke={isSelected ? '#ffffff' : 'rgba(255,255,255,0.15)'}
                    strokeWidth={isSelected ? '3' : '0.5'}
                    className={selectable ? 'cursor-pointer' : undefined}
                    style={{ transition: 'fill 150ms ease' }}
                    onClick={selectable ? () => onZoneClick?.(zone) : undefined}
                    onMouseEnter={selectable ? () => setHoveredZone(zone) : undefined}
                    onMouseLeave={selectable ? () => setHoveredZone(null) : undefined}
                    role={selectable ? 'button' : undefined}
                    aria-label={selectable ? `${ZONE_SHORT[zone]} 선택` : undefined}
                    aria-pressed={selectable ? isSelected : undefined}
                  />
                )
              })}
            </g>

            {/* Paint zone: always dimmed in interactive */}
            <path
              d={ZONE_PATHS['paint']}
              fill="rgba(80,80,80,0.25)"
            />
          </>
        )}

        {/* ── Court lines drawn OVER zone fills ── */}

        {/* Paint rect border */}
        <rect
          x="170" y="0" width="160" height="200"
          fill="none" stroke="white" strokeWidth="2"
        />

        {/* FT line */}
        <line x1="170" y1="200" x2="330" y2="200" stroke="white" strokeWidth="2" />

        {/* FT circle upper half (dashed arc toward basket) */}
        <path
          d="M 190,200 A 60,60 0 0,1 310,200"
          stroke="white" strokeWidth="2" fill="none"
          strokeDasharray="6 4"
        />

        {/* 3pt arc */}
        <path
          d="M 30,144 A 238,238 0 0,1 470,144"
          stroke="white" strokeWidth="2.5" fill="none"
        />

        {/* Corner lines */}
        <line x1="30" y1="0" x2="30" y2="144" stroke="white" strokeWidth="2.5" />
        <line x1="470" y1="0" x2="470" y2="144" stroke="white" strokeWidth="2.5" />

        {/* Restricted area (lower half arc going away from basket) */}
        <path
          d="M 210,53 A 40,40 0 0,1 290,53"
          stroke="white" strokeWidth="1.5" fill="none"
        />

        {/* Lane hash marks */}
        <line x1="158" y1="120" x2="170" y2="120" stroke="white" strokeWidth="1.5" />
        <line x1="330" y1="120" x2="342" y2="120" stroke="white" strokeWidth="1.5" />
        <line x1="158" y1="155" x2="170" y2="155" stroke="white" strokeWidth="1.5" />
        <line x1="330" y1="155" x2="342" y2="155" stroke="white" strokeWidth="1.5" />

        {/* Backboard */}
        <line x1="228" y1="28" x2="272" y2="28" stroke="white" strokeWidth="4" strokeLinecap="round" />

        {/* Basket pole */}
        <line x1="250" y1="28" x2="250" y2="40" stroke="white" strokeWidth="2" />

        {/* Basket rim */}
        <circle cx="250" cy="53" r="13" fill="none" stroke="#f97316" strokeWidth="3" />

        {/* ── Zone stat labels (display mode only) ── */}
        {!interactive && allZones.map(zone => {
          const stat = zoneStats[zone]
          const a = stat?.a ?? 0
          const m = stat?.m ?? 0
          const pos = ZONE_CENTERS[zone]
          if (!pos) return null
          const [cx, cy] = pos

          if (a === 0) return null

          const pct = (m / a * 100).toFixed(0)

          return (
            <g key={`label-${zone}`} transform={`translate(${cx}, ${cy})`} aria-hidden="true">
              <rect x="-26" y="-20" width="52" height="40" rx="4" fill="rgba(15,15,15,0.78)" />
              <text
                x="0" y="-5"
                textAnchor="middle"
                fill="white"
                fontSize="11"
                fontWeight="700"
                fontFamily="monospace"
                style={{ userSelect: 'none' }}
              >
                {m}/{a}
              </text>
              <text
                x="0" y="13"
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontFamily="monospace"
                style={{ userSelect: 'none' }}
              >
                {pct}%
              </text>
            </g>
          )
        })}

        {/* ── Zone name labels (interactive mode, selectable zones only) ── */}
        {interactive && interactiveZoneKeys.map(zone => {
          const selectable = isSelectable(zone)
          if (!selectable) return null
          const pos = ZONE_CENTERS[zone]
          if (!pos) return null
          const [cx, cy] = pos
          const isSelected = selectedZone === zone

          return (
            <text
              key={`ilabel-${zone}`}
              x={cx} y={cy + 5}
              textAnchor="middle"
              fontSize="13"
              fontWeight="700"
              fill={isSelected ? '#ffffff' : 'rgba(255,255,255,0.88)'}
              style={{ userSelect: 'none', pointerEvents: 'none' }}
              aria-hidden="true"
            >
              {ZONE_SHORT[zone]}
            </text>
          )
        })}

        {/* ── Legend (display mode only) ── */}
        {!interactive && (
          <g transform="translate(10, 445)">
            {[
              { color: 'rgba(210,50,50,0.8)',   label: '<33%' },
              { color: 'rgba(210,120,50,0.8)',  label: '33-40%' },
              { color: 'rgba(190,170,40,0.8)',  label: '40-47%' },
              { color: 'rgba(50,170,80,0.8)',   label: '>47%' },
              { color: 'rgba(100,100,100,0.4)', label: '기록없음' },
            ].map(({ color, label }, i) => (
              <g key={i} transform={`translate(${i * 88}, 0)`}>
                <circle r="7" cx="7" cy="0" fill={color} />
                <text x="19" y="4" fontSize="11" fill="#5a4000" fontFamily="sans-serif">
                  {label}
                </text>
              </g>
            ))}
          </g>
        )}
      </g>
    </svg>
  )
}
