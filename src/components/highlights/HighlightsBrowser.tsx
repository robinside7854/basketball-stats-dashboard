'use client'
// HighlightsBrowser — 라운드 상세 페이지의 최상위 client 컨트롤러
// 역할:
//   - URL 쿼리(?player=X&type=... &clip=N) → 필터 · 재생 인덱스 반영 (공유 URL)
//   - 필터 적용 → HighlightsPlayer / HighlightsPlaylist 에 전달
//   - 자동재생 토글 상태 소유
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Link2 } from 'lucide-react'
import { toast } from 'sonner'
import HighlightsPlayer from './HighlightsPlayer'
import HighlightsPlaylist from './HighlightsPlaylist'
import HighlightsFilterBar, { type FilterState } from './HighlightsFilterBar'
import { categoryOfType, parseShotCategory, type HighlightFilterCategory, type ShotCategory } from '@/lib/highlights/clip'
import { shortenUrl } from '@/lib/shortUrl'
import type { HighlightRoundDetail } from '@/lib/highlights/types'

interface Props {
  detail: HighlightRoundDetail
  teamSectionLabel?: string       // 팀 칩 섹션 라벨 — 리그: '팀'(기본) · 대회: '상대'
  hideCategories?: ShotCategory[] // 숨길 슛 유형 (대회: ['andones'])
  clutchTitle?: string            // 클러치 chip tooltip (리그/대회 정의 다름)
}

// URL 쿼리 → 필터 카테고리 · SHOT_CATEGORY_OPTIONS 6종(parseShotCategory) + 컨텍스트 'clutch'
function parseCategory(v: string | null): HighlightFilterCategory | null {
  if (v === 'clutch') return 'clutch'
  return parseShotCategory(v)
}

export default function HighlightsBrowser({ detail, teamSectionLabel, hideCategories, clutchTitle }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // URL 초기값으로 상태 초기화 (라운드 로드 시 1회)
  const [filter, setFilter] = useState<FilterState>(() => ({
    teamId: searchParams.get('team') || null,
    playerId: searchParams.get('player') || null,
    category: parseCategory(searchParams.get('type')),
  }))
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const n = Number(searchParams.get('clip'))
    return Number.isFinite(n) && n > 0 ? n : 0
  })
  const [autoAdvance, setAutoAdvance] = useState(true)

  // 필터 적용 — clutch 는 shot_type 무관 컨텍스트 필터 (is_clutch 체크)
  const filteredClips = useMemo(() => {
    return detail.clips.filter(c => {
      if (filter.teamId && c.team_id !== filter.teamId) return false
      if (filter.playerId && c.player_id !== filter.playerId) return false
      if (filter.category === 'clutch') {
        if (!c.is_clutch) return false
      } else if (filter.category && categoryOfType(c.shot_type) !== filter.category) return false
      return true
    })
  }, [detail.clips, filter])

  // 전체 클립 중 클러치 개수 — 필터바 뱃지용
  const clutchCount = useMemo(
    () => detail.clips.reduce((acc, c) => acc + (c.is_clutch ? 1 : 0), 0),
    [detail.clips],
  )

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

  // 공유 링크 — 현재 필터/클립 상태가 반영된 페이지 URL 을 shortener 로 축약해 클립보드에 복사.
  // 카카오톡·SNS 공유 시 URL 이 짧아져 붙여넣기 편의성 향상.
  const shareShort = useCallback(async () => {
    if (typeof window === 'undefined') return
    const short = await shortenUrl(window.location.href, {
      source: 'highlights_round',
      date: detail.date,
    })
    try {
      await navigator.clipboard.writeText(short)
      const label = short.includes('/h/')
        ? `짧은 링크 복사됨: /h/${short.split('/h/')[1] ?? ''}`
        : '링크 복사됨'
      toast.success(label)
    } catch {
      toast.error('링크 복사 실패')
    }
  }, [detail.date])

  return (
    <div className="space-y-3">
      {/* 공유 링크 버튼 — 현재 필터/클립 상태 URL 을 짧은 링크로 축약 */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={shareShort}
          className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
          style={{
            background: 'var(--mm-panel)',
            color: 'var(--mm-ink-soft)',
            border: '1px solid var(--mm-rule)',
            borderRadius: '4px',
          }}
          aria-label="현재 화면 짧은 링크 복사"
          title="짧은 공유 링크 복사"
        >
          <Link2 size={14} />
          공유 링크
        </button>
      </div>

      <HighlightsFilterBar
        players={detail.players}
        teams={detail.teams}
        filter={filter}
        onChange={setFilter}
        totalClips={detail.clips.length}
        filteredCount={filteredClips.length}
        teamSectionLabel={teamSectionLabel}
        clutchCount={clutchCount}
        hideCategories={hideCategories}
        clutchTitle={clutchTitle}
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
