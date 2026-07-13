'use client'
// LeagueGroupTabs — 상위 메뉴 통합(스탯 우산 / 아카이브 우산) 하위 페이지 상단에 표시하는 서브탭
// 부모가 usePathname / useSearchParams 등으로 active 판정을 수행해 각 탭의 active 를 전달한다.
// 스타일: mm-* 팔레트 · font-jersey · 밑줄 액센트 · 44px 터치 타겟
import Link from 'next/link'

export type LeagueGroupTab = { href: string; label: string; active: boolean }

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
            <Link
              key={t.href}
              href={t.href}
              role="tab"
              aria-selected={active}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 px-3.5 py-2.5 lg:px-5 lg:py-3 -mb-px border-b-2 font-jersey font-black uppercase tracking-[0.10em] text-sm lg:text-[15px] min-h-[44px] flex items-center transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 ${
                active
                  ? 'border-[color:var(--mm-yellow)] text-[color:var(--mm-ink)]'
                  : 'border-transparent text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)]'
              }`}
            >
              {t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
