'use client'

// 선수 카드 미니 탭 — 세로 스크롤이 과도하게 길어지는 문제 해결용 (2026-08-03)
// (2026-10-26) 6탭 → 4탭: 요약(지난 경기일·하루 평균·요즘 흐름) / 기록(일별·월별·분기별) /
//   플레이스타일(다이나믹 듀오 포함) / 커리어 하이. 폰에서도 한 줄(4칸)로 들어간다.
// sticky 로 붙여 스크롤 중에도 탭 전환이 가능하도록 한다.

export type PlayerTabKey = 'summary' | 'records' | 'style' | 'career'

export const PLAYER_TABS: { key: PlayerTabKey; label: string }[] = [
  { key: 'summary', label: '요약' },
  { key: 'records', label: '기록' },
  { key: 'style',   label: '플레이스타일' },
  // 「커리어 하이」 탭은 리뉴얼 R3(2026-10-31)에서 요약 「더 보기」 안으로 옮겼다 — 탭 4 → 3
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
      className="sticky z-10 px-3 py-2"
      style={{
        top: topOffset,
        background: 'var(--mm-panel)',
        borderBottom: '1px solid var(--mm-rule)',
      }}
      role="tablist"
      aria-label="선수 카드 섹션"
    >
      <div className={`grid gap-1.5 ${tabs.length <= 2 ? 'grid-cols-2' : tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
        {tabs.map(t => {
          const isActive = t.key === active
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className="min-w-0 px-1.5 min-h-[44px] text-xs font-black leading-tight break-keep text-center cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={isActive
                ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', letterSpacing: '0.01em' }
                : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', letterSpacing: '0.01em' }
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
