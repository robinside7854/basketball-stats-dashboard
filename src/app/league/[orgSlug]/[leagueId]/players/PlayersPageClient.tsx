'use client'
// 「선수」 탭 — 지금 팀에 있는 선수 전원을 카드로 (2026-10-16 부활).
//   예전 명단 화면(roster)을 없앤 뒤 「전체 명단을 한눈에 못 본다」는 요청으로 되살렸다.
//   수정·삭제·분기 배정은 팀 탭 RosterEditor 에만 있다. 여기엔 어드민 「+ 선수 등록」(이름·포지션)만 둔다.
//   숫자(출석일·열린 날)는 /roster-cards 가 computeLeagueStats 캐시에서 그대로 가져온다(선수 카드·스탯 탭과 같은 값).
//   사용자 피드백(2026-10-16): 등번호·소속팀(분기마다 바뀜)·출석 막대·게스트는 보이지 않는다. 얼굴을 크게.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { BadgeCheck, Loader2, Plus, Search, UserX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Chip, EmptyState, SectionCard, SegmentedTabs, Sheet } from '@/components/league/ui'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { RosterCard, RosterCardsResponse } from '@/app/api/leagues/[leagueId]/roster-cards/route'

type Period = 'quarter' | 'all'
type SortKey = 'attendance' | 'name'

/** 앱 전체가 쓰는 포지션 값(팀 탭 RosterEditor·PlayerForm 과 같다) */
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']
const OPTIMIZABLE = /^https:\/\/[^/]+\.supabase\.(co|in)\//

function posRank(p: string): number {
  const i = POSITION_ORDER.indexOf(p)
  return i < 0 ? 99 : i
}

export default function PlayersPageClient({ leagueId }: { leagueId: string }) {
  const openCard = useOpenPlayerCard()
  const { isEditMode, leagueHeaders } = useLeagueEditMode()
  const [data, setData] = useState<RosterCardsResponse | null>(null)
  const [error, setError] = useState(false)
  const [period, setPeriod] = useState<Period | null>(null)
  const [sort, setSort] = useState<SortKey>('attendance')
  const [pos, setPos] = useState<string>('ALL')
  const [onlyMembers, setOnlyMembers] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`/api/leagues/${leagueId}/roster-cards`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    return (await r.json()) as RosterCardsResponse
  }, [leagueId])

  useEffect(() => {
    let alive = true
    load()
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [load])

  const refetch = useCallback(() => {
    load().then(d => { setData(d); setError(false) }).catch(() => {})
  }, [load])

  // 기본 기간 = 이번 분기. 분기에 열린 날이 아직 0일이면(분기 첫 주 전) 전체로 시작한다.
  const effPeriod: Period = period ?? (data?.quarter && data.quarter.total_rounds > 0 ? 'quarter' : 'all')
  const totalRounds = effPeriod === 'quarter' ? (data?.quarter?.total_rounds ?? 0) : (data?.all_total_rounds ?? 0)

  const positions = useMemo(() => {
    const s = new Set<string>()
    for (const p of data?.players ?? []) p.positions.forEach(x => s.add(x))
    return [...s].sort((a, b) => posRank(a) - posRank(b) || a.localeCompare(b))
  }, [data])

  const attOf = useCallback(
    (p: RosterCard) => (effPeriod === 'quarter' ? (p.attendance.quarter ?? { gp: 0, rate: 0 }) : p.attendance.all),
    [effPeriod],
  )

  const list = useMemo(() => {
    const rows = (data?.players ?? []).filter(p => {
      if (onlyMembers && !p.has_account) return false
      if (pos !== 'ALL' && !p.positions.includes(pos)) return false
      return true
    })
    const byName = (a: RosterCard, b: RosterCard) => a.name.localeCompare(b.name, 'ko')
    return [...rows].sort((a, b) => {
      if (sort === 'name') return byName(a, b)
      const aa = attOf(a), ba = attOf(b)
      return ba.rate - aa.rate || ba.gp - aa.gp || byName(a, b)
    })
  }, [data, onlyMembers, pos, sort, attOf])

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
                {data ? <>선수 {total}명 · 가입 {members}명</> : ' '}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
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
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center gap-1 px-3 min-h-11 text-sm font-black whitespace-nowrap cursor-pointer transition-[filter] duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)' }}
                >
                  <Plus size={16} aria-hidden />선수 등록
                </button>
              )}
            </div>
          </div>

          {data && (
            <div className="space-y-2">
              <FilterRow label="정렬">
                <Chip as="button" selected={sort === 'attendance'} onClick={() => setSort('attendance')}>참석률</Chip>
                <Chip as="button" selected={sort === 'name'} onClick={() => setSort('name')}>이름</Chip>
              </FilterRow>
              {positions.length > 0 && (
                <FilterRow label="포지션">
                  <Chip as="button" selected={pos === 'ALL'} onClick={() => setPos('ALL')}>전체</Chip>
                  {positions.map(p => (
                    <Chip key={p} as="button" selected={pos === p} onClick={() => setPos(p)}>{p}</Chip>
                  ))}
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
            <div key={i} className="aspect-[4/5.6] animate-pulse" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }} />
          ))}
        </CardGrid>
      ) : list.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={total === 0 ? Users : Search}
            title={total === 0 ? '아직 등록된 선수가 없어요' : '조건에 맞는 선수가 없어요'}
            action={total > 0 ? (
              <Chip as="button" size="md" onClick={() => { setPos('ALL'); setOnlyMembers(false) }}>필터 초기화</Chip>
            ) : undefined}
          />
        </SectionCard>
      ) : (
        <CardGrid>
          {list.map((p, i) => (
            <PlayerCardTile
              key={p.id}
              p={p}
              gp={attOf(p).gp}
              rate={attOf(p).rate}
              totalRounds={totalRounds}
              priority={i < 4}
              onOpen={openCard ? () => openCard({
                playerId: p.id,
                playerName: p.name,
                quarterId: effPeriod === 'quarter' ? (data.quarter?.id ?? 'all') : 'all',
              }) : undefined}
            />
          ))}
        </CardGrid>
      )}

      {isEditMode && (
        <AddPlayerSheet
          open={addOpen}
          onClose={() => setAddOpen(false)}
          leagueId={leagueId}
          headers={leagueHeaders}
          onAdded={refetch}
        />
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

function PlayerCardTile({ p, gp, rate, totalRounds, priority, onOpen }: {
  p: RosterCard; gp: number; rate: number; totalRounds: number; priority: boolean; onOpen?: () => void
}) {
  const pct = Math.round(rate * 100)
  const noRounds = totalRounds === 0
  const initial = p.name.trim().charAt(0) || '?'
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="group text-left min-w-0 flex flex-col overflow-hidden cursor-pointer transition-[transform,border-color,box-shadow] duration-200 border border-[color:var(--mm-rule)] hover:-translate-y-0.5 hover:border-[color:var(--mm-yellow-strong)] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--mm-yellow-strong)] active:translate-y-0 disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-[color:var(--mm-rule)] disabled:hover:shadow-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      style={{ background: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-card)' }}
      aria-label={`${p.name} 선수 카드 열기`}
    >
      {/* 얼굴이 주인공 — 카드 폭 전체, 4:5 */}
      <div className="relative w-full aspect-[4/5] overflow-hidden" style={{ background: 'var(--mm-panel-alt)' }}>
        {p.photo_url ? (
          OPTIMIZABLE.test(p.photo_url) ? (
            <Image
              src={p.photo_url}
              alt=""
              fill
              sizes="(min-width:1280px) 20vw, (min-width:1024px) 25vw, (min-width:640px) 33vw, 50vw"
              preload={priority}
              className="object-cover object-top transition-[filter] duration-200 group-hover:brightness-105"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- 옵티마이저 허용 호스트가 아님(Avatar 와 같은 규칙)
            <img src={p.photo_url} alt="" loading={priority ? 'eager' : 'lazy'} className="absolute inset-0 w-full h-full object-cover object-top" />
          )
        ) : (
          <span aria-hidden className="absolute inset-0 flex items-center justify-center font-black text-5xl lg:text-6xl select-none" style={{ color: 'var(--mm-muted)' }}>
            {initial}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-2.5 lg:p-3 min-w-0 flex-1">
        <p className="font-black text-[15px] lg:text-base leading-tight truncate" style={{ color: 'var(--mm-ink)' }}>{p.name}</p>
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
        </div>
        <p className="mt-auto text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>
          출석 {noRounds ? '–' : <>{gp}/{totalRounds}일 · <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{pct}%</span></>}
        </p>
      </div>
    </button>
  )
}

function AddPlayerSheet({ open, onClose, leagueId, headers, onAdded }: {
  open: boolean; onClose: () => void; leagueId: string; headers: Record<string, string>; onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  function close() {
    if (saving) return
    setName(''); setPicked([])
    onClose()
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const clean = name.trim()
    if (!clean) { toast.error('이름을 입력해 주세요'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/players`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: clean, position: picked.length > 0 ? picked.join(',') : null }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null
        toast.error(res.status === 401 ? '어드민만 등록할 수 있어요' : (j?.error ?? '등록하지 못했어요'))
        return
      }
      toast.success(`${clean} 선수를 등록했어요`)
      setName(''); setPicked([])
      onClose()
      onAdded()
    } catch {
      toast.error('등록하지 못했어요. 잠시 뒤 다시 해 주세요')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={close} title="선수 등록" width="sm">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>이름 (필수)</span>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            placeholder="예: 홍길동"
            className="mt-1 w-full min-h-11 px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-chip)' }}
          />
        </label>
        <fieldset>
          <legend className="text-xs font-bold mb-1.5" style={{ color: 'var(--mm-muted)' }}>포지션 (선택 · 여러 개 가능)</legend>
          <div className="flex flex-wrap gap-1.5">
            {POSITIONS.map(x => {
              const on = picked.includes(x)
              return (
                <button
                  key={x}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(v => (on ? v.filter(y => y !== x) : [...v, x]))}
                  className="min-h-11 min-w-11 px-3 text-sm font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={on
                    ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', borderRadius: 'var(--mm-radius-chip)' }
                    : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
                >
                  {x}
                </button>
              )
            })}
          </div>
        </fieldset>
        <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>분기 팀 배정은 팀 탭에서 해요.</p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={close}
            className="flex-1 min-h-11 text-sm font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-chip)' }}
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1 min-h-11 text-sm font-black cursor-pointer transition-[filter] duration-200 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)' }}
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}등록
          </button>
        </div>
      </form>
    </Sheet>
  )
}
