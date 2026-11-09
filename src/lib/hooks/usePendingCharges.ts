'use client'
// 확인을 기다리는 월렛 충전 요청 수 — 상단 톱니바퀴 빨간 배지 · 설정의 월렛 버튼이 같이 본다 (2026-11-09 운영진).
//   usePendingSignups 와 같은 방식: 모듈에 값을 두고 구독자 전원에게 같은 값을 흘린다(두 곳이 어긋나지 않게).
//   폴링하지 않는다 — 화면을 열 때 · 창으로 돌아올 때 · 승인/반려 직후(refreshPendingCharges)만 다시 읽는다.
//   어드민(편집 모드)이 아니면 요청하지 않고 0. 월렛을 안 쓰는 팀은 404 → 0.
import { useEffect, useState } from 'react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

const cache = new Map<string, number>()
const subscribers = new Map<string, Set<(n: number) => void>>()
const inflight = new Map<string, Promise<void>>()

function publish(leagueId: string, n: number) {
  cache.set(leagueId, n)
  subscribers.get(leagueId)?.forEach(fn => fn(n))
}

/** 승인·반려 직후 부른다 — 배지를 바로 맞춘다. */
export function refreshPendingCharges(leagueId: string): Promise<void> {
  const existing = inflight.get(leagueId)
  if (existing) return existing
  const p = (async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/wallet/admin?count=1`, { cache: 'no-store' })
      if (r.status === 404) { publish(leagueId, 0); return }
      if (!r.ok) return
      const d = await r.json() as { pending?: number }
      publish(leagueId, d.pending ?? 0)
    } catch {
      // 부가 알림 — 실패해도 조용히
    } finally {
      inflight.delete(leagueId)
    }
  })()
  inflight.set(leagueId, p)
  return p
}

export function usePendingCharges(leagueId: string): number {
  const { isEditMode, isInitialized } = useLeagueEditMode()
  const [n, setN] = useState<number>(() => cache.get(leagueId) ?? 0)

  useEffect(() => {
    if (!isInitialized || !isEditMode) return
    if (!subscribers.has(leagueId)) subscribers.set(leagueId, new Set())
    const set = subscribers.get(leagueId)!
    set.add(setN)
    void refreshPendingCharges(leagueId)
    const onFocus = () => { if (!document.hidden) void refreshPendingCharges(leagueId) }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      set.delete(setN)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [leagueId, isEditMode, isInitialized])

  return isEditMode ? n : 0
}
