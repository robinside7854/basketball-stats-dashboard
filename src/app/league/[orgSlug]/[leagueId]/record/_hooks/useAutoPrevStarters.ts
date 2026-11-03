import { useEffect, useRef } from 'react'
import type { GameSlot } from '../_lib/types'

// 다음 경기 선발 미리 체크 (2026-11-03, 운영진).
//   하루 9경기 로테이션이라 같은 팀이 여러 번 나오고 선발도 대개 같다. 슬롯을 열면 「지난 경기와 같은 선발」을
//   **체크만** 해 둔다 — 경기는 시작하지 않는다. 기록원이 바뀐 1~2명만 고치고 시작을 누른다.
//   ⚠ 슬롯당 한 번만. 기록원이 고친 체크를 명단 갱신(게스트 추가 등)이 다시 덮으면 안 된다.
//   useStarterDefaults(정규 전원 체크) 다음에 호출해야 한다 — 같은 커밋에서 effect 는 선언 순서로 돈다.
export function useAutoPrevStarters(ctx: {
  selectedSlot: GameSlot | null
  gameStarted: boolean
  rosterReady: boolean
  hasSources: boolean
  applyPrevStarters: (opts?: { auto?: boolean; slotId?: string; isCurrent?: (id: string) => boolean }) => Promise<void>
}) {
  const { selectedSlot, gameStarted, rosterReady, hasSources, applyPrevStarters } = ctx
  const doneRef = useRef<string | null>(null)
  const currentRef = useRef<string | null>(null)
  currentRef.current = selectedSlot?.id ?? null
  useEffect(() => {
    const id = selectedSlot?.id
    if (!id || gameStarted || selectedSlot.is_complete || !rosterReady || !hasSources) return
    if (doneRef.current === id) return
    doneRef.current = id
    void applyPrevStarters({ auto: true, slotId: id, isCurrent: x => currentRef.current === x })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 슬롯·명단 준비 여부로만 판단한다(함수는 매 렌더 새로 만들어진다)
  }, [selectedSlot?.id, gameStarted, rosterReady, hasSources])
}
