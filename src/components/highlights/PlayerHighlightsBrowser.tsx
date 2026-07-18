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
import { availabilityCounts, availabilityCountsBy, gameQuarterLabel } from '@/lib/highlights/crossFilter'
import { shortenUrl } from '@/lib/shortUrl'
import type {
  HighlightClip, HighlightQuarterOption, HighlightShotTypeOption, PlayerHighlightsInfo,
  HighlightGameQuarterOption,
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
  const [gameQuarter, setGameQuarter] = useState<number | null>(() => {
    const q = Number(searchParams.get('q'))
    return Number.isFinite(q) && q > 0 ? q : null
  })
  const [currentIdx, setCurrentIdx] = useState<number>(() => {
    const n = Number(searchParams.get('clip'))
    return Number.isFinite(n) && n >= 0 ? n : 0
  })

  // ── 축별 술어 (교차 필터링의 기본 단위) ────────────────────────
  // 각 축의 선택지 개수는 "자기 축을 뺀 나머지 필터"만 적용해 센다.
  const matchCategory = useCallback((c: HighlightClip) => {
    if (!category) return true
    if (category === 'clutch') return !!c.is_clutch
    return categoryOfType(c.shot_type) === category
  }, [category])
  const matchGroup = useCallback(
    (c: HighlightClip) => !quarterId || c.quarter_id === quarterId, [quarterId])
  const matchGameQuarter = useCallback(
    (c: HighlightClip) => gameQuarter == null || c.game_quarter === gameQuarter, [gameQuarter])

  const filteredClips = useMemo(
    () => clips.filter(c => matchCategory(c) && matchGroup(c) && matchGameQuarter(c)),
    [clips, matchCategory, matchGroup, matchGameQuarter],
  )

  // 게임 쿼터 옵션 — 대회만 game_quarter 를 채우므로 리그에선 빈 배열 → 섹션 숨김
  const gameQuarterOptions = useMemo<HighlightGameQuarterOption[]>(() => {
    const seen = new Map<number, number>()
    for (const c of clips) {
      if (c.game_quarter == null) continue
      seen.set(c.game_quarter, (seen.get(c.game_quarter) ?? 0) + 1)
    }
    return [...seen.keys()].sort((a, b) => a - b)
      .map(q => ({ quarter: q, label: gameQuarterLabel(q), count: seen.get(q) ?? 0 }))
  }, [clips])

  // ── 교차 필터 개수 ──────────────────────────────────────────
  const counts = useMemo(() => {
    const categoryMatchers: Record<string, (c: HighlightClip) => boolean> = {
      clutch: c => !!c.is_clutch,
    }
    for (const o of SHOT_CATEGORY_OPTIONS) {
      categoryMatchers[o.key] = c => categoryOfType(c.shot_type) === o.key
    }
    return {
      categories:    availabilityCountsBy(clips, [matchGroup, matchGameQuarter], categoryMatchers),
      groups:        availabilityCounts(clips, [matchCategory, matchGameQuarter], c => c.quarter_id),
      gameQuarters:  availabilityCounts(clips, [matchCategory, matchGroup], c => c.game_quarter),
    }
  }, [clips, matchCategory, matchGroup, matchGameQuarter])

  // 필터 변경 시 인덱스 리셋 (범위 밖으로 튀지 않도록)
  useEffect(() => {
    if (currentIdx >= filteredClips.length) setCurrentIdx(0)
  }, [filteredClips.length, currentIdx])

  // URL 동기화 (replace — 히스토리 오염 방지)
  useEffect(() => {
    const params = new URLSearchParams()
    if (category) params.set('type', category)
    if (quarterId) params.set('quarter', quarterId)
    if (gameQuarter != null) params.set('q', String(gameQuarter))
    if (currentIdx > 0) params.set('clip', String(currentIdx))
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [category, quarterId, gameQuarter, currentIdx, pathname, router])

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

  const activeCount = (category ? 1 : 0) + (quarterId ? 1 : 0) + (gameQuarter != null ? 1 : 0)

  const chip = (active: boolean, hue?: string, disabled = false): React.CSSProperties => {
    if (disabled) {
      return {
        background: 'var(--mm-panel)',
        color: 'var(--mm-muted)',
        border: '1px dashed var(--mm-rule)',
        borderRadius: '4px',
        opacity: 0.4,
        cursor: 'not-allowed',
      }
    }
    return {
      background: active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-panel)',
      color: active ? (hue ? '#fff' : 'var(--mm-black)') : 'var(--mm-ink-soft)',
      border: `1px solid ${active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-rule)'}`,
      borderRadius: '4px',
    }
  }

  // 선택된 칩은 개수가 0이어도 비활성화하지 않는다 (해제 가능해야 함)
  const isOff = (active: boolean, n: number | undefined) => !active && (n ?? 0) === 0
  const offTitle = '현재 선택한 다른 필터와 겹치는 클립이 없습니다'

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
                onClick={() => { setCategory(null); setQuarterId(null); setGameQuarter(null) }}
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
            {CATEGORIES.map(c => {
              const active = category === c.key
              const n = counts.categories[c.key] ?? 0
              const off = isOff(active, n)
              return (
                <button
                  key={c.key}
                  type="button"
                  disabled={off}
                  onClick={() => setCategory(active ? null : c.key)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] transition-colors inline-flex items-center gap-1.5 ${off ? '' : 'cursor-pointer'}`}
                  style={chip(active, undefined, off)}
                  aria-pressed={active}
                  aria-disabled={off}
                  title={off ? offTitle : undefined}
                >
                  {c.label}
                  <span className="text-[10px] opacity-80">{n}</span>
                </button>
              )
            })}
            {/* 클러치 chip — 단독 필터 · 빨간 강조 */}
            {(() => {
              const active = category === 'clutch'
              const n = counts.categories.clutch ?? 0
              const off = isOff(active, n)
              return (
                <button
                  type="button"
                  disabled={off}
                  onClick={() => setCategory(active ? null : 'clutch')}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] transition-colors inline-flex items-center gap-1 ${off ? '' : 'cursor-pointer'}`}
                  style={chip(active, '#ef4444', off)}
                  aria-pressed={active}
                  aria-disabled={off}
                  aria-label={clutchTitle ? `클러치 슛만 보기 (${clutchTitle})` : '클러치 슛만 보기'}
                  title={off ? offTitle : (clutchTitle ?? '경기 마지막 2분 · 슛 직전 6점차 이내(2포제션) → 이 슛으로 3점차 이내(1포제션) 로 좁혀진 결정타')}
                >
                  <HeartCrack size={12} aria-hidden />
                  클러치
                  <span className="text-[10px] opacity-80">{n}</span>
                </button>
              )
            })()}
          </div>
        </div>

        {/* 쿼터 — 대회 전용 (리그는 game_quarter 미설정 → 옵션이 비어 섹션 숨김) */}
        {gameQuarterOptions.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>쿼터</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setGameQuarter(null)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
                style={chip(gameQuarter === null)}
              >
                전체
              </button>
              {gameQuarterOptions.map(q => {
                const active = gameQuarter === q.quarter
                const n = counts.gameQuarters[String(q.quarter)] ?? 0
                const off = isOff(active, n)
                return (
                  <button
                    key={q.quarter}
                    type="button"
                    disabled={off}
                    onClick={() => setGameQuarter(active ? null : q.quarter)}
                    className={`px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] transition-colors inline-flex items-center gap-1.5 ${off ? '' : 'cursor-pointer'}`}
                    style={chip(active, undefined, off)}
                    aria-pressed={active}
                    aria-disabled={off}
                    title={off ? offTitle : undefined}
                  >
                    {q.label}
                    <span className="text-[10px] opacity-80">{n}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

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
              {quarters.map(q => {
                const active = quarterId === q.id
                const n = counts.groups[q.id] ?? 0
                const off = isOff(active, n)
                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={off}
                    onClick={() => setQuarterId(active ? null : q.id)}
                    className={`px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] transition-colors inline-flex items-center gap-1.5 ${off ? '' : 'cursor-pointer'}`}
                    style={chip(active, undefined, off)}
                    aria-pressed={active}
                    aria-disabled={off}
                    title={off ? offTitle : undefined}
                  >
                    {q.label}
                    <span className="text-[10px] opacity-80">{n}</span>
                  </button>
                )
              })}
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
