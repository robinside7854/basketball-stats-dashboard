// 카드(SectionCard pad="none") 맨 위의 제목 줄 — 가독성 정리(2026-10-13).
// 「배경 위에 글자가 그냥 떠 있다」는 피드백: 섹션 제목·설명을 카드 밖에 두지 않고 카드 안 첫 줄로 넣는다.
// 패딩은 SectionCard 의 base 와 같다(모바일 px-4 · PC px-6). 아래 1px rule 로 본문과 나눈다.
import type { ReactNode } from 'react'

interface Props {
  title: ReactNode
  /** 제목 아래 보조 설명 — 부가 정보라 muted */
  description?: ReactNode
  /** 제목 앞 아이콘 */
  icon?: ReactNode
  /** 오른쪽 끝(모바일은 줄바꿈) — 토글·개수 등 */
  actions?: ReactNode
  /** 제목 태그 — 페이지 제목(h2) 아래 섹션이면 h3 */
  as?: 'h2' | 'h3' | 'h4'
  /** 제목 id (aria-labelledby 용) */
  id?: string
  /** 아래 구분선 — 본문이 바로 이어지는 표·목록이면 true(기본) */
  divider?: boolean
  className?: string
}

export default function SectionHeader({
  title, description, icon, actions, as: Tag = 'h3', id, divider = true, className = '',
}: Props) {
  return (
    <div
      className={`px-4 py-3 lg:px-6 lg:py-4 flex items-center justify-between gap-x-3 gap-y-2 flex-wrap ${className}`}
      style={divider ? { borderBottom: '1px solid var(--mm-rule)' } : undefined}
    >
      <div className="min-w-0">
        <Tag id={id} className="flex items-center gap-2 font-black text-lg lg:text-xl break-keep" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.015em', lineHeight: 1.25 }}>
          {icon && <span aria-hidden className="shrink-0 inline-flex" style={{ color: 'var(--mm-ink-soft)' }}>{icon}</span>}
          {title}
        </Tag>
        {description && (
          <p className="text-xs lg:text-sm mt-1 break-keep" style={{ color: 'var(--mm-muted)', lineHeight: 1.45 }}>{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
