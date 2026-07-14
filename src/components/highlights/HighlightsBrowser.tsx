'use client'
// HighlightsBrowser — 라운드 상세 페이지의 최상위 client 컨트롤러
// 역할:
//   - URL 쿼리(?player=X&type=... &clip=N) → 필터 · 재생 인덱스 반영 (공유 URL)
//   - 필터 적용 → HighlightsPlayer / HighlightsPlaylist 에 전달
//   - 자동재생 토글 상태 소유
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import HighlightsPlayer from './HighlightsPlayer'
import HighlightsPlaylist from './HighlightsPlaylist'
import HighlightsFilterBar, { type FilterState } from './HighlightsFilterBar'
import { categoryOfType, parseShotCategory } from '@/lib/highlights/clip'
import type { HighlightRoundDetail } from '@/lib/highlights/types'

interface Props {
  detail: HighlightRoundDetail
  teamSectionLabel?: string   // 팀 칩 섹션 라벨 — 리그: '팀'(기본) · 대회: '상대'
}

export default function HighlightsBrowser({ detail, teamSectionLabel }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL 초기값으로 상태 초기화 (라운드 로드 시 1회)
  const [filter, setFilter] = useState<FilterState>(() => ({
    teamId: searchParams.get('team') || null,
    playerId: searchParams.get('player') || null,
    category: parseShotCategory(searchParams.get('type')),
  }))
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const n = Number(searchParams.get('clip'))
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const [autoAdvance, setAutoAdvance] = useState(true)

  // 필터 적용
  const filteredClips = useMemo(() => {
    return detail.clips.filter(c => {
      if (filter.teamId && c.team_id !== filter.teamId) return false
      if (filter.playerId && c.player_id !== filter.playerId) return false
      if (filter.category && categoryOfType(c.shot_type) !== filter.category) return false
      return true
    })
  }, [detail.clips, filter])

  // 필터 변경 시 인덱스 리셋 (필터 결과 밖으로 튈 위험)
  useEffect(() => {
    if (currentIdx >= filteredClips.length) setCurrentIdx(0)
  }, [filteredClips.length, currentIdx])

  // URL 동기화 (replace — 히스토리 오염 방지)
  useEffect(() => {
    const params = new URLSearchParams()
    if (filter.teamId) params.set('team', filter.teamId)
    if (filter.playerId) params.set('player', filter.playerId)
    if (filter.category) params.set('type', filter.category)
    if (currentIdx > 0) params.set('clip', String(currentIdx))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filter, currentIdx, pathname, router])

  const onSelectIdx = useCallback((idx: number) => setCurrentIdx(idx), [])
  const onToggleAuto = useCallback(() => setAutoAdvance(v => !v), [])

  return (
    <div className="space-y-3">
      <HighlightsFilterBar
        players={detail.players}
        teams={detail.teams}
        filter={filter}
        onChange={setFilter}
        totalClips={detail.clips.length}
        filteredCount={filteredClips.length}
        teamSectionLabel={teamSectionLabel}
      />

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <HighlightsPlayer
            clips={filteredClips}
            currentIdx={currentIdx}
            onIndexChange={onSelectIdx}
            autoAdvance={autoAdvance}
            onToggleAutoAdvance={onToggleAuto}
          />
        </div>
        {/* 레이아웃(LeagueLayoutClient)이 이미 pb-[56px+safe-area] 처리 · 플레이리스트 자체 스크롤로 재생기 자연스럽게 상단 유지 */}
        <div className="lg:col-span-4">
          <HighlightsPlaylist
            clips={filteredClips}
            currentIdx={currentIdx}
            onSelect={onSelectIdx}
          />
        </div>
      </div>
    </div>
  )
}
