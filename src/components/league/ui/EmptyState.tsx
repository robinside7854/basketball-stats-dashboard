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
  title, description, action, variant = 'default', framed = false, className = '',
}: Props) {
  const compact = variant === 'compact'
  return (
    <div
      role="status"
      className={`flex flex-col items-center text-center px-4 ${compact ? 'py-8 gap-1.5' : 'py-16 gap-2'} ${className}`}
      style={framed ? { border: '1px dashed var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' } : undefined}
    >
      {/* 빈 골대 그림(2026-11-27 운영진 「우드톤」 농구 소품) — 화면마다 고른 아이콘 대신 늘 같은 골대 */}
      <Hoop size={compact ? 30 : 44} />
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

function Hoop({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden className="mb-1" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="4" width="32" height="20" rx="2" stroke="var(--mm-muted)" strokeWidth="2" />
      <rect x="18" y="12" width="12" height="9" stroke="var(--mm-muted)" strokeWidth="1.6" />
      <path d="M14 25h20" stroke="#F08A24" strokeWidth="2.6" />
      <path d="M15.5 25l3 14M32.5 25l-3 14M19 25l3.5 14M29 25l-3.5 14M24 25v14M17 31h14M18.5 37h11" stroke="var(--mm-muted)" strokeWidth="1.2" />
    </svg>
  )
}
