'use client'
// 선수별 커리어 마일스톤 차트 (2026-07-19)
// 5대 지표(PTS/REB/AST/STL/BLK) 각각을 세로 막대로 · 각 선수 = 한 카드
// 임계값 자동 확장: 리그 최다치 초과 시 두 배로 확장 (100→200→400→800…)
// 각 막대는 현재 누적을 하단부터 채우고, 임계값 지점에 눈금 표시.
// 카드 클릭 → 선수별 하이라이트로 이동 (경기별 하이라이트 우산).

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'

export type PlayerMilestoneData = {
  player_id: string
  name: string
  number: number | null
  position: string | null
  photo_url: string | null
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
}

const METRICS = [
  { key: 'pts', label: 'PTS', color: '#F59E0B', base: [100, 250, 500, 1000, 2000] },   // amber
  { key: 'reb', label: 'REB', color: '#F97316', base: [50,  100, 250, 500,  1000] },   // orange
  { key: 'ast', label: 'AST', color: '#06B6D4', base: [25,  50,  100, 250,  500 ] },   // cyan
  { key: 'stl', label: 'STL', color: '#10B981', base: [25,  50,  100, 250,  500 ] },   // emerald
  { key: 'blk', label: 'BLK', color: '#EF4444', base: [10,  25,  50,  100,  250 ] },   // red
] as const

type MetricKey = typeof METRICS[number]['key']

// 리그 최다치까지 임계값 확장 (마지막 값 이상이면 두 배씩 push)
function extendThresholds(base: readonly number[], leagueMax: number): number[] {
  const result = [...base]
  while (result[result.length - 1] < leagueMax) {
    result.push(result[result.length - 1] * 2)
  }
  return result
}

interface Props {
  players: PlayerMilestoneData[]
  orgSlug: string
  leagueId: string
}

export default function PlayerMilestoneChart({ players, orgSlug, leagueId }: Props) {
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<MetricKey>('pts')

  // 지표별 임계값 사다리 (리그 최다치까지 확장)
  const thresholdsByMetric = useMemo(() => {
    const out: Record<MetricKey, number[]> = { pts: [], reb: [], ast: [], stl: [], blk: [] }
    for (const m of METRICS) {
      const leagueMax = Math.max(0, ...players.map(p => p[m.key]))
      out[m.key] = extendThresholds(m.base, leagueMax)
    }
    return out
  }, [players])

  // 최소 활동 필터 (전 지표 0인 선수 제외)
  const activePlayers = useMemo(() =>
    players.filter(p => p.pts + p.reb + p.ast + p.stl + p.blk > 0),
    [players],
  )

  // 검색 + 정렬
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? activePlayers.filter(p => p.name.toLowerCase().includes(q) || (p.number != null && String(p.number).includes(q)))
      : activePlayers
    return [...filtered].sort((a, b) => b[sortKey] - a[sortKey])
  }, [activePlayers, query, sortKey])

  return (
    <div className="space-y-4">
      {/* 컨트롤 · 정렬 지표 + 검색 */}
      <div
        className="flex flex-wrap items-center gap-2 sm:gap-3 pb-3 pt-1"
        style={{ borderBottom: '1px solid var(--mm-rule)' }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[11px] font-bold uppercase mr-1"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}
          >
            정렬
          </span>
          {METRICS.map(m => {
            const isActive = sortKey === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setSortKey(m.key)}
                className="px-2.5 py-1.5 text-[11px] font-black uppercase min-h-[36px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                style={{
                  background: isActive ? m.color : 'var(--mm-panel-alt)',
                  color: isActive ? '#fff' : 'var(--mm-ink-soft)',
                  border: `1px solid ${isActive ? m.color : 'var(--mm-rule)'}`,
                  borderRadius: '3px',
                  letterSpacing: '0.14em',
                }}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <div className="flex-1 min-w-[180px]">
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5"
            style={{
              background: 'var(--mm-panel-alt)',
              border: '1px solid var(--mm-rule)',
              borderRadius: '3px',
            }}
          >
            <Search size={13} style={{ color: 'var(--mm-muted)' }} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="선수 이름 또는 등번호"
              className="flex-1 bg-transparent outline-none text-[13px] min-h-[28px]"
              style={{ color: 'var(--mm-ink)' }}
              aria-label="선수 검색"
            />
          </div>
        </div>
        <span
          className="text-[11px] font-bold uppercase tabular-nums"
          style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}
        >
          {shown.length}명
        </span>
      </div>

      {/* 카드 그리드 · 각 선수 = 프로필 + 5개 세로 막대 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shown.map(p => (
          <PlayerCard
            key={p.player_id}
            player={p}
            thresholdsByMetric={thresholdsByMetric}
            href={`/league/${orgSlug}/${leagueId}/highlights/player/${p.player_id}`}
          />
        ))}
      </div>

      {shown.length === 0 && (
        <div
          className="text-center py-10 text-[13px] font-bold uppercase"
          style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}
        >
          조건에 맞는 선수가 없어요
        </div>
      )}
    </div>
  )
}

function initialsOf(name: string): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

function PlayerCard({
  player,
  thresholdsByMetric,
  href,
}: {
  player: PlayerMilestoneData
  thresholdsByMetric: Record<MetricKey, number[]>
  href: string
}) {
  return (
    <Link
      href={href}
      className="group block transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderRadius: '4px',
        padding: '14px 12px',
        minHeight: 260,
      }}
      aria-label={`${player.name} 커리어 마일스톤 상세`}
    >
      {/* 상단 · 프로필 + 이름 */}
      <div className="flex items-center gap-2.5 mb-3 min-w-0">
        <div
          className="relative w-11 h-11 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
          aria-hidden
        >
          <span
            className="absolute inset-0 flex items-center justify-center font-jersey font-black text-lg"
            style={{ color: 'var(--mm-ink)' }}
          >
            {initialsOf(player.name)}
          </span>
          {player.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.photo_url}
              alt=""
              loading="lazy"
              className="relative w-full h-full object-cover"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-jersey font-black text-[15px] truncate"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            {player.name}
          </div>
          <div className="text-[10px] font-bold uppercase mt-0.5 truncate" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
            {player.position ?? ''}{player.number != null ? ` · #${player.number}` : ''}
          </div>
        </div>
      </div>

      {/* 하단 · 5개 세로 막대 */}
      <div className="grid grid-cols-5 gap-2">
        {METRICS.map(m => (
          <MetricBar
            key={m.key}
            label={m.label}
            color={m.color}
            value={player[m.key]}
            thresholds={thresholdsByMetric[m.key]}
          />
        ))}
      </div>
    </Link>
  )
}

const BAR_HEIGHT = 150  // px

function MetricBar({
  label,
  color,
  value,
  thresholds,
}: {
  label: string
  color: string
  value: number
  thresholds: number[]
}) {
  const top = thresholds[thresholds.length - 1]
  const fillPct = Math.min(100, (value / top) * 100)
  // 임계값 도달 카운트 (뱃지 표기용)
  const reachedCount = thresholds.filter(t => value >= t).length
  const nextThreshold = thresholds.find(t => value < t)
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* 라벨 + 현재값 */}
      <div className="text-center">
        <div
          className="text-[9px] font-black uppercase tracking-[0.14em]"
          style={{ color }}
        >
          {label}
        </div>
        <div
          className="font-jersey font-black tabular-nums text-[14px] leading-none"
          style={{ color: 'var(--mm-ink)' }}
          title={nextThreshold ? `다음 임계값: ${nextThreshold} (도달 ${reachedCount}/${thresholds.length})` : `최고 달성 (도달 ${reachedCount}/${thresholds.length})`}
        >
          {value}
        </div>
      </div>
      {/* 막대 · 눈금 */}
      <div
        className="relative w-full"
        style={{ height: BAR_HEIGHT, minHeight: BAR_HEIGHT }}
        aria-label={`${label} ${value} · 다음 임계값 ${nextThreshold ?? '최고'} · 도달 ${reachedCount}/${thresholds.length}`}
      >
        {/* 배경 트랙 */}
        <div
          className="absolute inset-0 rounded-sm"
          style={{
            background: 'var(--mm-panel-alt)',
            border: '1px solid var(--mm-rule)',
          }}
        />
        {/* 임계값 눈금선 */}
        {thresholds.map((t, i) => {
          const yPct = (t / top) * 100  // 하단 기준 % (bottom 값으로 사용)
          const reached = value >= t
          return (
            <div
              key={t}
              className="absolute left-0 right-0 flex items-center pointer-events-none"
              style={{ bottom: `${yPct}%`, transform: 'translateY(50%)' }}
              aria-hidden
            >
              <div
                className="flex-1"
                style={{
                  borderTop: `1px ${i === thresholds.length - 1 ? 'solid' : 'dashed'} ${reached ? color : 'var(--mm-rule)'}`,
                  opacity: reached ? 0.9 : 0.55,
                }}
              />
              <span
                className="text-[8px] font-bold tabular-nums px-0.5"
                style={{ color: reached ? color : 'var(--mm-muted)', letterSpacing: '0.06em' }}
              >
                {t}
              </span>
            </div>
          )
        })}
        {/* 채움 (하단부터 위로) */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-sm"
          style={{
            height: `${fillPct}%`,
            background: `linear-gradient(180deg, ${color}CC 0%, ${color} 100%)`,
            border: `1px solid ${color}`,
            transition: 'height 300ms ease-out',
          }}
        />
      </div>
      {/* 도달 뱃지 */}
      <div
        className="text-[9px] font-bold uppercase tabular-nums"
        style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}
      >
        {reachedCount}/{thresholds.length}
      </div>
    </div>
  )
}
