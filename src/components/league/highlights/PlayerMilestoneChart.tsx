'use client'
// 커리어 마일스톤 · 나무(TREE) 뷰 (2026-07-19 재설계)
//   · 5개 지표 = 5개 나무 (PTS/REB/AST/STL/BLK)
//   · 각 나무 = 세로 축 · 임계값 눈금 · 선수 아바타 핀
//   · 각 선수는 자기 누적치에 해당하는 y 위치에 핀 → "어디쯤 위치하는지" 한눈에
//   · 겹치는 핀은 옆으로 오프셋 (최대 4개 · 넘치면 "+N")
//   · 임계값 자동 확장: 리그 최다치가 상한 넘어서면 두 배씩 push
// 아바타 클릭 → 선수별 하이라이트로 이동

import { useMemo, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { X, ChevronRight } from 'lucide-react'

// 선수카드 모달 · 상호작용 트리거 후에만 필요 (recharts 등 포함)
const PlayerQuickViewModal = dynamic(() => import('../PlayerQuickViewModal'), { ssr: false })

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

export default function PlayerMilestoneChart({ players, leagueId }: Props) {
  // 활동 있는 선수만
  const activePlayers = useMemo(
    () => players.filter(p => p.pts + p.reb + p.ast + p.stl + p.blk > 0),
    [players],
  )

  // hover 가능 디바이스 여부 (PC vs 터치)
  //   · PC: 클릭 → 선수카드 모달 직행
  //   · 모바일: 클릭 → 프로필 확대 팝오버 (요약 + CTA)
  const [hoverCapable, setHoverCapable] = useState(true)  // 서버 렌더 시 PC 가정
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    setHoverCapable(mq.matches)
    const handler = (e: MediaQueryListEvent) => setHoverCapable(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // 상태 · 모바일 팝오버 (하나만 노출) · 선수카드 모달
  const [popoverPid, setPopoverPid] = useState<string | null>(null)
  const [modalPid, setModalPid] = useState<string | null>(null)

  const popoverPlayer = popoverPid ? activePlayers.find(p => p.player_id === popoverPid) ?? null : null
  const modalPlayer = modalPid ? activePlayers.find(p => p.player_id === modalPid) ?? null : null

  // 아바타 클릭 · 디바이스별 분기
  function handlePinClick(pid: string) {
    if (hoverCapable) {
      // PC 는 바로 선수카드 랜딩
      setModalPid(pid)
    } else {
      // 모바일: 팝오버 토글 (같은 아바타 재탭 = 닫기)
      setPopoverPid(prev => prev === pid ? null : pid)
    }
  }

  function openCardFromPopover() {
    if (popoverPid) {
      setModalPid(popoverPid)
      setPopoverPid(null)
    }
  }

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
            hoverPid={hoverPid}
            setHoverPid={setHoverPid}
            onPinClick={handlePinClick}
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
          <span className="font-bold">아바타 클릭</span> · 선수카드 열림 (모바일은 요약 팝오버 후 CTA)
        </span>
      </div>

      {/* 모바일 팝오버 · 프로필 확대 + 5대 지표 요약 + 선수카드 CTA */}
      {popoverPlayer && !hoverCapable && (
        <PlayerMilestonePopover
          player={popoverPlayer}
          onClose={() => setPopoverPid(null)}
          onOpenCard={openCardFromPopover}
        />
      )}

      {/* 선수카드 모달 (PC 직행 · 모바일 CTA) */}
      {modalPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={modalPlayer.player_id}
          playerName={modalPlayer.name}
          onClose={() => setModalPid(null)}
        />
      )}
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
  hoverPid,
  setHoverPid,
  onPinClick,
}: {
  metricKey: MetricKey
  label: string
  color: string
  players: PlayerMilestoneData[]
  thresholds: number[]
  hoverPid: string | null
  setHoverPid: (pid: string | null) => void
  onPinClick: (pid: string) => void
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
            hover={hoverPid === p.player.player_id}
            onEnter={() => setHoverPid(p.player.player_id)}
            onLeave={() => setHoverPid(null)}
            onClick={() => onPinClick(p.player.player_id)}
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
  hover,
  onEnter,
  onLeave,
  onClick,
}: {
  player: PlayerMilestoneData
  y: number
  xOffset: number
  metricKey: MetricKey
  color: string
  hover: boolean
  onEnter: () => void
  onLeave: () => void
  onClick: () => void
}) {
  const value = player[metricKey]
  // hover 시 아바타/프로필 사진 크게 확대 (기본 22px → 확대 시 56px · 2.5배 이상)
  const scale = hover ? 2.55 : 1
  return (
    <button
      type="button"
      className="absolute rounded-full overflow-hidden flex items-center justify-center cursor-pointer transition-transform duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
      style={{
        bottom: y,
        left: 30 + AVATAR / 2 + xOffset,  // 축 우측 xOffset 만큼
        width: AVATAR,
        height: AVATAR,
        transform: `translate(-50%, 50%) scale(${scale})`,
        transformOrigin: 'center center',
        background: 'var(--mm-panel-alt)',
        border: hover ? `2px solid ${color}` : `1.5px solid ${color}`,
        boxShadow: hover
          ? `0 0 0 3px var(--mm-panel), 0 12px 32px -6px ${color}88, 0 4px 12px -2px rgba(0,0,0,0.3)`
          : `0 1px 3px rgba(0,0,0,0.3)`,
        zIndex: hover ? 40 : 5,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
      onClick={onClick}
      aria-label={`${player.name} · ${value} · 선수카드 열기`}
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
      {/* 호버 툴팁 · 이름 + 값 (확대된 아바타 옆에 · scale 역보정으로 크기 유지) */}
      {hover && (
        <span
          className="absolute pointer-events-none whitespace-nowrap text-[10px] font-black"
          style={{
            background: 'var(--mm-black)',
            color: 'var(--mm-yellow)',
            border: `1px solid ${color}`,
            borderRadius: '3px',
            padding: '3px 6px',
            left: '105%',
            top: '50%',
            // parent scale(2.55) 을 상쇄해 툴팁 원래 크기 유지
            transform: `translateY(-50%) scale(${1 / 2.55})`,
            transformOrigin: 'left center',
            letterSpacing: '0.06em',
            zIndex: 50,
          }}
        >
          {player.name} · {value}
        </span>
      )}
    </button>
  )
}

// ─────── 모바일 팝오버 · 프로필 확대 + 5대 지표 요약 + 선수카드 CTA ───────
function PlayerMilestonePopover({
  player,
  onClose,
  onOpenCard,
}: {
  player: PlayerMilestoneData
  onClose: () => void
  onOpenCard: () => void
}) {
  // ESC 로 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${player.name} 마일스톤 요약`}
      onClick={onClose}
    >
      {/* 배경 딤 */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.55)' }} aria-hidden />
      {/* 팝오버 카드 */}
      <div
        className="relative mm-brand w-full max-w-sm"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderRadius: '6px',
          boxShadow: '0 24px 60px -12px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 p-1.5 cursor-pointer transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center rounded"
          style={{ color: 'var(--mm-muted)' }}
          aria-label="닫기"
        >
          <X size={18} />
        </button>

        {/* 프로필 확대 */}
        <div className="flex flex-col items-center pt-6 pb-3 px-4">
          <div
            className="relative w-24 h-24 rounded-full overflow-hidden flex items-center justify-center mb-3"
            style={{
              background: 'var(--mm-panel-alt)',
              border: `3px solid var(--mm-yellow)`,
              boxShadow: '0 8px 24px -4px rgba(0,0,0,0.4)',
            }}
            aria-hidden
          >
            <span
              className="absolute inset-0 flex items-center justify-center font-jersey font-black text-4xl"
              style={{ color: 'var(--mm-ink)' }}
            >
              {initialsOf(player.name)}
            </span>
            {player.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={player.photo_url}
                alt=""
                className="relative w-full h-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />
            )}
          </div>
          <div
            className="font-jersey font-black text-lg text-center"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            {player.number != null ? `#${player.number} ` : ''}{player.name}
          </div>
          {player.position && (
            <div className="text-[11px] font-bold uppercase mt-1" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
              {player.position}
            </div>
          )}
        </div>

        {/* 5대 지표 요약 */}
        <div
          className="grid grid-cols-5 gap-0"
          style={{ borderTop: '1px solid var(--mm-rule)', borderBottom: '1px solid var(--mm-rule)' }}
        >
          {METRICS.map((m, i) => (
            <div
              key={m.key}
              className="text-center py-3"
              style={{
                borderRight: i < METRICS.length - 1 ? '1px solid var(--mm-rule)' : undefined,
              }}
            >
              <div
                className="text-[10px] font-black uppercase"
                style={{ color: m.color, letterSpacing: '0.12em' }}
              >
                {m.label}
              </div>
              <div
                className="font-jersey font-black tabular-nums text-lg mt-1"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.01em' }}
              >
                {player[m.key]}
              </div>
            </div>
          ))}
        </div>

        {/* CTA · 선수카드 열기 */}
        <button
          type="button"
          onClick={onOpenCard}
          className="w-full flex items-center justify-center gap-2 px-4 min-h-[52px] font-jersey font-black uppercase tracking-[0.14em] text-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
          style={{
            background: 'var(--mm-yellow)',
            color: 'var(--mm-black)',
            border: 'none',
          }}
        >
          선수카드 열기
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
