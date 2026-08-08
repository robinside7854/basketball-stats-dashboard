'use client'
import { usePathname, useParams } from 'next/navigation'
import Link from 'next/link'

// 선수 명단(/roster)·팀 순위(/teams)는 스탯 우산으로 옮겨졌다(2026-08-08, stats-umbrella-move).
// 박스스코어 목록(/boxscore 인덱스)은 2026-08-09 '일정' 으로 통합 흡수됐다 — 완료 경기만 보여주는
// '일정'의 부분집합이었다(둘 다 날짜 목록 + 분기 필터 → /boxscore/[date]). 라벨도 '일정' → '일정·결과'
// 로 바꿨다 — 이 탭이 지난 경기 결과 조회까지 겸하는데 '일정'만 보면 지난 경기를 다시 찾을 때
// 안 눌러볼 수 있어서다. /boxscore 경로 자체는 리다이렉트로 남아 있다(boxscore/page.tsx).
const GROUPS: Record<string, { seg: string; label: string }[]> = {
  games: [
    { seg: 'schedule', label: '일정·결과' },
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
          // /boxscore/[date](박스스코어 상세)는 흡수된 목록의 목적지라 '일정·결과' 탭 소속으로
          // 계속 하이라이트한다 — 안 그러면 상세 화면에서 서브탭 바에 켜진 항목이 하나도 없어진다.
          const active = t.seg === 'schedule'
            ? pathname.startsWith(href) || pathname.startsWith(`${base}/boxscore`)
            : pathname.startsWith(href)
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
