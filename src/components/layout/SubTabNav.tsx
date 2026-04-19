'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTeam } from '@/contexts/TeamContext'

interface SubTab { path: string; label: string }
interface Props { tabs: SubTab[] }

export default function SubTabNav({ tabs }: Props) {
  const pathname = usePathname()
  const team = useTeam()

  return (
    <div className="flex gap-1 border-b border-gray-800 mb-6">
      {tabs.map(({ path, label }) => {
        const href = `/${team}${path}`
        const isActive = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={path}
            href={href}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
              isActive
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-600'
            )}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
