'use client'
// 기록실 — 통산 누적 보드 (2026-10-14 · 2026-10-16 「부문별 1위 조명」으로 개편)
// 참고: kbl-stats 의 역대 통산 순위(Career Leaders) 화면 · 순위 규칙은 lib/stats/careerRanks.ts(withRanks).
//
// 재료: 스탯 API 를 분기 없이 부른 결과 = 그 리그의 모든 정규 경기(친선전 제외). 새 집계 없음.
// 화면
//   ① 1위 카드 격자 — 부문(CAREER_STATS) 하나에 카드 하나. 첫 부문(득점)은 줄 전체를 쓰는 큰 카드라
//      나머지 12장이 2·3·4·6열 어디서도 끝줄이 비지 않는다. 카드를 누르면 아래 상세가 그 부문으로 바뀐다.
//   ② 선택 부문 상세 — 상위 10명. 부문 고르기는 위 카드가 맡는다(같은 13부문 칩 줄이 한 벌 더 있어 2026-10-26 삭제). 1~3위는 줄을 키우고 순위 숫자를 노랑 계열로.
//   ⚠ 트로피·배지 아이콘은 쓰지 않는다(배지 제도 폐지 2026-10-11 — 모으기처럼 읽히면 안 된다).
// 출전 자격은 따지지 않는다: 통산 누적은 「얼마나 쌓았나」라 오래 뛴 사람이 위에 오는 게 맞다.
import { useMemo, useRef, useState, type CSSProperties } from 'react'
import Chip from '@/components/league/ui/Chip'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import { POSITION_GROUPS, positionGroupOf, positionGroupLabel, type PositionGroupCode } from '@/lib/league/positionGroup'
import Avatar from '@/components/league/ui/Avatar'
import SectionCard from '@/components/league/ui/SectionCard'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import { accentOrInk } from '@/lib/util/contrastColor'
import { CAREER_STATS, careerTop, careerRankLabel, type CareerStatKey } from '@/lib/stats/careerRanks'
import type { PlayerStat } from '@/types/league'

const BOARD_TOP = 10

interface Props {
  /** 전체 기간 스탯(분기 없이 받은 것) */
  players: PlayerStat[]
  loading: boolean
}

type Ranked = PlayerStat & { rank: number; value: number }

const valueOf = (key: CareerStatKey) => (p: PlayerStat) => Number(p[key]) || 0
const fmt = (n: number) => n.toLocaleString('ko-KR')

/** 1~3위 순위 숫자 색 — 노랑 계열 세 단계(메달 아이콘 대신 숫자로만) */
const PODIUM: Record<number, CSSProperties> = {
  1: { background: 'var(--mm-yellow)', color: 'var(--mm-black)' },
  2: { background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)', border: '1px solid var(--mm-yellow-strong)' },
  3: { background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)' },
}

export default function CareerLeadersBoard({ players, loading }: Props) {
  const openPlayerCard = useOpenPlayerCard()
  const [key, setKey] = useState<CareerStatKey>(CAREER_STATS[0].key)
  const detailRef = useRef<HTMLDivElement>(null)
  const def = CAREER_STATS.find(s => s.key === key) ?? CAREER_STATS[0]
  // 「전체 순위 | 같은 포지션」 (2026-10-17) — 같은 포지션이면 그 그룹만 모아 같은 규칙(careerTop)으로 다시 센다.
  //   포지션이 없는 선수는 이 모드에서만 빠진다.
  const [scope, setScope] = useState<'all' | 'pos'>('all')
  const [posGroup, setPosGroup] = useState<PositionGroupCode>('G')
  const pool = useMemo(
    () => scope === 'pos' ? players.filter(p => positionGroupOf(p.position) === posGroup) : players,
    [players, scope, posGroup],
  )
  const scopeLabel = scope === 'pos' ? `${positionGroupLabel(posGroup)} ` : ''

  // 부문별 1위(공동 포함) — 순위는 careerTop(withRanks) 한 곳에서만 매긴다
  const leaders = useMemo(
    () => CAREER_STATS.map(s => ({ def: s, top: careerTop(pool, valueOf(s.key), 1) as Ranked[] })),
    [pool],
  )
  const rows = useMemo(() => careerTop(pool, valueOf(key), BOARD_TOP) as Ranked[], [pool, key])
  const hasAny = leaders.some(l => l.top.length > 0)

  const open = (p: { player_id: string; name: string }) =>
    openPlayerCard?.({ playerId: p.player_id, playerName: p.name, quarterId: 'all' })

  function pick(k: CareerStatKey) {
    setKey(k)
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // 상태가 바뀐 다음 프레임에 내려가야 새 목록 위치로 간다
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5 lg:gap-3">
          <div className="col-span-full h-28 rounded-[var(--mm-radius-card)] mm-shimmer" />
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="h-44 rounded-[var(--mm-radius-card)] mm-shimmer" />
          ))}
        </div>
      </div>
    )
  }

  const scopeControls = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedTabs<'all' | 'pos'>
        items={[
          { key: 'all', label: '전체 순위' },
          { key: 'pos', label: '같은 포지션' },
        ]}
        value={scope}
        onChange={setScope}
        ariaLabel="순위 범위"
        size="sm"
      />
      {scope === 'pos' && (
        <div className="flex gap-1.5" role="group" aria-label="포지션">
          {POSITION_GROUPS.map(g => (
            <Chip key={g.code} as="button" size="sm" selected={posGroup === g.code} onClick={() => setPosGroup(g.code)}>
              {g.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  )

  if (!hasAny) {
    return (
      <div className="space-y-4">
        {scope === 'pos' && scopeControls}
        <SectionCard variant="standalone">
          <p className="text-sm py-6 text-center" style={{ color: 'var(--mm-muted)' }}>
            {scope === 'pos' ? `${positionGroupLabel(posGroup)} 기록이 아직 없어요` : '아직 기록이 없어요'}
          </p>
        </SectionCard>
      </div>
    )
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {scopeControls}
      {/* ① 부문별 1위 — 첫 부문은 줄 전체 큰 카드, 나머지 12장은 2/3/4/6열에서 끝줄이 꽉 찬다 */}
      <section aria-label="부문별 통산 1위">
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5 lg:gap-3">
          {leaders.map(({ def: s, top }, i) => (
            <li key={s.key} className={i === 0 ? 'col-span-full' : undefined}>
              <LeaderCard
                label={s.label}
                unit={s.unit}
                top={top}
                wide={i === 0}
                selected={s.key === key}
                onSelect={() => pick(s.key)}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* ② 선택 부문 상세 — 상위 10명 */}
      <div ref={detailRef} className="scroll-mt-20">
        <SectionCard variant="standalone" ariaLabel={`통산 ${def.label} 순위`} pad="none">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 pt-4 lg:px-6 lg:pt-5">
            <h3 className="font-black text-lg lg:text-xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.015em' }}>
              {scopeLabel}통산 {def.label} 순위
            </h3>
            <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>상위 {BOARD_TOP}명</span>
          </div>

          <div className="px-4 py-4 lg:px-6 lg:py-5">
            {rows.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: 'var(--mm-muted)' }}>이 부문은 아직 기록이 없어요</p>
            ) : (
              // PC: 전폭 한 줄이면 이름과 숫자가 양 끝으로 벌어진다 → 위·아래 절반씩 두 열(1~5위 | 6~10위)
              <ol
                className="space-y-1.5 lg:space-y-0 lg:grid lg:grid-cols-2 lg:grid-flow-col lg:grid-rows-[repeat(var(--rows),auto)] lg:gap-x-4 lg:gap-y-1.5"
                style={{ '--rows': Math.ceil(rows.length / 2) } as CSSProperties}
              >
                {rows.map(r => {
                  const podium = r.rank <= 3
                  return (
                    <li key={r.player_id}>
                      <button
                        type="button"
                        onClick={() => open(r)}
                        className={`mm-press w-full flex items-center gap-2.5 px-2.5 text-left cursor-pointer transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] ${podium ? 'min-h-14 py-2' : 'min-h-11 py-1.5'}`}
                        style={{
                          background: r.rank === 1 ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                          border: `1px solid ${r.rank === 1 ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
                          borderRadius: 'var(--mm-radius-ctl)',
                        }}
                        aria-label={`${careerRankLabel(r.rank)} ${r.name} 통산 ${def.label} ${r.value}${def.unit}`}
                      >
                        <span
                          className={`t-num shrink-0 inline-flex items-center justify-center rounded-full font-black ${podium ? 'w-7 h-7 text-sm' : 'w-7 h-6 text-xs'}`}
                          style={PODIUM[r.rank] ?? { color: 'var(--mm-ink-soft)' }}
                          aria-hidden
                        >
                          {r.rank}
                        </span>
                        <Avatar src={r.photo_url} name={r.name} size={podium ? 40 : 24} ringColor={podium ? accentOrInk(r.team_color) : null} decorative />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-bold ${podium ? 'text-base' : 'text-sm'}`} title={r.name} style={{ color: 'var(--mm-ink)' }}>{r.name}</span>
                          {podium && r.team_name && (
                            <span className="block truncate text-xs font-semibold" style={{ color: 'var(--mm-muted)' }}>{r.team_name}</span>
                          )}
                        </span>
                        <span className="t-num font-black shrink-0" style={{ color: 'var(--mm-ink)', fontSize: podium ? '20px' : '16px' }}>
                          {fmt(r.value)}
                          <span className="ml-0.5 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{def.unit}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

/** 부문 1위 카드 — 누르면 아래 상세가 그 부문으로. 공동 1위면 「공동 1위 · 김A 외 N명」 */
function LeaderCard({ label, unit, top, wide, selected, onSelect }: {
  label: string
  unit: string
  top: Ranked[]
  wide: boolean
  selected: boolean
  onSelect: () => void
}) {
  const first = top[0]
  const tied = top.length > 1
  const accent = first ? accentOrInk(first.team_color) : 'var(--mm-rule)'
  const name = !first ? '아직 기록 없음' : tied ? `${first.name} 외 ${top.length - 1}명` : first.name
  const rankText = tied ? '공동 1위' : '1위'
  const aria = first
    ? `통산 ${label} ${rankText} ${top.map(t => t.name).join(', ')} ${first.value}${unit} — 순위 보기`
    : `통산 ${label} 기록 없음`

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={aria}
      className={`mm-lift relative w-full h-full overflow-hidden text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] ${
        wide
          ? 'flex items-center gap-4 px-4 py-4 sm:px-5 lg:px-6'
          : 'flex flex-col items-center text-center gap-1.5 px-3 pt-5 pb-4'
      }`}
      style={{
        // 큰 카드(첫 부문)는 오른쪽 위 노랑 빛으로 한 번 더 무게를 준다 — 홈 맨 위 카드와 같은 어휘
        background: selected
          ? 'var(--mm-yellow-soft)'
          : wide ? 'radial-gradient(70% 180% at 100% 0%, var(--mm-yellow-soft), transparent 60%), var(--mm-panel)' : 'var(--mm-panel)',
        border: `1px solid ${selected ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
        borderRadius: 'var(--mm-radius-card)',
        boxShadow: 'var(--mm-edge-light), var(--mm-shadow-sm)',
        opacity: first ? 1 : 0.6,
      }}
    >
      {/* 팀 색 띠 — 팀 정체성은 글자가 아니라 띠·테두리로(대비 규칙, contrastColor.ts) */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: accent }} />

      {wide ? (
        <>
          <Avatar src={first?.photo_url} name={first?.name ?? label} size={80} ringColor={first ? accent : null} decorative />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-black" style={{ color: 'var(--mm-yellow-strong)' }}>통산 {label} · {rankText}</span>
            <span className="block truncate font-black text-lg sm:text-xl" style={{ color: 'var(--mm-ink)' }}>{name}</span>
            {first?.team_name && !tied && (
              <span className="block truncate text-xs font-semibold" style={{ color: 'var(--mm-muted)' }}>{first.team_name}</span>
            )}
          </span>
          {first && (
            <span className="t-num font-black shrink-0 leading-none" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 8vw, 40px)' }}>
              {fmt(first.value)}
              <span className="ml-1 text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>{unit}</span>
            </span>
          )}
        </>
      ) : (
        <>
          <span className="text-xs font-black" style={{ color: 'var(--mm-ink-soft)' }}>{label}</span>
          <Avatar src={first?.photo_url} name={first?.name ?? label} size={56} ringColor={first ? accent : null} decorative />
          <span className="w-full truncate font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{name}</span>
          {first ? (
            <span className="t-num font-black leading-none" style={{ color: 'var(--mm-ink)', fontSize: '24px' }}>
              {fmt(first.value)}
              <span className="ml-0.5 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{unit}</span>
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>—</span>
          )}
          {tied && <span className="text-[11px] font-bold" style={{ color: 'var(--mm-yellow-strong)' }}>공동 1위</span>}
        </>
      )}
    </button>
  )
}
