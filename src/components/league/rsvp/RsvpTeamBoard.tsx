'use client'
// 팀별 참가 현황 (2026-11-09 운영진 — 매주 단톡방 공지 캡처처럼 「색 점 · 팀명 · 인원 · 이름 · 포지션」)
//   · 색 점 = 그 달 유니폼 색(안 고르면 노랑 기본). 어드민은 점을 눌러 노랑·흰색·검정을 고른다(PUT /month-uniforms).
//   · 정규는 「참」이면 이번 달 팀에 자동으로 들어간다. 비정규·게스트는 **대기명단**에 모이고,
//     어드민이 이름을 **끌어서 팀 카드에 놓아** 배치한다(각 팀 수요에 맞춰 — 자동으로 채우지 않는다, 운영진).
//     팀 → 대기명단으로 끌면 배치를 푼다(비정규 티켓을 썼으면 돌려줄지 묻는다). 팀 → 다른 팀도 된다.
//   · 끌기는 마우스(PC)용이다. 폰에서는 /rsvp 아래 목록의 팀 고르기로 같은 일을 한다.
import { useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { GripVertical } from 'lucide-react'
import { UNIFORM_FILL, UNIFORM_NAME, KIND_LABEL, type RsvpEntryView, type RsvpRes } from './rsvpTypes'

type Team = NonNullable<RsvpRes['teams']>[number]
type Uni = keyof typeof UNIFORM_FILL
const WAIT = '__wait__'

function Dot({ uniform, size = 22 }: { uniform: Uni | null; size?: number }) {
  return (
    <span aria-hidden className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: UNIFORM_FILL[uniform ?? 'yellow'], boxShadow: 'inset 0 0 0 1.5px var(--mm-rule)' }} />
  )
}

export default function RsvpTeamBoard({
  leagueId, gameDate, teams, yes, admin, onChanged, compact = false,
}: {
  leagueId: string
  gameDate: string
  teams: Team[]
  yes: RsvpEntryView[]
  admin: boolean
  onChanged: () => void
  compact?: boolean
}) {
  const [picking, setPicking] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const waiting = yes.filter(e => !e.placed_team_id)

  async function setUniform(teamId: string, uniform: Uni | null) {
    setPicking(null)
    const res = await fetch(`/api/leagues/${leagueId}/month-uniforms`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: `${gameDate.slice(0, 7)}-01`, team_id: teamId, uniform }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? '유니폼 색을 저장하지 못했어요'); return }
    toast.success(uniform ? `${UNIFORM_NAME[uniform]} 유니폼으로 정했어요` : '유니폼 색 지정을 풀었어요(기본 노랑)')
    onChanged()
  }

  async function move(e: RsvpEntryView, target: string | null) {
    if ((e.placed_team_id ?? null) === target) return
    let returnTicket = false
    if (!target && e.ticket_used) {
      returnTicket = confirm(`${e.name} 님을 대기명단으로 돌려요.\n쓴 비정규 티켓 1장을 돌려줄까요?\n(확인 = 돌려줌 · 취소 = 그대로 둠, 다시 배치해도 또 빠지지 않아요)`)
    }
    if (target && e.kind === 'non_regular' && !e.ticket_used && !confirm(`${e.name} 님을 배치하면 비정규 티켓 1장이 빠져요. 계속할까요?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/rsvp/admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'place', date: gameDate, playerId: e.player_id, teamId: target, returnTicket }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '배치하지 못했어요'); return }
      toast.success(j.ticket ?? (target ? `${e.name} 님을 ${teams.find(t => t.id === target)?.name ?? ''}팀에 배치했어요` : `${e.name} 님을 대기명단으로 옮겼어요`))
      onChanged()
    } finally { setBusy(false) }
  }

  const dropProps = (key: string) => admin ? {
    onDragOver: (ev: DragEvent) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; if (over !== key) setOver(key) },
    onDragLeave: () => setOver(o => (o === key ? null : o)),
    onDrop: (ev: DragEvent) => {
      ev.preventDefault(); setOver(null)
      const pid = ev.dataTransfer.getData('text/plain')
      const e = yes.find(x => x.player_id === pid)
      if (e && !busy) void move(e, key === WAIT ? null : key)
    },
  } : {}

  const card = 'p-4 lg:p-5 min-w-0 transition-colors'
  const cardStyle = (key: string, dashed = false) => ({
    background: over === key ? 'var(--mm-yellow-soft)' : 'var(--mm-panel)',
    border: `${over === key ? 2 : 1}px ${dashed ? 'dashed' : 'solid'} ${over === key ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
    borderRadius: 'var(--mm-radius-card)',
  })

  const Person = ({ m, showKind }: { m: RsvpEntryView; showKind: boolean }) => (
    <li
      draggable={admin}
      onDragStart={admin ? (ev => { ev.dataTransfer.setData('text/plain', m.player_id); ev.dataTransfer.effectAllowed = 'move' }) : undefined}
      className={`flex items-baseline gap-2 flex-wrap ${admin ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
      title={admin ? '끌어서 다른 팀이나 대기명단에 놓기' : undefined}
    >
      {admin && <GripVertical size={14} aria-hidden className="self-center shrink-0" style={{ color: 'var(--mm-muted)' }} />}
      <span className="text-base" style={{ color: 'var(--mm-ink)' }}>{m.name}</span>
      {m.position && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{m.position}</span>}
      {showKind && <span className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{KIND_LABEL[m.kind]}</span>}
      {m.kind === 'guest' && m.answered_by && m.answered_by.endsWith('초대') && (
        <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>{m.answered_by}</span>
      )}
      {admin && m.kind === 'guest' && m.guest_paid && <span className="text-xs font-bold" style={{ color: '#059669' }}>게스트비 받음</span>}
      {admin && m.kind === 'non_regular' && !m.placed_team_id && (
        <span className="text-xs" style={{ color: m.tickets_left > 0 ? 'var(--mm-muted)' : 'var(--mm-live-bg)' }}>티켓 {m.tickets_left}장</span>
      )}
    </li>
  )

  return (
    <div className="space-y-2">
      {admin && (
        <p className="text-xs hidden lg:block" style={{ color: 'var(--mm-muted)' }}>
          대기명단의 이름을 끌어 팀 카드에 놓으면 배치돼요(비정규는 그때 티켓 1장). 팀에서 대기명단으로 끌면 배치가 풀려요.
        </p>
      )}
      <div className={`grid gap-2 ${compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        {teams.map(t => {
          const members = yes.filter(e => e.placed_team_id === t.id)
          return (
            <div key={t.id} className={card} style={cardStyle(t.id)} {...dropProps(t.id)}>
              <div className="flex items-center justify-between gap-2">
                <span className="relative inline-flex items-center gap-2 min-w-0">
                  {admin ? (
                    <button type="button" onClick={() => setPicking(p => p === t.id ? null : t.id)} aria-label={`${t.name} 유니폼 색 고르기`}
                      className="mm-press inline-flex items-center justify-center w-11 h-11 -m-2.5">
                      <Dot uniform={t.uniform} />
                    </button>
                  ) : <Dot uniform={t.uniform} />}
                  <b className="font-black text-lg break-keep" style={{ color: 'var(--mm-ink)' }}>{t.name}팀</b>
                  {picking === t.id && (
                    <span className="absolute left-0 top-full mt-1 z-20 flex items-center gap-1.5 p-2"
                      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', boxShadow: 'var(--mm-shadow-md)', borderRadius: 'var(--mm-radius-ctl)' }}>
                      {(['yellow', 'white', 'black'] as const).map(u => (
                        <button key={u} type="button" onClick={() => setUniform(t.id, u)} aria-label={`${UNIFORM_NAME[u]} 유니폼`}
                          className="mm-press inline-flex flex-col items-center gap-0.5 min-w-11 min-h-11 px-1 text-xs font-bold" style={{ color: 'var(--mm-ink)' }}>
                          <span className="rounded-full" style={{ width: 22, height: 22, background: UNIFORM_FILL[u], boxShadow: t.uniform === u ? '0 0 0 2px var(--mm-ink)' : 'inset 0 0 0 1.5px var(--mm-rule)' }} />
                          {UNIFORM_NAME[u]}
                        </button>
                      ))}
                      {t.uniform && (
                        <button type="button" onClick={() => setUniform(t.id, null)} className="mm-press min-h-11 px-1 text-xs font-bold underline" style={{ color: 'var(--mm-ink-soft)' }}>지정 풀기</button>
                      )}
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--mm-muted)' }}>{members.length}명</span>
              </div>
              {members.length === 0 ? (
                <p className="text-sm mt-2" style={{ color: 'var(--mm-muted)' }}>{admin ? '여기에 끌어다 놓기' : '아직 없어요'}</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {members.map(m => <Person key={m.player_id} m={m} showKind={m.kind !== 'regular'} />)}
                </ul>
              )}
            </div>
          )
        })}
        {(waiting.length > 0 || admin) && (
          <div className={card} style={cardStyle(WAIT, true)} {...dropProps(WAIT)}>
            <div className="flex items-center justify-between gap-2">
              <b className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>대기명단</b>
              <span className="text-sm tabular-nums" style={{ color: 'var(--mm-muted)' }}>{waiting.length}명</span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>비정규·게스트 — 어드민이 팀 수요에 맞춰 배치해요</p>
            {waiting.length === 0 ? (
              <p className="text-sm mt-2" style={{ color: 'var(--mm-muted)' }}>대기 중인 사람이 없어요</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {waiting.map(m => <Person key={m.player_id} m={m} showKind />)}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
