'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTeam } from '@/contexts/TeamContext'
import { useOrg } from '@/contexts/OrgContext'
import type { SubTab } from './subTabs'

interface Props { tabs: SubTab[] }

export default function SubTabNav({ tabs }: Props) {
  const pathname = usePathname()
  const team = useTeam()
  const org = useOrg()

  return (
    // mm-brand: LeagueSubTabs.tsx 와 동일 규칙 (44px 터치 타겟 + focus-visible 링) — 두 트리 탭 바 룩을 통일
    <div className="flex items-center gap-1 border-b border-[color:var(--mm-rule)] mb-6">
      {tabs.map(({ path, label }) => {
        const href = `/${org}/${team}${path}`
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={path}
            href={href}
            className={cn(
              'px-4 py-2 min-h-11 flex items-center text-sm font-medium border-b-2 -mb-px transition-colors duration-200 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1',
              isActive
                ? 'border-[color:var(--color-hoop-orange-500)] text-[color:var(--mm-ink)] font-bold'
                : 'border-transparent text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)]'
            )}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
