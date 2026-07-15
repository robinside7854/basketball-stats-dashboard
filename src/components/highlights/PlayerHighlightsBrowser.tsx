'use client'
// PlayerHighlightsBrowser — 선수별 하이라이트 페이지 최상위 client 컨트롤러
// - URL 쿼리 (?type=X&quarter=Y&clip=N) ↔ 필터 · 재생 인덱스 동기화
// - HighlightsPlayer 재사용 (자동 연속재생 그대로)
// - 우측 플레이리스트는 날짜별 그룹핑 (PlayerHighlightsPlaylist)
import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Link2, HeartCrack } from 'lucide-react'
import { toast } from 'sonner'
import HighlightsPlayer from './HighlightsPlayer'
import PlayerHighlightsPlaylist from './PlayerHighlightsPlaylist'
import PinBestShotToolbar from './PinBestShotToolbar'
import {
  categoryOfType,
  parseShotCategory,
  SHOT_CATEGORY_OPTIONS,
  type HighlightFilterCategory,
  type ShotCategory,
} from '@/lib/highlights/clip'
import { shortenUrl } from '@/lib/shortUrl'
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
  groupLabel?: string             // 그룹 필터 라벨 — 리그: '분기'(기본) · 팀 대시보드: '대회'
  hideCategories?: ShotCategory[] // 숨길 슛 유형 (대회: ['andones'])
  clutchTitle?: string            // 클러치 chip tooltip (리그/대회 정의 다름)
  // 베스트샷 핀 지원 (리그 전용) — leagueId + initialPinnedEventIds 함께 전달 시 활성화
  initialPinnedEventIds?: string[]
}

// URL 쿼리 → 필터 카테고리 · SHOT_CATEGORY_OPTIONS 6종(parseShotCategory) + 컨텍스트 'clutch'
function parseCategory(v: string | null): HighlightFilterCategory | null {
  if (v === 'clutch') return 'clutch'
  return parseShotCategory(v)
}

export default function PlayerHighlightsBrowser({
  player, clips, quarters, groupLabel = '분기', hideCategories, clutchTitle,
  leagueId, initialPinnedEventIds,
}: Props) {
  const pinsEnabled = Boolean(leagueId) && Array.isArray(initialPinnedEventIds)
  const [pinnedEventIds, setPinnedEventIds] = useState<string[]>(initialPinnedEventIds ?? [])
  // 정형 슛 카테고리 (레이업/골밑/미들 세분화) · 'clutch' 는 별도 chip 으로 처리
  // 대회 컨텍스트에서는 앤드원(andones) chip 숨김
  const CATEGORIES = hideCategories && hideCategories.length > 0
    ? SHOT_CATEGORY_OPTIONS.filter(o => !hideCategories.includes(o.key))
    : SHOT_CATEGORY_OPTIONS
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [category, setCategory] = useState<HighlightFilterCategory | null>(() =>
    parseCategory(searchParams.get('type')),
  )
  const [quarterId, setQuarterId] = useState<string | null>(() =>
    searchParams.get('quarter') || null,
  )
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const n = Number(searchParams.get('clip'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  })
  // 필터 적용 — clutch 는 shot_type 무관 컨텍스트 필터 (is_clutch 체크)
  const filteredClips = useMemo(() => {
    return clips.filter(c => {
      if (category === 'clutch') {
        if (!c.is_clutch) return false
      } else if (category && categoryOfType(c.shot_type) !== category) return false
      if (quarterId && c.quarter_id !== quarterId) return false
      return true
    })
  }, [clips, category, quarterId])

  const clutchCount = useMemo(() => clips.reduce((a, c) => a + (c.is_clutch ? 1 : 0), 0), [clips])

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

  // 공유 링크 — 현재 필터/클립 상태 URL 을 shortener 로 축약해 클립보드에 복사
  const shareShort = useCallback(async () => {
    if (typeof window === 'undefined') return
    const short = await shortenUrl(window.location.href, {
      source: 'highlights_player',
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
  }, [])

  const activeCount = (category ? 1 : 0) + (quarterId ? 1 : 0)

  const chip = (active: boolean, hue?: string): React.CSSProperties => ({
    background: active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-panel)',
    color: active ? (hue ? '#fff' : 'var(--mm-black)') : 'var(--mm-ink-soft)',
    border: `1px solid ${active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-rule)'}`,
    borderRadius: '4px',
  })

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
            {/* 클러치 chip — 단독 필터 · 빨간 강조 */}
            <button
              type="button"
              onClick={() => setCategory(category === 'clutch' ? null : 'clutch')}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors inline-flex items-center gap-1"
              style={chip(category === 'clutch', '#ef4444')}
              aria-pressed={category === 'clutch'}
              aria-label={clutchTitle ? `클러치 슛만 보기 (${clutchTitle})` : '클러치 슛만 보기 (경기 마지막 2분·3점차 이내)'}
              title={clutchTitle ?? '경기 마지막 2분 · 3점차 이내 접전 상황의 슛'}
            >
              <HeartCrack size={12} aria-hidden />
              클러치
              {clutchCount > 0 && <span className="text-[10px] opacity-80">{clutchCount}</span>}
            </button>
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
        <div className="lg:col-span-8 space-y-2">
          <HighlightsPlayer
            clips={filteredClips}
            currentIdx={currentIdx}
            onIndexChange={onSelectIdx}
          />
          {pinsEnabled && leagueId && filteredClips[currentIdx] && (
            <PinBestShotToolbar
              leagueId={leagueId}
              playerId={player.id}
              playerName={player.name}
              currentClip={filteredClips[currentIdx]}
              pinnedEventIds={pinnedEventIds}
              onChange={setPinnedEventIds}
            />
          )}
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
