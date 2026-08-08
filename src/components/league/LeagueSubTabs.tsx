'use client'
import { usePathname, useParams } from 'next/navigation'
import Link from 'next/link'

// 선수 명단(/roster)·팀 순위(/teams)는 스탯 우산으로 옮겨졌다(2026-08-08, stats-umbrella-move).
// games 그룹은 원래대로 경기 3개만 — LeagueGroupTabs(스탯 우산)와 역할이 겹치지 않는다.
const GROUPS: Record<string, { seg: string; label: string }[]> = {
  games: [
    { seg: 'schedule', label: '일정' },
    { seg: 'boxscore', label: '박스스코어' },
    { seg: 'record', label: '경기 기록' },
  ],
}

export default function LeagueSubTabs({ group }: { group: 'games' }) {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const pathname = usePathname()
  // 미들웨어가 slug→UUID 로 rewrite 하므로 params.leagueId 는 UUID 지만 pathname 은 slug URL.
  // base 를 pathname 에서 뽑아 href·활성판정을 slug 기준으로 일치시킨다 (안 그러면 startsWith 가 항상 false).
  const seg = pathname.split('/')
  const base = (seg[1] === 'league' && seg[2] && seg[3])
    ? `/${seg[1]}/${seg[2]}/${seg[3]}`
    : `/league/${params.orgSlug}/${params.leagueId}`
  const items = GROUPS[group]

  return (
    <nav
      className="mb-4 -mx-2 sm:mx-0 overflow-x-auto scrollbar-hide border-b border-[color:var(--mm-rule)]"
      aria-label="경기 서브 메뉴"
    >
      <div className="flex items-center gap-1 px-2 sm:px-0 whitespace-nowrap">
        {items.map(t => {
          const href = `${base}/${t.seg}`
          const active = pathname.startsWith(href)
          return (
            <Link key={t.seg} href={href}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 min-h-[44px] flex items-center px-4 lg:px-5 text-sm lg:text-base border-b-2 -mb-px transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1 ${
                active
                  ? 'border-[color:var(--color-hoop-orange-500)] text-[color:var(--mm-ink)] font-bold'
                  : 'border-transparent text-[color:var(--mm-muted)] font-medium hover:text-[color:var(--mm-ink)]'
              }`}>
              {t.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
