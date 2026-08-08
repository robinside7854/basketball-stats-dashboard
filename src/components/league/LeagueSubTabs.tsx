'use client'
import { usePathname, useParams } from 'next/navigation'
import Link from 'next/link'

// squad(선수 명단·팀 구성) 그룹은 '팀/경기' 우산으로 흡수됐다(Task 1-B, 2026-08-08).
// games 5개가 좁은 화면에서 넘치므로 가로 스크롤 컨테이너로 감싼다 — 페이지 본문은 그대로 두고
// 이 탭 바 안에서만 스크롤되게 한다(LeagueGroupTabs 와 동일 패턴).
const GROUPS: Record<string, { seg: string; label: string }[]> = {
  games: [
    { seg: 'schedule', label: '일정' },
    { seg: 'boxscore', label: '박스스코어' },
    { seg: 'record', label: '경기 기록' },
    { seg: 'roster', label: '팀 명단' },
    { seg: 'teams', label: '팀 구성' },
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
    <div
      className="mb-4 -mx-2 sm:mx-0 overflow-x-auto scrollbar-hide border-b border-[color:var(--mm-rule)]"
      role="tablist"
      aria-label="팀/경기 서브 메뉴"
    >
      <div className="flex items-center gap-1 px-2 sm:px-0 whitespace-nowrap">
        {items.map(t => {
          const href = `${base}/${t.seg}`
          const active = pathname.startsWith(href)
          return (
            <Link key={t.seg} href={href}
              role="tab"
              aria-selected={active}
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
    </div>
  )
}
