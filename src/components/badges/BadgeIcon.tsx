'use client'
import {
  Flame, Target, Zap, Clock, Swords, Crosshair, Star, Snowflake,
  Sparkles, Shield, Bird, ShieldCheck, Handshake, ArrowUpRight,
  Crown, ArrowRight, Wrench,
} from 'lucide-react'
import type { BadgeTier } from '@/lib/stats/badges'
import type { LucideIcon } from 'lucide-react'

export const BADGE_ICONS: Record<string, LucideIcon> = {
  PAINT_BUSTER:     Swords,
  GLASS_EATER:      Zap,
  FINISHER:         Flame,
  CLUTCH_Q4:        Clock,
  SCORING_MACHINE:  Flame,
  JUNG_DAEMAN:      Crosshair,
  DONG_HO_CURRY:    Star,
  ICE_VEINS:        Snowflake,
  MID_MAESTRO:      Target,
  EFFICIENCY_GOD:   Sparkles,
  GLASS_CLEANER:    Shield,
  PICKPOCKET:       Bird,
  SHOT_BLOCKER:     ShieldCheck,
  HUSTLE_KING:      Zap,
  CLEAN_HANDS:      Handshake,
  KICKOUT:          ArrowUpRight,
  FLOOR_GENERAL:    Crown,
  POCKET_PASSER:    ArrowRight,
  ALL_ROUNDER:      Wrench,
}

export const TIER_STYLES: Record<NonNullable<BadgeTier>, {
  outer: string; inner: string; iconColor: string; label: string; labelColor: string; glow: string
}> = {
  gold: {
    outer: 'bg-gradient-to-br from-amber-400 to-yellow-700 ring-2 ring-amber-300/60',
    inner: 'bg-gradient-to-br from-amber-900/80 to-yellow-900/80',
    iconColor: '#FDE68A',
    label: 'GOLD', labelColor: 'text-amber-300',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.6)]',
  },
  silver: {
    outer: 'bg-gradient-to-br from-slate-300 to-slate-600 ring-2 ring-slate-300/50',
    inner: 'bg-gradient-to-br from-slate-800/80 to-slate-700/80',
    iconColor: '#E2E8F0',
    label: 'SILVER', labelColor: 'text-slate-300',
    glow: 'shadow-[0_0_10px_rgba(148,163,184,0.5)]',
  },
  bronze: {
    outer: 'bg-gradient-to-br from-orange-500 to-orange-800 ring-2 ring-orange-500/50',
    inner: 'bg-gradient-to-br from-orange-950/80 to-orange-900/80',
    iconColor: '#FED7AA',
    label: 'BRONZE', labelColor: 'text-orange-300',
    glow: 'shadow-[0_0_8px_rgba(194,119,58,0.4)]',
  },
}

interface Props {
  code: string
  tier: BadgeTier
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const SIZE_MAP = {
  sm: { wrap: 'w-8 h-8',   iconSize: 12 },
  md: { wrap: 'w-11 h-11', iconSize: 16 },
  lg: { wrap: 'w-14 h-14', iconSize: 22 },
}

export default function BadgeIcon({ code, tier, size = 'md', showLabel = false }: Props) {
  const Icon = BADGE_ICONS[code] ?? Target
  const s = SIZE_MAP[size]

  if (!tier) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className={`relative ${s.wrap} hexagon bg-gray-800/60 ring-1 ring-gray-700/40 flex items-center justify-center`}>
          <Icon size={s.iconSize} className="text-gray-600 opacity-40" />
        </div>
      </div>
    )
  }

  const ts = TIER_STYLES[tier]
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className={`relative ${s.wrap} hexagon ${ts.outer} ${ts.glow} flex items-center justify-center transition-transform hover:scale-110`}>
        <div className={`absolute inset-[2px] hexagon ${ts.inner} flex items-center justify-center`}>
          <Icon size={s.iconSize} style={{ color: ts.iconColor }} />
        </div>
      </div>
      {showLabel && <span className={`text-[9px] font-bold tracking-wider ${ts.labelColor}`}>{ts.label}</span>}
    </div>
  )
}

export type { BadgeTier }
