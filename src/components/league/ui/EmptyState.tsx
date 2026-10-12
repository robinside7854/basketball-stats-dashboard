// 빈 상태 — 아이콘 + 한 줄 제목 + (설명) + (행동) (리뉴얼 1단계, 2026-10-12).
//
// 배경: 회원 화면의 「~가 없습니다」가 화면마다 손으로 그려져 아이콘 유무·여백(py-10/12/16)·
//   글자 크기가 제각각이었다. 비어 있다는 사실은 같은 모양으로 알려야 "고장"이 아니라
//   "아직 없음"으로 읽힌다.
// ⚠ `components/league/EmptyState.tsx`(편집 모드 CTA 를 가진 카드형)와는 별개다 — 그쪽은
//   운영자 안내(editorHint)를 품은 온보딩 카드이고, 여기는 회원 화면 안쪽의 가벼운 빈칸이다.
//   운영 화면은 그쪽을 그대로 쓴다.
//
// variant
//   · default — 탭/섹션 전체가 빈 경우(py-16, 아이콘 28)
//   · compact — 카드 안 한 구획이 빈 경우(py-8, 아이콘 22)
// framed=true 면 점선 테두리 상자 — 주변이 카드가 아닐 때 빈칸의 경계를 보여 준다.

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  /** 버튼·링크 등 — 호출부가 그대로 그린다 */
  action?: ReactNode
  variant?: 'default' | 'compact'
  framed?: boolean
  className?: string
}

export default function EmptyState({
  icon: Icon, title, description, action, variant = 'default', framed = false, className = '',
}: Props) {
  const compact = variant === 'compact'
  return (
    <div
      role="status"
      className={`flex flex-col items-center text-center px-4 ${compact ? 'py-8 gap-1.5' : 'py-16 gap-2'} ${className}`}
      style={framed ? { border: '1px dashed var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' } : undefined}
    >
      {Icon && (
        <Icon
          size={compact ? 22 : 28}
          strokeWidth={1.75}
          aria-hidden
          className={compact ? 'mb-0.5' : 'mb-1'}
          style={{ color: 'var(--mm-muted)' }}
        />
      )}
      <p className={`${compact ? 'text-sm' : 'text-base'} font-semibold break-keep`} style={{ color: 'var(--mm-ink-soft)' }}>
        {title}
      </p>
      {description && (
        <p className="text-xs leading-relaxed max-w-sm break-keep" style={{ color: 'var(--mm-muted)' }}>
          {description}
        </p>
      )}
      {action && <div className={compact ? 'mt-2' : 'mt-3'}>{action}</div>}
    </div>
  )
}
