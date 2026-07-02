'use client'
import { ovrStyle } from '@/lib/rating/computeRating'

interface Props {
  ovr: number
  qualified?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  title?: string
}

/**
 * OVR 뱃지 — 원형, 값 gradient 컬러, 4가지 크기.
 * qualified=false 면 '—' 로 표시.
 * (티어 개념 제거 — 색상은 OVR 값에 따른 연속 gradient)
 */
export default function RatingBadge({ ovr, qualified = true, size = 'md', title }: Props) {
  const c = ovrStyle(ovr, qualified)

  const sizeCls = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-16 h-16 text-xl',
    xl: 'w-24 h-24 text-3xl',
  }[size]

  return (
    <div
      title={title ?? (qualified ? `OVR ${ovr}` : '경기 데이터 없음')}
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
