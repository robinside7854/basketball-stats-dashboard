'use client'
// PlayerHighlightsBrowser — 선수별 하이라이트 페이지 최상위 client 컨트롤러
// - URL 쿼리 (?type=X&quarter=Y&clip=N) ↔ 필터 · 재생 인덱스 동기화
// - HighlightsPlayer 재사용 (자동 연속재생 그대로)
// - 우측 플레이리스트는 날짜별 그룹핑 (PlayerHighlightsPlaylist)
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import HighlightsPlayer from './HighlightsPlayer'
import PlayerHighlightsPlaylist from './PlayerHighlightsPlaylist'
import { categoryOfType, parseShotCategory, SHOT_CATEGORY_OPTIONS, type ShotCategory } from '@/lib/highlights/clip'
import type {
  HighlightClip, HighlightQuarterOption, HighlightShotTypeOption, PlayerHighlightsInfo,
} from '@/lib/highlights/types'

interface Props {
  player: PlayerHighlightsInfo
  clips: HighlightClip[]
  quarters: HighlightQuarterOption[]
  shotTypes: HighlightShotTypeOption[]
  orgSlug?: string
  leagueId?: string
  groupLabel?: string   // 그룹 필터 라벨 — 리그: '분기'(기본) · 팀 대시보드: '대회'
}

const CATEGORIES = SHOT_CATEGORY_OPTIONS

export default function PlayerHighlightsBrowser({
  clips, quarters, groupLabel = '분기',
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [category, setCategory] = useState<ShotCategory | null>(() =>
    parseShotCategory(searchParams.get('type')),
  )
  const [quarterId, setQuarterId] = useState<string | null>(() =>
    searchParams.get('quarter') || null,
  )
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const n = Number(searchParams.get('clip'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  })
  const [autoAdvance, setAutoAdvance] = useState(true)

  // 필터 적용
  const filteredClips = useMemo(() => {
    return clips.filter(c => {
      if (category && categoryOfType(c.shot_type) !== category) return false
      if (quarterId && c.quarter_id !== quarterId) return false
      return true
    })
  }, [clips, category, quarterId])

  // 필터 변경 시 인덱스 리셋 (범위 밖으로 튀지 않도록)
  useEffect(() => {
    if (currentIdx >= filteredClips.length) setCurrentIdx(0)
  }, [filteredClips.length, currentIdx])

  // URL 동기화 (replace — 히스토리 오염 방지)
  useEffect(() => {
    const params = new URLSearchParams()
    if (category) params.set('type', category)
    if (quarterId) params.set('quarter', quarterId)
    if (currentIdx > 0) params.set('clip', String(currentIdx))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [category, quarterId, currentIdx, pathname, router])

  const onSelectIdx = useCallback((idx: number) => setCurrentIdx(idx), [])
  const onToggleAuto = useCallback(() => setAutoAdvance(v => !v), [])

  const activeCount = (category ? 1 : 0) + (quarterId ? 1 : 0)

  const chip = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--mm-yellow)' : 'var(--mm-panel)',
    color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
    border: `1px solid ${active ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
    borderRadius: '4px',
  })

  return (
    <div className="space-y-3">
      {/* 필터 바 */}
      <div
        className="p-3 lg:p-4 space-y-3"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        aria-label="선수 하이라이트 필터"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span
              className="font-jersey font-black uppercase text-sm tracking-[0.14em]"
              style={{ color: 'var(--mm-ink)' }}
            >
              필터
            </span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => { setCategory(null); setQuarterId(null) }}
                className="text-[11px] font-bold uppercase tracking-[0.10em] px-2 py-1 min-h-[32px] cursor-pointer transition-colors"
                style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
              >
                초기화 ({activeCount})
              </button>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }} aria-live="polite">
            {filteredClips.length === clips.length ? `${clips.length}개 클립` : `${filteredClips.length} / ${clips.length}개`}
          </span>
        </div>

        {/* 공격유형 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>공격 유형</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
              style={chip(category === null)}
            >
              전체
            </button>
            {CATEGORIES.map(c => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(category === c.key ? null : c.key)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
                style={chip(category === c.key)}
                aria-pressed={category === c.key}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* 분기 */}
        {quarters.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>{groupLabel}</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setQuarterId(null)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
                style={chip(quarterId === null)}
              >
                전체
              </button>
              {quarters.map(q => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQuarterId(quarterId === q.id ? null : q.id)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors inline-flex items-center gap-1.5"
                  style={chip(quarterId === q.id)}
                  aria-pressed={quarterId === q.id}
                >
                  {q.label}
                  <span className="text-[10px] opacity-80">{q.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 플레이어 + 플레이리스트 */}
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
          <PlayerHighlightsPlaylist
            clips={filteredClips}
            currentIdx={currentIdx}
            onSelect={onSelectIdx}
          />
        </div>
      </div>
    </div>
  )
}
