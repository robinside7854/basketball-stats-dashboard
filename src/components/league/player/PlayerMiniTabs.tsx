'use client'

// 선수 카드 미니 탭 — 세로 스크롤이 과도하게 길어지는 문제 해결용 (2026-08-03)
// 모바일에서 가로 스크롤 칩, 데스크탑에서는 한 줄에 정렬.
// sticky 로 붙여 스크롤 중에도 탭 전환이 가능하도록 한다.

export type PlayerTabKey = 'season' | 'badges' | 'duo' | 'shot' | 'career' | 'trend'

export const PLAYER_TABS: { key: PlayerTabKey; label: string }[] = [
  { key: 'season', label: '시즌 스탯' },
  { key: 'badges', label: '성과 뱃지' },
  { key: 'duo',    label: '다이나믹 듀오' },
  { key: 'shot',   label: '공격 스타일' },
  { key: 'career', label: '커리어 하이' },
  { key: 'trend',  label: '최근 트렌드' },
]

export default function PlayerMiniTabs({
  active,
  onChange,
  available,
  topOffset = 52,
}: {
  active: PlayerTabKey
  onChange: (key: PlayerTabKey) => void
  /** 데이터가 있어 노출 가능한 탭 (미지정 시 전체 노출) */
  available?: Set<PlayerTabKey>
  /** 상단 sticky 액션바 높이 — 그 바로 밑에 붙도록 */
  topOffset?: number
}) {
  const tabs = available ? PLAYER_TABS.filter(t => available.has(t.key)) : PLAYER_TABS
  if (tabs.length <= 1) return null

  return (
    <div
      className="sticky z-10 px-3 py-2 overflow-x-auto scrollbar-hide"
      style={{
        top: topOffset,
        background: 'var(--mm-panel)',
        borderBottom: '1px solid var(--mm-rule)',
      }}
      role="tablist"
      aria-label="선수 카드 섹션"
    >
      <div className="flex gap-1.5 whitespace-nowrap">
        {tabs.map(t => {
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className="shrink-0 px-3 min-h-[36px] text-xs font-black uppercase cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={isActive
                ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', letterSpacing: '0.08em' }
                : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.08em' }
              }
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
