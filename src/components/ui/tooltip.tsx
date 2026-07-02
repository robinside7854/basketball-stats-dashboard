'use client'
import * as React from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'
import { cn } from '@/lib/utils'

/**
 * 얇은 base-ui Tooltip 래퍼.
 *
 * 사용 예:
 *   <Tooltip content="진실 야투율 · PTS / (2 × (FGA + 0.44 × FTA))">
 *     <span className="cursor-help underline decoration-dotted">TS%</span>
 *   </Tooltip>
 *
 * 앱 최상위(layout)에 <TooltipProvider>가 있어야 함.
 */
export const TooltipProvider = TooltipPrimitive.Provider

interface Props {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delay?: number
  className?: string
}

export function Tooltip({ content, children, side = 'top', align = 'center', delay, className }: Props) {
  void delay  // Provider 에서 관리
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        render={(props: React.HTMLAttributes<HTMLSpanElement>) => (
          <span {...props}>{children}</span>
        )}
      />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={side} align={align} sideOffset={6}>
          <TooltipPrimitive.Popup
            className={cn(
              'z-50 max-w-xs rounded-lg border border-gray-700 bg-gray-900/95 backdrop-blur px-3 py-2 text-xs text-gray-100 shadow-lg',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
              className,
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-gray-900 stroke-gray-700" />
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
