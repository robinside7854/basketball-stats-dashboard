'use client'
// LeagueGroupTabs — 상위 메뉴 통합(스탯 우산 / 아카이브 우산) 하위 페이지 상단에 표시하는 서브탭
// 부모가 usePathname / useSearchParams 등으로 active 판정을 수행해 각 탭의 active 를 전달한다.
// 스타일: mm-* 팔레트 · font-jersey · 밑줄 액센트 · 44px 터치 타겟
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

// external — 같은 바 안에 있지만 실제로는 "옆 페이지로 나가는" 탭(예: 스탯 우산의 어워즈).
// 뒤로가기 동작이 나머지 탭(쿼리 파라미터로 페이지 내부 상태만 바꾸는 탭)과 다르므로,
// 구분선 + 화살표 아이콘으로 그 차이를 시각적으로 미리 알려 기대 불일치를 없앤다.
// (2026-08-07 IA 정리 2-B — 완전한 URL 방식 통일은 이월)
export type LeagueGroupTab = { href: string; label: string; active: boolean; external?: boolean }

export default function LeagueGroupTabs({ tabs }: { tabs: LeagueGroupTab[] }) {
  return (
    <div
      className="mb-4 lg:mb-5 -mx-2 sm:mx-0 overflow-x-auto scrollbar-hide"
      style={{ borderBottom: '1px solid var(--mm-rule)' }}
      role="tablist"
      aria-label="섹션 서브 메뉴"
    >
      <div className="flex items-center gap-1 px-2 sm:px-0 whitespace-nowrap">
        {tabs.map(t => {
          const active = t.active
          return (
            <span key={t.href} className="flex items-center shrink-0">
              {t.external && (
                <span aria-hidden className="mx-1.5 h-5 w-px shrink-0" style={{ background: 'var(--mm-rule)' }} />
              )}
              <Link
                href={t.href}
                role="tab"
                aria-selected={active}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 px-3.5 py-2.5 lg:px-5 lg:py-3 -mb-px border-b-2 font-bold text-sm lg:text-[15px] min-h-[44px] flex items-center gap-1 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1 ${
                  active
                    ? 'border-[color:var(--color-hoop-orange-500)] text-[color:var(--mm-ink)]'
                    : 'border-transparent text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)]'
                }`}
              >
                {t.label}
                {t.external && <ArrowUpRight size={14} aria-hidden />}
              </Link>
            </span>
          )
        })}
      </div>
    </div>
  )
}
