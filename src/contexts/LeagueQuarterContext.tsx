'use client'
// 리그 섹션에서 선택된 분기를 페이지 간에 공유하는 컨텍스트
//
// 배경:
//   stats · teams · schedule · awards 등에서 각자 분기 state 관리 → 페이지 이동 시 리셋
//   → 사용자 요청: '3분기 stats 봤으면 3분기 teams 로 이동' 자연스러워야 함
//
// 저장 전략:
//   - React state (in-memory) + localStorage 백업 (같은 리그로 재방문 시 복원)
//   - URL 은 각 페이지가 개별 관리 (파라미터 공유 X · 컨텍스트로만 sync)
//
// 사용:
//   const { selectedQuarterId, setSelectedQuarterId } = useLeagueQuarter()
//   const { quarters, currentQuarter, ready } = useLeagueQuarter()
//
// 분기 목록의 단일 출처 (2026-10-12):
//   리뉴얼 5단계부터는 레이아웃(서버)이 `loadLeagueQuarters()` 로 미리 받아 initialQuarters 로 넘긴다 —
//   진입 시 브라우저 요청 0회. 서버 조회가 실패했을 때만 여기서 `/quarters` 를 부른다.
//   종전엔 레이아웃(드래프트 탭 판정)·이 컨텍스트·스탯 페이지가 각자 `/quarters` 를 불렀다(진입마다 3회).
//   이제 여기서 한 번 받아 `quarters`·`currentQuarter`(= pickCurrentQuarter) 로 내준다.
//   `ready` = 저장값 복원 + 분기 목록 수신(실패 포함)이 끝남 → 선택 분기가 확정됐다는 뜻.
//   스탯처럼 분기로 조회하는 화면은 ready 전에 fetch 하지 않는다('all' 로 한 번 → 실제 분기로 또 한 번 이중 조회 방지).

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { pickCurrentQuarter } from '@/lib/league/currentQuarter'
import type { Quarter } from '@/types/league'

interface LeagueQuarterContextValue {
  /** 'all' 또는 특정 분기 id · 기본 'all' */
  selectedQuarterId: string
  setSelectedQuarterId: (v: string) => void
  /** `/quarters` 응답 그대로(대회 행 포함) — 받기 전·실패 시 [] */
  quarters: Quarter[]
  /** 지금 분기 — 정본 pickCurrentQuarter (대회 행 제외). 없으면 null */
  currentQuarter: Quarter | null
  /** 저장값 복원 + 분기 목록 수신이 끝났는가 (selectedQuarterId 가 확정됨) */
  ready: boolean
  /**
   * 분기 목록을 다시 받는다(선택 분기는 건드리지 않는다). 팀 탭 명단 편집의 「분기 관리」처럼
   * 분기를 추가·수정한 화면이 닫힐 때 부른다. 받기가 끝나면 resolve.
   */
  reloadQuarters: () => Promise<void>
}

const Ctx = createContext<LeagueQuarterContextValue | null>(null)

/** localStorage 키 — 페이지가 마운트 직후(컨텍스트 복원 전) 저장값을 봐야 할 때 이걸로 읽는다 */
export const quarterStorageKey = (leagueId: string) => `league:${leagueId}:selectedQuarterId`

export function LeagueQuarterProvider({
  leagueId,
  initialQuarters = null,
  children,
}: {
  leagueId: string
  /**
   * 레이아웃(서버)이 미리 받은 분기 목록 (2026-10-12, 리뉴얼 5단계 — 진입마다 나가던 `/quarters` 요청 제거).
   * null 이면 종전처럼 브라우저에서 받는다. 마운트 시점 값만 쓴다(이후 갱신은 reloadQuarters).
   */
  initialQuarters?: Quarter[] | null
  children: React.ReactNode
}) {
  const storageKey = quarterStorageKey(leagueId)

  // 초기 로드 시 localStorage 에서 복원 (SSR-safe)
  const [selectedQuarterId, setSelectedQuarterIdInner] = useState<string>('all')
  const [restored, setRestored] = useState(false)
  const [quarters, setQuarters] = useState<Quarter[] | null>(initialQuarters)
  // 마운트 시점의 초기값만 본다 — 서버가 다시 렌더해 새 배열이 와도 effect 를 다시 돌리지 않는다.
  const [initialList] = useState(initialQuarters)

  // 분기 목록을 받은 뒤의 기본 선택.
  //   ① 저장값이 없으면 지금 분기를 기본으로 고른다(저장하지 않는다 — 다음 분기에도 날짜를 따라간다).
  //      종전엔 스탯·팀 페이지가 각자 같은 가드로 하던 일이다.
  //   ② 분기가 넘어가면 기억해 둔 분기를 **한 번** 새 분기로 옮긴다 (2026-10-10).
  //      기억값이 있으면 화면들이 「현재 분기」 기본값을 안 쓰므로, 3분기를 보던 기기는 4분기가 돼도
  //      계속 3분기 순위·스탯을 보여 줬다. 「지난번에 본 현재 분기」를 따로 적어 두고, 그게 바뀐 날
  //      한 번만 덮는다 — 그 뒤 사용자가 3분기를 다시 고르면 그대로 둔다. 「전체」를 고른 사람은 건드리지 않는다.
  const applyDefaultSelection = useCallback((list: Quarter[]) => {
    const cur = pickCurrentQuarter(list)
    if (!cur) return
    const seenKey = `league:${leagueId}:lastCurrentQuarterId`
    try {
      const seen = localStorage.getItem(seenKey)
      const saved = localStorage.getItem(storageKey)
      if (!saved) {
        setSelectedQuarterIdInner(cur.id)
      } else if (seen && seen !== cur.id && saved !== 'all') {
        setSelectedQuarterIdInner(cur.id)
        localStorage.setItem(storageKey, cur.id)
      }
      localStorage.setItem(seenKey, cur.id)
    } catch {
      // private mode — 저장값을 못 읽으면 지금 분기를 기본으로
      setSelectedQuarterIdInner(cur.id)
    }
  }, [leagueId, storageKey])

  // 저장값 복원 — 서버 초기값이 있으면 기본 선택까지 **같은 effect 안에서** 끝낸다.
  //   restored 와 선택값이 한 번에 확정돼야 ready 직후 화면이 'all' → 실제 분기로 두 번 조회하지 않는다.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 복원은 클라이언트 전용, 마운트 1회(SSR 첫 렌더와 맞추려고 초기값에 못 넣는다)
      if (saved) setSelectedQuarterIdInner(saved)
    } catch { /* SSR / private mode 등 무시 */ }
    if (initialList) applyDefaultSelection(initialList)
    setRestored(true)
  }, [storageKey, initialList, applyDefaultSelection])

  // 서버 초기값이 없을 때만(조회 실패 등) 브라우저에서 받는다 — 종전 동작.
  useEffect(() => {
    if (initialList) return
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => (r.ok ? r.json() : null))
      .then((qs: Quarter[] | null) => {
        if (cancelled) return
        const list = Array.isArray(qs) ? qs : []
        setQuarters(list)
        applyDefaultSelection(list)
      })
      .catch(() => { if (!cancelled) setQuarters([]) })
    return () => { cancelled = true }
  }, [leagueId, initialList, applyDefaultSelection])

  const setSelectedQuarterId = useCallback((v: string) => {
    setSelectedQuarterIdInner(v)
    try { localStorage.setItem(storageKey, v) } catch { /* ignore */ }
  }, [storageKey])

  const reloadQuarters = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/quarters`)
      const qs = r.ok ? await r.json() : null
      if (Array.isArray(qs)) setQuarters(qs as Quarter[])
    } catch { /* 네트워크 실패 — 기존 목록 유지 */ }
  }, [leagueId])

  const value = useMemo<LeagueQuarterContextValue>(() => {
    const list = quarters ?? []
    return {
      selectedQuarterId,
      setSelectedQuarterId,
      quarters: list,
      currentQuarter: pickCurrentQuarter(list),
      ready: restored && quarters !== null,
      reloadQuarters,
    }
  }, [selectedQuarterId, setSelectedQuarterId, quarters, restored, reloadQuarters])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const FALLBACK: LeagueQuarterContextValue = {
  selectedQuarterId: 'all',
  setSelectedQuarterId: () => {},
  quarters: [],
  currentQuarter: null,
  ready: true,
  reloadQuarters: async () => {},
}

/**
 * @returns 컨텍스트가 없으면 { selectedQuarterId: 'all', quarters: [], ready: true, ... } 반환.
 *          Provider 없는 곳에서 optional 하게 사용 가능.
 */
export function useLeagueQuarter(): LeagueQuarterContextValue {
  return useContext(Ctx) ?? FALLBACK
}
