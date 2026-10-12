import { useRef, useState } from 'react'
import type { FoulRow } from '../_lib/types'
import type { RecordState } from './useRecordState'

export type UseFoulCountsCtx = Pick<RecordState,
  'currentQuarter' | 'selectedSlotId'
> & {
  leagueId: string
}

export function useFoulCounts(ctx: UseFoulCountsCtx) {
  const { currentQuarter, selectedSlotId, leagueId } = ctx
  // ── 파울 집계 ───────────────────────────────────────────────────────
  //   개인 파울(경기 전체)과 팀 파울(지금 쿼터)을 이 경기 기록에서 센다. 별도 저장값은 없다 —
  //   기록이 곧 진실이고, 기록 내역에서 지우면 그대로 줄어든다.
  //   ⚠ 늦게 온 앞 경기 응답이 지금 경기 수를 덮지 않도록 요청 토큰으로 막는다.
  const [foulEvents, setFoulEvents] = useState<{ gameId: string; rows: FoulRow[] }>({ gameId: '', rows: [] })
  const foulReqRef = useRef(0)
  function refreshFoulEvents() {
    const gameId = selectedSlotId
    if (!gameId) return
    const token = ++foulReqRef.current
    fetch(`/api/leagues/${leagueId}/events?gameId=${gameId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((rows: FoulRow[] | null) => {
        if (foulReqRef.current !== token || !Array.isArray(rows)) return
        setFoulEvents({ gameId, rows: rows.filter(e => e.type === 'foul') })
      })
      .catch(() => null)
  }
  const gameFouls = foulEvents.gameId === selectedSlotId ? foulEvents.rows : []
  /** 선수별 개인 파울(경기 전체) */
  const foulCounts: Record<string, number> = {}
  for (const e of gameFouls) {
    if (e.league_player_id) foulCounts[e.league_player_id] = (foulCounts[e.league_player_id] ?? 0) + 1
  }
  /** 지금 쿼터의 팀 파울 — 이벤트에 쿼터가 없으면(옛 기록) 1쿼터로 본다 */
  function teamFoulsOf(teamId: string | null | undefined): number {
    if (!teamId) return 0
    return gameFouls.filter(e => e.team_id === teamId && (e.quarter ?? 1) === currentQuarter).length
  }

  return { setFoulEvents, foulReqRef, refreshFoulEvents, foulCounts, teamFoulsOf }
}
