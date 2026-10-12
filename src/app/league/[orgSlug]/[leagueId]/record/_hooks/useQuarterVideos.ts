import { useCallback, useEffect, useRef } from 'react'
import type { RecordState } from './useRecordState'

// ── 쿼터별 영상 표와 영상 패널 상태 ──────────────────────────────────
//   ⚠ effect 순서(목록 캐시 비우기 → 영상 표 읽기 → 패널 열기 → 링크 대상 쿼터 → 시작 쿼터 보정)는
//     분리 전과 같다. 패널 열기 effect 의 의존성에 quarterVideos 를 넣지 말 것(CLAUDE.md).
export type UseQuarterVideosCtx = Pick<RecordState,
  'currentQuarter' | 'quarterRestore' | 'quarterVideos' | 'selectedDate' | 'selectedSlotId' | 'setAdvancedOpen' | 'setCurrentQuarter' | 'setQuarterSplitOpen' | 'setQuarterVideos' | 'setVideoPanelOpen' | 'setVideosLoadedFor' | 'setYtInput' | 'setYtList' | 'setYtPickerOpen' | 'setYtTargetQuarter' | 'slots' | 'videosLoadedFor'
> & {
  leagueId: string
}

export function useQuarterVideos(ctx: UseQuarterVideosCtx) {
  const { currentQuarter, quarterRestore, quarterVideos, selectedDate, selectedSlotId,
    setAdvancedOpen, setCurrentQuarter, setQuarterSplitOpen, setQuarterVideos, setVideoPanelOpen,
    setVideosLoadedFor, setYtInput, setYtList, setYtPickerOpen, setYtTargetQuarter, slots,
    videosLoadedFor, leagueId } = ctx
  // 날짜가 바뀌면 영상 목록 캐시를 버린다 — 안 버리면 다른 날짜 영상이 그대로 뜬다
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  useEffect(() => { setYtList([]); setYtPickerOpen(false); setYtInput('') }, [selectedDate, selectedSlotId])

  // ── 쿼터별 영상 ────────────────────────────────────────────────────
  // ⚠ 늦게 도착한 앞 경기 응답이 지금 경기 표를 덮지 않도록 요청 토큰으로 막는다.
  //   슬롯을 빠르게 넘기면 실제로 일어나고, 아래 시작 쿼터 보정이 그 표를 근거로 삼으면
  //   남의 경기 영상을 보며 기록하게 된다.
  const videoReqRef = useRef(0)
  const loadQuarterVideos = useCallback(async (gameId: string | null) => {
    const token = ++videoReqRef.current
    // 성공·실패·빈 경기 **모든 경로**에서 표와 "어느 경기 것인지"를 같이 세운다.
    const settle = (map: Record<number, { url: string; start_offset: number }>) => {
      if (videoReqRef.current !== token) return
      setQuarterVideos(map)
      setVideosLoadedFor(gameId)
    }
    if (!gameId) { settle({}); return }
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}/videos`, { cache: 'no-store' })
      if (!res.ok) { settle({}); return }
      const rows = (await res.json()) as Array<{ quarter: number; youtube_url: string; start_offset: number }>
      const map: Record<number, { url: string; start_offset: number }> = {}
      for (const r of rows) map[r.quarter] = { url: r.youtube_url, start_offset: r.start_offset ?? 0 }
      settle(map)
    } catch {
      settle({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [leagueId])

  // 슬롯이 바뀌면 그 경기의 쿼터 영상을 다시 읽는다. 안 읽으면 앞 경기의 영상이 그대로 남아
  //   기록원이 다른 경기 영상을 보면서 기록하게 된다 — 화면상으로는 정상이라 눈치채기 어렵다.
  useEffect(() => {
    loadQuarterVideos(selectedSlotId)
  }, [selectedSlotId, loadQuarterVideos])

  // 영상 패널은 **항상 펼친 채로** 연다 (2026-09-18).
  //   접어 둔 것은 "자동 매핑이 다 붙이니 열 일이 없다"는 전제였는데, 쿼터 카드가 곧
  //   재생 쿼터를 고르는 자리가 되면서 전제가 깨졌다. 기록할 때마다 펼쳐야 해서
  //   "쿼터를 바꿀 수 없다"로 읽혔다.
  useEffect(() => {
    setVideoPanelOpen(!!selectedSlotId)
    setAdvancedOpen(false)
    setQuarterSplitOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [selectedSlotId])

  // 쿼터가 넘어가면 링크 입력 대상도 따라간다(기록 중 4번 중 3번은 지금 쿼터를 채운다).
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  useEffect(() => { setYtTargetQuarter(currentQuarter) }, [currentQuarter])

  // 슬롯을 처음 열 때 **영상이 연결된 첫 쿼터**에서 시작한다.
  //
  //   왜: 1쿼터 영상이 없는 경기(업로더가 그 쿼터를 안 올린 날)를 열면 빈 1쿼터에 멈춰 서서
  //   "미연결"만 보였다. 기록원이 매번 손으로 쿼터를 옮겨야 했고, 그걸 연동 실패로 오해했다.
  //
  // ⚠ 지켜야 할 두 가지 — 이 가드가 없으면 기록 중 쿼터를 빼앗는 사고가 난다.
  //   ① hasEvents: 이미 기록이 있으면 **마지막 기록 쿼터 복원이 이긴다**(기록이 곧 진실).
  //   ② appliedRef: 슬롯당 한 번만. quarterVideos 가 의존성에 있어서, 이게 없으면
  //      기록 도중 1쿼터 영상을 붙이는 순간 기록 쿼터가 1로 튄다.
  //   두 비동기(영상 표 · 이벤트 조회)는 어느 쪽이 늦게 와도 되게 각각의 도착을 확인한다.
  const autoStartAppliedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedSlotId) { autoStartAppliedRef.current = null; return }
    if (autoStartAppliedRef.current === selectedSlotId) return
    if (videosLoadedFor !== selectedSlotId) return
    if (quarterRestore?.slotId !== selectedSlotId) return

    autoStartAppliedRef.current = selectedSlotId
    if (quarterRestore.hasEvents) return
    // 시작된 경기는 손대지 않는다 — 막 시작해 이벤트가 아직 0건인 경기(라이브 기록 직전)까지
    //   영상 있는 쿼터로 끌고 가면, 1쿼터를 실시간으로 적으려던 기록원이 2쿼터에 적게 된다.
    if (slots.find(s => s.id === selectedSlotId)?.is_started) return

    const keys = Object.keys(quarterVideos).map(Number).filter(Number.isFinite)
    if (keys.length === 0) return
    setCurrentQuarter(Math.min(...keys))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId, videosLoadedFor, quarterRestore, quarterVideos])

  return { loadQuarterVideos }
}
