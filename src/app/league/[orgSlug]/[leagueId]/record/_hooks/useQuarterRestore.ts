import type React from 'react'
import { useEffect } from 'react'
import type { FoulRow, Setter } from '../_lib/types'
import type { RecordState } from './useRecordState'

export type UseQuarterRestoreCtx = Pick<RecordState,
  'selectedSlotId' | 'setCurrentQuarter' | 'setQuarterRestore'
> & {
  foulReqRef: React.MutableRefObject<number>
  leagueId: string
  setFoulEvents: Setter<{ gameId: string; rows: FoulRow[] }>
}

export function useQuarterRestore(ctx: UseQuarterRestoreCtx) {
  const { selectedSlotId, setCurrentQuarter, setQuarterRestore, foulReqRef, leagueId, setFoulEvents } = ctx
  // 선택한 경기의 쿼터 복원 — 새로고침·경기 전환 후에도 마지막으로 기록하던 쿼터에서 이어간다.
  //   전용 컬럼을 두지 않고 이미 저장된 이벤트의 최대 쿼터를 읽는다(기록이 곧 진실).
  //   복원에 실패해도 기본값 1 로 두고 기록 자체는 막지 않는다.
  useEffect(() => {
    if (!selectedSlotId) { setCurrentQuarter(1); setQuarterRestore(null); return }
    let cancelled = false
    const slotId = selectedSlotId
    // 같은 응답으로 파울 수도 채운다 — 경기를 열 때 이벤트를 두 번 받지 않게.
    const foulToken = ++foulReqRef.current
    fetch(`/api/leagues/${leagueId}/events?gameId=${slotId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((rows: Array<FoulRow> | null) => {
        if (cancelled) return
        if (!Array.isArray(rows)) {
          // 조회 실패도 "끝났다"고 알려야 한다 — 안 그러면 시작 쿼터 보정이 영영 안 돈다.
          setQuarterRestore({ slotId, hasEvents: false })
          return
        }
        if (foulReqRef.current === foulToken) {
          setFoulEvents({ gameId: slotId, rows: rows.filter(e => e.type === 'foul') })
        }
        const max = rows.reduce((m, e) => Math.max(m, e.quarter ?? 1), 1)
        setCurrentQuarter(Math.min(Math.max(max, 1), 6))
        // 기록이 있으면 위 복원값이 정본이다. 시작 쿼터 보정은 여기서 물러난다.
        setQuarterRestore({ slotId, hasEvents: rows.length > 0 })
      })
      .catch(() => { if (!cancelled) setQuarterRestore({ slotId, hasEvents: false }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [leagueId, selectedSlotId])
}
