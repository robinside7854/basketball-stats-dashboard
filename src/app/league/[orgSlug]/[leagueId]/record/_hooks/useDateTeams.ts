import { useEffect } from 'react'
import type { RecordState } from './useRecordState'

// 날짜·슬롯의 분기에 맞춘 팀 목록 + 그 날짜의 친선전 임시팀
export type UseDateTeamsCtx = Pick<RecordState,
  'dateQuarterMap' | 'selectedDate' | 'selectedSlotId' | 'setAdhocTeams' | 'setTeams' | 'slots'
> & {
  leagueId: string
}

export function useDateTeams(ctx: UseDateTeamsCtx) {
  const { dateQuarterMap, selectedDate, selectedSlotId, setAdhocTeams, setTeams, slots, leagueId } = ctx
  // 선택한 날짜/슬롯의 분기로 teams 자동 갱신 — 분기별 팀명/색상 override 적용
  //   버그 수정 (2026-07-18): dateQuarterMap 이 초기 로딩 타이밍 문제로 미준비 상태이거나
  //     이전 분기 teams 상태(락다운 등)가 남아있는 경우 잘못된 이름이 dropdown 에 노출됨.
  //   개선: selectedSlot 이 있으면 slot.quarter_id (더 직접적) · 없으면 dateQuarterMap fallback.
  //         cache: 'no-store' 로 Next.js fetch dedupe 캐시 방지.
  //   슬롯 목록(slots)에서 selectedSlotId 로 찾은 slot 의 quarter_id 가 최우선.
  useEffect(() => {
    if (!selectedDate) return
    const slotQid = slots.find(s => s.id === selectedSlotId)?.quarter_id
    const qid = slotQid ?? dateQuarterMap[selectedDate]
    if (!qid) return
    fetch(`/api/leagues/${leagueId}/teams?quarterId=${qid}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(ts => { if (Array.isArray(ts)) setTeams(ts) })
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [leagueId, selectedDate, selectedSlotId, dateQuarterMap, slots])

  // 이 날짜의 임시팀 로드 — 날짜를 고르는 순간 받아 둔다. 친선전 토글 뒤에 로드하면
  //   드롭다운이 한 박자 비어 보이고, 기록원은 그걸 "팀을 못 만든다"로 읽는다.
  async function loadAdhocTeams(date: string) {
    if (!date) { setAdhocTeams([]); return }
    const res = await fetch(`/api/leagues/${leagueId}/teams?exhibitionDate=${date}`, { cache: 'no-store' })
      .catch(() => null)
    if (res?.ok) {
      const ts = await res.json()
      setAdhocTeams(Array.isArray(ts) ? ts : [])
    } else {
      setAdhocTeams([])
    }
  }
  useEffect(() => { loadAdhocTeams(selectedDate) }, [leagueId, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  return { loadAdhocTeams }
}
