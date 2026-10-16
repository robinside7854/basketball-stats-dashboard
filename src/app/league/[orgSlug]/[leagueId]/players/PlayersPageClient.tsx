'use client'
// 「선수」 탭 — 지금 팀에 있는 선수 전원을 카드로 (2026-10-16 부활).
//   예전 명단 화면(roster)을 없앤 뒤 「전체 명단을 한눈에 못 본다」는 요청으로 보기 전용으로 되살렸다.
//   편집(추가·삭제·분기 배정)은 팀 탭 RosterEditor 에만 있다 — 여기엔 넣지 않는다.
//   숫자(출석일·열린 날)는 /roster-cards 가 computeLeagueStats 캐시에서 그대로 가져온다(선수 카드·스탯 탭과 같은 값).
import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, Search, UserX, Users } from 'lucide-react'
import { Avatar, Chip, EmptyState, SectionCard, SegmentedTabs, ProgressBar } from '@/components/league/ui'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import type { RosterCard, RosterCardsResponse } from '@/app/api/leagues/[leagueId]/roster-cards/route'

type Period = 'quarter' | 'all'
type SortKey = 'attendance' | 'name' | 'number'

const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']
const UNASSIGNED = '__none__'

function posRank(p: string): number {
  const i = POSITION_ORDER.indexOf(p)
  return i < 0 ? 99 : i
}

export default function PlayersPageClient({ leagueId }: { leagueId: string }) {
  const openCard = useOpenPlayerCard()
  const [data, setData] = useState<RosterCardsResponse | null>(null)
  const [error, setError] = useState(false)
  const [period, setPeriod] = useState<Period | null>(null)
  const [sort, setSort] = useState<SortKey>('attendance')
  const [pos, setPos] = useState<string>('ALL')
  const [team, setTeam] = useState<string>('ALL')
  const [onlyMembers, setOnlyMembers] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/leagues/${leagueId}/roster-cards`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: RosterCardsResponse) => { if (alive) setData(d) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [leagueId])

  // 기본 기간 = 이번 분기. 분기에 열린 날이 아직 0일이면(분기 첫 주 전) 전체로 시작한다.
  const effPeriod: Period = period ?? (data?.quarter && data.quarter.total_rounds > 0 ? 'quarter' : 'all')
  const totalRounds = effPeriod === 'quarter' ? (data?.quarter?.total_rounds ?? 0) : (data?.all_total_rounds ?? 0)

  const positions = useMemo(() => {
    const s = new Set<string>()
    for (const p of data?.players ?? []) p.positions.forEach(x => s.add(x))
    return [...s].sort((a, b) => posRank(a) - posRank(b) || a.localeCompare(b))
  }, [data])
  const hasUnassigned = (data?.players ?? []).some(p => !p.team)

  const attOf = (p: RosterCard) =>
    effPeriod === 'quarter' ? (p.attendance.quarter ?? { gp: 0, rate: 0 }) : p.attendance.all

  const list = useMemo(() => {
    const rows = (data?.players ?? []).filter(p => {
      if (onlyMembers && !p.has_account) return false
      if (pos !== 'ALL' && !p.positions.includes(pos)) return false
      if (team === UNASSIGNED && p.team) return false
      if (team !== 'ALL' && team !== UNASSIGNED && p.team?.id !== team) return false
      return true
    })
    const byName = (a: RosterCard, b: RosterCard) => a.name.localeCompare(b.name, 'ko')
    return [...rows].sort((a, b) => {
      if (sort === 'name') return byName(a, b)
      if (sort === 'number') {
        const an = a.number ?? Number.MAX_SAFE_INTEGER
        const bn = b.number ?? Number.MAX_SAFE_INTEGER
        return an - bn || byName(a, b)
      }
      const aa = effPeriod === 'quarter' ? (a.attendance.quarter ?? { gp: 0, rate: 0 }) : a.attendance.all
      const ba = effPeriod === 'quarter' ? (b.attendance.quarter ?? { gp: 0, rate: 0 }) : b.attendance.all
      return ba.rate - aa.rate || ba.gp - aa.gp || byName(a, b)
    })
  }, [data, onlyMembers, pos, team, sort, effPeriod])

  const total = data?.players.length ?? 0
  const members = (data?.players ?? []).filter(p => p.has_account).length

  return (
    <div className="mm-brand space-y-4">
      <SectionCard pad="none">
        <div className="px-4 py-4 lg:px-6 lg:py-5 space-y-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-black text-2xl lg:text-3xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>선수</h1>
              <p className="text-sm mt-1 tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                {data ? <>선수 {total}명 · 가입 {members}명</> : ' '}
              </p>
            </div>
            {data && (
              <SegmentedTabs<Period>
                ariaLabel="출석 기간"
                size="sm"
                value={effPeriod}
                onChange={setPeriod}
                items={[
                  { key: 'quarter', label: data.quarter ? `이번 분기 (${data.quarter.label})` : '이번 분기', disabled: !data.quarter },
                  { key: 'all', label: '전체' },
                ]}
              />
            )}
          </div>

          {data && (
            <div className="space-y-2">
              <FilterRow label="정렬">
                <Chip as="button" selected={sort === 'attendance'} onClick={() => setSort('attendance')}>참석률</Chip>
                <Chip as="button" selected={sort === 'name'} onClick={() => setSort('name')}>이름</Chip>
                <Chip as="button" selected={sort === 'number'} onClick={() => setSort('number')}>등번호</Chip>
              </FilterRow>
              {positions.length > 0 && (
                <FilterRow label="포지션">
                  <Chip as="button" selected={pos === 'ALL'} onClick={() => setPos('ALL')}>전체</Chip>
                  {positions.map(p => (
                    <Chip key={p} as="button" selected={pos === p} onClick={() => setPos(p)}>{p}</Chip>
                  ))}
                </FilterRow>
              )}
              {(data.teams.length > 0 || hasUnassigned) && (
                <FilterRow label="소속팀">
                  <Chip as="button" selected={team === 'ALL'} onClick={() => setTeam('ALL')}>전체</Chip>
                  {data.teams.map(t => (
                    <Chip
                      key={t.id}
                      as="button"
                      selected={team === t.id}
                      onClick={() => setTeam(t.id)}
                      icon={<span className="inline-block w-2 h-2 rounded-full" style={{ background: t.color }} />}
                    >
                      {t.name}
                    </Chip>
                  ))}
                  {hasUnassigned && (
                    <Chip as="button" selected={team === UNASSIGNED} onClick={() => setTeam(UNASSIGNED)}>팀 미배정</Chip>
                  )}
                </FilterRow>
              )}
              <FilterRow label="회원">
                <Chip as="button" selected={onlyMembers} onClick={() => setOnlyMembers(v => !v)} icon={BadgeCheck}>
                  가입 회원만
                </Chip>
              </FilterRow>
            </div>
          )}
        </div>
      </SectionCard>

      {error ? (
        <SectionCard><EmptyState icon={UserX} title="명단을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." /></SectionCard>
      ) : !data ? (
        <CardGrid>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-[188px] animate-pulse" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }} />
          ))}
        </CardGrid>
      ) : list.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={total === 0 ? Users : Search}
            title={total === 0 ? '아직 등록된 선수가 없어요' : '조건에 맞는 선수가 없어요'}
            action={total > 0 ? (
              <Chip as="button" size="md" onClick={() => { setPos('ALL'); setTeam('ALL'); setOnlyMembers(false) }}>필터 초기화</Chip>
            ) : undefined}
          />
        </SectionCard>
      ) : (
        <CardGrid>
          {list.map(p => (
            <PlayerCardTile
              key={p.id}
              p={p}
              gp={attOf(p).gp}
              rate={attOf(p).rate}
              totalRounds={totalRounds}
              onOpen={openCard ? () => openCard({
                playerId: p.id,
                playerName: p.name,
                quarterId: effPeriod === 'quarter' ? (data.quarter?.id ?? 'all') : 'all',
              }) : undefined}
            />
          ))}
        </CardGrid>
      )}
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-bold shrink-0 w-11" style={{ color: 'var(--mm-muted)' }}>{label}</span>
      <div className="flex gap-1.5 overflow-x-auto min-w-0 -my-1 py-1 pr-1">{children}</div>
    </div>
  )
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 lg:gap-3">{children}</div>
}

function PlayerCardTile({ p, gp, rate, totalRounds, onOpen }: {
  p: RosterCard; gp: number; rate: number; totalRounds: number; onOpen?: () => void
}) {
  const pct = Math.round(rate * 100)
  const noRounds = totalRounds === 0
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="text-left min-w-0 flex flex-col gap-2 p-3 lg:p-4 transition-colors duration-200 hover:border-[color:var(--mm-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
      aria-label={`${p.name} 선수 카드 열기`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar src={p.photo_url} name={p.name} size={40} ringColor={p.team?.color} decorative />
        <div className="min-w-0">
          <p className="font-black text-[15px] leading-tight truncate" style={{ color: 'var(--mm-ink)' }}>{p.name}</p>
          <p className="text-xs tabular-nums mt-0.5" style={{ color: 'var(--mm-muted)' }}>
            {p.number != null ? `#${p.number}` : '번호 없음'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 min-h-6">
        {p.positions.map(x => (
          <span
            key={x}
            className="inline-flex items-center h-6 px-1.5 text-[11px] font-bold"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
          >
            {x}
          </span>
        ))}
        {p.has_account
          ? <Chip tone="positive" icon={BadgeCheck}>가입</Chip>
          : <Chip tone="neutral">미가입</Chip>}
        {p.is_guest && <Chip tone="accent">게스트</Chip>}
      </div>

      <p className="flex items-center gap-1.5 text-xs font-semibold min-w-0" style={{ color: p.team ? 'var(--mm-ink-soft)' : 'var(--mm-muted)' }}>
        <span aria-hidden className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.team?.color ?? 'var(--mm-rule)' }} />
        <span className="truncate">{p.team ? p.team.name : '팀 미배정'}</span>
        {p.team && !p.team.is_regular && <span className="shrink-0" style={{ color: 'var(--mm-muted)' }}>· 비정규</span>}
      </p>

      <div className="mt-auto space-y-1">
        <p className="text-xs tabular-nums flex justify-between gap-2" style={{ color: 'var(--mm-muted)' }}>
          <span>출석 {noRounds ? '–' : `${gp}/${totalRounds}일`}</span>
          <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{noRounds ? '' : `${pct}%`}</span>
        </p>
        <ProgressBar value={noRounds ? 0 : rate} height={5} label={noRounds ? undefined : `출석률 ${pct}%`} />
      </div>
    </button>
  )
}
