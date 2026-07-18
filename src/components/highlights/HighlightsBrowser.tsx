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
import HighlightsFilterBar, { type FilterState, type FilterCounts } from './HighlightsFilterBar'
import { categoryOfType, parseShotCategory, SHOT_CATEGORY_OPTIONS, type HighlightFilterCategory, type ShotCategory } from '@/lib/highlights/clip'
import { availabilityCounts, availabilityCountsBy, gameQuarterLabel } from '@/lib/highlights/crossFilter'
import { shortenUrl } from '@/lib/shortUrl'
import type { HighlightClip, HighlightRoundDetail, HighlightGameQuarterOption } from '@/lib/highlights/types'

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
  const [filter, setFilter] = useState<FilterState>(() => {
    const q = Number(searchParams.get('q'))
    return {
      teamId: searchParams.get('team') || null,
      playerId: searchParams.get('player') || null,
      category: parseCategory(searchParams.get('type')),
      quarter: Number.isFinite(q) && q > 0 ? q : null,
    }
  })
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const n = Number(searchParams.get('clip'))
    return Number.isFinite(n) && n > 0 ? n : 0
  })

  // ── 축별 술어 (교차 필터링의 기본 단위) ────────────────────────
  // 각 축의 선택지 개수를 셀 때 "자기 축"만 빼고 나머지를 적용한다.
  const matchTeam     = useCallback((c: HighlightClip) => !filter.teamId   || c.team_id === filter.teamId, [filter.teamId])
  const matchPlayer   = useCallback((c: HighlightClip) => !filter.playerId || c.player_id === filter.playerId, [filter.playerId])
  const matchQuarter  = useCallback((c: HighlightClip) => filter.quarter == null || c.game_quarter === filter.quarter, [filter.quarter])
  const matchCategory = useCallback((c: HighlightClip) => {
    if (!filter.category) return true
    if (filter.category === 'clutch') return !!c.is_clutch
    return categoryOfType(c.shot_type) === filter.category
  }, [filter.category])

  // 필터 적용 — clutch 는 shot_type 무관 컨텍스트 필터 (is_clutch 체크)
  const filteredClips = useMemo(
    () => detail.clips.filter(c => matchTeam(c) && matchPlayer(c) && matchCategory(c) && matchQuarter(c)),
    [detail.clips, matchTeam, matchPlayer, matchCategory, matchQuarter],
  )

  // 쿼터 옵션 — 클립에 game_quarter 가 있을 때만 생성 (리그는 미설정 → 빈 배열 → 섹션 숨김)
  const quarterOptions = useMemo<HighlightGameQuarterOption[]>(() => {
    const seen = new Map<number, number>()
    for (const c of detail.clips) {
      if (c.game_quarter == null) continue
      seen.set(c.game_quarter, (seen.get(c.game_quarter) ?? 0) + 1)
    }
    return [...seen.keys()]
      .sort((a, b) => a - b)
      .map(q => ({ quarter: q, label: gameQuarterLabel(q), count: seen.get(q) ?? 0 }))
  }, [detail.clips])

  // ── 교차 필터 개수 — 각 축은 자기 자신을 제외한 나머지 필터만 반영 ──
  const counts = useMemo<FilterCounts>(() => {
    const categoryMatchers: Record<string, (c: HighlightClip) => boolean> = {
      clutch: c => !!c.is_clutch,
    }
    for (const o of SHOT_CATEGORY_OPTIONS) {
      categoryMatchers[o.key] = c => categoryOfType(c.shot_type) === o.key
    }
    return {
      teams:      availabilityCounts(detail.clips, [matchPlayer, matchCategory, matchQuarter], c => c.team_id),
      players:    availabilityCounts(detail.clips, [matchTeam, matchCategory, matchQuarter], c => c.player_id),
      quarters:   availabilityCounts(detail.clips, [matchTeam, matchPlayer, matchCategory], c => c.game_quarter),
      categories: availabilityCountsBy(detail.clips, [matchTeam, matchPlayer, matchQuarter], categoryMatchers),
    }
  }, [detail.clips, matchTeam, matchPlayer, matchCategory, matchQuarter])

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
    if (filter.quarter != null) params.set('q', String(filter.quarter))
    if (currentIdx > 0) params.set('clip', String(currentIdx))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [filter, currentIdx, pathname, router])

  const onSelectIdx = useCallback((idx: number) => setCurrentIdx(idx), [])

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
        quarters={quarterOptions}
        filter={filter}
        onChange={setFilter}
        totalClips={detail.clips.length}
        filteredCount={filteredClips.length}
        counts={counts}
        teamSectionLabel={teamSectionLabel}
        hideCategories={hideCategories}
        clutchTitle={clutchTitle}
      />

      <div className="grid gap-3 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <HighlightsPlayer
            clips={filteredClips}
            currentIdx={currentIdx}
            onIndexChange={onSelectIdx}
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
