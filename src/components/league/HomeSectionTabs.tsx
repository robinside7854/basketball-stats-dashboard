'use client'
// 홈 하단 섹션(최근 라운드·하이라이트)을 탭으로 묶어 스크롤 길이 단축.
// 2026-10-12 리뉴얼 2단계: 팀 승률·리그 리더는 탭에서 빠져 「이번 분기」 묶음(홈 본문)으로 올라갔다.
//   여기 남은 건 「지난 토요일」 아래의 보조 섹션뿐이다.
// 서버에서 렌더된 섹션 노드를 슬롯으로 받아 활성 탭만 노출(나머지는 display:none → 높이 0, 상태 유지).
import { useState, useEffect, type ReactNode } from 'react'
import SegmentedTabs, { tabPanelProps } from '@/components/league/ui/SegmentedTabs'

type TabKey = 'rounds' | 'highlights'
const HOME_TAB_SEEN = 'mm_home_tab_seen'

export default function HomeSectionTabs({
  rounds, highlights, highlightsAvailable = false,
}: {
  rounds: ReactNode
  highlights: ReactNode
  highlightsAvailable?: boolean
}) {
  const tabs: { key: TabKey; label: string; node: ReactNode }[] = [
    { key: 'rounds', label: '최근 라운드', node: rounds },
    { key: 'highlights', label: '하이라이트', node: highlights },
  ]
  const [active, setActive] = useState<TabKey>('rounds')

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
      if (key && ['rounds', 'highlights'].includes(key)) setActive(key)
    }
    window.addEventListener('mm-home-tab', onTab)
    return () => window.removeEventListener('mm-home-tab', onTab)
  }, [])

  // 캐주얼 전환(2026-08) — 탭 안에 들어가는 SectionCard(variant="stack")가 이제 자체
  // border+radius 를 갖는 독립 카드라서, 예전처럼 이 래퍼가 둘러싸는 카드 프레임 역할을
  // 하면 이중 테두리가 생긴다. 탭 바는 카드 프레임 없이 알약 트랙(SegmentedTabs)만 갖고,
  // 아래 카드와는 간격(mb-4 lg:mb-5, 다른 탭 3종과 통일 — 가독성 업그레이드 ⑥)으로 분리한다.
  return (
    <div>
      {/* 탭 바 — 공용 SegmentedTabs(리뉴얼 1단계). 키보드 ←/→ · 넘치면 가로 스크롤 */}
      <SegmentedTabs
        items={tabs.map(t => ({ key: t.key, label: t.label }))}
        value={active}
        onChange={setActive}
        ariaLabel="홈 요약 섹션"
        idPrefix="home-section"
        className="mb-4 lg:mb-5"
      />
      {/* 패널 — 모두 마운트 유지(클라이언트 상태·프리페치 보존), 비활성은 display:none 으로 높이 0 */}
      {tabs.map(t => (
        <div key={t.key} {...tabPanelProps('home-section', t.key)} hidden={active !== t.key}>
          {t.node}
        </div>
      ))}
    </div>
  )
}
