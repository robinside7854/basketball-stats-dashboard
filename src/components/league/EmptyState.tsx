'use client'
// 공통 빈 상태 컴포넌트 — 아이콘 + 제목 + 설명 + (편집 모드 시) CTA
// 첫 방문자에게 "여기서 뭘 해야 하는지" 를 안내하는 온보딩 역할.

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type EmptyStateProps = {
  Icon?: LucideIcon
  title: string
  description?: string
  /** 편집 모드에서만 노출되는 안내 문구 (예: "위 버튼으로 선수를 추가하세요") */
  editorHint?: string
  isEditMode?: boolean
  /** 편집 모드에서 노출되는 CTA 버튼 */
  cta?: {
    label: string
    onClick?: () => void
    href?: string
  }
  /** 추가 자식 (커스텀 액션 그룹 등) */
  children?: ReactNode
  /** 컨테이너 여백 조절 (기본: py-16) */
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASS: Record<NonNullable<EmptyStateProps['size']>, string> = {
  sm: 'py-8',
  md: 'py-16',
  lg: 'py-24',
}

export default function EmptyState({
  Icon,
  title,
  description,
  editorHint,
  isEditMode = false,
  cta,
  children,
  size = 'md',
}: EmptyStateProps) {
  return (
    <div className={`text-center ${SIZE_CLASS[size]} px-6 rounded-2xl border border-gray-800 bg-gray-900/40`}>
      {Icon && (
        <div className="flex justify-center mb-3">
          <Icon size={40} className="text-gray-600" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-base font-semibold text-gray-300">{title}</p>
      {description && <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto leading-relaxed">{description}</p>}
      {isEditMode && editorHint && (
        <p className="text-xs text-amber-400 mt-3 inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          {editorHint}
        </p>
      )}
      {isEditMode && cta && (
        <div className="mt-5">
          {cta.href ? (
            <a
              href={cta.href}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
            >
              {cta.label}
            </a>
          ) : (
            <button
              onClick={cta.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
            >
              {cta.label}
            </button>
          )}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
