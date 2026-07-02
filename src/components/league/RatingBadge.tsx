'use client'
import { TIER_COLORS, tierOf, type Tier } from '@/lib/rating/computeRating'

interface Props {
  ovr: number
  qualified?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tier?: Tier
  title?: string
}

/**
 * NBA 2K 스타일 OVR 뱃지 — 원형, 티어별 컬러, 4가지 크기.
 * qualified=false 면 '—' 로 표시.
 */
export default function RatingBadge({ ovr, qualified = true, size = 'md', tier, title }: Props) {
  const t = tier ?? tierOf(ovr, qualified)
  const c = TIER_COLORS[t]

  const sizeCls = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  }[size]

  return (
    <div
      title={title ?? `${t} · OVR ${ovr}`}
      className={`inline-flex flex-col items-center justify-center rounded-full border-2 font-black tabular-nums ${sizeCls} ${c.bg} ${c.text} ${c.border} shrink-0`}
      style={{ lineHeight: 1 }}
    >
      {qualified ? (
        <>
          <span>{ovr}</span>
          {(size === 'lg' || size === 'xl') && (
            <span className="text-[10px] font-jersey tracking-widest opacity-80 mt-0.5">OVR</span>
          )}
        </>
      ) : (
        <span className="opacity-50">—</span>
      )}
    </div>
  )
}
