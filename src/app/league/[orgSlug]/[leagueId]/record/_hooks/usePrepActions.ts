import { toast } from 'sonner'
import { QUARTER_OPTIONS } from '../_lib/constants'
import type { GameSlot } from '../_lib/types'
import type { RecordState } from './useRecordState'

// ── 기록 준비 카드의 동작 ─────────────────────────────────────────────
//   화면 좌우 반전 · 팀 후보/저장/홈↔원정 · 임시팀 · 정규/친선 · 슬롯 추가/삭제 · 이 경기 +1 · 쿼터별 +1.
//   훅을 쓰지 않는다 — 분리 전처럼 매 렌더 새로 만들어지는 함수다.
export type UsePrepActionsCtx = Pick<RecordState,
  'adhocTeams' | 'currentQuarter' | 'extraP1AllSlots' | 'newTeamColor' | 'newTeamName' | 'pendingAway' | 'pendingHome' | 'savingExtraP1' | 'selectedDate' | 'selectedSlotId' | 'setAddingSlot' | 'setCreatingTeam' | 'setDeletingSlot' | 'setDeletingTeamId' | 'setLiveScore' | 'setNewTeamName' | 'setPendingAway' | 'setPendingHome' | 'setSavingExtraP1' | 'setSavingTeam' | 'setSelectedSlotId' | 'setSlots' | 'setStatsRefresh' | 'setSwappingId' | 'slots' | 'teams'
> & {
  autoFillRotation: (fresh: GameSlot[], opts?: { onlyEmpty?: boolean }) => Promise<void>
  leagueHeaders: Record<string, string>
  leagueId: string
  loadAdhocTeams: (date: string) => Promise<void>
  loadRoster: (slot: GameSlot) => Promise<void>
  refreshSlots: () => Promise<GameSlot[] | null>
  resetLineup: () => void
  selectedSlot: GameSlot | null
  sidesFlipped: boolean
  swappedQuarters: number[]
}

export function usePrepActions(ctx: UsePrepActionsCtx) {
  const { adhocTeams, currentQuarter, extraP1AllSlots, newTeamColor, newTeamName, pendingAway,
    pendingHome, savingExtraP1, selectedDate, selectedSlotId, setAddingSlot, setCreatingTeam,
    setDeletingSlot, setDeletingTeamId, setLiveScore, setNewTeamName, setPendingAway,
    setPendingHome, setSavingExtraP1, setSavingTeam, setSelectedSlotId, setSlots, setStatsRefresh,
    setSwappingId, slots, teams, autoFillRotation, leagueHeaders, leagueId, loadAdhocTeams,
    loadRoster, refreshSlots, resetLineup, selectedSlot, sidesFlipped, swappedQuarters } = ctx
  /** 지금 쿼터의 좌우를 뒤집는다(그 쿼터에만 적용, 즉시 저장). */
  async function toggleQuarterSides() {
    if (!selectedSlotId || !selectedSlot) return
    const next = sidesFlipped
      ? swappedQuarters.filter(q => q !== currentQuarter)
      : [...swappedQuarters, currentQuarter].sort((a, b) => a - b)
    // 화면을 먼저 뒤집는다 — 영상을 보며 누르는 버튼이라 왕복을 기다리면 손이 끊긴다.
    setSlots(prev => prev.map(s => s.id === selectedSlotId ? { ...s, sides_swapped_quarters: next } : s))
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ sides_swapped_quarters: next }),
    })
    if (!res.ok) {
      // 저장에 실패했으면 화면도 되돌린다. 안 되돌리면 새로고침 때 조용히 제자리로 간다.
      setSlots(prev => prev.map(s => s.id === selectedSlotId ? { ...s, sides_swapped_quarters: swappedQuarters } : s))
      toast.error('좌우 저장에 실패했습니다')
    }
  }

  // ── 팀 드롭다운 후보 ──────────────────────────────────────────
  //   정규전: 상시팀(분기 override 적용된 이름).
  //   친선전: 이 날짜 임시팀만. 상시 3팀은 뺀다 — 친선전은 그날 짠 팀으로 하는 경기이지
  //           락다운/굿모닝이 뛴 경기가 아니고, 섞어 놓으면 손이 미끄러져 상시팀이 들어간다.
  //   예외: 이미 이 경기에 배정돼 있는 팀은 상시팀이라도 남긴다. 임시팀 개념이 없던 시절의
  //         친선전이 "팀 없음"으로 보이면 기록원이 그걸 덮어쓰고, 그 순간 옛 기록의
  //         team_id 와 경기 팀이 어긋난다.
  const teamOptions: { id: string; name: string }[] = (() => {
    if (!selectedSlot?.is_exhibition) return teams
    const opts: { id: string; name: string }[] = adhocTeams.map(t => ({ id: t.id, name: t.name }))
    const seen = new Set(opts.map(o => o.id))
    for (const t of [selectedSlot.home_team, selectedSlot.away_team]) {
      if (t && !seen.has(t.id)) { opts.push({ id: t.id, name: `${t.name} (상시팀)` }); seen.add(t.id) }
    }
    return opts
  })()

  // 이름 조회는 상시팀·임시팀을 함께 본다 — 친선전 화면에서 teams 만 뒤지면 항상 미스가 난다
  function teamNameById(id: string | null | undefined): string | null {
    if (!id) return null
    return teams.find(t => t.id === id)?.name ?? adhocTeams.find(t => t.id === id)?.name ?? null
  }

  // 이 날짜 전용 임시팀 만들기. 만든 즉시 비어 있는 쪽(홈 → 어웨이)에 꽂아 준다 —
  //   현장에서 만들고 다시 드롭다운을 여는 동작을 없애기 위해서다.
  async function createAdhocTeam() {
    const name = newTeamName.trim()
    if (!name) { toast.error('팀 이름을 입력하세요'); return }
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setCreatingTeam(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ name, color: newTeamColor, exhibition_date: selectedDate }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `팀 생성 실패 (${res.status})`); return }
      setNewTeamName('')
      await loadAdhocTeams(selectedDate)
      if (!pendingHome) setPendingHome(body.id)
      else if (!pendingAway && body.id !== pendingHome) setPendingAway(body.id)
      toast.success(`임시팀 "${name}" 생성 — ${selectedDate} 친선전에서만 쓰입니다`)
    } catch (e) {
      toast.error(`팀 생성 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setCreatingTeam(false)
    }
  }

  // 잘못 만든 임시팀 정리. 경기에 물려 있으면 서버가 409 로 막는다(기록이 끊기므로).
  async function deleteAdhocTeam(teamId: string, name: string) {
    if (!confirm(`임시팀 "${name}" 을 삭제하시겠습니까?\n\n· 이 팀이 배정된 경기가 있으면 삭제되지 않습니다`)) return
    setDeletingTeamId(teamId)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}`, {
        method: 'DELETE',
        headers: leagueHeaders,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `삭제 실패 (${res.status})`, { duration: 6000 }); return }
      if (pendingHome === teamId) setPendingHome('')
      if (pendingAway === teamId) setPendingAway('')
      await loadAdhocTeams(selectedDate)
      toast.success('임시팀 삭제됨')
    } finally {
      setDeletingTeamId(null)
    }
  }

  async function saveTeams() {
    if (!pendingHome || !pendingAway) { toast.error('홈·어웨이 팀을 모두 선택하세요'); return }
    if (pendingHome === pendingAway) { toast.error('같은 팀을 선택할 수 없습니다'); return }

    // 이미 기록이 들어간 경기의 팀 교체는 **이벤트 이관과 한 묶음**이어야 한다.
    //   경기의 home/away 만 바꾸면 league_game_events.team_id 가 이 경기와 무관한 팀을 가리켜
    //   그 선수들이 박스스코어에서 통째로 사라진다(화면은 멀쩡하고 점수만 빈다).
    const recorded = !!selectedSlot && (selectedSlot.is_started || selectedSlot.is_complete)
    if (recorded) {
      const nameOf = (id: string) => teamOptions.find(t => t.id === id)?.name ?? teamNameById(id) ?? '?'
      if (!confirm(
        `기록이 있는 경기의 팀을 바꿉니다.

` +
        `· 홈: ${teamNameById(selectedSlot!.home_team_id) ?? '-'} → ${nameOf(pendingHome)}
` +
        `· 어웨이: ${teamNameById(selectedSlot!.away_team_id) ?? '-'} → ${nameOf(pendingAway)}

` +
        `이 경기에 저장된 기록과 명단의 소속 팀도 함께 옮깁니다.
` +
        `좌우가 통째로 뒤집히는 경우에는 스코어도 같이 뒤집습니다.`
      )) return
      setSavingTeam(true)
      try {
        const r = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/reassign-teams`, {
          method: 'POST',
          headers: leagueHeaders,
          body: JSON.stringify({ home_team_id: pendingHome, away_team_id: pendingAway }),
        })
        const b = await r.json().catch(() => ({}))
        if (!r.ok) { toast.error(b.error ?? `팀 교체 실패 (${r.status})`, { duration: 8000 }); return }
        toast.success(`팀 교체 완료 — 기록 ${b.moved ?? 0}건 이관${b.swapped_scores ? ' · 스코어 좌우 교체' : ''}`)
        const fresh = await refreshSlots()
        if (fresh) await autoFillRotation(fresh)
        const updated = slots.find(x => x.id === selectedSlotId)
        if (updated) await loadRoster({ ...updated, home_team_id: pendingHome, away_team_id: pendingAway })
        setStatsRefresh(v => v + 1)
      } finally {
        setSavingTeam(false)
      }
      return
    }

    setSavingTeam(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ home_team_id: pendingHome, away_team_id: pendingAway }),
    })
    setSavingTeam(false)
    if (res.ok) {
      toast.success('팀 저장 완료')
      const fresh = await refreshSlots()
      if (fresh) await autoFillRotation(fresh)
      const updated = slots.find(s => s.id === selectedSlotId)
      if (updated) await loadRoster({ ...updated, home_team_id: pendingHome, away_team_id: pendingAway })
    } else {
      // 서버가 거절 이유를 준다(임시팀·날짜 불일치 등). 뭉개면 기록원이 같은 시도를 반복한다.
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '팀 저장 실패', { duration: 6000 })
    }
  }

  // 좌우(홈↔어웨이) 뒤집기 — 코트 배치가 무작위라 매번 손으로 다시 고르지 않게 한다.
  // 이미 기록이 들어간 경기는 점수 대응이 어긋나므로 막는다.
  async function swapSides(slotId: string) {
    const slot = slots.find(s => s.id === slotId)
    if (!slot?.home_team_id || !slot?.away_team_id) { toast.error('먼저 두 팀을 지정하세요'); return }
    if (slot.is_started || slot.is_complete) {
      toast.error('기록이 시작된 경기는 홈·원정을 바꿀 수 없습니다', {
        description: '이미 저장된 점수·기록과 홈·원정이 어긋납니다. 화면 배치만 맞추려면 영상 칸의 「화면 좌우 반전」을 쓰세요',
        duration: 6000,
      })
      return
    }
    setSwappingId(slotId)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/games?gameId=${slotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ home_team_id: slot.away_team_id, away_team_id: slot.home_team_id }),
      })
      if (!r.ok) throw new Error(`저장 실패 (${r.status})`)
      await refreshSlots()
      if (slotId === selectedSlotId) {
        setPendingHome(slot.away_team_id)
        setPendingAway(slot.home_team_id)
        const updated = { ...slot, home_team_id: slot.away_team_id, away_team_id: slot.home_team_id }
        await loadRoster(updated)
      }
      toast.success('홈·원정을 바꿨습니다')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '홈·원정 바꾸기 실패')
    } finally {
      setSwappingId(null)
    }
  }

  // 개별 경기 친선 토글 (리그 순위 제외 ↔ 정규전 복귀)
  async function toggleExhibition() {
    if (!selectedSlotId || !selectedSlot) return
    const current = !!selectedSlot.is_exhibition
    const next = !current
    const msg = next
      ? '이 경기를 친선전으로 표시하시겠습니까?\n\n· 리그 순위·개인 스탯·마일스톤 집계에서 모두 제외됨\n· 박스스코어·하이라이트에는 그대로 남음\n\n· 팀 구성이 이 경기 전용으로 바뀝니다 — 분기 소속을 따르지 않고\n  이 화면에서 직접 배정한 선수만 명단이 됩니다\n\n· 팀도 이 날짜 전용 임시팀에서 고릅니다 — 아래에서 만들어 배정하세요'
      : '이 경기를 정규전으로 되돌리시겠습니까?\n\n· 리그 순위·개인 스탯 집계에 다시 포함됨\n· 명단이 분기 소속 기준으로 돌아갑니다\n\n· 임시팀이 배정돼 있으면 되돌릴 수 없습니다 (상시팀으로 먼저 교체)'
    if (!confirm(msg)) return
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_exhibition: next }),
    })
    if (res.ok) {
      toast.success(next ? '친선전으로 변경 — 팀 구성을 이 화면에서 직접 배정하세요' : '정규전으로 복귀')
      await refreshSlots()
      // 명단 기준이 통째로 바뀌므로(분기 소속 ↔ 이 경기 전용) 다시 읽는다.
      //   refreshSlots 는 슬롯만 갱신해서, 안 하면 바뀌기 전 명단이 화면에 그대로 남는다.
      const reloaded = { ...selectedSlot, is_exhibition: next }
      if (reloaded.home_team_id && reloaded.away_team_id) await loadRoster(reloaded)
    } else {
      // 409 = 임시팀이 배정된 채로 정규전 복귀를 시도한 경우. 이유를 그대로 보여준다.
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '변경 실패', { duration: 7000 })
    }
  }

  // 이 날짜에 슬롯 한 칸 추가. 리그 설정(games_per_round)은 건드리지 않는다 —
  //   그걸 바꾸면 모든 날짜가 같이 늘어난다.
  async function addSlot() {
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setAddingSlot(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ date: selectedDate, addSlot: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `슬롯 추가 실패 (${res.status})`, { duration: 6000 }); return }
      setSlots(body.slots ?? [])
      toast.success(
        `${body.added_slot}경기 슬롯 추가됨${body.is_exhibition ? ' · 친선전' : ''}`,
        { description: body.is_exhibition ? '이 날짜의 다른 슬롯과 같은 친선전으로 만들어졌습니다' : undefined },
      )
    } catch (e) {
      toast.error(`슬롯 추가 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setAddingSlot(false)
    }
  }

  // 선택된 슬롯 삭제. 기록이 붙은 슬롯은 서버가 409 로 막는다 —
  //   league_games 삭제는 league_game_events 로 캐스케이드돼 그 경기 기록이 영구 소멸한다.
  async function deleteSlot() {
    if (!selectedSlot) return
    if (!confirm(
      `${selectedSlot.slot_num}경기 슬롯을 삭제하시겠습니까?

` +
      `· 기록이 하나라도 있으면 삭제되지 않습니다
` +
      `· 뒤 슬롯 번호는 다시 매기지 않습니다 (번호가 비어도 기록에는 지장 없음)`
    )) return
    setDeletingSlot(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlot.id}`, {
        method: 'DELETE',
        headers: leagueHeaders,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `삭제 실패 (${res.status})`, { duration: 7000 }); return }
      setSelectedSlotId('')
      resetLineup()
      await refreshSlots()
      toast.success('슬롯 삭제됨')
    } finally {
      setDeletingSlot(false)
    }
  }

  // 이 경기 한정 +1 토글.
  //   선수 목록의 +1 은 **전역 플래그**라 켜는 순간 과거 마감 경기까지 소급된다 —
  //   그 선수의 과거 야투마다 점수가 올라가 순위·기록이 통째로 바뀐다. 그래서 "이번 경기만"은
  //   반드시 경기 쪽(league_games.plus_one_extra_ids)에 담는다. 판정 정본은 scoring.ts isPlusOneFor().
  /**
   * 한 선수의 +1 을 특정 쿼터에서만 적용/해제 (113).
   *
   * 전반과 후반의 +1 선수가 다른 경기가 있다. 경기 단위 지정만으로는 둘 중 하나만 고를 수
   * 있어 어느 쪽으로 정하든 절반이 틀린 점수가 된다.
   * ⚠ 저장 후 반드시 recompute — 이미 기록된 이벤트의 저장 점수가 옛 판정으로 남으면
   *   화면 집계(재계산)와 저장 스코어가 갈린다(2026-08-23 에 실제로 1건 어긋난 적이 있다).
   */
  async function togglePlusOneQuarter(playerId: string, quarter: number) {
    if (!selectedSlot || savingExtraP1) return
    const cur = (selectedSlot.plus_one_quarters ?? {}) as Record<string, number[]>
    // 지정이 없으면 "전 쿼터" 다 — 거기서 한 쿼터를 끄면 나머지 전부가 남는다.
    const base = cur[playerId] ?? QUARTER_OPTIONS.map(q => q.value)
    const next = base.includes(quarter) ? base.filter(q => q !== quarter) : [...base, quarter].sort((a, b) => a - b)

    const merged: Record<string, number[]> = { ...cur }
    // 전 쿼터가 켜졌으면 제한이 없는 것과 같다 — 키를 지워 "제한 없음" 으로 되돌린다.
    if (next.length === 0 || next.length === QUARTER_OPTIONS.length) delete merged[playerId]
    else merged[playerId] = next

    setSavingExtraP1(playerId)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlot.id}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ plus_one_quarters: Object.keys(merged).length > 0 ? merged : null }),
      })
      if (!r.ok) {
        const b = await r.json().catch(() => ({}))
        toast.error(b?.error ?? '쿼터별 +1 저장 실패')
        return
      }
      const sc = await fetch(`/api/leagues/${leagueId}/games/${selectedSlot.id}/recompute`, {
        method: 'POST', headers: { ...leagueHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      }).then(res => res.ok ? res.json() : null).catch(() => null)
      if (sc) setLiveScore({ home: sc.home_score ?? sc.home ?? 0, away: sc.away_score ?? sc.away ?? 0 })
      await refreshSlots()
      setStatsRefresh(v => v + 1)
    } finally {
      setSavingExtraP1(null)
    }
  }

  async function toggleExtraPlusOne(playerId: string, playerName: string) {
    if (!selectedSlot) return
    const cur = selectedSlot.plus_one_extra_ids ?? []
    const on = cur.includes(playerId)
    const next = on ? cur.filter(id => id !== playerId) : [...cur, playerId]
    // 이 날짜 전 슬롯에 적용 — 쿼터를 슬롯으로 쪼갠 날은 한 경기가 4칸이라 한 칸씩 누르면 어긋나기 쉽다.
    const targets = extraP1AllSlots ? slots : [selectedSlot]
    setSavingExtraP1(playerId)
    try {
      const failed: number[] = []
      for (const sl of targets) {
        const c = sl.plus_one_extra_ids ?? []
        const n = on ? c.filter(id => id !== playerId) : (c.includes(playerId) ? c : [...c, playerId])
        const r = await fetch(`/api/leagues/${leagueId}/games?gameId=${sl.id}`, {
          method: 'PATCH',
          headers: leagueHeaders,
          body: JSON.stringify({ plus_one_extra_ids: n }),
        })
        if (!r.ok) { failed.push(sl.slot_num); continue }
        // 이미 기록된 이벤트의 저장 점수를 다시 맞춘다 — 안 하면 화면 집계와 저장 스코어가 갈린다.
        if (sl.is_started || sl.is_complete) {
          const sc = await fetch(`/api/leagues/${leagueId}/games/${sl.id}/recompute`, {
            method: 'POST', headers: { ...leagueHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
          }).then(res => res.ok ? res.json() : null).catch(() => null)
          if (sc && sl.id === selectedSlotId) setLiveScore({ home: sc.home_score ?? sc.home ?? 0, away: sc.away_score ?? sc.away ?? 0 })
        }
      }
      await refreshSlots()
      setStatsRefresh(v => v + 1)
      if (failed.length > 0) {
        toast.error(`${failed.join(', ')}경기 슬롯 저장 실패 — 다시 시도하세요`, { duration: 7000 })
      } else {
        const scope = extraP1AllSlots ? `${selectedDate} 전 슬롯` : '이 경기'
        toast.success(on ? `${playerName} — ${scope} +1 해제` : `${playerName} — ${scope}에만 +1 적용`)
      }
    } finally {
      setSavingExtraP1(null)
    }
  }

  return { toggleQuarterSides, teamOptions, teamNameById, createAdhocTeam, deleteAdhocTeam, saveTeams, swapSides, toggleExhibition, addSlot, deleteSlot, togglePlusOneQuarter, toggleExtraPlusOne }
}
