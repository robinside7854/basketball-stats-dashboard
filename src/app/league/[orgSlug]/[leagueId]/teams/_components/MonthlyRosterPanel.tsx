'use client'
// 달별 정규 멤버 (마이그레이션 120, 2026-11-07 운영진 요청 — 「달마다 정규가 정해지기도 한다」)
//
// 분기 소속은 그대로 두고 「이 달만 다르게」를 고친다. 고친 달의 경기만 기록 화면 명단이 바뀐다.
//   순위·팀 이름·스탯은 계속 분기 단위 — 이 패널은 그걸 건드리지 않는다.
//   「분기대로」 = 그 달 덮어쓰기를 지워 분기 소속으로 되돌린다.
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, RotateCcw, ChevronDown } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import { swatchEdge } from '@/lib/util/contrastColor'
import { monthsBetween, monthLabel, monthOf } from '@/lib/league/monthlyRoster'
import type { Quarter } from '@/types/league'
import type { Team } from '../_types'

type Row = {
  id: string
  name: string
  is_active?: boolean | null
  team_id: string | null
  is_regular: boolean | null
  month_override?: boolean
  quarter_team_id?: string | null
  quarter_is_regular?: boolean | null
}

type Overrides = Record<string, Record<string, { name: string | null; color: string | null }>>

const NONE = '__none__'

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export default function MonthlyRosterPanel({ leagueId, quarters, teams, teamOverrides, headers }: {
  leagueId: string
  quarters: Quarter[]
  teams: Team[]
  teamOverrides: Overrides
  headers: HeadersInit
}) {
  // 달을 셀 수 있는 분기만 — 기간이 없으면 어느 달인지 알 수 없다. 대회는 정규 개념이 없다.
  const usable = useMemo(
    () => quarters
      .filter(q => q.kind !== 'tournament' && monthsBetween(q.start_date, q.end_date).length > 0)
      .slice()
      .sort((a, b) => (a.year - b.year) || (a.quarter - b.quarter)),
    [quarters],
  )
  const today = todayKst()
  const todayMonth = monthOf(today)!

  const [qId, setQId] = useState<string>('')
  const [month, setMonth] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // 기본 = 오늘이 든 분기 · 오늘의 달. 없으면 마지막 분기의 첫 달.
  useEffect(() => {
    if (qId || usable.length === 0) return
    const cur = usable.find(q => q.start_date && q.end_date && today >= q.start_date && today <= q.end_date)
      ?? usable.find(q => q.is_current) ?? usable[usable.length - 1]
    setQId(cur.id)
    const ms = monthsBetween(cur.start_date, cur.end_date)
    setMonth(ms.includes(todayMonth) ? todayMonth : ms[0])
  }, [usable, qId, today, todayMonth])

  const quarter = usable.find(q => q.id === qId) ?? null
  const months = quarter ? monthsBetween(quarter.start_date, quarter.end_date) : []

  async function load() {
    if (!qId || !month) return
    setLoading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/quarters/${qId}/players?month=${month}`)
      const data = res.ok ? await res.json() as Row[] : []
      setRows(data.filter(r => r.is_active !== false))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [qId, month]) // eslint-disable-line react-hooks/exhaustive-deps

  const teamName = (tid: string) => teamOverrides[qId]?.[tid]?.name ?? teams.find(t => t.id === tid)?.name ?? '팀'
  const teamColor = (tid: string) => teamOverrides[qId]?.[tid]?.color ?? teams.find(t => t.id === tid)?.color ?? '#888888'

  // 이 분기에 실제로 쓰인 팀만 고를 수 있게 한다(상시 팀 전부를 늘어놓으면 지난 분기 팀이 섞인다).
  const quarterTeams = useMemo(() => {
    const ids = new Set<string>()
    for (const r of rows) {
      if (r.quarter_team_id && r.quarter_is_regular) ids.add(r.quarter_team_id)
      if (r.team_id && r.is_regular) ids.add(r.team_id)
    }
    const list = teams.filter(t => ids.has(t.id))
    return list.length > 0 ? list : teams
  }, [rows, teams])

  const regularTeamOf = (r: Row) => (r.team_id && r.is_regular ? r.team_id : null)
  const quarterRegularTeamOf = (r: Row) => (r.quarter_team_id && r.quarter_is_regular ? r.quarter_team_id : null)

  const groups = quarterTeams.map(t => ({
    team: t,
    players: rows.filter(r => regularTeamOf(r) === t.id).sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  }))
  const others = rows
    .filter(r => !regularTeamOf(r) || !quarterTeams.some(t => t.id === regularTeamOf(r)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const changedCount = rows.filter(r => r.month_override).length

  async function save(r: Row, value: string) {
    setSavingId(r.id)
    const teamId = value === NONE ? null : value
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${qId}/players`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ league_player_id: r.id, team_id: teamId, is_regular: teamId !== null, month }),
    })
    setSavingId(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      toast.error(/league_player_months/.test(j.error ?? '') ? '아직 달별 소속 표가 준비되지 않았어요' : '저장하지 못했어요')
      return
    }
    setRows(prev => prev.map(x => x.id === r.id ? { ...x, team_id: teamId, is_regular: teamId ? true : null, month_override: true } : x))
    toast.success(`${r.name} · ${monthLabel(month)}만 ${teamId ? teamName(teamId) : '정규 아님'}`)
  }

  async function revert(r: Row) {
    setSavingId(r.id)
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${qId}/players?playerId=${r.id}&month=${month}`, {
      method: 'DELETE',
      headers,
    })
    setSavingId(null)
    if (!res.ok) { toast.error('되돌리지 못했어요'); return }
    setRows(prev => prev.map(x => x.id === r.id
      ? { ...x, team_id: x.quarter_team_id ?? null, is_regular: x.quarter_team_id ? (x.quarter_is_regular ?? false) : null, month_override: false }
      : x))
  }

  if (usable.length === 0) return null

  const refYear = Number(todayMonth.slice(0, 4))

  const renderRow = (r: Row) => {
    const cur = regularTeamOf(r)
    const qTeam = quarterRegularTeamOf(r)
    return (
      <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 border-b border-[var(--mm-rule)] last:border-b-0">
        <div className="flex-1 min-w-[7rem]">
          <p className="font-bold text-[var(--mm-ink)] text-sm">{r.name}</p>
          {r.month_override ? (
            <p className="text-xs text-[var(--mm-muted)]">
              분기 기본: {qTeam ? teamName(qTeam) : '정규 아님'}
            </p>
          ) : null}
        </div>
        {r.month_override && (
          <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-[var(--mm-yellow-soft)] text-[var(--mm-ink)]">이 달만</span>
        )}
        <select
          aria-label={`${r.name} ${monthLabel(month, refYear)} 소속`}
          value={cur ?? NONE}
          disabled={savingId === r.id}
          onChange={e => save(r, e.target.value)}
          className="min-h-11 rounded-md border border-[var(--mm-rule)] bg-[var(--mm-panel)] text-[var(--mm-ink)] text-base sm:text-sm px-2 cursor-pointer"
        >
          {quarterTeams.map(t => <option key={t.id} value={t.id}>{teamName(t.id)} 정규</option>)}
          <option value={NONE}>정규 아님</option>
        </select>
        {r.month_override && (
          <button
            type="button"
            onClick={() => revert(r)}
            disabled={savingId === r.id}
            className="mm-press inline-flex items-center gap-1 min-h-11 px-2.5 rounded-md border border-[var(--mm-rule)] text-sm font-bold text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer"
          >
            {savingId === r.id ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}분기대로
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
          달마다 정규가 바뀌면 여기서 고쳐요. 고친 달의 경기만 기록 화면 명단이 바뀌고, 순위·팀 이름·스탯은 분기 그대로예요.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {usable.length > 1 && (
          <select
            aria-label="분기"
            value={qId}
            onChange={e => {
              const q = usable.find(x => x.id === e.target.value)
              setQId(e.target.value)
              const ms = q ? monthsBetween(q.start_date, q.end_date) : []
              setMonth(ms.includes(todayMonth) ? todayMonth : (ms[0] ?? ''))
            }}
            className="min-h-11 rounded-md border border-[var(--mm-rule)] bg-[var(--mm-panel)] text-[var(--mm-ink)] text-base sm:text-sm px-2 cursor-pointer"
          >
            {usable.map(q => <option key={q.id} value={q.id}>{q.year}년 {q.quarter}분기</option>)}
          </select>
        )}
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
          <div className="grid gap-3 lg:grid-cols-3">
            {groups.map(g => (
              <div key={g.team.id} className="rounded-md border border-[var(--mm-rule)] px-3 py-2">
                <p className="flex items-center gap-2 font-black text-[var(--mm-ink)] pb-1">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: teamColor(g.team.id), boxShadow: swatchEdge(teamColor(g.team.id)) }}
                  />
                  {teamName(g.team.id)}
                  <span className="text-sm font-bold text-[var(--mm-muted)]">{g.players.length}명</span>
                </p>
                {g.players.length === 0
                  ? <p className="text-sm text-[var(--mm-muted)] py-2">이 달 정규가 없어요</p>
                  : <ul>{g.players.map(renderRow)}</ul>}
              </div>
            ))}
          </div>
          {others.length > 0 && (
            <details className="rounded-md border border-[var(--mm-rule)] px-3 py-2 group">
              <summary className="flex items-center gap-1 min-h-11 cursor-pointer font-bold text-[var(--mm-ink-soft)] list-none">
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                정규가 아닌 선수 {others.length}명 · 이 달 정규로 넣기
              </summary>
              <ul>{others.map(renderRow)}</ul>
            </details>
          )}
        </>
      )}
    </SectionCard>
  )
}
