'use client'
// HighlightsFilterBar — 팀 / 선수 / 슛 유형 필터 (mm-* 팔레트 · 44px 터치 타겟)
// 상태는 부모 (HighlightsBrowser) 에서 관리 → URL 쿼리 동기화
import type { HighlightPlayerOption, HighlightTeamOption } from '@/lib/highlights/types'
import { SHOT_CATEGORY_OPTIONS, type ShotCategory } from '@/lib/highlights/clip'

export type FilterState = {
  teamId: string | null       // null = 전체
  playerId: string | null     // null = 전체
  category: ShotCategory | null    // null = 전체 · SHOT_CATEGORY_OPTIONS 참고
}

interface Props {
  players: HighlightPlayerOption[]
  teams: HighlightTeamOption[]
  filter: FilterState
  onChange: (next: FilterState) => void
  totalClips: number
  filteredCount: number
}

const CATEGORIES = SHOT_CATEGORY_OPTIONS

export default function HighlightsFilterBar({ players, teams, filter, onChange, totalClips, filteredCount }: Props) {
  const setTeam = (teamId: string | null) => onChange({ ...filter, teamId })
  const setPlayer = (playerId: string | null) => onChange({ ...filter, playerId })
  const setCategory = (category: ShotCategory | null) => onChange({ ...filter, category })

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

      {/* 팀 필터 */}
      {teams.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>팀</div>
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
                style={chip(filter.teamId === t.id, t.color)}
                aria-pressed={filter.teamId === t.id}
              >
                <span aria-hidden className="inline-block w-2 h-2 rounded-full" style={{ background: t.color }} />
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
        </div>
      </div>

      {/* 선수 필터 — 드롭다운 (선수 수가 많을 수 있음) */}
      {players.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>선수</div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filter.playerId ?? ''}
              onChange={e => setPlayer(e.target.value === '' ? null : e.target.value)}
              className="px-3 py-2 min-h-[44px] text-sm cursor-pointer"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                color: 'var(--mm-ink)',
                borderRadius: '4px',
                minWidth: '200px',
              }}
              aria-label="선수 선택"
            >
              <option value="">전체 선수</option>
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number ? `#${p.number} ` : ''}{p.name} ({p.count})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}
