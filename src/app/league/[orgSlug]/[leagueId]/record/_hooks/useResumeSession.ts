import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { LEAVE_MESSAGE } from '../_lib/constants'
import { fmtClock, readResume, writeResume } from '../_lib/resume'
import type { ActiveVideo, GameSlot } from '../_lib/types'
import type { RecordState } from './useRecordState'

export type UseResumeSessionCtx = Pick<RecordState,
  'currentQuarter' | 'gameStarted' | 'quarterRestore' | 'resumeTarget' | 'selectedDate' | 'selectedSlotId' | 'setCurrentQuarter' | 'setResumeTarget' | 'videosLoadedFor'
> & {
  activeVideo: ActiveVideo | null
  leagueId: string
  selectedSlot: GameSlot | null
  ytPlayer: YT.Player | null
}

export function useResumeSession(ctx: UseResumeSessionCtx) {
  const { currentQuarter, gameStarted, quarterRestore, resumeTarget, selectedDate, selectedSlotId,
    setCurrentQuarter, setResumeTarget, videosLoadedFor, activeVideo, leagueId, selectedSlot,
    ytPlayer } = ctx
  // ── 기록 중 이탈 경고 ────────────────────────────────────────────────
  //   기록은 누를 때마다 저장되므로 떠나도 사라지지 않는다. 다만 「마감」을 안 하고 떠나면
  //   그 경기가 진행 중으로 남아, 다음에 누가 열었을 때 끝난 경기인지 알 수 없다.
  const recordingInProgress = !!selectedSlot && gameStarted && !selectedSlot.is_complete

  // 지금 장면(이어서 기록하기용) — 이벤트 핸들러·타이머가 늘 최신 값을 읽도록 ref 로 둔다.
  const resumeSnapRef = useRef<{ on: boolean; date: string; gameId: string; slotNum: number | null; quarter: number; videoUrl: string | null }>(
    { on: false, date: '', gameId: '', slotNum: null, quarter: 1, videoUrl: null },
  )
  resumeSnapRef.current = {
    on: recordingInProgress,
    date: selectedDate,
    gameId: selectedSlotId,
    slotNum: selectedSlot?.slot_num ?? null,
    quarter: currentQuarter,
    videoUrl: activeVideo?.url ?? null,
  }
  const ytPlayerRef = useRef(ytPlayer)
  ytPlayerRef.current = ytPlayer
  // ⚠ 복원(seek)이 끝나기 전에는 저장하지 않는다 — 플레이어가 막 떠서 0초인 상태로
  //   저장된 위치를 덮어써 버린다.
  const resumeHoldRef = useRef(false)
  // 마감한 경기 — 슬롯 목록이 새로 오기 전까지 recordingInProgress 가 잠깐 true 로 남으므로 따로 막는다.
  const completedIdsRef = useRef<Set<string>>(new Set())
  const saveResumeNow = useCallback(() => {
    const s = resumeSnapRef.current
    if (!s.on || !s.gameId || !s.date || resumeHoldRef.current) return
    if (completedIdsRef.current.has(s.gameId)) return
    let videoTime: number | null = null
    try {
      const p = ytPlayerRef.current
      const id = s.videoUrl ? extractYouTubeId(s.videoUrl) : null
      // 플레이어가 지금 영상과 같은 것을 틀고 있을 때만 위치를 믿는다(쿼터 전환 중이면 앞 영상일 수 있다).
      if (p && id && (p.getVideoUrl?.() ?? '').includes(id)) {
        const t = p.getCurrentTime()
        if (Number.isFinite(t)) videoTime = t
      }
    } catch { /* 플레이어 파괴 중 */ }
    // 위치를 못 읽었으면(화면을 떠나며 플레이어가 먼저 없어진 경우 등) 직전에 저장한 위치를 지킨다.
    if (videoTime == null) {
      const prev = readResume(leagueId)
      if (prev && prev.gameId === s.gameId && prev.videoUrl === s.videoUrl && prev.quarter === s.quarter) {
        videoTime = prev.videoTime
      }
    }
    writeResume(leagueId, {
      date: s.date, gameId: s.gameId, slotNum: s.slotNum, quarter: s.quarter,
      videoTime, videoUrl: s.videoUrl, savedAt: Date.now(),
    })
  }, [leagueId])

  // 기록 중에는 5초마다 · 쿼터가 바뀔 때 · 탭이 가려질 때 · 화면을 떠날 때 장면을 저장한다.
  useEffect(() => {
    if (!recordingInProgress) return
    saveResumeNow()
    const iv = window.setInterval(saveResumeNow, 5000)
    const onVis = () => { if (document.visibilityState === 'hidden') saveResumeNow() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', saveResumeNow)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', saveResumeNow)
      // 화면을 떠나는 순간(앱 안 이동으로 언마운트)도 한 번 더 — 마감으로 꺼진 경우는
      //   completeGame 이 곧바로 지우므로 남지 않는다.
      saveResumeNow()
    }
  }, [recordingInProgress, currentQuarter, selectedSlotId, saveResumeNow])

  // 기록 중 이탈 경고 — 브라우저 닫기·새로고침(beforeunload) + **앱 안 링크 이동**.
  //   하위 탭·하단 내비·헤더 링크는 전부 Next <Link> 라 beforeunload 가 안 뜬다. 그래서 문서 전체의
  //   링크 클릭을 capture 단계에서 먼저 받아 확인을 묻는다 — 거절하면 Link 의 onClick(React 루트)까지
  //   가지 않게 막는다. 각 컴포넌트를 고칠 필요가 없고, 새 링크가 생겨도 자동으로 걸린다.
  //   ⚠ 브라우저 「뒤로」는 막지 않는다(App Router 의 history 상태를 건드리면 라우터가 깨질 수 있다).
  //     대신 떠나는 순간 장면이 저장돼 있어 돌아오면 이어서 기록된다.
  const leaveApprovedRef = useRef(false)
  useEffect(() => {
    if (!recordingInProgress) return
    leaveApprovedRef.current = false
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      saveResumeNow()
      if (leaveApprovedRef.current) return  // 링크 클릭에서 이미 물어봤다 — 두 번 묻지 않는다
      e.preventDefault(); e.returnValue = ''
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      if (a.target && a.target !== '_self') return
      if (a.hasAttribute('download')) return
      let url: URL
      try { url = new URL(a.href, window.location.href) } catch { return }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return
      // 같은 화면(해시·쿼리만 다른 링크)은 떠나는 게 아니다.
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return
      saveResumeNow()
      if (confirm(LEAVE_MESSAGE)) { leaveApprovedRef.current = true; return }
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [recordingInProgress, saveResumeNow])
  function confirmLeave(): boolean {
    if (!recordingInProgress) return true
    saveResumeNow()
    return confirm(LEAVE_MESSAGE)
  }

  // ── 돌아왔을 때 그 장면으로 ─────────────────────────────────────────
  //   쿼터는 **아래 「이벤트 기반 쿼터 복원」이 끝난 뒤에** 덮어쓴다(quarterRestore 도착을 기다림) —
  //   먼저 덮으면 복원 effect 가 늦게 와서 마지막 기록 쿼터로 되돌려 버린다. 둘이 다르면
  //   기록원이 실제로 보고 있던 쿼터(저장값)가 이긴다. 시작 쿼터 보정은 시작된 경기에서 물러나므로 안 싸운다.
  const [pendingSeek, setPendingSeek] = useState<{ gameId: string; quarter: number; time: number; videoUrl: string } | null>(null)
  useEffect(() => {
    if (!resumeTarget) return
    if (selectedSlotId && selectedSlotId !== resumeTarget.gameId) { setResumeTarget(null); return }
    if (selectedSlotId !== resumeTarget.gameId) return
    if (quarterRestore?.slotId !== selectedSlotId || videosLoadedFor !== selectedSlotId) return
    const q = Math.min(Math.max(Math.round(resumeTarget.quarter) || 1, 1), 6)
    setCurrentQuarter(q)
    const t = resumeTarget.videoTime
    if (t != null && t > 1 && resumeTarget.videoUrl) {
      resumeHoldRef.current = true
      // 플레이어가 끝내 안 뜨면(영상 삭제 등) 저장을 영영 막지 않도록 풀어 둔다.
      window.setTimeout(() => { resumeHoldRef.current = false }, 15000)
      setPendingSeek({ gameId: resumeTarget.gameId, quarter: q, time: t, videoUrl: resumeTarget.videoUrl })
    }
    const slotLabel = resumeTarget.slotNum != null ? `${resumeTarget.slotNum}경기 ` : ''
    toast.success(`이어서 기록합니다 · ${slotLabel}${q}쿼터${t != null && t > 1 ? ` ${fmtClock(t)}` : ''}`)
    setResumeTarget(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [resumeTarget, selectedSlotId, quarterRestore, videosLoadedFor])

  // 플레이어가 준비되면 저장된 위치로 옮긴다. 쿼터를 바꾸면 플레이어가 새 영상으로 다시 뜨므로,
  //   **그 쿼터의 그 영상**이 떴을 때만 적용한다(앞 영상에 걸면 엉뚱한 지점으로 간다).
  useEffect(() => {
    if (!pendingSeek) return
    const giveUp = () => { resumeHoldRef.current = false; setPendingSeek(null) }
    if (selectedSlotId !== pendingSeek.gameId) { giveUp(); return }
    if (currentQuarter !== pendingSeek.quarter) return
    if (!activeVideo) return
    if (activeVideo.url !== pendingSeek.videoUrl) { giveUp(); return }  // 그사이 영상이 바뀌었다
    if (!ytPlayer) return
    const id = extractYouTubeId(pendingSeek.videoUrl)
    try {
      if (!id || !(ytPlayer.getVideoUrl?.() ?? '').includes(id)) return  // 아직 앞 영상 플레이어
      const playing = ytPlayer.getPlayerState() === 1
      ytPlayer.seekTo(Math.floor(pendingSeek.time), true)
      if (!playing) ytPlayer.pauseVideo()
    } catch { /* 플레이어가 막 파괴됨 — 다음 준비 때 다시 */ return }
    giveUp()
  }, [pendingSeek, ytPlayer, currentQuarter, selectedSlotId, activeVideo])

  return { recordingInProgress, resumeSnapRef, completedIdsRef, confirmLeave }
}
