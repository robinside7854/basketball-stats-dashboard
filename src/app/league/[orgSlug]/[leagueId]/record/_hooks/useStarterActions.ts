import type React from 'react'
import { toast } from 'sonner'
import { startersFromMinutes } from '../_lib/starters'
import type { GameSlot, IrregularPlayer, MinRow } from '../_lib/types'
import type { RecordState } from './useRecordState'

// ── 선발 고르기 동작 ── 체크 토글 · 팀 전체 · 「지난 경기와 같은 선발」 · 드롭
//   훅을 쓰지 않는다 — 분리 전처럼 매 렌더 새로 만들어지는 함수다.
export type UseStarterActionsCtx = Pick<RecordState,
  'awayRoster' | 'homeRoster' | 'irregularRoster' | 'isTournament' | 'setApplyingPrevStarters' | 'setDragOverSide' | 'setDraggingPlayerId' | 'setSelectedStarters' | 'slots'
> & {
  addIrregularToTeam: (player: IrregularPlayer, side: 'home' | 'away') => Promise<void>
  leagueId: string
  selectedSlot: GameSlot | null
}

export function useStarterActions(ctx: UseStarterActionsCtx) {
  const { awayRoster, homeRoster, irregularRoster, isTournament, setApplyingPrevStarters,
    setDragOverSide, setDraggingPlayerId, setSelectedStarters, slots, addIrregularToTeam, leagueId,
    selectedSlot } = ctx
  function toggleStarter(pid: string) {
    setSelectedStarters(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function selectAllTeam(side: 'home' | 'away') {
    const ids = (side === 'home' ? homeRoster : awayRoster).map(p => p.id)
    setSelectedStarters(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => next.has(id))
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  // ── 「지난 경기와 같은 선발」 ──────────────────────────────────────
  //   하루 9경기 로테이션이라 같은 팀이 하루에 여러 번 나오고, 선발도 대개 그대로다.
  //   같은 날 앞 경기(기록이 시작된 것) 중 이 팀이 나온 가장 가까운 경기의 선발을 그대로 체크해 준다.
  //   ⚠ 맞는 팀만 채운다 — 다른 쪽 팀의 체크는 건드리지 않는다. 채운 뒤에도 손으로 고칠 수 있다.
  //   선발은 출전시간 표에 in_time 0 으로 들어간다(doStartGame). 경기 중 영상 없이 교체하면
  //   교체도 in_time 0 이 될 수 있어, 첫 줄이 저장된 시각 근처(15초)에 함께 들어간 행만 선발로 본다.
  //   대회에서는 쓰지 않는다 — 대회 경기는 날짜마다 하나뿐이라 "같은 날 앞 경기"가 없다.
  const prevStarterSources: { side: 'home' | 'away'; teamName: string; src: GameSlot }[] = (() => {
    if (isTournament || !selectedSlot) return []
    const out: { side: 'home' | 'away'; teamName: string; src: GameSlot }[] = []
    for (const side of ['home', 'away'] as const) {
      const teamId = side === 'home' ? selectedSlot.home_team_id : selectedSlot.away_team_id
      if (!teamId) continue
      const src = slots
        .filter(x => x.id !== selectedSlot.id && x.slot_num < selectedSlot.slot_num && x.is_started
          && (x.home_team_id === teamId || x.away_team_id === teamId))
        .sort((a, b) => b.slot_num - a.slot_num)[0]
      if (src) {
        const team = side === 'home' ? selectedSlot.home_team : selectedSlot.away_team
        out.push({ side, teamName: team?.name ?? (side === 'home' ? '홈팀' : '어웨이팀'), src })
      }
    }
    return out
  })()

  async function applyPrevStarters() {
    if (prevStarterSources.length === 0) return
    setApplyingPrevStarters(true)
    try {
      const bySlot = new Map<string, MinRow[]>()
      for (const id of new Set(prevStarterSources.map(x => x.src.id))) {
        const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${id}`, { cache: 'no-store' }).catch(() => null)
        bySlot.set(id, r?.ok ? ((await r.json()) as MinRow[]) : [])
      }
      const picks: { rosterIds: string[]; pick: string[] }[] = []
      const filled: string[] = []
      for (const { side, teamName, src } of prevStarterSources) {
        const starters = startersFromMinutes(bySlot.get(src.id) ?? [])
        const roster = side === 'home' ? homeRoster : awayRoster
        const pick = roster.filter(p => starters.has(p.id)).map(p => p.id)
        if (pick.length === 0) continue
        picks.push({ rosterIds: roster.map(p => p.id), pick })
        filled.push(`${teamName} ${pick.length}명 (${src.slot_num}경기 선발)`)
      }
      if (picks.length === 0) {
        toast.info('앞 경기의 선발 기록을 찾지 못했습니다', { description: '직접 체크해 주세요' })
        return
      }
      setSelectedStarters(prev => {
        const next = new Set(prev)
        for (const { rosterIds, pick } of picks) {
          rosterIds.forEach(id => next.delete(id))
          pick.forEach(id => next.add(id))
        }
        return next
      })
      toast.success('지난 경기와 같은 선발로 체크했습니다', { description: filled.join(' · ') })
    } finally {
      setApplyingPrevStarters(false)
    }
  }

  // ── 드래그 앤 드롭 헬퍼 ───────────────────────────────────────

  async function handleDrop(e: React.DragEvent, side: 'home' | 'away') {
    e.preventDefault()
    setDragOverSide(null)
    setDraggingPlayerId(null)
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId) return

    const allPoolPlayers = [...homeRoster, ...awayRoster, ...irregularRoster]
    const player = allPoolPlayers.find(p => p.id === playerId)
    if (!player) return

    const isHome = homeRoster.some(p => p.id === playerId)
    const isAway = awayRoster.some(p => p.id === playerId)

    if ((side === 'home' && isHome) || (side === 'away' && isAway)) {
      // 같은 팀에 드롭 → 선발 토글
      toggleStarter(playerId)
      return
    }

    // 다른 팀 또는 미배정 풀 → addIrregularToTeam 호출
    await addIrregularToTeam(player as IrregularPlayer, side)
  }


  return { toggleStarter, selectAllTeam, prevStarterSources, applyPrevStarters, handleDrop }
}
