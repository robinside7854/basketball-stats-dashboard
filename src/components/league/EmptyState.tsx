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
  // 브랜드 토큰 사용 (2026-07-27) — 하드코딩 gray 제거: 라이트 모드에서 이 카드만 어두워지던 이질 해소.
  const ctaClass = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 transition-all cursor-pointer'
  return (
    <div className={`text-center ${SIZE_CLASS[size]} px-6 rounded-2xl border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel-alt)]`}>
      {Icon && (
        <div className="flex justify-center mb-3">
          <Icon size={40} className="text-[color:var(--mm-muted)]" strokeWidth={1.5} />
        </div>
      )}
      <p className="text-base font-semibold text-[color:var(--mm-ink)]">{title}</p>
      {description && <p className="text-sm text-[color:var(--mm-muted)] mt-1.5 max-w-md mx-auto leading-relaxed">{description}</p>}
      {isEditMode && editorHint && (
        <p className="text-xs text-[color:var(--mm-muted)] mt-3 inline-flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[color:var(--mm-muted)] animate-pulse" />
          {editorHint}
        </p>
      )}
      {isEditMode && cta && (
        <div className="mt-5">
          {cta.href ? (
            <a href={cta.href} className={ctaClass}>{cta.label}</a>
          ) : (
            <button onClick={cta.onClick} className={ctaClass}>{cta.label}</button>
          )}
        </div>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
