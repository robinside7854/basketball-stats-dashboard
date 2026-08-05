'use client'
// 경기묶음(competition) 전환 UI — 탭이 아니라 탭 위 계층이다.
//   "어느 묶음을 보는가" 를 먼저 정하고, 그 안에서 "어느 화면을 보는가" 가 탭이다.
//   그래서 LeagueLayoutClient 의 기존 탭 구성(TabNav/BottomNav)은 건드리지 않고
//   그 위에 별도 바로 얹는다 — 두 질문을 하나의 UI 에 욱여넣지 않기 위함.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Layers, Trophy } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { Competition } from '@/lib/league/competitions'

export default function CompetitionSwitcher({
  orgSlug,
  leagueId,
}: {
  orgSlug: string
  leagueId: string
}) {
  const [competitions, setCompetitions] = useState<Competition[] | null>(null)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // 편집 모드(어드민 role ∥ PIN)가 켜지면 노출 규칙이 바뀌어 빈 대회 묶음도 보여야 한다.
  //   leagueHeaders 는 PIN 폴백일 때만 X-League-Pin 을 싣는다(어드민 role 은 쿠키로 충분).
  const { isEditMode, leagueHeaders } = useLeagueEditMode()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/leagues/${leagueId}/competitions`, { headers: leagueHeaders })
        if (!res.ok) return // 비공개+미인증(401) 등은 조용히 숨긴다 — 전환 UI는 부가 기능이라 화면을 막지 않는다
        const data = await res.json()
        if (!cancelled) setCompetitions(data.competitions ?? [])
      } catch {
        // 네트워크 실패도 조용히 숨긴다 — 실패했다고 화면 전체를 막을 이유가 없다
      }
    })()
    return () => { cancelled = true }
    // isEditMode 가 바뀌면(PIN 입력·로그인) 다시 조회 — 숨겨졌던 빈 대회 묶음이 나타나야 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, isEditMode])

  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  // 묶음이 1개 이하면 아무것도 렌더하지 않는다 — 선택지가 하나뿐인 전환 UI 는 화면만 차지한다.
  // (미라클 일반 회원은 대회 묶음이 경기 0건이라 숨겨지므로 지금과 화면이 완전히 같다.)
  if (!competitions || competitions.length <= 1) return null

  const current = competitions.find(c => c.id === leagueId) ?? competitions[0]

  return (
    <div className="border-b border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]">
      <div className="max-w-7xl mx-auto px-4 lg:px-6 py-2">
        <div ref={rootRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            className="flex items-center gap-1.5 pl-2.5 pr-2 py-2 min-h-[44px] rounded-md border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-ink)] text-xs font-bold cursor-pointer hover:border-[color:var(--mm-ink-soft)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-hoop-orange-500)]"
          >
            {current.mode === 'tournament'
              ? <Trophy size={14} className="text-[color:var(--color-hoop-orange-500)] shrink-0" aria-hidden />
              : <Layers size={14} className="text-[color:var(--mm-muted)] shrink-0" aria-hidden />}
            <span className="max-w-[160px] truncate">{current.name}</span>
            <ChevronDown size={14} className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>

          {open && (
            <div
              role="listbox"
              aria-label="경기묶음 선택"
              className="absolute left-0 top-[calc(100%+4px)] z-20 min-w-[220px] rounded-md border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] shadow-lg py-1"
            >
              {competitions.map(c => (
                <Link
                  key={c.id}
                  href={`/league/${orgSlug}/${c.slug}`}
                  role="option"
                  aria-selected={c.id === leagueId}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 min-h-[44px] text-sm transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-hoop-orange-500)] ${
                    c.id === leagueId
                      ? 'bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-ink)] font-bold'
                      : 'text-[color:var(--mm-ink-soft)] hover:bg-[color:var(--mm-panel-alt)] hover:text-[color:var(--mm-ink)]'
                  }`}
                >
                  {c.mode === 'tournament'
                    ? <Trophy size={14} className="text-[color:var(--color-hoop-orange-500)] shrink-0" aria-hidden />
                    : <Layers size={14} className="text-[color:var(--mm-muted)] shrink-0" aria-hidden />}
                  <span className="flex-1 truncate">{c.name}</span>
                  {/* 대회 묶음 시각적 구분 — 같은 이름의 두 묶음을 헷갈리면 엉뚱한 곳에 기록하게 된다 */}
                  {c.mode === 'tournament' && (
                    <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--mm-yellow-soft)] text-[color:var(--mm-black)]">대회</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
