'use client'
// 홈 「드래프트 진행 중」 띠 (2026-10-15) — 팀 어드민 · CEO 에게만.
//   드래프트는 팀 어드민 전용 화면(/draft)이라 진입점이 메뉴 깊숙이 있다. 진행 중인 드래프트가 있는데
//   어드민이 홈에만 머물면 차례가 멈춘다. 진행 여부는 서버(홈 page.tsx)가 한 줄 조회로 알려 주고,
//   권한 판정은 여기서 useLeagueEditMode 로 한다(서버 캐시에 개인 판정을 섞지 않는다).
import Link from 'next/link'
import { ChevronRight, ListOrdered } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

export default function DraftInProgressBanner({ orgSlug, leagueId }: { orgSlug: string; leagueId: string }) {
  const { isEditMode } = useLeagueEditMode()
  if (!isEditMode) return null
  return (
    <Link
      href={`/league/${orgSlug}/${leagueId}/draft`}
      className="flex items-center justify-between gap-2 min-h-12 px-4 text-sm font-black hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-card)' }}
    >
      <span className="inline-flex items-center gap-2 min-w-0">
        <ListOrdered size={16} aria-hidden className="shrink-0" />
        <span className="truncate">드래프트가 진행 중이에요</span>
      </span>
      <span className="inline-flex items-center gap-0.5 shrink-0">드래프트로<ChevronRight size={16} aria-hidden /></span>
    </Link>
  )
}
