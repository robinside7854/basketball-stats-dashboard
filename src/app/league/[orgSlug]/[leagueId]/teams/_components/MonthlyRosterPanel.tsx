'use client'
// 달별 정규 멤버 (마이그레이션 120, 2026-11-07 운영진 요청 — 「달마다 정규가 정해지기도 한다」)
//
// 2026-11-08 운영진: 분기를 먼저 고르지 않고 **달을 바로 고른다** · 팀 고르기 대신
//   **선수 이름을 마우스로 끌어 팀 칸에 놓는다**(PC 전용 작업).
//   달이 든 분기는 날짜로 찾는다 — 그 분기 소속이 「기본값」, 여기서 옮긴 것이 「이 달만」이다.
// 고친 달의 경기만 기록 화면 명단이 바뀐다. 순위·팀 이름·스탯은 계속 분기 단위.
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw, GripVertical, Crown } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import { UNIFORMS, UNIFORM_LABEL, type Uniform } from '@/lib/league/uniformPhoto'
import { swatchEdge } from '@/lib/util/contrastColor'
import { monthsBetween, monthLabel, monthOf } from '@/lib/league/monthlyRoster'
import type { Quarter } from '@/types/league'
import type { Team } from '../_types'

type Row = {
  id: string
  name: string
  is_active?: boolean | null
  is_guest?: boolean | null
  team_id: string | null
  is_regular: boolean | null
  month_override?: boolean
  quarter_team_id?: string | null
  quarter_is_regular?: boolean | null
}

type Overrides = Record<string, Record<string, { name: string | null; color: string | null }>>

/** 「정규 아님」 칸 */
const NONE = '__none__'

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export default function MonthlyRosterPanel({ leagueId, quarters, teams, teamOverrides, headers, onChanged, leaders, onToggleLeader }: {
  onChanged?: () => void
  /** 분기 → 팀 → 팀장 선수 id. 팀장은 분기 단위다(league_quarter_leaders) */
  leaders: Record<string, Record<string, string | null>>
  onToggleLeader: (quarterId: string, teamId: string, playerId: string) => void
  leagueId: string
  quarters: Quarter[]
  teams: Team[]
  teamOverrides: Overrides
  headers: HeadersInit
}) {
  // 달 → 그 달이 든 분기. 기간이 없는 분기·대회는 뺀다(어느 달인지 알 수 없고, 대회엔 정규가 없다).
  const monthQuarter = useMemo(() => {
    const map = new Map<string, Quarter>()
    const list = quarters
      .filter(q => q.kind !== 'tournament')
      .slice()
      .sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter))
    for (const q of list) for (const m of monthsBetween(q.start_date, q.end_date)) map.set(m, q)
    return map
  }, [quarters])
  const months = useMemo(() => [...monthQuarter.keys()].sort(), [monthQuarter])

  const todayMonth = monthOf(todayKst())!
  const refYear = Number(todayMonth.slice(0, 4))

  // 고르기 전 기본 = 오늘의 달(없으면 마지막 달) — 상태로 옮겨 담지 않고 계산한다
  const [picked, setMonth] = useState<string>('')
  const month = picked || (months.includes(todayMonth) ? todayMonth : (months[months.length - 1] ?? ''))
  const [rows, setRows] = useState<Row[]>([])
  const [loadedKey, setLoadedKey] = useState('')
  // 그 달 팀 유니폼 색(121) — 고르면 이번 달 선수 프로필 사진이 그 색 유니폼으로 바뀐다
  const [uniforms, setUniforms] = useState<Record<string, Uniform>>({})
  const [uniKey, setUniKey] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)

  const qId = monthQuarter.get(month)?.id ?? ''
  const key = `${qId}|${month}`
  const loading = loadedKey !== key

  useEffect(() => {
    if (!month) return
    let alive = true
    fetch(`/api/leagues/${leagueId}/month-uniforms?month=${month}`)
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { team_id: string; uniform: Uniform }[]) => {
        if (!alive) return
        setUniforms(Object.fromEntries(rows.map(r => [r.team_id, r.uniform])))
        setUniKey(month)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [leagueId, month])

  async function pickUniform(teamId: string, u: Uniform) {
    const prev = uniforms
    const nextVal = uniforms[teamId] === u ? null : u
    setUniforms(cur => { const n = { ...cur }; if (nextVal) n[teamId] = nextVal; else delete n[teamId]; return n })
    const res = await fetch(`/api/leagues/${leagueId}/month-uniforms`, {
      method: 'PUT', headers, body: JSON.stringify({ month, team_id: teamId, uniform: nextVal }),
    }).catch(() => null)
    if (!res?.ok) { setUniforms(prev); toast.error('유니폼 색을 저장하지 못했어요'); return }
    onChanged?.()
  }

  useEffect(() => {
    if (!qId || !month) return
    let alive = true
    const done = (list: Row[]) => { if (alive) { setRows(list); setLoadedKey(`${qId}|${month}`) } }
    fetch(`/api/leagues/${leagueId}/quarters/${qId}/players?month=${month}`)
      .then(r => (r.ok ? r.json() : []))
      // 게스트는 달별 정규 대상이 아니라 뺀다(2026-11-09 운영진)
      .then((data: Row[]) => done(data.filter(r => r.is_active !== false && !r.is_guest)))
      .catch(() => done([]))
    return () => { alive = false }
  }, [leagueId, qId, month])

  const teamName = (tid: string) => teamOverrides[qId]?.[tid]?.name ?? teams.find(t => t.id === tid)?.name ?? '팀'
  const teamColor = (tid: string) => teamOverrides[qId]?.[tid]?.color ?? teams.find(t => t.id === tid)?.color ?? '#888888'

  const regularTeamOf = (r: Row) => (r.team_id && r.is_regular ? r.team_id : null)
  const quarterRegularTeamOf = (r: Row) => (r.quarter_team_id && r.quarter_is_regular ? r.quarter_team_id : null)

  // 그 분기에 실제로 쓰인 팀만 칸으로 — 상시 팀을 전부 늘어놓으면 지난 분기 팀이 섞인다.
  const columnTeams = useMemo(() => {
    const ids = new Set<string>()
    for (const r of rows) {
      const q = r.quarter_team_id && r.quarter_is_regular ? r.quarter_team_id : null
      if (q) ids.add(q)
      if (r.team_id && r.is_regular) ids.add(r.team_id)
    }
    const list = teams.filter(t => ids.has(t.id))
    return list.length > 0 ? list : teams
  }, [rows, teams])

  const byName = (a: Row, b: Row) => a.name.localeCompare(b.name, 'ko')
  const columns = [
    ...columnTeams.map(t => ({ key: t.id, players: rows.filter(r => regularTeamOf(r) === t.id).sort(byName) })),
    {
      key: NONE,
      players: rows.filter(r => !regularTeamOf(r) || !columnTeams.some(t => t.id === regularTeamOf(r))).sort(byName),
    },
  ]
  const changedCount = rows.filter(r => r.month_override).length

  async function moveTo(playerId: string, col: string) {
    const r = rows.find(x => x.id === playerId)
    if (!r) return
    const from = regularTeamOf(r) ?? NONE
    if (from === col) return
    const teamId = col === NONE ? null : col
    // 바로 옮겨 보이고, 저장이 실패하면 되돌린다 — 끌어 놓은 손이 기다리지 않게
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, team_id: teamId, is_regular: teamId ? true : null, month_override: true } : x))
    setSavingId(r.id)
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${qId}/players`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ league_player_id: r.id, team_id: teamId, is_regular: teamId !== null, month }),
    }).catch(() => null)
    setSavingId(null)
    if (!res?.ok) {
      // 그 선수 한 명만 되돌린다 — 그사이 옮겨 저장된 다른 사람까지 화면에서 되돌아가지 않게(2026-11-10)
      setRows(prev => prev.map(x => x.id === r.id ? r : x))
      toast.error('옮기지 못했어요. 다시 해 주세요')
      return
    }
    onChanged?.()
  }

  async function revert(r: Row) {
    setSavingId(r.id)
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${qId}/players?playerId=${r.id}&month=${month}`, {
      method: 'DELETE',
      headers,
    }).catch(() => null)
    setSavingId(null)
    if (!res?.ok) { toast.error('되돌리지 못했어요'); return }
    onChanged?.()
    setRows(prev => prev.map(x => x.id === r.id
      ? { ...x, team_id: x.quarter_team_id ?? null, is_regular: x.quarter_team_id ? (x.quarter_is_regular ?? false) : null, month_override: false }
      : x))
  }

  if (months.length === 0) return null

  const renderChip = (r: Row) => {
    const qTeam = quarterRegularTeamOf(r)
    return (
      <li
        key={r.id}
        draggable={savingId !== r.id}
        onDragStart={e => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; setDragId(r.id) }}
        onDragEnd={() => { setDragId(null); setOverCol(null) }}
        title={r.month_override ? `분기 기본: ${qTeam ? teamName(qTeam) : '정규 아님'}` : '끌어서 다른 칸에 놓으면 이 달만 옮겨져요'}
        className={`group flex items-center gap-1 pl-1.5 pr-1 min-h-9 rounded-md border bg-[var(--mm-panel)] cursor-grab active:cursor-grabbing select-none transition-colors duration-200 ${
          r.month_override ? 'border-[var(--mm-yellow)]' : 'border-[var(--mm-rule)] hover:border-[var(--mm-ink-soft)]'
        } ${dragId === r.id ? 'opacity-40' : ''}`}
      >
        <GripVertical size={14} className="text-[var(--mm-muted)] shrink-0" aria-hidden />
        <span className="text-sm font-bold text-[var(--mm-ink)] whitespace-nowrap">{r.name}</span>
        {/* 왕관 = 팀장에게만 보인다. 다른 선수는 마우스를 올렸을 때만 흐린 왕관이 나와 눌러서 팀장으로 정한다 */}
        {(() => {
          const tid = regularTeamOf(r)
          if (!tid || !qId) return null
          const isLeader = leaders[qId]?.[tid] === r.id
          return (
            <button
              type="button"
              draggable={false}
              onClick={() => onToggleLeader(qId, tid, r.id)}
              aria-label={isLeader ? `${r.name} 팀장 해제` : `${r.name} 팀장으로 지정`}
              title={isLeader ? '팀장 해제' : '팀장으로 지정'}
              className={`w-7 h-7 inline-flex items-center justify-center rounded cursor-pointer transition-opacity duration-200 hover:bg-[var(--mm-panel-alt)] ${
                isLeader ? 'text-[var(--mm-ink)]' : 'text-[var(--mm-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
              }`}
            >
              <Crown size={14} />
            </button>
          )
        })()}
        {savingId === r.id && <Loader2 size={12} className="animate-spin text-[var(--mm-muted)]" />}
        {r.month_override && savingId !== r.id && (
          <button
            type="button"
            onClick={() => revert(r)}
            aria-label={`${r.name} 분기대로 되돌리기`}
            title={`분기대로 (${qTeam ? teamName(qTeam) : '정규 아님'})`}
            className="w-7 h-7 inline-flex items-center justify-center rounded text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] cursor-pointer"
          >
            <RotateCcw size={13} />
          </button>
        )}
      </li>
    )
  }

  return (
    <SectionCard variant="standalone" pad="base" className="space-y-3">
      <div>
        <h3 className="font-black text-[20px] text-[var(--mm-ink)] tracking-tight">달별 정규 멤버</h3>
        <p className="text-sm text-[var(--mm-muted)] mt-1">
          달을 고르고 선수 이름을 끌어 다른 팀 칸에 놓으면 그 달만 옮겨져요. 노란 테두리가 이 달만 바꾼 사람이고, ↺ 를 누르면 분기 소속으로 돌아가요. 이름에 마우스를 올려 왕관을 누르면 팀장이 돼요.
        </p>
        <p className="lg:hidden text-sm font-bold text-[var(--mm-ink-soft)] mt-1">끌어 옮기기는 PC 에서 해 주세요.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {months.map(m => (
          <button
            key={m}
            type="button"
            onClick={() => setMonth(m)}
            aria-pressed={m === month}
            className={`mm-press min-h-11 px-3.5 rounded-md text-sm font-black border cursor-pointer transition-colors duration-200 ${
              m === month
                ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)] border-[var(--mm-ink)]'
                : 'border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
            }`}
          >
            {monthLabel(m, refYear)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-[var(--mm-muted)]" /></div>
      ) : (
        <>
          <p className="text-sm font-bold text-[var(--mm-ink-soft)]">
            {monthLabel(month, refYear)} · {changedCount > 0 ? `분기와 다른 사람 ${changedCount}명` : '분기 소속 그대로'}
          </p>
          {/* PC 작업 화면(운영진) — lg 부터 칸을 나란히. 그 아래는 칸을 위아래로 쌓아 깨지지 않게만 둔다 */}
          <div
            className="grid gap-3 sm:grid-cols-2 lg:[grid-template-columns:var(--mrp-cols)]"
            style={{ ['--mrp-cols' as string]: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map(c => {
              const isNone = c.key === NONE
              const color = isNone ? null : teamColor(c.key)
              return (
                <div
                  key={c.key}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overCol !== c.key) setOverCol(c.key) }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCol(null) }}
                  onDrop={e => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData('text/plain')
                    setOverCol(null); setDragId(null)
                    if (id) moveTo(id, c.key)
                  }}
                  className={`min-w-0 rounded-md border-2 px-2.5 py-2 min-h-40 transition-colors duration-200 ${
                    overCol === c.key
                      ? 'border-[var(--mm-ink)] bg-[var(--mm-panel-alt)]'
                      : isNone ? 'border-dashed border-[var(--mm-rule)]' : 'border-[var(--mm-rule)]'
                  }`}
                >
                  <p className="flex items-center gap-2 font-black text-[var(--mm-ink)] pb-2">
                    {color && (
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color, boxShadow: swatchEdge(color) }} />
                    )}
                    {isNone ? '정규 아님' : teamName(c.key)}
                    <span className="text-sm font-bold text-[var(--mm-muted)]">{c.players.length}명</span>
                  </p>
                  {/* 이 달 유니폼 색 — 고르면 그 팀 선수 프로필 사진이 그 색으로(정규 아님 칸 = 회색 고정) */}
                  {!isNone && uniKey === month && (
                    <div role="group" aria-label={`${teamName(c.key)} ${monthLabel(month, refYear)} 유니폼 색`} className="flex flex-wrap items-center gap-1 pb-2">
                      <span className="text-xs font-bold text-[var(--mm-muted)] mr-0.5">유니폼</span>
                      {UNIFORMS.map(u => {
                        const on = (uniforms[c.key] ?? null) === u
                        return (
                          <button key={u} type="button" aria-pressed={on} onClick={() => pickUniform(c.key, u)}
                            className={`mm-press inline-flex items-center gap-1 h-8 px-2 rounded-md border text-xs font-bold cursor-pointer transition-colors duration-200 ${
                              on ? 'border-[var(--mm-ink)] text-[var(--mm-ink)] bg-[var(--mm-panel-alt)]' : 'border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                            }`}>
                            <span aria-hidden className="w-3 h-3 rounded-full shrink-0"
                              style={{ background: u === 'yellow' ? '#F2B705' : u === 'white' ? '#ffffff' : '#1a1a1a', boxShadow: 'inset 0 0 0 1.5px var(--mm-ink-soft)' }} />
                            {UNIFORM_LABEL[u]}
                          </button>
                        )
                      })}
                      {!uniforms[c.key] && <span className="text-[11px] text-[var(--mm-muted)]">안 고르면 노랑</span>}
                    </div>
                  )}
                  {c.players.length === 0
                    ? <p className="text-sm text-[var(--mm-muted)] py-2">여기로 끌어 놓으세요</p>
                    : <ul className="flex flex-wrap gap-1.5">{c.players.map(renderChip)}</ul>}
                </div>
              )
            })}
          </div>
        </>
      )}
    </SectionCard>
  )
}
