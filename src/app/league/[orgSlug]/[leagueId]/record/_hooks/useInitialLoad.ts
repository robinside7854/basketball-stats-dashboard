import { useEffect } from 'react'
import type { RecordState } from './useRecordState'

// 초기 로드 — 일정 날짜 · 팀 · 선수 · 리그 설정 · 날짜별 분기
export type UseInitialLoadCtx = Pick<RecordState,
  'setAllPlayers' | 'setDateQuarterMap' | 'setIsTournament' | 'setLeagueYtChannel' | 'setLoadingDates' | 'setScheduleDates' | 'setTeams'
> & {
  leagueId: string
}

export function useInitialLoad(ctx: UseInitialLoadCtx) {
  const { setAllPlayers, setDateQuarterMap, setIsTournament, setLeagueYtChannel, setLoadingDates,
    setScheduleDates, setTeams, leagueId } = ctx
  // 초기 로드
  useEffect(() => {
    async function init() {
      setLoadingDates(true)
      const [dRes, tRes, pRes, lRes, gRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/schedule-dates`),
        fetch(`/api/leagues/${leagueId}/teams`),
        // 기록 화면은 상대 선수를 눌러 득점을 남겨야 하므로 옵트인
        fetch(`/api/leagues/${leagueId}/players?includeExternal=1`),
        fetch(`/api/leagues/${leagueId}`),
        // 집계 전용 — 전 경기(303행 × 전 컬럼 + 팀 조인)를 받던 것을 날짜당 한 줄로 줄였다.
        fetch(`/api/leagues/${leagueId}/games/date-summary`),
      ])
      if (dRes.ok) setScheduleDates(await dRes.json())
      if (tRes.ok) setTeams(await tRes.json())
      if (pRes.ok) setAllPlayers(await pRes.json())
      if (lRes.ok) {
        const ld = await lRes.json()
        setLeagueYtChannel(ld.youtube_channel ?? null)
        // 대회 묶음이면 영상 연동이 통째로 다르다 — 경기 하나에 쿼터별 영상 4개가 붙고,
        //   제목 추측 방식의 자동 매핑은 쓰지 않는다(엉뚱한 자리에 조용히 붙는다).
        setIsTournament(ld.mode === 'tournament')
      }
      if (gRes.ok) {
        const summaries = await gRes.json()
        // 날짜 → 분기 맵 — 집계 응답이 날짜당 quarter_id 를 함께 준다(전 경기 순회 불필요)
        const dqMap: Record<string, string> = {}
        for (const r of summaries as Array<{ date: string; quarter_id: string | null }>) {
          if (r.date && r.quarter_id) dqMap[r.date] = r.quarter_id
        }
        setDateQuarterMap(dqMap)
      }
      setLoadingDates(false)
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [leagueId])
}
