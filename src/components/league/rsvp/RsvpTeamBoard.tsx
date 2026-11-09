'use client'
// 팀별 참가 현황 (2026-11-09 운영진 — 매주 단톡방 공지 캡처처럼 「색 점 · 팀명 · 인원 · 이름 · 포지션」)
//   · 색 점 = 그 달 유니폼 색(안 고르면 노랑 기본). 어드민은 점을 눌러 노랑·흰색·검정을 고른다(PUT /month-uniforms).
//   · 정규는 「참」이면 이번 달 팀에 자동으로 들어간다. 비정규·게스트는 **대기명단**에 모이고,
//     어드민이 이름을 **끌어서 팀 카드에 놓아** 배치한다(각 팀 수요에 맞춰 — 자동으로 채우지 않는다, 운영진).
//     팀 → 대기명단으로 끌면 배치를 푼다(비정규 티켓을 썼으면 돌려줄지 묻는다). 팀 → 다른 팀도 된다.
//   · 끌기는 마우스(PC)용이다. 폰에서는 /rsvp 아래 목록의 팀 고르기로 같은 일을 한다.
//   · 팀 카드에는 이번 달 그 팀 정규 멤버가 **늘 보인다**(2026-11-09 운영진 — 답을 했는지 모르겠다):
//     ✓ 참(맨 위) · ? 아직 답 안 함 · ✕ 불참. 게스트는 「이름(나이) / 포지션 / 신장」.
import { useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { GripVertical, Check, X, HelpCircle, Crown } from 'lucide-react'
import { UNIFORM_FILL, UNIFORM_NAME, KIND_LABEL, guestLine, type RsvpEntryView, type RsvpRes } from './rsvpTypes'

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
  leagueId, gameDate, teams, yes, admin, onChanged, compact = false, entries = [], myGuestIds = [], canCancelGuests = false, adminVote = false,
}: {
  leagueId: string
  gameDate: string
  teams: Team[]
  yes: RsvpEntryView[]
  admin: boolean
  onChanged: () => void
  compact?: boolean
  /** 전체 신청(참·불) — 정규 멤버의 ? / ✕ 판정용 */
  entries?: RsvpEntryView[]
  /** 내가 부른 게스트 — 「취소」 버튼 */
  myGuestIds?: string[]
  canCancelGuests?: boolean
  /** 어드민 원클릭 V/X — 정규 선수 줄 옆에서 참·불을 바로 바꾼다(참가 명단 화면, 2026-11-09 운영진) */
  adminVote?: boolean
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

  async function cancelGuest(e: RsvpEntryView) {
    if (!confirm(`${e.name} 님 게스트 신청을 취소할까요?`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/rsvp?guestId=${e.player_id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '취소하지 못했어요'); return }
      toast.success('게스트 신청을 취소했어요')
      onChanged()
    } finally { setBusy(false) }
  }

  // 어드민 「취소」 — 비정규·게스트의 이번 주 참가를 뺀다(2026-11-09 운영진).
  //   비정규 = 「불」로 바꿈(티켓을 쓴 배치면 먼저 배치를 풀고 티켓 돌려줄지 묻는다) · 게스트 = 그 주 신청을 지움(다음에 「다시 넣기」로 부를 수 있다).
  async function adminCancel(e: RsvpEntryView) {
    if (!confirm(`${e.name} 님의 이번 주 참가를 취소할까요?`)) return
    setBusy(true)
    try {
      const post = (body: Record<string, unknown>) => fetch(`/api/leagues/${leagueId}/rsvp/admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: gameDate, playerId: e.player_id, ...body }),
      }).then(async r => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      if (e.kind !== 'guest' && e.placed_team_id && e.ticket_used) {
        const returnTicket = confirm('쓴 비정규 티켓 1장을 돌려줄까요?\n(확인 = 돌려줌 · 취소 = 돌려주지 않음)')
        const r1 = await post({ action: 'place', teamId: null, returnTicket })
        if (!r1.ok) { toast.error(r1.j.error ?? '배치를 풀지 못했어요'); return }
      }
      const r2 = await post({ action: 'set_answer', answer: 'no' })
      if (!r2.ok) { toast.error(r2.j.error ?? '취소하지 못했어요'); return }
      toast.success(`${e.name} 님 참가를 취소했어요`)
      onChanged()
    } finally { setBusy(false) }
  }

  const answerOf = new Map(entries.map(x => [x.player_id, x.answer]))

  async function vote(pid: string, name: string, answer: 'yes' | 'no') {
    if (answerOf.get(pid) === answer) return
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/rsvp/admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_answer', date: gameDate, playerId: pid, answer }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '바꾸지 못했어요'); return }
      toast.success(`${name} 님 ${answer === 'yes' ? '참' : '불참'}으로 바꿨어요`)
      onChanged()
    } finally { setBusy(false) }
  }

  async function toggleGuestPaid(m: RsvpEntryView) {
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/rsvp/admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guest_paid', date: gameDate, playerId: m.player_id, paid: !m.guest_paid }),
      })
      if (!res.ok) { toast.error('바꾸지 못했어요'); return }
      onChanged()
    } finally { setBusy(false) }
  }

  // 정규 줄 옆 V / X — 지금 답이 칠해져 있다
  const Vote = ({ pid, name }: { pid: string; name: string }) => {
    if (!admin || !adminVote) return null
    const cur = answerOf.get(pid)
    const btn = (a: 'yes' | 'no') => (
      <button type="button" disabled={busy} onClick={() => vote(pid, name, a)} aria-label={`${name} ${a === 'yes' ? '참' : '불참'}`} aria-pressed={cur === a}
        className="mm-press inline-flex items-center justify-center w-7 h-7 border text-xs font-black disabled:opacity-50"
        style={{
          // 고르지 않은 쪽도 V = 초록 · X = 빨강 아이콘(바탕은 비움) — 2026-11-09 운영진
          borderColor: cur === a ? (a === 'yes' ? '#059669' : 'var(--mm-live-bg)') : (a === 'yes' ? '#05966966' : 'color-mix(in srgb, var(--mm-live-bg) 40%, transparent)'),
          background: cur === a ? (a === 'yes' ? '#059669' : 'var(--mm-live-bg)') : 'var(--mm-panel)',
          color: cur === a ? '#fff' : (a === 'yes' ? '#059669' : 'var(--mm-live-bg)'),
          borderRadius: 'var(--mm-radius-chip)',
        }}>
        {a === 'yes' ? <Check size={14} aria-hidden /> : <X size={14} aria-hidden />}
      </button>
    )
    return <span className="ml-auto inline-flex gap-1 self-center">{btn('yes')}{btn('no')}</span>
  }

  // 게스트를 부른 회원 — 「김로빈 초대」 → 「김로빈 게스트」
  const inviter = (m: RsvpEntryView) => m.answered_by && m.answered_by.endsWith(' 초대') ? m.answered_by.slice(0, -3) : null

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

  const Mark = ({ kind }: { kind: 'yes' | 'unknown' | 'no' }) => kind === 'yes'
    ? <Check size={14} aria-label="참" className="self-center shrink-0" style={{ color: '#059669' }} />
    : kind === 'no'
      ? <X size={14} aria-label="불참" className="self-center shrink-0" style={{ color: 'var(--mm-live-bg)' }} />
      : <HelpCircle size={14} aria-label="아직 답 안 함" className="self-center shrink-0" style={{ color: 'var(--mm-muted)' }} />

  // 팀장 왕관 — 홈 「이번 달 우리 팀」과 같은 모양(노란 동그라미)
  const CrownMark = () => (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full self-center shrink-0" title="팀장"
      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}>
      <Crown size={12} strokeWidth={2.5} aria-label="팀장" />
    </span>
  )

  // 폰·태블릿(끌기가 안 되는 화면)용 팀 고르기 — 비정규·게스트 줄에만(2026-11-09 운영진 「폰에서도 배치」)
  const MobilePlace = ({ m }: { m: RsvpEntryView }) => (!admin || m.kind === 'regular') ? null : (
    <select aria-label={`${m.name} 팀 배치`} value={m.placed_team_id ?? ''} disabled={busy}
      onChange={ev => { void move(m, ev.target.value || null) }}
      className="lg:hidden ml-auto min-h-9 px-1.5 text-sm font-bold border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] self-center"
      style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>
      <option value="">대기명단</option>
      {teams.map(t => <option key={t.id} value={t.id}>TEAM {t.name}</option>)}
    </select>
  )

  const Person = ({ m, showKind, leader = false }: { m: RsvpEntryView; showKind: boolean; leader?: boolean }) => (
    <li
      draggable={admin}
      onDragStart={admin ? (ev => { ev.dataTransfer.setData('text/plain', m.player_id); ev.dataTransfer.effectAllowed = 'move' }) : undefined}
      className={`flex items-baseline gap-x-2 gap-y-0.5 flex-wrap sm:flex-nowrap ${admin ? 'cursor-grab active:cursor-grabbing select-none' : ''}`}
      title={admin ? '끌어서 다른 팀이나 대기명단에 놓기' : undefined}
    >
      {admin && <GripVertical size={14} aria-hidden className="self-center shrink-0" style={{ color: 'var(--mm-muted)' }} />}
      <Mark kind="yes" />
      {m.kind === 'guest' && m.placed_team_id ? (
        // 팀에 배치된 게스트는 정규와 같은 모양(이름 · 포지션) + 「게스트」 표시만(2026-11-09 운영진 —
        // 나이·키는 대기명단에서 실력 가늠용이라 배치된 뒤엔 뺀다)
        <>
          <span className="text-base whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>{m.name}</span>
          {m.position && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{m.position}</span>}
          <span className="inline-flex items-center self-center px-1.5 text-xs font-black whitespace-nowrap"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}>게스트</span>
        </>
      ) : m.kind === 'guest' ? (
        // 대기명단: 「듀란트(37) / SF / 211cm · 김로빈 게스트」(2026-11-09 운영진 — 실력 가늠용)
        <span className="text-base sm:whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
          {guestLine(m)}{inviter(m) && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}> · {inviter(m)} 게스트</span>}
        </span>
      ) : (
        <>
          <span className="text-base whitespace-nowrap" style={{ color: 'var(--mm-ink)', fontWeight: leader ? 800 : undefined }}>{m.name}</span>
          {leader && <CrownMark />}
          {m.position && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{m.position}</span>}
        </>
      )}
      {showKind && m.kind !== 'guest' && <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)' }}>{KIND_LABEL[m.kind]}</span>}
      {admin && m.kind === 'guest' && m.guest_pay === 'points' && (
        // 게스트비를 부른 회원 포인트로 — 배치될 때 자동으로 빠지고 풀리면 돌려준다(127). 어드민이 누를 것 없음.
        <span className="inline-flex items-center gap-0.5 min-h-8 px-1.5 text-xs font-black whitespace-nowrap border self-center"
          title={m.guest_fee_charged ? '부른 회원 포인트에서 게스트비를 냈어요' : '팀에 배치하면 부른 회원 포인트에서 빠져요'}
          style={{ borderColor: m.guest_fee_charged ? '#059669' : 'var(--mm-rule)', background: m.guest_fee_charged ? '#059669' : 'transparent', color: m.guest_fee_charged ? '#fff' : 'var(--mm-muted)', borderRadius: 'var(--mm-radius-chip)' }}>
          포인트{m.guest_fee_charged ? <Check size={12} strokeWidth={3} aria-hidden /> : ' · 배치 때'}
        </span>
      )}
      {admin && m.kind === 'guest' && m.guest_pay !== 'points' && (
        // 게스트비(통장 입금) 받음 표시 — 누를 때마다 바뀐다(종전 참가 명단 목록의 체크를 여기로 옮겼다)
        <button type="button" disabled={busy} onClick={() => toggleGuestPaid(m)} aria-pressed={m.guest_paid}
          title={m.guest_paid ? '게스트비 입금 확인됨 — 누르면 취소' : '게스트비 입금 확인하면 누르기'}
          aria-label={`${m.name} 게스트비 ${m.guest_paid ? '입금 확인됨' : '입금 미확인'}`}
          className="mm-press inline-flex items-center gap-0.5 min-h-8 px-1.5 text-xs font-black whitespace-nowrap border disabled:opacity-50 self-center"
          style={{ borderColor: m.guest_paid ? '#059669' : 'var(--mm-rule)', background: m.guest_paid ? '#059669' : 'transparent', color: m.guest_paid ? '#fff' : 'var(--mm-muted)', borderRadius: 'var(--mm-radius-chip)' }}>
          입금{m.guest_paid && <Check size={12} strokeWidth={3} aria-hidden />}
        </button>
      )}
      {admin && m.kind === 'non_regular' && !m.placed_team_id && (
        <span className="text-xs whitespace-nowrap" style={{ color: m.tickets_left > 0 ? 'var(--mm-muted)' : 'var(--mm-live-bg)' }}>티켓 {m.tickets_left}장</span>
      )}
      {/* 부른 회원의 「취소」 — 어드민 화면에는 어드민 「✕ 취소」가 있으니 하나만(2026-11-09 운영진 — 두 개 보이던 오류) */}
      {!admin && canCancelGuests && m.kind === 'guest' && myGuestIds.includes(m.player_id) && (
        <button type="button" disabled={busy} onClick={() => cancelGuest(m)}
          className="mm-press min-h-8 px-2 text-xs font-bold underline whitespace-nowrap" style={{ color: 'var(--mm-live-bg)' }}>취소</button>
      )}
      {m.kind === 'regular' && <Vote pid={m.player_id} name={m.name} />}
      <MobilePlace m={m} />
      {admin && m.kind !== 'regular' && (
        <button type="button" disabled={busy} onClick={() => adminCancel(m)} aria-label={`${m.name} 참가 취소`}
          className="mm-press inline-flex items-center gap-0.5 min-h-8 px-1.5 text-xs font-bold whitespace-nowrap border disabled:opacity-50 self-center"
          style={{ borderColor: 'color-mix(in srgb, var(--mm-live-bg) 40%, transparent)', color: 'var(--mm-live-bg)', borderRadius: 'var(--mm-radius-chip)' }}>
          <X size={12} strokeWidth={3} aria-hidden />취소
        </button>
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
                  <b className="font-black text-lg break-keep" style={{ color: 'var(--mm-ink)' }}>
                    <span className="text-xs font-black tracking-widest mr-1.5 align-middle" style={{ color: 'var(--mm-muted)' }}>TEAM</span>{t.name}
                  </b>
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
                <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--mm-muted)' }}>참 {members.length}명</span>
              </div>
              {(() => {
                const inTeam = new Set(members.map(m => m.player_id))
                // 이번 달 이 팀 정규 중 아직 이 팀에 「참」으로 들어오지 않은 사람 — ? 답 안 함 · ✕ 불참
                //   (「참」인데 다른 팀·대기명단에 있으면 거기서 보이므로 여기선 뺀다)
                const rest = (t.regulars ?? []).filter(r => !inTeam.has(r.player_id) && answerOf.get(r.player_id) !== 'yes')
                  .map(r => ({ ...r, mark: answerOf.get(r.player_id) === 'no' ? 'no' as const : 'unknown' as const }))
                  .sort((a, b) => (a.mark === b.mark ? a.name.localeCompare(b.name, 'ko') : a.mark === 'unknown' ? -1 : 1))
                if (members.length === 0 && rest.length === 0) {
                  return <p className="text-sm mt-2" style={{ color: 'var(--mm-muted)' }}>{admin ? '여기에 끌어다 놓기' : '아직 없어요'}</p>
                }
                // 팀장은 늘 맨 위(답과 상관없이 · 왕관) — 2026-11-09 운영진. 그다음 ✓ 참, 그다음 ? / ✕.
                const leaderId = t.leader_id ?? null
                const restRow = (r: (typeof rest)[number]) => (
                  <li key={r.player_id} className="flex items-baseline gap-2 flex-wrap" style={{ opacity: r.mark === 'no' ? 0.55 : 0.8 }}>
                    {admin && <span className="w-[14px] shrink-0" aria-hidden />}
                    <Mark kind={r.mark} />
                    <span className="text-base" style={{ color: 'var(--mm-ink)', fontWeight: r.player_id === leaderId ? 800 : undefined, textDecoration: r.mark === 'no' ? 'line-through' : undefined }}>{r.name}</span>
                    {r.player_id === leaderId && <CrownMark />}
                    {r.position && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{r.position}</span>}
                    <Vote pid={r.player_id} name={r.name} />
                  </li>
                )
                const leaderMember = members.find(m => m.player_id === leaderId)
                const leaderRest = rest.find(r => r.player_id === leaderId)
                return (
                  <ul className="mt-2 space-y-1.5">
                    {leaderMember && <Person key={leaderMember.player_id} m={leaderMember} showKind={leaderMember.kind !== 'regular'} leader />}
                    {leaderRest && restRow(leaderRest)}
                    {members.filter(m => m.player_id !== leaderId).map(m => <Person key={m.player_id} m={m} showKind={m.kind !== 'regular'} />)}
                    {rest.filter(r => r.player_id !== leaderId).map(restRow)}
                  </ul>
                )
              })()}
            </div>
          )
        })}
        {(waiting.length > 0 || admin) && (() => {
          // PC·태블릿: 세 팀 아래 한 줄 전체 너비 · 안은 비정규 | 게스트 좌우(2026-11-09 운영진)
          const nonReg = waiting.filter(m => m.kind !== 'guest')
          const guests = waiting.filter(m => m.kind === 'guest')
          const Col = ({ title, rows }: { title: string; rows: RsvpEntryView[] }) => (
            <div className="min-w-0">
              <div className="text-sm font-black" style={{ color: 'var(--mm-ink-soft)' }}>{title} <span className="tabular-nums" style={{ color: 'var(--mm-muted)' }}>{rows.length}명</span></div>
              {rows.length === 0 ? <p className="text-sm mt-1" style={{ color: 'var(--mm-muted)' }}>없어요</p> : (
                <ul className="mt-1 space-y-1.5">{rows.map(m => <Person key={m.player_id} m={m} showKind={false} />)}</ul>
              )}
            </div>
          )
          return (
            <div className={`${card} col-span-full`} style={cardStyle(WAIT, true)} {...dropProps(WAIT)}>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <b className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>대기명단 <span className="text-sm font-normal" style={{ color: 'var(--mm-muted)' }}>어드민이 팀 수요에 맞춰 배치해요</span></b>
                <span className="text-sm tabular-nums" style={{ color: 'var(--mm-muted)' }}>{waiting.length}명</span>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Col title="비정규" rows={nonReg} />
                <Col title="게스트" rows={guests} />
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
