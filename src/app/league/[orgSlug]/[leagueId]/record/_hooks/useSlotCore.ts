import { toast } from 'sonner'
import type { LeaguePlayer } from '@/types/league'
import type { Game } from '@/types/database'
import { rotationFromFirstTwo, generateRotation } from '@/lib/league/rotation'
import type { GameSlot, IrregularPlayer, MinRow, RosterPlayer } from '../_lib/types'
import type { RecordState } from './useRecordState'

// ── 날짜·슬롯의 뼈대 동작 ─────────────────────────────────────────────
//   명단 로드 · 날짜 열기(리그는 슬롯 생성 POST · 대회는 읽기만) · 슬롯 열기 · 슬롯 다시 읽기 · 대진 자동 편성.
//   훅을 쓰지 않는다 — 분리 전처럼 **매 렌더 새로 만들어지는 함수**라 그 렌더의 값을 그대로 본다.
//   딥링크(useDeepLink)와 다른 동작들이 이것을 부르므로 페이지에서 가장 먼저 만든다.
export type UseSlotCoreCtx = Pick<RecordState,
  'isTournament' | 'selectedDate' | 'selectedSlotId' | 'setAwayRoster' | 'setGameStarted' | 'setHomeRoster' | 'setInitializingSlots' | 'setIrregularRoster' | 'setLiveScore' | 'setMinutes' | 'setPendingAway' | 'setPendingHome' | 'setPlusOneConflict' | 'setRosterLoading' | 'setSelectedDate' | 'setSelectedSlotId' | 'setShowPlusOneModal' | 'setSlots'
> & {
  leagueHeaders: Record<string, string>
  leagueId: string
  resetLineup: () => void
  setCurrentGame: (game: Game | null) => void
  setLineup: (playerIds: string[]) => void
}

export function useSlotCore(ctx: UseSlotCoreCtx) {
  const { isTournament, selectedDate, selectedSlotId, setAwayRoster, setGameStarted, setHomeRoster,
    setInitializingSlots, setIrregularRoster, setLiveScore, setMinutes, setPendingAway,
    setPendingHome, setPlusOneConflict, setRosterLoading, setSelectedDate, setSelectedSlotId,
    setShowPlusOneModal, setSlots, leagueHeaders, leagueId, resetLineup, setCurrentGame, setLineup } = ctx
  async function loadRoster(slot: GameSlot) {
    if (!slot.home_team_id || !slot.away_team_id) return
    setRosterLoading(true)
    let assignedIrregularIds: string[] = []
    // roster API 응답의 resolved quarter_id 를 사용 — 게임에 quarter_id 가 null 로 저장되어 있어도
    // 서버에서 date 매칭으로 자동 유추 후 반환 (그리고 백필). 이 값으로 미배정 풀도 조회해야
    // 게스트/비정규 선수 추가가 정상 동작.
    let effectiveQuarterId: string | null = slot.quarter_id ?? null
    const rRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/roster`)
    if (rRes.ok) {
      const rd = await rRes.json()
      const home: RosterPlayer[] = rd.home ?? []
      const away: RosterPlayer[] = rd.away ?? []
      setHomeRoster(home)
      setAwayRoster(away)
      assignedIrregularIds = rd.assigned_irregular_ids ?? []
      if (rd.quarter_id) effectiveQuarterId = rd.quarter_id
      // 친선전 = 스팟 구성. 서버가 "이 팀 명단 전체 − 이미 배정된 사람"을 후보로 내려준다.
      //   분기 명단(quarters/[id]/players)을 부르지 않는 게 핵심이다 — 부르는 순간
      //   "원래 어느 팀 소속" 이라는 개념이 화면에 다시 새어들어 스팟 구성 전제가 깨진다.
      if (rd.is_exhibition) {
        setIrregularRoster((rd.unassigned ?? []).map((p: LeaguePlayer) => ({
          ...p, team_id: null, is_regular: false,
        })) as IrregularPlayer[])
        setRosterLoading(false)
        return
      }

      // 이미 시작된 경기 로드 시: plus_one 충돌 있으면 자동 팝업
      if (slot.is_started) {
        const homePO = home.filter(p => p.plus_one)
        const awayPO = away.filter(p => p.plus_one)
        const conflict = homePO.length >= 2
          ? { teamName: slot.home_team?.name ?? '홈팀', players: homePO }
          : awayPO.length >= 2
          ? { teamName: slot.away_team?.name ?? '어웨이팀', players: awayPO }
          : null
        if (conflict) {
          setPlusOneConflict(conflict)
          setShowPlusOneModal(true)
        }
      }
    }
    // 미배정 풀: 비정규/미배정 선수 + 이 경기에 출전하지 않는 다른 팀 선수(임대 가능)
    if (effectiveQuarterId) {
      const qRes = await fetch(`/api/leagues/${leagueId}/quarters/${effectiveQuarterId}/players`)
      if (qRes.ok) {
        const qd: IrregularPlayer[] = await qRes.json()
        const assignedSet = new Set(assignedIrregularIds)
        setIrregularRoster(qd.filter(p => {
          // 탈퇴 회원(is_active=false)은 새 경기에 "더 데려올" 후보에서 제외 —
          // 이미 이 경기에 배정돼 있었다면 위 assignedSet 분기에서 걸러지지 않고
          // homeRoster/awayRoster 쪽(roster API)이 과거 기록 보존 책임을 진다.
          if (p.is_active === false) return false
          if (assignedSet.has(p.id)) return false
          // 비정규/미배정 → 포함 (기존 동작)
          if (p.is_regular !== true) return true
          // 다른 팀 정규선수 → 임대 후보로 포함
          if (p.team_id && p.team_id !== slot.home_team_id && p.team_id !== slot.away_team_id) return true
          return false
        }))
      } else {
        setIrregularRoster([])
      }
    } else {
      setIrregularRoster([])
    }
    setRosterLoading(false)
  }

  // 날짜 선택 → 슬롯 초기화 + 로드
  async function selectDate(date: string) {
    setSelectedDate(date)
    setSelectedSlotId('')
    resetLineup()
    setGameStarted(false)
    setSlots([])

    if (!date) return
    setInitializingSlots(true)
    // ⚠ 대회는 **슬롯을 만들지 않는다.** 리그는 날짜를 열면 games_per_round 만큼 빈 슬롯을
    //   깔지만, 대회 경기는 대회(quarter_id)·상대팀과 함께 등록돼야 한다 — 여기서 만든 빈 슬롯은
    //   어느 대회 카드에도 안 잡히는 미아 경기가 되고, 기록하면 그 기록도 갈 곳이 없다.
    //   그래서 있는 경기만 읽는다.
    const res = isTournament
      ? await fetch(`/api/leagues/${leagueId}/games?date=${date}`, { cache: 'no-store' })
      : await fetch(`/api/leagues/${leagueId}/games`, {
          method: 'POST',
          headers: leagueHeaders,
          body: JSON.stringify({ date }),
        })
    setInitializingSlots(false)
    if (res.ok) setSlots(await res.json())
    else toast.error(isTournament ? '경기를 불러오지 못했습니다' : '슬롯 생성 실패')
  }

  // 슬롯 선택
  async function selectSlot(slot: GameSlot) {
    setSelectedSlotId(slot.id)
    setPendingHome(slot.home_team_id ?? '')
    setPendingAway(slot.away_team_id ?? '')
    setGameStarted(slot.is_started ?? false)
    setCurrentGame({ id: slot.id } as never)
    resetLineup()
    setHomeRoster([])
    setAwayRoster([])
    setIrregularRoster([])
    // DB에 저장된 값으로 즉시 초기화 (navigation 복귀 시 0:0 방지)
    if (slot.is_started) {
      setLiveScore({ home: slot.home_score ?? 0, away: slot.away_score ?? 0 })
    } else {
      setLiveScore(null)
    }

    await loadRoster(slot)

    // 이미 시작된 경기면 이벤트 기반 재계산으로 갱신
    if (slot.is_started) {
      const scoreRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (scoreRes.ok) {
        const scores = await scoreRes.json()
        setLiveScore({ home: scores.home_score ?? scores.home ?? 0, away: scores.away_score ?? scores.away ?? 0 })
      }
    }

    // 출전 기록 로드 + 코트 상태 복원 (out_time=null인 선수가 현재 코트)
    const res = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${slot.id}`)
    if (res.ok) {
      const mins: MinRow[] = await res.json()
      setMinutes(mins)
      if (slot.is_started) {
        const courtIds = mins.filter(m => m.out_time === null).map(m => m.league_player_id)
        setLineup(courtIds)
      }
    }
  }

  // ── 대진 자동 편성 (2026-10-10 재도입) ─────────────────────────────
  // 1·2경기 팀을 저장하면 3경기부터 끝 슬롯까지 「승자 잔류 · 2연속 휴식」 순서로 채운다.
  //   규칙은 src/lib/league/rotation.ts — 1·2경기에 같이 나온 팀이 1경기 승자다(점수 불필요).
  //   운영자는 각 경기 직전에 홈·원정만 뒤집으면 된다(팀 선택 사이의 「홈↔원정」 버튼).
  // ⚠ 건드리는 슬롯: 기록 전(시작·마감 아님)만. 기록이 있는 경기의 팀은 이벤트 이관이
  //   필요하므로(reassign-teams) 여기서 절대 바꾸지 않는다.
  // ⚠ 이미 같은 대진이면 그대로 둔다 — 운영자가 좌우를 바꿔 둔 것을 1·2경기 재저장이 되돌리지 않게.
  // 친선전 날·대회에서는 돌지 않는다(대진이 그날 짠 팀이거나 상대가 외부 팀).
  //   onlyEmpty: 팀이 빈 칸만 채운다 — 1·2경기를 저장한 게 아니라 칸이 새로 생긴 경우(영상 연동).
  async function autoFillRotation(fresh: GameSlot[], opts: { onlyEmpty?: boolean } = {}) {
    if (isTournament) return
    const ordered = [...fresh].filter(x => x.slot_num != null).sort((a, b) => a.slot_num - b.slot_num)
    if (ordered.some(x => x.is_exhibition)) return
    const g1 = ordered.find(x => x.slot_num === 1)
    const g2 = ordered.find(x => x.slot_num === 2)
    // 1·2경기를 저장할 때만 — 다른 슬롯을 손으로 고친 것이 덮이지 않게
    const savedNum = fresh.find(x => x.id === selectedSlotId)?.slot_num
    if (!g1 || !g2) return
    if (!opts.onlyEmpty && savedNum !== 1 && savedNum !== 2) return
    const r = rotationFromFirstTwo(
      { home: g1.home_team_id ?? null, away: g1.away_team_id ?? null },
      { home: g2.home_team_id ?? null, away: g2.away_team_id ?? null },
    )
    if (!r) {
      if (!opts.onlyEmpty && g1.home_team_id && g2.home_team_id) {
        toast.info('3경기 이후 자동 배정 안 함', {
          description: '1·2경기에 같이 나온 팀(1경기 승자)이 한 팀이어야 순서를 정할 수 있습니다',
        })
      }
      return
    }
    const targets = ordered.filter(x => x.slot_num >= 3)
    if (targets.length === 0) return
    const seq = generateRotation(r.winnerId, r.loserId, r.restingId, targets[targets.length - 1].slot_num - 1)
    let filled = 0
    let skippedRecorded = 0
    for (const slot of targets) {
      const want = seq[slot.slot_num - 2]
      if (!want) continue
      const samePair = [slot.home_team_id, slot.away_team_id].sort().join() === [want.homeTeamId, want.awayTeamId].sort().join()
      if (samePair) continue
      if (slot.is_started || slot.is_complete) { skippedRecorded++; continue }
      if (opts.onlyEmpty && (slot.home_team_id || slot.away_team_id)) continue
      const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${slot.id}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ home_team_id: want.homeTeamId, away_team_id: want.awayTeamId }),
      })
      if (res.ok) filled++
    }
    if (filled > 0) {
      await refreshSlots()
      const last = targets[targets.length - 1].slot_num
      toast.success(`3~${last}경기 대진 자동 배정 (${filled}경기)`, {
        description: '홈·원정이 다르면 경기마다 팀 선택 사이의 「홈↔원정」 버튼만 누르세요'
          + (skippedRecorded > 0 ? ` · 이미 기록된 ${skippedRecorded}경기는 그대로 뒀습니다` : ''),
        duration: 6000,
      })
    }
  }

  async function refreshSlots(): Promise<GameSlot[] | null> {
    if (!selectedDate) return null
    const res = await fetch(`/api/leagues/${leagueId}/games?date=${selectedDate}`, { cache: 'no-store' })
    if (res.ok) {
      const updated: GameSlot[] = await res.json()
      setSlots(updated)
      if (selectedSlotId) {
        const s = updated.find(x => x.id === selectedSlotId)
        if (s) {
          setPendingHome(s.home_team_id ?? '')
          setPendingAway(s.away_team_id ?? '')
          setGameStarted(s.is_started ?? false)
        }
      }
      return updated
    }
    return null
  }

  return { loadRoster, selectDate, selectSlot, refreshSlots, autoFillRotation }
}
