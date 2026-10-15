import { useEffect, useRef } from 'react'
import type { GameSlot } from '../_lib/types'
import { clearResume, readResume } from '../_lib/resume'
import type { RecordState } from './useRecordState'

// 딥링크(`?date=&game=`) · 「이어서 기록하기」 진입 — 최초 1회
export type UseDeepLinkCtx = Pick<RecordState,
  'loadingDates' | 'scheduleDates' | 'setResumeTarget' | 'setShowGameLog'
> & {
  leagueId: string
  selectDate: (date: string) => Promise<void>
  selectSlot: (slot: GameSlot) => Promise<void>
}

export function useDeepLink(ctx: UseDeepLinkCtx) {
  const { loadingDates, scheduleDates, setResumeTarget, setShowGameLog, leagueId, selectDate, selectSlot } = ctx
  // 대회 관리 화면의 「기록」 버튼이 보내는 딥링크 — `?date=YYYY-MM-DD&game=<id>`.
  //   `&log=1` 이면 그 경기를 연 뒤 「기록 내역」(GameLogModal)까지 띄운다 — 박스스코어 「기록 수정」(2026-10-15).
  //   없으면 종전대로 날짜 목록부터 시작한다.
  //   ⚠ `useSearchParams()` 를 쓰지 않는다 — 이 페이지는 Suspense 경계가 없어서 그걸 쓰면
  //     빌드가 깨진다(일정 화면이 같은 이유로 내부 컴포넌트를 분리해 뒀다).
  //     여기서 필요한 건 최초 1회 읽기뿐이라 location 으로 충분하다.
  const deepLinkRef = useRef(false)
  useEffect(() => {
    if (deepLinkRef.current) return
    if (loadingDates || scheduleDates.length === 0) return
    const sp = new URLSearchParams(window.location.search)
    const date = sp.get('date')
    const resume = readResume(leagueId)
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      deepLinkRef.current = true
      // 날짜 없이 들어왔다(「경기 기록」 탭 등) — 기록하다 나간 경기가 있으면 그 장면으로 돌아간다.
      //   ⚠ 날짜를 열기 **전에** 경기가 아직 안 끝났는지 본다. 리그의 selectDate 는 슬롯을 까는
      //     POST 라, 이미 마감된 경기 때문에 날짜를 열어 버리면 엉뚱한 화면에 떨어진다.
      if (!resume) return
      ;(async () => {
        const res = await fetch(`/api/leagues/${leagueId}/games?date=${resume.date}`, { cache: 'no-store' })
        if (!res.ok) return
        const rows = (await res.json()) as GameSlot[]
        const hit = rows.find(s => s.id === resume.gameId)
        if (!hit || hit.is_complete || !hit.is_started) { clearResume(leagueId, resume.gameId); return }
        await selectDate(resume.date)
        setResumeTarget(resume)
        await selectSlot(hit)
      })()
      return
    }
    deepLinkRef.current = true
    ;(async () => {
      await selectDate(date)
      // 슬롯은 selectDate 의 setState 가 반영된 뒤에야 목록에 있다 — 여기서 직접 다시 읽는다.
      const gameId = sp.get('game')
      if (!gameId) return
      const res = await fetch(`/api/leagues/${leagueId}/games?date=${date}`, { cache: 'no-store' })
      if (!res.ok) return
      const rows = (await res.json()) as GameSlot[]
      const hit = rows.find(s => s.id === gameId)
      if (!hit) return
      // 딥링크가 기록하다 나간 그 경기면 쿼터·영상 위치도 되살린다.
      if (resume && resume.gameId === hit.id) {
        if (hit.is_complete) clearResume(leagueId, hit.id)
        else setResumeTarget(resume)
      }
      await selectSlot(hit)
      if (sp.get('log') === '1') setShowGameLog(true)
    })()
    // selectDate/selectSlot 은 매 렌더 새로 만들어진다 — 넣으면 매번 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDates, scheduleDates.length, leagueId])
}
