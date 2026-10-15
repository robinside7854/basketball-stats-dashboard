'use client'
// 홈 맨 아래 보조 섹션(하이라이트 · 마일스톤)을 탭으로 묶어 스크롤 길이 단축.
// 2026-10-12 리뉴얼 2단계: 팀 승률·리그 리더는 탭에서 빠져 「이번 분기」 묶음(홈 본문)으로 올라갔다.
// 2026-10-15: 「지난 경기일」 탭을 뺐다 — 일정 탭과 같은 목록이 하나 더 있었을 뿐이다.
//   지난 날짜는 홈 맨 위 경기일 카드 아래 「전체 일정 보기 →」(→ /schedule)로 간다.
// 서버에서 렌더된 섹션 노드를 슬롯으로 받아 활성 탭만 노출(나머지는 display:none → 높이 0, 상태 유지).
import { useState, useEffect, type ReactNode } from 'react'
import SegmentedTabs, { tabPanelProps } from '@/components/league/ui/SegmentedTabs'

type TabKey = 'highlights' | 'milestones'

export default function HomeSectionTabs({
  highlights, milestones, highlightsAvailable = false, isMember = false,
}: {
  highlights: ReactNode
  /** (2026-10-14 홈 통합 개편) 홈 맨 아래 따로 있던 마일스톤을 탭으로 넣어 세로를 줄였다 */
  milestones: ReactNode
  /** 승인 회원이고 이번 주 클러치 클립이 있다 */
  highlightsAvailable?: boolean
  isMember?: boolean
}) {
  const tabs: { key: TabKey; label: string; node: ReactNode }[] = [
    { key: 'highlights', label: '하이라이트', node: highlights },
    { key: 'milestones', label: '마일스톤', node: milestones },
  ]
  // 기본 탭(2026-10-15) — 볼 클립이 있으면 늘 하이라이트(종전엔 첫 방문 1회만이라 두 번째부터는
  //   빈 「지난 경기일」이 먼저 떴다). 회원인데 클러치 클립이 없으면 빈 상태 대신 마일스톤.
  //   비회원은 둘 다 잠금 카드라 앞 탭 그대로. 서버가 아는 값이라 첫 그림부터 맞다(깜빡임 없음).
  const [active, setActive] = useState<TabKey>(highlightsAvailable || !isMember ? 'highlights' : 'milestones')

  // #7 투어 스텝 진입 시 해당 탭 열기 (mm-home-tab 이벤트)
  useEffect(() => {
    const onTab = (e: Event) => {
      const key = (e as CustomEvent).detail as TabKey
      if (key && ['highlights', 'milestones'].includes(key)) setActive(key)
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
