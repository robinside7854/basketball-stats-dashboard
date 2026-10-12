import { useEffect, useRef } from 'react'
import type { RecordState } from './useRecordState'

// 선발 기본 체크 — 슬롯 단위로 한 번만(정규 선수 전원 · 대회는 아무도 체크하지 않음)
export type UseStarterDefaultsCtx = Pick<RecordState,
  'awayRoster' | 'gameStarted' | 'homeRoster' | 'isTournament' | 'selectedSlotId' | 'setSelectedStarters'
>

export function useStarterDefaults(ctx: UseStarterDefaultsCtx) {
  const { awayRoster, gameStarted, homeRoster, isTournament, selectedSlotId, setSelectedStarters } = ctx
  // 슬롯 단위로 한 번만 자동 초기화 — 비정규 선수 추가 등 같은 슬롯 내 roster 변경 시엔 유지
  const initializedSlotRef = useRef<string | null>(null)
  useEffect(() => {
    if (gameStarted) return
    if (!selectedSlotId) { initializedSlotRef.current = null; return }
    if (homeRoster.length === 0 && awayRoster.length === 0) return
    // 같은 슬롯에서 이미 초기화 완료 → 추가 갱신은 사용자의 선택을 보존
    if (initializedSlotRef.current === selectedSlotId) return

    // ⚠ 대회는 **아무도 미리 체크하지 않는다.**
    //   리그는 팀당 5명 안팎이라 "정규 선수 전원 체크"가 곧 코트 5명이었다. 대회 참가 명단은
    //   10명 넘는 게 정상이라 그 기본값이 그대로 켜지면 `팀당 선발 최대 5명` 검증에 걸려
    //   **경기 시작 버튼이 아예 안 먹는다**(실측: 참가 6명 → "6/5" 로 막힘).
    //   기록원이 그 경기에 처음 나선 5명을 직접 고르는 게 대회의 실제 흐름이기도 하다.
    if (isTournament) {
      setSelectedStarters(new Set())
      initializedSlotRef.current = selectedSlotId
      return
    }

    // 정규 선수만 기본 체크 (비정규는 기본 미체크 — GP 오염 방지)
    const regularIds = [...homeRoster, ...awayRoster]
      .filter(p => p.is_regular !== false)
      .map(p => p.id)
    setSelectedStarters(new Set(regularIds))
    initializedSlotRef.current = selectedSlotId
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [homeRoster, awayRoster, gameStarted, selectedSlotId, isTournament])
}
