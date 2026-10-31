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
import { Chip, EmptyState, SectionCard, Sheet } from '@/components/league/ui'
import SortSelect from '@/components/league/ui/SortSelect'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import type { RosterCardLine } from '@/app/api/leagues/[leagueId]/roster-cards/route'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { RosterCard, RosterCardsResponse } from '@/app/api/leagues/[leagueId]/roster-cards/route'
import { POSITION_GROUPS, positionGroupLabel, positionGroupOf, type PositionGroupCode } from '@/lib/league/positionGroup'

type Period = 'quarter' | 'all'
// 리뉴얼 R2 (2026-10-31): 선수 탭 = 명단 + 순위. 스탯 탭(리더보드)의 「누가 잘하나」를 여기로 합쳤다.
//   고르기는 「순위 ▾」 하나 + 기간 2칩. 포지션·가입 회원 칩은 뺐다. 되돌리기: docs/renewal-rollback.md (R2).
type SortKey = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'tpg' | 'attendance' | 'name'
const SORT_OPTIONS: readonly { key: SortKey; label: string; unit?: string }[] = [
  { key: 'ppg', label: '득점', unit: '점' },
  { key: 'rpg', label: '리바운드', unit: '개' },
  { key: 'apg', label: '어시스트', unit: '개' },
  { key: 'spg', label: '스틸', unit: '개' },
  { key: 'bpg', label: '블록', unit: '개' },
  { key: 'tpg', label: '3점 성공', unit: '개' },
  { key: 'attendance', label: '출석' },
  { key: 'name', label: '이름' },
]
type StatKey = Exclude<SortKey, 'attendance' | 'name'>
const isStatKey = (k: SortKey): k is StatKey => k !== 'attendance' && k !== 'name'

// 포지션은 가드·포워드·센터 세 가지(2026-10-17). 옛 5코드(PG·SG…)는 positionGroupOf 로 묶어 읽는다.
const OPTIMIZABLE = /^https:\/\/[^/]+\.supabase\.(co|in)\//

/** 카드의 positions(저장 문자열을 쉼표로 쪼갠 것) → 그룹 하나 */
function groupOfCard(p: RosterCard): PositionGroupCode | null {
  return positionGroupOf(p.positions.join(','))
}

export default function PlayersPageClient({ leagueId }: { leagueId: string }) {
  const openCard = useOpenPlayerCard()
  const { isEditMode, leagueHeaders } = useLeagueEditMode()
  const [data, setData] = useState<RosterCardsResponse | null>(null)
  const [error, setError] = useState(false)
  const [period, setPeriod] = useState<Period | null>(null)
  const [sort, setSort] = useState<SortKey>('ppg')
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const [addOpen, setAddOpen] = useState(false)

  // 특정 분기 보기(2026-11 운영진) — null 이면 서버가 고른 지금 분기. 다른 분기를 고르면 그 분기로 다시 받는다.
  const [askedQ, setAskedQ] = useState<string | null>(null)
  const { quarters } = useLeagueQuarter()
  const quarterOptions = useMemo(() => [...quarters]
    .filter(q => q.kind !== 'tournament')
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter)
    .map(q => ({ key: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q` })), [quarters])

  const load = useCallback(async () => {
    const qs = askedQ ? `?quarterId=${encodeURIComponent(askedQ)}` : ''
    const r = await fetch(`/api/leagues/${leagueId}/roster-cards${qs}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    return (await r.json()) as RosterCardsResponse
  }, [leagueId, askedQ])

  useEffect(() => {
    let alive = true
    load()
      .then(d => { if (alive) { setData(d); setError(false) } })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [load])

  const refetch = useCallback(() => {
    load().then(d => { setData(d); setError(false) }).catch(() => {})
  }, [load])

  // 기본 기간 = 이번 분기. 분기에 열린 날이 아직 0일이면(분기 첫 주 전) 전체로 시작한다.
  const effPeriod: Period = period ?? (data?.quarter && data.quarter.total_rounds > 0 ? 'quarter' : 'all')
  const totalRounds = effPeriod === 'quarter' ? (data?.quarter?.total_rounds ?? 0) : (data?.all_total_rounds ?? 0)

  const attOf = useCallback(
    (p: RosterCard) => (effPeriod === 'quarter' ? (p.attendance.quarter ?? { gp: 0, rate: 0 }) : p.attendance.all),
    [effPeriod],
  )

  const lineOf = useCallback(
    (p: RosterCard): RosterCardLine | null => (effPeriod === 'quarter' ? p.line.quarter : p.line.all),
    [effPeriod],
  )

  // 순위(1·2·2·4 공동) — 자격(순위 기준 출전일)을 채운 선수만. 자격 밖은 순위 없이 뒤로.
  const { list, rankOf } = useMemo(() => {
    const rows = data?.players ?? []
    const byName = (a: RosterCard, b: RosterCard) => a.name.localeCompare(b.name, 'ko')
    const ranks = new Map<string, number>()
    if (sort === 'name') return { list: [...rows].sort(byName), rankOf: ranks }
    if (sort === 'attendance') {
      return { list: [...rows].sort((a, b) => attOf(b).rate - attOf(a).rate || attOf(b).gp - attOf(a).gp || byName(a, b)), rankOf: ranks }
    }
    const v = (p: RosterCard) => lineOf(p)?.[sort] ?? -1
    const ok = (p: RosterCard) => lineOf(p)?.eligible === true
    const sorted = [...rows].sort((a, b) => Number(ok(b)) - Number(ok(a)) || v(b) - v(a) || byName(a, b))
    let prev = NaN, rank = 0
    sorted.forEach((p, i) => { if (!ok(p)) return; if (v(p) !== prev) { rank = i + 1; prev = v(p) } ranks.set(p.id, rank) })
    return { list: sorted, rankOf: ranks }
  }, [data, sort, attOf, lineOf])

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
                // 기간 고르기 — 「전체」 + 분기마다 하나(최신 먼저). 칩을 늘어놓지 않고 하나로(리뉴얼 원칙)
                <SortSelect
                  label="기간"
                  value={effPeriod === 'all' ? 'all' : (data.quarter?.id ?? 'all')}
                  options={[
                    { key: 'all', label: '전체' },
                    ...(quarterOptions.length > 0
                      ? quarterOptions
                      : data.quarter ? [{ key: data.quarter.id, label: data.quarter.label }] : []),
                  ]}
                  onChange={k => {
                    if (k === 'all') { setPeriod('all'); return }
                    setPeriod('quarter')
                    if (k !== data.quarter?.id) setAskedQ(k)
                  }}
                />
              )}
              {isEditMode && (
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="mm-press inline-flex items-center gap-1 px-3 min-h-11 text-sm font-black whitespace-nowrap cursor-pointer transition-[filter] duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)' }}
                >
                  <Plus size={16} aria-hidden />선수 등록
                </button>
              )}
            </div>
          </div>

          {data && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <SortSelect value={sort} options={SORT_OPTIONS} onChange={setSort} label="순위" />
              {/* PC 에서 숫자를 표로 보고 싶은 사람용 — 옛 스탯 표(메뉴에서는 뺐다) */}
              <Link href={`/league/${orgSlug}/${leagueId}/stats`} className="hidden lg:inline-flex t-label items-center min-h-11 hover:underline">
                표로 보기 →
              </Link>
            </div>
          )}
        </div>
      </SectionCard>

      {error ? (
        <SectionCard><EmptyState icon={UserX} title="명단을 불러오지 못했어요" description="잠시 뒤 다시 열어 주세요." /></SectionCard>
      ) : !data ? (
        <CardGrid>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[4/5.6] mm-shimmer" style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }} />
          ))}
        </CardGrid>
      ) : list.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={total === 0 ? Users : Search}
            title={total === 0 ? '아직 등록된 선수가 없어요' : '조건에 맞는 선수가 없어요'}
            action={total > 0 ? (
              <Chip as="button" size="md" onClick={() => setSort('ppg')}>처음으로</Chip>
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
              stat={isStatKey(sort) ? { label: SORT_OPTIONS.find(o => o.key === sort)!.label, value: lineOf(p)?.[sort] ?? null, rank: rankOf.get(p.id) ?? null } : null}
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

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 lg:gap-3">{children}</div>
}

function PlayerCardTile({ p, gp, rate, totalRounds, priority, onOpen, stat }: {
  p: RosterCard; gp: number; rate: number; totalRounds: number; priority: boolean; onOpen?: () => void
  /** 고른 순위 지표 — 없으면(출석·이름 정렬) 종전처럼 출석만 */
  stat: { label: string; value: number | null; rank: number | null } | null
}) {
  const pct = Math.round(rate * 100)
  const noRounds = totalRounds === 0
  const initial = p.name.trim().charAt(0) || '?'
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="group text-left min-w-0 flex flex-col overflow-hidden cursor-pointer transition-[translate,scale,border-color,box-shadow] duration-200 border border-[color:var(--mm-rule)] hover:-translate-y-0.5 hover:border-[color:var(--mm-yellow-strong)] shadow-[var(--mm-shadow-sm)] hover:shadow-[var(--mm-shadow-md)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--mm-yellow-strong)] active:translate-y-0 disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:border-[color:var(--mm-rule)] disabled:hover:shadow-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
              className="object-cover object-top transition-[filter,scale] duration-300 ease-out group-hover:brightness-105 group-hover:scale-[1.03] motion-reduce:group-hover:scale-100"
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
        {stat?.rank != null && (
          <span
            className="absolute left-2 top-2 min-w-8 h-8 px-1.5 inline-flex items-center justify-center font-jersey font-black text-lg tabular-nums"
            style={stat.rank <= 3
              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }
              : { background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
            aria-label={`${stat.label} ${stat.rank}위`}
          >
            {stat.rank}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 p-2.5 lg:p-3 min-w-0 flex-1">
        <p className="font-black text-[15px] lg:text-base leading-tight truncate" style={{ color: 'var(--mm-ink)' }}>{p.name}</p>
        <div className="flex flex-wrap gap-1 min-h-6">
          {groupOfCard(p) && (
            <span
              className="inline-flex items-center h-6 px-1.5 text-[11px] font-bold"
              style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
            >
              {positionGroupLabel(groupOfCard(p))}
            </span>
          )}
          {p.has_account
            ? <Chip tone="positive" icon={BadgeCheck}>가입</Chip>
            : <Chip tone="neutral">미가입</Chip>}
        </div>
        {stat ? (
          // 고른 지표 숫자 하나를 크게 — 순위 밖(출전일 부족)이면 흐리게
          <p className="mt-auto flex items-baseline gap-1" style={{ opacity: stat.rank == null ? 0.5 : 1 }}>
            <span className="font-jersey font-black tabular-nums leading-none text-[26px]" style={{ color: 'var(--mm-ink)' }}>
              {stat.value == null ? '–' : stat.value.toFixed(1)}
            </span>
            <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{stat.label} · 하루</span>
          </p>
        ) : (
          <p className="mt-auto text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>
            출석 {noRounds ? '–' : <>{gp}/{totalRounds}일 · <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{pct}%</span></>}
          </p>
        )}
      </div>
    </button>
  )
}

function AddPlayerSheet({ open, onClose, leagueId, headers, onAdded }: {
  open: boolean; onClose: () => void; leagueId: string; headers: Record<string, string>; onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<PositionGroupCode | null>(null)
  const [saving, setSaving] = useState(false)

  function close() {
    if (saving) return
    setName(''); setPicked(null)
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
        body: JSON.stringify({ name: clean, position: picked }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => null) as { error?: string } | null
        toast.error(res.status === 401 ? '어드민만 등록할 수 있어요' : (j?.error ?? '등록하지 못했어요'))
        return
      }
      toast.success(`${clean} 선수를 등록했어요`)
      setName(''); setPicked(null)
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
          <legend className="text-xs font-bold mb-1.5" style={{ color: 'var(--mm-muted)' }}>포지션 (선택)</legend>
          <div className="flex flex-wrap gap-1.5">
            {POSITION_GROUPS.map(({ code, label }) => {
              const on = picked === code
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(on ? null : code)}
                  className="min-h-11 min-w-11 px-3 text-sm font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={on
                    ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', border: '1px solid var(--mm-ink)', borderRadius: 'var(--mm-radius-chip)' }
                    : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
                >
                  {label}
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
            className="mm-press flex-1 inline-flex items-center justify-center gap-1 min-h-11 text-sm font-black cursor-pointer transition-[filter] duration-200 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)' }}
          >
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}등록
          </button>
        </div>
      </form>
    </Sheet>
  )
}
