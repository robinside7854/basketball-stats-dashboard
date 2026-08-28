'use client'
// HighlightsFilterBar — 팀 / 슛 유형 / 쿼터 / 선수 필터 (mm-* 팔레트 · 44px 터치 타겟)
// 상태는 부모 (HighlightsBrowser) 에서 관리 → URL 쿼리 동기화
//
// 교차 연동(cross-filtering):
//   부모가 축별 `counts` 를 내려준다. 각 축의 개수는 "자기 축을 뺀 나머지 필터"만 적용해 센 값이라,
//   다른 필터를 바꾸면 이 축의 선택지 개수가 실시간으로 갱신된다.
//   개수 0 인 선택지는 제거하지 않고 회색 + 비활성으로 남긴다 (레이아웃 유지 · 무엇이 빠졌는지 보이게).
import { HeartCrack } from 'lucide-react'
import type {
  HighlightPlayerOption, HighlightTeamOption, HighlightGameQuarterOption,
} from '@/lib/highlights/types'
import { SHOT_CATEGORY_OPTIONS, type HighlightFilterCategory, type ShotCategory } from '@/lib/highlights/clip'

export type FilterState = {
  teamId: string | null       // null = 전체
  playerId: string | null     // null = 전체
  // null = 전체 · SHOT_CATEGORY_OPTIONS 의 6종 + 컨텍스트 기반 'clutch'
  category: HighlightFilterCategory | null
  quarter: number | null      // null = 전체 · 게임 쿼터 (대회 전용)
}

// 축별 선택지 개수 — 자기 축 제외한 나머지 필터 적용 결과 (0 = 비활성)
export type FilterCounts = {
  teams: Record<string, number>
  players: Record<string, number>
  categories: Record<string, number>   // ShotCategory | 'clutch'
  quarters: Record<string, number>
}

interface Props {
  players: HighlightPlayerOption[]
  teams: HighlightTeamOption[]
  quarters?: HighlightGameQuarterOption[]   // 비었으면 쿼터 섹션 미표시 (리그)
  filter: FilterState
  onChange: (next: FilterState) => void
  totalClips: number
  filteredCount: number
  counts: FilterCounts
  teamSectionLabel?: string   // 팀 칩 섹션 라벨 — 리그: '팀'(기본) · 대회: '상대'
  hideCategories?: ShotCategory[]  // 숨길 슛 유형 chip (대회: 'andones' 등)
  clutchTitle?: string        // 클러치 chip tooltip 텍스트 (리그/대회 다름)
}

const EMPTY_FILTER: FilterState = { teamId: null, playerId: null, category: null, quarter: null }

// 정형 슛 카테고리 6종 (레이업/골밑/미들로 세분화된 SHOT_CATEGORY_OPTIONS 재사용)
// · 'clutch' 는 컨텍스트 기반이라 별도 chip 으로 처리 → 아래 렌더 참고
export default function HighlightsFilterBar({
  players, teams, quarters = [], filter, onChange, totalClips, filteredCount, counts,
  teamSectionLabel = '팀', hideCategories, clutchTitle,
}: Props) {
  const CATEGORIES = hideCategories && hideCategories.length > 0
    ? SHOT_CATEGORY_OPTIONS.filter(o => !hideCategories.includes(o.key))
    : SHOT_CATEGORY_OPTIONS
  const setTeam = (teamId: string | null) => onChange({ ...filter, teamId })
  const setPlayer = (playerId: string | null) => onChange({ ...filter, playerId })
  const setCategory = (category: HighlightFilterCategory | null) => onChange({ ...filter, category })
  const setQuarter = (quarter: number | null) => onChange({ ...filter, quarter })

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
      color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
      border: `1px solid ${active ? (hue ?? 'var(--mm-yellow)') : 'var(--mm-rule)'}`,
      borderRadius: '4px',
    }
  }

  // 현재 선택된 칩은 개수가 0이어도 비활성화하지 않는다 (해제할 수 있어야 함)
  const isOff = (active: boolean, n: number | undefined) => !active && (n ?? 0) === 0
  const offTitle = '현재 선택한 다른 필터와 겹치는 클립이 없습니다'

  const activeCount =
    (filter.teamId ? 1 : 0) + (filter.playerId ? 1 : 0)
    + (filter.category ? 1 : 0) + (filter.quarter != null ? 1 : 0)

  return (
    <div
      className="p-3 lg:p-4 space-y-3"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      aria-label="하이라이트 필터"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span
            className="font-bold text-sm"
            style={{ color: 'var(--mm-ink)' }}
          >
            필터
          </span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTER)}
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
            {teams.map(t => {
              const active = filter.teamId === t.id
              const n = counts.teams[t.id] ?? 0
              const off = isOff(active, n)
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={off}
                  onClick={() => setTeam(active ? null : t.id)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] transition-colors inline-flex items-center gap-1.5 ${off ? '' : 'cursor-pointer'}`}
                  style={chip(active, t.color || undefined, off)}
                  aria-pressed={active}
                  aria-disabled={off}
                  title={off ? offTitle : undefined}
                >
                  {t.color && <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: t.color }} />}
                  {t.name}
                  <span className="text-[10px] opacity-80">{n}</span>
                </button>
              )
            })}
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
          {CATEGORIES.map(c => {
            const active = filter.category === c.key
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
          {/* 클러치 chip — 단독 필터 (다른 카테고리와 XOR) · 빨간 강조 */}
          {(() => {
            const active = filter.category === 'clutch'
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
                <HeartCrack size={14} aria-hidden />
                클러치
                <span className="text-[10px] opacity-80">{n}</span>
              </button>
            )
          })()}
        </div>
      </div>

      {/* 쿼터 필터 — 대회 전용 (리그는 game_quarter 미설정 → quarters 가 비어 섹션 자체가 안 보임) */}
      {quarters.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>쿼터</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setQuarter(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
              style={chip(filter.quarter === null)}
            >
              전체
            </button>
            {quarters.map(q => {
              const active = filter.quarter === q.quarter
              const n = counts.quarters[String(q.quarter)] ?? 0
              const off = isOff(active, n)
              return (
                <button
                  key={q.quarter}
                  type="button"
                  disabled={off}
                  onClick={() => setQuarter(active ? null : q.quarter)}
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
            {players.map(p => {
              const active = filter.playerId === p.id
              const n = counts.players[p.id] ?? 0
              const off = isOff(active, n)
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={off}
                  onClick={() => setPlayer(active ? null : p.id)}
                  className={`px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors inline-flex items-center gap-1.5 ${off ? '' : 'cursor-pointer'}`}
                  style={chip(active, undefined, off)}
                  aria-pressed={active}
                  aria-disabled={off}
                  title={off ? offTitle : undefined}
                >
                  {p.number != null ? `#${p.number} ` : ''}{p.name}
                  <span className="text-[10px] opacity-80">{n}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
