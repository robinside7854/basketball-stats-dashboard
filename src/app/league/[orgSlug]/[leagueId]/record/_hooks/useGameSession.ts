import type React from 'react'
import { toast } from 'sonner'
import { clearResume } from '../_lib/resume'
import type { GameSlot, IrregularPlayer, MinRow, ResumeSnap, RosterPlayer } from '../_lib/types'
import type { RecordState } from './useRecordState'

// ── 경기 진행 동작 ───────────────────────────────────────────────────
//   경기 시작(+1 충돌) · 마감/상대 점수(대회) · 다시 기록하기 · 점수 재계산 · 기록 저장 후 갱신 · 게스트·임시 선수 배정.
//   훅을 쓰지 않는다 — 분리 전처럼 매 렌더 새로 만들어지는 함수다.
export type UseGameSessionCtx = Pick<RecordState,
  'awayRoster' | 'currentQuarter' | 'gameStarted' | 'homeRoster' | 'isTournament' | 'oppFinalScore' | 'plusOneConflict' | 'selectedSlotId' | 'selectedStarters' | 'setActivePlusOneIds' | 'setAddingIrregular' | 'setCompleting' | 'setGameStarted' | 'setLiveScore' | 'setMinutes' | 'setPendingIrregular' | 'setPlusOneConflict' | 'setReopening' | 'setSavingOppScore' | 'setShowComplete' | 'setShowPlusOneModal' | 'setStartingGame' | 'setStatsRefresh' | 'slots'
> & {
  completedIdsRef: React.MutableRefObject<Set<string>>
  leagueHeaders: Record<string, string>
  leagueId: string
  loadRoster: (slot: GameSlot) => Promise<void>
  refreshFoulEvents: () => void
  refreshSlots: () => Promise<GameSlot[] | null>
  resumeSnapRef: React.MutableRefObject<ResumeSnap>
  selectSlot: (slot: GameSlot) => Promise<void>
  selectedSlot: GameSlot | null
  setLineup: (playerIds: string[]) => void
}

export function useGameSession(ctx: UseGameSessionCtx) {
  const { awayRoster, currentQuarter, gameStarted, homeRoster, isTournament, oppFinalScore,
    plusOneConflict, selectedSlotId, selectedStarters, setActivePlusOneIds, setAddingIrregular,
    setCompleting, setGameStarted, setLiveScore, setMinutes, setPendingIrregular,
    setPlusOneConflict, setReopening, setSavingOppScore, setShowComplete, setShowPlusOneModal,
    setStartingGame, setStatsRefresh, slots, completedIdsRef, leagueHeaders, leagueId, loadRoster,
    refreshFoulEvents, refreshSlots, resumeSnapRef, selectSlot, selectedSlot, setLineup } = ctx
  // 선발 체크된 선수만 onCourt + minutes INSERT (실제 로직)
  async function doStartGame(starterIds: string[]) {
    setStartingGame(true)
    await Promise.all(starterIds.map(pid =>
      fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: pid, quarter: currentQuarter, in_time: 0 }),
      })
    ))
    setLineup(starterIds)
    setGameStarted(true)
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_started: true }),
    })
    // minutes 재로드
    const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
    if (r.ok) setMinutes(await r.json())
    refreshSlots()
    setStartingGame(false)
  }

  // 플러스원 충돌 체크 후 경기 시작
  async function startGame() {
    if (!selectedSlotId) return
    const starterIds = Array.from(selectedStarters)
    if (starterIds.length === 0) { toast.error('선발 선수를 1명 이상 선택하세요'); return }
    const homeStarters = starterIds.filter(id => homeRoster.some(p => p.id === id))
    const awayStarters = starterIds.filter(id => awayRoster.some(p => p.id === id))
    if (homeStarters.length > 5 || awayStarters.length > 5) {
      toast.error(`팀당 선발은 최대 5명입니다 (홈 ${homeStarters.length}명 / 어웨이 ${awayStarters.length}명)`)
      return
    }

    // 플러스원 충돌 체크: 같은 팀 스타터 중 plus_one=true가 2명 이상
    function checkPlusOneConflict(teamStarters: string[], roster: RosterPlayer[], teamName: string) {
      const plusOnePlayers = teamStarters
        .map(id => roster.find(p => p.id === id))
        .filter((p): p is RosterPlayer => !!(p?.plus_one))
      if (plusOnePlayers.length >= 2) return { teamName, players: plusOnePlayers }
      return null
    }
    const homeConflict = checkPlusOneConflict(homeStarters, homeRoster, selectedSlot?.home_team?.name ?? '홈팀')
    const awayConflict = checkPlusOneConflict(awayStarters, awayRoster, selectedSlot?.away_team?.name ?? '어웨이팀')
    const conflict = homeConflict || awayConflict
    if (conflict) {
      setPlusOneConflict(conflict)
      setShowPlusOneModal(true)
      return
    }

    // 플러스원 충돌 없으면 기존 plus_one 플래그 사용
    const allPlusOneIds = [...homeRoster, ...awayRoster]
      .filter(p => selectedStarters.has(p.id) && p.plus_one)
      .map(p => p.id)
    setActivePlusOneIds(allPlusOneIds)
    await doStartGame(starterIds)
  }

  // 플러스원 충돌 모달에서 선택 처리
  async function handlePlusOneSelect(selectedId: string) {
    setShowPlusOneModal(false)
    const conflictTeam = plusOneConflict
    setPlusOneConflict(null)

    // 이미 시작된 경기면 전체 로스터 기준, 아니면 선발 기준
    const base = gameStarted
      ? [...homeRoster, ...awayRoster].filter(p => p.plus_one).map(p => p.id)
      : [...homeRoster, ...awayRoster].filter(p => selectedStarters.has(p.id) && p.plus_one).map(p => p.id)

    // 충돌 팀은 선택된 선수만, 나머지 팀은 전부
    const finalPlusOneIds = base.filter(id => {
      if (conflictTeam?.players.some(p => p.id === id)) return id === selectedId
      return true
    })
    setActivePlusOneIds(finalPlusOneIds)

    // DB에 plus_one_player_id 저장
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ plus_one_player_id: selectedId }),
    })

    // 이미 시작된 경기라면 doStartGame 호출 안 함 (라인업 중복 방지)
    if (!gameStarted) {
      const starterIds = Array.from(selectedStarters)
      await doStartGame(starterIds)
    }
  }

  /** 대회 상대 최종 점수를 저장하고 스코어를 다시 계산한다. 마감 모달에서 쓴다. */
  async function saveOppFinalScore(): Promise<boolean> {
    if (!selectedSlotId) return false
    const raw = oppFinalScore.trim()
    const value = raw === '' ? null : Number(raw)
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 300)) {
      toast.error('상대 점수는 0~300 사이의 정수로 입력하세요')
      return false
    }
    setSavingOppScore(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ opponent_score_manual: value }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        toast.error(b?.error ?? '상대 점수 저장 실패')
        return false
      }
      await refreshSlots()
      // 저장 직후 재계산해야 모달의 스코어가 방금 넣은 값으로 바뀐다.
      await fetchLiveScore()
      return true
    } finally {
      setSavingOppScore(false)
    }
  }

  async function completeGame() {
    if (!selectedSlotId) { toast.error('경기를 선택하세요'); return }
    // 대회는 마감이 곧 상대 점수를 확정하는 시점이다 — 재계산 **전에** 저장해야
    //   아래 recompute 가 그 값을 반영한다(순서가 바뀌면 한 박자 늦게 반영된다).
    if (isTournament) {
      const ok = await saveOppFinalScore()
      if (!ok) return
    }
    setCompleting(true)
    try {
      const recomputeRes = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (recomputeRes.ok) {
        const scores = await recomputeRes.json()
        setLiveScore(scores)
      }
      const patchRes = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ is_complete: true }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error((err.error as string) ?? `완료 처리 실패 (${patchRes.status})`)
      }
      setShowComplete(false)
      // 마감했으니 「이어서 기록」 대상이 아니다. 저장 effect 의 정리 함수가 한 번 더 쓰지 않게
      //   먼저 스냅샷을 끈다(이 경기가 is_complete 로 바뀌며 effect 가 정리된다).
      resumeSnapRef.current = { ...resumeSnapRef.current, on: false }
      if (selectedSlotId) completedIdsRef.current.add(selectedSlotId)
      clearResume(leagueId, selectedSlotId)
      // 마감 → 다음 경기로 한 번에 (2026-10-11). 종전엔 위로 올라가 슬롯을 다시 골라야 했다.
      const cur = slots.find(s => s.id === selectedSlotId)
      const next = cur
        ? [...slots].filter(s => s.slot_num > cur.slot_num && !s.is_complete).sort((a, b) => a.slot_num - b.slot_num)[0]
        : undefined
      toast.success('경기 완료 처리됨', next ? {
        duration: 10000,
        action: { label: `${next.slot_num}경기 기록하기 →`, onClick: () => { selectSlot(next) } },
      } : undefined)
      refreshSlots()
    } catch (e) {
      toast.error(`마감 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setCompleting(false)
    }
  }

  // 마감된 경기를 다시 기록 모드로 복귀 (이벤트 유지, is_complete만 해제)
  async function reopenGame() {
    if (!selectedSlotId) return
    if (!confirm('마감을 풀고 이 경기를 다시 기록할까요?\n\n· 지금까지의 기록은 그대로 남습니다\n· 다 고친 뒤에는 다시 「마감」을 눌러 주세요')) return
    setReopening(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_complete: false }),
    })
    setReopening(false)
    if (!res.ok) { toast.error('전환 실패'); return }
    completedIdsRef.current.delete(selectedSlotId)
    toast.success('다시 기록할 수 있습니다 — 지금까지의 기록은 그대로입니다')
    await refreshSlots()
    // 코트 상태 복원 (다시 기록하기 후에도 선수 표시 유지)
    const mRes = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
    if (mRes.ok) {
      const mins: MinRow[] = await mRes.json()
      setMinutes(mins)
      const courtIds = mins.filter(m => m.out_time === null).map(m => m.league_player_id)
      setLineup(courtIds)
    }
  }

  // 마감 버튼 클릭 핸들러: 점수 미리 계산 후 모달 표시
  async function openCompleteModal() {
    setShowComplete(true)
    await fetchLiveScore()
  }

  async function fetchLiveScore() {
    if (!selectedSlotId) return
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/recompute`, {
      method: 'POST',
      headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json()
      setLiveScore({ home: data.home_score ?? data.home ?? 0, away: data.away_score ?? data.away ?? 0 })
    }
  }

  function handleEventSaved(eventType?: string) {
    setStatsRefresh(k => k + 1)
    if (selectedSlotId) {
      fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
        .then(r => r.json()).then(setMinutes)
    }
    // 파울 수는 파울이 저장·취소됐을 때만 다시 센다(종류를 모르면 안전하게 다시 센다) —
    //   매 기록마다 이벤트 전체를 다시 받지 않기 위해서다.
    if (eventType === undefined || eventType === 'foul') refreshFoulEvents()
  }

  // 비정규 선수를 홈/어웨이 팀에 추가 (이 경기 하나에만 유효 — 다른 경기에 뛰면 그 경기에서 따로 지정)
  async function addIrregularToTeam(player: IrregularPlayer, side: 'home' | 'away') {
    if (!selectedSlotId) { toast.error('경기를 선택하세요'); return }
    const teamId = side === 'home' ? selectedSlot?.home_team_id : selectedSlot?.away_team_id
    if (!teamId) { toast.error('팀이 지정되지 않았습니다'); return }
    setAddingIrregular(true)
    // 경기별 배정 (league_game_players) — 이 경기(selectedSlotId)에만 배정된다.
    //   (2026-08-08 사고: 예전엔 서버에서 같은 날짜·같은 팀 경기에도 자동 배정했다 —
    //    정규 선수가 다른 팀 게스트로 한 경기 뛰면 그날 전체 소속이 바뀌는 사고로 이어져 제거함.)
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/irregular-players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: player.id, team_id: teamId }),
    })
    if (!res.ok) {
      setAddingIrregular(false)
      toast.error('게스트·임시 선수 추가 실패')
      return
    }
    // 게임이 시작된 경우, minutes도 INSERT
    if (gameStarted) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: player.id, quarter: currentQuarter, in_time: 0 }),
      })
      const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
      if (r.ok) setMinutes(await r.json())
    }
    // roster 재로드
    if (selectedSlot) await loadRoster(selectedSlot)
    setPendingIrregular(null)
    setAddingIrregular(false)
    toast.success(`${player.name} → ${side === 'home' ? selectedSlot?.home_team?.name ?? '홈' : selectedSlot?.away_team?.name ?? '어웨이'} 추가됨`)
  }

  return { startGame, handlePlusOneSelect, completeGame, reopenGame, openCompleteModal, fetchLiveScore, handleEventSaved, addIrregularToTeam }
}
