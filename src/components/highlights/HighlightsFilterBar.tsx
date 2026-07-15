'use client'
// HighlightsFilterBar — 팀 / 선수 / 슛 유형 필터 (mm-* 팔레트 · 44px 터치 타겟)
// 상태는 부모 (HighlightsBrowser) 에서 관리 → URL 쿼리 동기화
import { HeartCrack } from 'lucide-react'
import type { HighlightPlayerOption, HighlightTeamOption } from '@/lib/highlights/types'
import { SHOT_CATEGORY_OPTIONS, type HighlightFilterCategory, type ShotCategory } from '@/lib/highlights/clip'

export type FilterState = {
  teamId: string | null       // null = 전체
  playerId: string | null     // null = 전체
  // null = 전체 · SHOT_CATEGORY_OPTIONS 의 6종 + 컨텍스트 기반 'clutch'
  category: HighlightFilterCategory | null
}

interface Props {
  players: HighlightPlayerOption[]
  teams: HighlightTeamOption[]
  filter: FilterState
  onChange: (next: FilterState) => void
  totalClips: number
  filteredCount: number
  teamSectionLabel?: string   // 팀 칩 섹션 라벨 — 리그: '팀'(기본) · 대회: '상대'
  clutchCount?: number        // 클러치 chip 뱃지용 · 전체 클립 중 is_clutch 개수
  hideCategories?: ShotCategory[]  // 숨길 슛 유형 chip (대회: 'andones' 등)
  clutchTitle?: string        // 클러치 chip tooltip 텍스트 (리그/대회 다름)
}

// 정형 슛 카테고리 6종 (레이업/골밑/미들로 세분화된 SHOT_CATEGORY_OPTIONS 재사용)
// · 'clutch' 는 컨텍스트 기반이라 별도 chip 으로 처리 → 아래 렌더 참고
export default function HighlightsFilterBar({
  players, teams, filter, onChange, totalClips, filteredCount,
  teamSectionLabel = '팀', clutchCount = 0, hideCategories, clutchTitle,
}: Props) {
  const CATEGORIES = hideCategories && hideCategories.length > 0
    ? SHOT_CATEGORY_OPTIONS.filter(o => !hideCategories.includes(o.key))
    : SHOT_CATEGORY_OPTIONS
  const setTeam = (teamId: string | null) => onChange({ ...filter, teamId })
  const setPlayer = (playerId: string | null) => onChange({ ...filter, playerId })
  const setCategory = (category: HighlightFilterCategory | null) => onChange({ ...filter, category })

  const chip = (active: boolean, hue?: string): React.CSSProperties => ({
    background: active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-panel)',
    color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
    border: `1px solid ${active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-rule)'}`,
    borderRadius: '4px',
  })

  const activeCount =
    (filter.teamId ? 1 : 0) + (filter.playerId ? 1 : 0) + (filter.category ? 1 : 0)

  return (
    <div
      className="p-3 lg:p-4 space-y-3"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      aria-label="하이라이트 필터"
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
              onClick={() => onChange({ teamId: null, playerId: null, category: null })}
              className="text-[11px] font-bold uppercase tracking-[0.10em] px-2 py-1 min-h-[32px] cursor-pointer transition-colors"
              style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
            >
              초기화 ({activeCount})
            </button>
          )}
        </div>
        <span className="text-xs" style={{ color: 'var(--mm-muted)' }} aria-live="polite">
          {filteredCount === totalClips ? `${totalClips}개 클립` : `${filteredCount} / ${totalClips}개`}
        </span>
      </div>

      {/* 팀(또는 상대) 필터 */}
      {teams.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>{teamSectionLabel}</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setTeam(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
              style={chip(filter.teamId === null)}
            >
              전체
            </button>
            {teams.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTeam(filter.teamId === t.id ? null : t.id)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={chip(filter.teamId === t.id, t.color || undefined)}
                aria-pressed={filter.teamId === t.id}
              >
                {t.color && <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: t.color }} />}
                {t.name}
                <span className="text-[10px] opacity-80">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 슛 유형 필터 */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>슛 유형</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
            style={chip(filter.category === null)}
          >
            전체
          </button>
          {CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(filter.category === c.key ? null : c.key)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
              style={chip(filter.category === c.key)}
              aria-pressed={filter.category === c.key}
            >
              {c.label}
            </button>
          ))}
          {/* 클러치 chip — 단독 필터 (다른 카테고리와 XOR) · 빨간 강조 */}
          <button
            type="button"
            onClick={() => setCategory(filter.category === 'clutch' ? null : 'clutch')}
            className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors inline-flex items-center gap-1"
            style={chip(filter.category === 'clutch', '#ef4444')}
            aria-pressed={filter.category === 'clutch'}
            aria-label={clutchTitle ? `클러치 슛만 보기 (${clutchTitle})` : '클러치 슛만 보기 (경기 마지막 2분 · 2포제션 접전에서 1포제션 이내로 좁힌 결정타)'}
            title={clutchTitle ?? '경기 마지막 2분 · 슛 직전 6점차 이내(2포제션) → 이 슛으로 3점차 이내(1포제션) 로 좁혀진 결정타'}
          >
            <HeartCrack size={12} aria-hidden />
            클러치
            {clutchCount > 0 && <span className="text-[10px] opacity-80">{clutchCount}</span>}
          </button>
        </div>
      </div>

      {/* 선수 필터 — 칩 (클립 수 많은 순 정렬) */}
      {players.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>선수</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setPlayer(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
              style={chip(filter.playerId === null)}
            >
              전체
            </button>
            {players.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlayer(filter.playerId === p.id ? null : p.id)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-bold cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={chip(filter.playerId === p.id)}
                aria-pressed={filter.playerId === p.id}
              >
                {p.number != null ? `#${p.number} ` : ''}{p.name}
                <span className="text-[10px] opacity-80">{p.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
