'use client'
// 처리 대기 중인 가입 신청 — 한 번만 불러서 여러 화면이 나눠 쓴다.
//
// 왜 훅 하나에 모으나: 이 값을 보는 곳이 둘이다(홈 알림 카드 · 상단 톱니바퀴 배지).
//   각자 부르면 같은 화면에서 같은 요청이 두 번 나가고, 더 나쁜 건 **둘이 어긋난다** —
//   승인 직후 카드는 사라졌는데 톱니바퀴 점은 남아 있는 식이다. 모듈 수준에 결과를 두고
//   구독자 전원에게 같은 값을 흘린다.
//
// 왜 폴링하지 않나: 어드민이 홈을 띄워 놓고 신청을 기다리는 상황은 없다. 실제로 필요한 건
//   "앱을 다시 열었을 때 최신인 것"이라 마운트 + 창 포커스 복귀에만 다시 읽는다.
import { useEffect, useState } from 'react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

export interface PendingAccount {
  id: string
  requested_at: string | null
  player: { name: string } | null
}

// leagueId → 마지막으로 받은 목록. 리그를 옮겨 다녀도 서로 섞이지 않게 키를 나눈다.
const cache = new Map<string, PendingAccount[]>()
const subscribers = new Map<string, Set<(v: PendingAccount[]) => void>>()
// 같은 순간에 두 컴포넌트가 마운트되면 요청이 둘 나간다 — 진행 중인 것을 재사용한다.
const inflight = new Map<string, Promise<void>>()

function publish(leagueId: string, value: PendingAccount[]) {
  cache.set(leagueId, value)
  subscribers.get(leagueId)?.forEach(fn => fn(value))
}

async function fetchPending(leagueId: string, headers: Record<string, string>): Promise<void> {
  const existing = inflight.get(leagueId)
  if (existing) return existing
  const p = (async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/admin/accounts?status=pending`, {
        headers, cache: 'no-store',
      })
      if (!r.ok) return
      const d = await r.json() as { accounts?: PendingAccount[] }
      publish(leagueId, d.accounts ?? [])
    } catch {
      // 조용히 넘긴다 — 부가 알림이라, 실패했다고 화면에 에러를 띄우면 손해가 더 크다.
    } finally {
      inflight.delete(leagueId)
    }
  })()
  inflight.set(leagueId, p)
  return p
}

/**
 * 대기 중인 가입 신청 목록.
 *
 * 어드민(편집 모드)이 아니면 **아무 요청도 하지 않고** 빈 배열을 준다 —
 * 일반 회원에게 401 이 쌓이게 두면 로그가 지저분해지고 얻는 것도 없다.
 */
export function usePendingSignups(leagueId: string): PendingAccount[] {
  const { isEditMode, isInitialized, leagueHeaders } = useLeagueEditMode()
  const [pending, setPending] = useState<PendingAccount[]>(() => cache.get(leagueId) ?? [])

  useEffect(() => {
    if (!isInitialized || !isEditMode) return

    if (!subscribers.has(leagueId)) subscribers.set(leagueId, new Set())
    const set = subscribers.get(leagueId)!
    set.add(setPending)

    // 캐시가 있으면 즉시 반영하고, 그와 별개로 최신값을 다시 읽는다.
    const cached = cache.get(leagueId)
    if (cached) setPending(cached)
    fetchPending(leagueId, leagueHeaders)

    // 승인 처리 후 돌아왔을 때 자동으로 사라지게 하는 지점이다.
    const onFocus = () => { if (!document.hidden) fetchPending(leagueId, leagueHeaders) }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      set.delete(setPending)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [leagueId, isEditMode, isInitialized, leagueHeaders])

  return isEditMode ? pending : []
}
