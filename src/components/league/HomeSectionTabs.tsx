'use client'
// 홈 하단 4섹션(팀 승률·최근 라운드·리그 리더·하이라이트)을 탭으로 묶어 스크롤 길이 단축.
// 서버에서 렌더된 섹션 노드를 슬롯으로 받아 활성 탭만 노출(나머지는 display:none → 높이 0, 상태 유지).
import { useState, useEffect, type ReactNode } from 'react'

type TabKey = 'standings' | 'rounds' | 'leaders' | 'highlights'
const HOME_TAB_SEEN = 'mm_home_tab_seen'

export default function HomeSectionTabs({
  standings, rounds, leaders, highlights, highlightsAvailable = false,
}: {
  standings: ReactNode
  rounds: ReactNode
  leaders: ReactNode
  highlights: ReactNode
  highlightsAvailable?: boolean
}) {
  const tabs: { key: TabKey; label: string; node: ReactNode }[] = [
    { key: 'standings', label: '팀 승률', node: standings },
    { key: 'rounds', label: '최근 라운드', node: rounds },
    { key: 'leaders', label: '리그 리더', node: leaders },
    { key: 'highlights', label: '하이라이트', node: highlights },
  ]
  const [active, setActive] = useState<TabKey>('standings')

  // #9 첫 방문 + 하이라이트 있으면 기본 탭을 하이라이트로(인스타 유입 팬의 첫 화면에 영상). 최초 1회만.
  useEffect(() => {
    try {
      if (!localStorage.getItem(HOME_TAB_SEEN)) {
        localStorage.setItem(HOME_TAB_SEEN, '1')
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 첫 방문 판정(localStorage)은 클라이언트에서만 가능, 마운트 1회 동기화
        if (highlightsAvailable) setActive('highlights')
      }
    } catch { /* 무시 */ }
  }, [highlightsAvailable])

  // #7 투어 스텝 진입 시 해당 탭 열기 (mm-home-tab 이벤트)
  useEffect(() => {
    const onTab = (e: Event) => {
      const key = (e as CustomEvent).detail as TabKey
      if (key && ['standings', 'rounds', 'leaders', 'highlights'].includes(key)) setActive(key)
    }
    window.addEventListener('mm-home-tab', onTab)
    return () => window.removeEventListener('mm-home-tab', onTab)
  }, [])

  return (
    <div className="rounded-md border border-[color:var(--mm-rule)] overflow-hidden bg-[color:var(--mm-panel)]">
      {/* 탭 바 */}
      <div
        role="tablist"
        aria-label="홈 요약 섹션"
        className="flex items-stretch gap-1 overflow-x-auto scrollbar-hide border-b border-[color:var(--mm-rule)] px-1"
      >
        {tabs.map(t => {
          const on = active === t.key
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              aria-current={on ? 'page' : undefined}
              onClick={() => setActive(t.key)}
              className={`relative shrink-0 px-4 py-3.5 text-sm lg:text-base font-jersey font-black uppercase tracking-[0.06em] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1 ${
                on
                  ? 'text-[color:var(--mm-ink)]'
                  : 'text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)]'
              }`}
            >
              {t.label}
              {on && (
                <span
                  aria-hidden
                  className="absolute inset-x-2 bottom-0 h-[3px] rounded-t-sm bg-[color:var(--color-hoop-orange-500)]"
                />
              )}
            </button>
          )
        })}
      </div>
      {/* 패널 — 모두 마운트 유지(클라이언트 상태·프리페치 보존), 비활성은 display:none 으로 높이 0 */}
      {tabs.map(t => (
        <div key={t.key} role="tabpanel" hidden={active !== t.key}>
          {t.node}
        </div>
      ))}
    </div>
  )
}
