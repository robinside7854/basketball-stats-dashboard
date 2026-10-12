'use client'
// 「진행 중인 드래프트가 있는가」 — 드래프트 탭(레이아웃)·내 기록 바로가기 공용 (2026-10-12).
//
// - 드래프트는 주장·어드민 전용이 됐다 → **편집 모드(어드민 ∥ CEO)일 때만** 조회한다.
//   일반 회원·비로그인 방문마다 /drafts/current 를 부를 이유가 없다.
// - 분기는 LeagueQuarterContext 의 currentQuarter(= pickCurrentQuarter) — `/quarters` 를 다시 부르지 않고,
//   `is_current` 깃발도 직접 읽지 않는다(깃발이 늦게 옮겨지면 화면마다 분기가 갈린다).
// ⚠ LeagueEditModeProvider · LeagueQuarterProvider 안에서만 의미가 있다(밖이면 항상 false).
import { useEffect, useState } from 'react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'

export function useActiveDraft(leagueId: string): boolean {
  const { isEditMode } = useLeagueEditMode()
  const { currentQuarter } = useLeagueQuarter()
  const quarterId = currentQuarter?.id ?? null
  const [active, setActive] = useState<{ key: string; value: boolean } | null>(null)
  const key = isEditMode && quarterId ? `${leagueId}:${quarterId}` : null

  useEffect(() => {
    if (!key || !quarterId) return
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/drafts/current?quarterId=${quarterId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { draft?: { status?: string } | null } | null) => {
        if (!cancelled) setActive({ key, value: !!d?.draft && d.draft.status !== 'completed' })
      })
      .catch(() => null)
    return () => { cancelled = true }
  }, [key, leagueId, quarterId])

  // 편집 모드가 꺼지거나 분기가 바뀌면 지난 결과를 쓰지 않는다
  return !!key && active?.key === key && active.value
}
