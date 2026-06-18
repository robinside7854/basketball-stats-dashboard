'use client'
import { usePathname, useParams } from 'next/navigation'
import Link from 'next/link'

const GROUPS: Record<string, { seg: string; label: string }[]> = {
  squad: [
    { seg: 'roster', label: '선수 명단' },
    { seg: 'teams', label: '팀 구성' },
  ],
  games: [
    { seg: 'schedule', label: '일정' },
    { seg: 'record', label: '경기 기록' },
  ],
}

export default function LeagueSubTabs({ group }: { group: 'squad' | 'games' }) {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const pathname = usePathname()
  const base = `/league/${params.orgSlug}/${params.leagueId}`
  const items = GROUPS[group]

  return (
    <div className="flex items-center gap-1 mb-4 border-b border-gray-800">
      {items.map(t => {
        const href = `${base}/${t.seg}`
        const active = pathname.startsWith(href)
        return (
          <Link key={t.seg} href={href}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
              active ? 'border-blue-500 text-white font-bold' : 'border-transparent text-gray-400 font-medium hover:text-white'
            }`}>
            {t.label}
          </Link>
        )
      })}
    </div>
  )
}
