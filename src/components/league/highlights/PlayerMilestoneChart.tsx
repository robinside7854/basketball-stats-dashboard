'use client'
// 커리어 마일스톤 · 나무(TREE) 뷰 (2026-07-19 재설계)
//   · 5개 지표 = 5개 나무 (PTS/REB/AST/STL/BLK)
//   · 각 나무 = 세로 축 · 임계값 눈금 · 선수 아바타 핀
//   · 각 선수는 자기 누적치에 해당하는 y 위치에 핀 → "어디쯤 위치하는지" 한눈에
//   · 겹치는 핀은 옆으로 오프셋 (최대 4개 · 넘치면 "+N")
//   · 임계값 자동 확장: 리그 최다치가 상한 넘어서면 두 배씩 push
// 아바타 클릭 → 선수별 하이라이트로 이동

import { useMemo, useState } from 'react'
import Link from 'next/link'

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

// 각 지표: 기본 임계값 사다리 + 확장 스텝
//   · 리그 1위 값에 따라 TOP 을 근사치로 스냅 → 선수 분포가 촘촘히 몰리지 않음
const METRICS = [
  { key: 'pts', label: 'PTS', color: '#F59E0B', base: [100, 250, 500, 1000, 2000], step: 500 },
  { key: 'reb', label: 'REB', color: '#F97316', base: [50,  100, 250, 500,  1000], step: 100 },
  { key: 'ast', label: 'AST', color: '#06B6D4', base: [25,  50,  100, 250,  500 ], step: 100 },
  { key: 'stl', label: 'STL', color: '#10B981', base: [25,  50,  100, 250,  500 ], step: 100 },
  { key: 'blk', label: 'BLK', color: '#EF4444', base: [10,  25,  50,  100,  250 ], step: 50  },
] as const

type MetricKey = typeof METRICS[number]['key']

// TOP 을 1위 값에 근사치로 스냅
//   · 1위 ≤ 기본 사다리의 어떤 값 → 그 값을 TOP 으로 · 그 이하 눈금만 표시
//   · 1위 > 기본 사다리 최대 → step 단위로 올림한 값을 TOP 으로 추가
// 예: PTS 기본=[100,250,500,1000,2000], 1위=2400 → TOP=2500, 눈금=[100,250,500,1000,2000,2500]
function buildThresholds(base: readonly number[], step: number, leaderValue: number): number[] {
  for (const t of base) {
    if (t >= leaderValue) {
      // 1위 값이 base 안 · 그 이하 값들만
      return base.filter(v => v <= t)
    }
  }
  // 1위 값이 base 초과 · step 단위 올림
  const snapped = Math.max(step, Math.ceil(leaderValue / step) * step)
  return [...base, snapped]
}

interface Props {
  players: PlayerMilestoneData[]
  orgSlug: string
  leagueId: string
}

export default function PlayerMilestoneChart({ players, orgSlug, leagueId }: Props) {
  // 활동 있는 선수만
  const activePlayers = useMemo(
    () => players.filter(p => p.pts + p.reb + p.ast + p.stl + p.blk > 0),
    [players],
  )

  // 지표별 임계값 사다리 · TOP = 리그 1위 값 근사치로 스냅 (분포 시인성 개선)
  const thresholdsByMetric = useMemo(() => {
    const out: Record<MetricKey, number[]> = { pts: [], reb: [], ast: [], stl: [], blk: [] }
    for (const m of METRICS) {
      const leaderValue = Math.max(0, ...activePlayers.map(p => p[m.key]))
      out[m.key] = leaderValue > 0
        ? buildThresholds(m.base, m.step, leaderValue)
        : [m.base[0]]  // 활동 전무 시 최소 눈금 하나만
    }
    return out
  }, [activePlayers])

  const [hoverPid, setHoverPid] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {/* 5개 나무 · 데스크탑 grid-5 · 태블릿 grid-3 · 모바일 grid-2 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {METRICS.map(m => (
          <MetricTree
            key={m.key}
            metricKey={m.key}
            label={m.label}
            color={m.color}
            players={activePlayers}
            thresholds={thresholdsByMetric[m.key]}
            orgSlug={orgSlug}
            leagueId={leagueId}
            hoverPid={hoverPid}
            setHoverPid={setHoverPid}
          />
        ))}
      </div>

      {/* 각주 */}
      <div
        className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] pt-3"
        style={{ borderTop: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
      >
        <span>
          <span className="font-bold">임계값</span>은 지표별 기본 사다리 (PTS 100·250·500·1000·2000 등) 에서 시작 ·
          리그 1위 값에 근사한 상한으로 자동 스냅 (선수 분포 시인성 우선)
        </span>
        <span>
          <span className="font-bold">아바타 클릭</span> · 그 선수의 하이라이트로 이동
        </span>
      </div>
    </div>
  )
}

// ─────── 나무 하나 ───────

const TREE_HEIGHT = 460  // px
const AVATAR = 22        // px (원형 아바타 지름)
const H_STEP = 24        // 겹칠 때 x 오프셋
const V_TOLERANCE = 18   // 세로 근접 판정
const MAX_PER_ROW = 4    // 한 y 근처에 최대 4명 노출 (초과 시 +N)

function initialsOf(name: string): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

interface Placement {
  player: PlayerMilestoneData
  y: number     // 하단 기준 px
  xOffset: number
  hidden: boolean  // MAX_PER_ROW 초과 시 hidden (오버플로우 카운트에만 반영)
}

function placePlayers(
  players: PlayerMilestoneData[],
  metricKey: MetricKey,
  topThreshold: number,
): { placements: Placement[]; overflowByRow: Map<number, number> } {
  // 값 있는 선수만 → 값 desc 정렬
  const withValue = players
    .filter(p => p[metricKey] > 0)
    .sort((a, b) => b[metricKey] - a[metricKey])

  const placements: Placement[] = []
  const overflowByRow = new Map<number, number>()
  for (const p of withValue) {
    const y = (p[metricKey] / topThreshold) * TREE_HEIGHT
    // 근접 그룹 내 이미 배치된 개수 확인
    const inRow = placements.filter(pl => Math.abs(pl.y - y) < V_TOLERANCE && !pl.hidden)
    if (inRow.length >= MAX_PER_ROW) {
      // 오버플로우 · +N 뱃지에만 반영
      const rowKey = Math.round(inRow[0].y)
      overflowByRow.set(rowKey, (overflowByRow.get(rowKey) ?? 0) + 1)
      placements.push({ player: p, y, xOffset: 0, hidden: true })
      continue
    }
    // 다음 사용 가능한 x 오프셋 (같은 y 근접에 이미 있는 x 값 회피)
    const usedX = new Set(inRow.map(pl => pl.xOffset))
    let xOffset = 0
    while (usedX.has(xOffset)) xOffset += H_STEP
    placements.push({ player: p, y, xOffset, hidden: false })
  }
  return { placements, overflowByRow }
}

function MetricTree({
  metricKey,
  label,
  color,
  players,
  thresholds,
  orgSlug,
  leagueId,
  hoverPid,
  setHoverPid,
}: {
  metricKey: MetricKey
  label: string
  color: string
  players: PlayerMilestoneData[]
  thresholds: number[]
  orgSlug: string
  leagueId: string
  hoverPid: string | null
  setHoverPid: (pid: string | null) => void
}) {
  const top = thresholds[thresholds.length - 1]
  const { placements, overflowByRow } = useMemo(
    () => placePlayers(players, metricKey, top),
    [players, metricKey, top],
  )

  // 리그 리더 (상위 1명)
  const leader = players.filter(p => p[metricKey] > 0).sort((a, b) => b[metricKey] - a[metricKey])[0]

  return (
    <div
      className="flex flex-col"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderTop: `3px solid ${color}`,
        borderRadius: '4px',
        padding: '10px 8px 12px',
      }}
    >
      {/* 헤더 · 지표 라벨 + 리그 리더 값 */}
      <div className="text-center mb-2">
        <div
          className="font-jersey font-black uppercase text-[15px]"
          style={{ color, letterSpacing: '0.10em' }}
        >
          {label}
        </div>
        {leader && (
          <div
            className="text-[10px] font-bold uppercase mt-0.5 truncate"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}
            title={`리그 1위 · ${leader.name} · ${leader[metricKey]}`}
          >
            1위 {leader[metricKey]}
          </div>
        )}
      </div>

      {/* 나무 몸통 · 세로 축 + 임계값 눈금 + 선수 핀 */}
      <div className="relative mx-auto" style={{ height: TREE_HEIGHT, width: '100%', minWidth: 140 }}>
        {/* 축 (세로 라인 · 왼쪽) */}
        <div
          className="absolute top-0 bottom-0"
          style={{
            left: 30,
            width: 2,
            background: `linear-gradient(180deg, ${color}55 0%, ${color}22 60%, var(--mm-rule) 100%)`,
            borderRadius: '1px',
          }}
          aria-hidden
        />

        {/* 임계값 눈금 */}
        {thresholds.map((t, idx) => {
          const yPct = (t / top) * 100
          const isTop = idx === thresholds.length - 1
          return (
            <div
              key={t}
              className="absolute left-0 right-0 flex items-center pointer-events-none"
              style={{ bottom: `${yPct}%`, transform: 'translateY(50%)' }}
              aria-hidden
            >
              {/* 눈금 라벨 (좌측) */}
              <span
                className="text-[9px] font-black tabular-nums pr-1 text-right"
                style={{
                  color: isTop ? color : 'var(--mm-muted)',
                  letterSpacing: '0.04em',
                  width: 26,
                }}
              >
                {t}
              </span>
              {/* 눈금선 */}
              <div
                className="flex-1"
                style={{
                  borderTop: `1px ${isTop ? 'solid' : 'dashed'} ${isTop ? color : 'var(--mm-rule)'}`,
                  opacity: isTop ? 0.9 : 0.5,
                }}
              />
            </div>
          )
        })}

        {/* 선수 핀 · 아바타 */}
        {placements.filter(p => !p.hidden).map(p => (
          <PlayerPin
            key={p.player.player_id}
            player={p.player}
            y={p.y}
            xOffset={p.xOffset}
            metricKey={metricKey}
            color={color}
            orgSlug={orgSlug}
            leagueId={leagueId}
            hover={hoverPid === p.player.player_id}
            onEnter={() => setHoverPid(p.player.player_id)}
            onLeave={() => setHoverPid(null)}
          />
        ))}

        {/* 오버플로우 뱃지 (+N) */}
        {[...overflowByRow.entries()].map(([y, count]) => (
          <div
            key={`overflow-${y}`}
            className="absolute pointer-events-none"
            style={{
              bottom: y,
              left: 30 + AVATAR * MAX_PER_ROW + 6,
              transform: 'translateY(50%)',
            }}
          >
            <span
              className="inline-block text-[10px] font-black px-1 py-0.5"
              style={{
                background: 'var(--mm-panel-alt)',
                color: 'var(--mm-ink-soft)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '2px',
              }}
            >
              +{count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlayerPin({
  player,
  y,
  xOffset,
  metricKey,
  color,
  orgSlug,
  leagueId,
  hover,
  onEnter,
  onLeave,
}: {
  player: PlayerMilestoneData
  y: number
  xOffset: number
  metricKey: MetricKey
  color: string
  orgSlug: string
  leagueId: string
  hover: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const value = player[metricKey]
  return (
    <Link
      href={`/league/${orgSlug}/${leagueId}/highlights/player/${player.player_id}`}
      className="absolute rounded-full overflow-hidden flex items-center justify-center cursor-pointer transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
      style={{
        bottom: y,
        left: 30 + AVATAR / 2 + xOffset,  // 축 우측 xOffset 만큼
        width: AVATAR,
        height: AVATAR,
        transform: `translate(-50%, 50%) scale(${hover ? 1.35 : 1})`,
        background: 'var(--mm-panel-alt)',
        border: `2px solid ${color}`,
        boxShadow: hover ? `0 0 0 2px var(--mm-panel), 0 4px 12px -3px ${color}66` : `0 1px 3px rgba(0,0,0,0.3)`,
        zIndex: hover ? 20 : 5,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      aria-label={`${player.name} · ${value}`}
      title={`${player.name} · ${value}`}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-jersey font-black text-[10px]"
        style={{ color: 'var(--mm-ink)' }}
        aria-hidden
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
      {/* 호버 툴팁 · 이름 + 값 */}
      {hover && (
        <span
          className="absolute pointer-events-none whitespace-nowrap text-[10px] font-black px-1.5 py-0.5"
          style={{
            background: 'var(--mm-black)',
            color: 'var(--mm-yellow)',
            border: `1px solid ${color}`,
            borderRadius: '3px',
            left: '110%',
            top: '50%',
            transform: 'translateY(-50%) scale(0.75)',
            transformOrigin: 'left center',
            letterSpacing: '0.06em',
            zIndex: 30,
          }}
        >
          {player.name} · {value}
        </span>
      )}
    </Link>
  )
}
