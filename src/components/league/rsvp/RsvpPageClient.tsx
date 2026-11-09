'use client'
// 참가 명단 화면 (/rsvp, 2026-11-09 운영진)
//   회원: 이번 주 「참」 명단(구분 · 배치 팀) + 내 참/불.
//   어드민: 지난 주·다음 주로 옮겨 보기 · 대기명단(비정규·게스트)을 끌어서 팀 배치(비정규면 이때 티켓 1장, 폰은 팀 고르기) ·
//           정규를 이번 달 팀으로 한 번에 · 게스트비 받음 · 대신 참/불 눌러 주기 · 불참·미응답 명단.
//   정원은 안내만 — 넘쳐도 막지 않는다(팀장·총무 회의).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Loader2, Wand2 } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import EmptyState from '@/components/league/ui/EmptyState'
import { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import RsvpHomeCard from './RsvpHomeCard'
import RsvpTeamBoard from './RsvpTeamBoard'
import { KIND_LABEL, countByKind, dateLabel, guestLine, type RsvpEntryView, type RsvpKind, type RsvpRes } from './rsvpTypes'

function shift(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

const KIND_ORDER: RsvpKind[] = ['regular', 'non_regular', 'guest']

export default function RsvpPageClient({ leagueId, base }: { leagueId: string; base: string }) {
  const [date, setDate] = useState<string | null>(null)
  const [data, setData] = useState<RsvpRes | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [addPid, setAddPid] = useState('')
  const api = `/api/leagues/${leagueId}/rsvp`

  const load = useCallback(async () => {
    const res = await fetch(date ? `${api}?date=${date}` : api, { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setData(await res.json())
    else setData({ enabled: false, window: null, capacity: 0, me: null })
  }, [api, date])
  useEffect(() => { void load() }, [load])

  const gameDate = data?.window?.gameDate ?? date
  const entries = useMemo(() => data?.entries ?? [], [data])
  const yes = entries.filter(e => e.answer === 'yes')
  const no = entries.filter(e => e.answer === 'no')
  const teamName = (id: string | null) => data?.teams?.find(t => t.id === id)?.name ?? null

  if (!data) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[color:var(--mm-muted)]" aria-label="불러오는 중" /></div>
  if (!data.enabled) return <EmptyState title="이 리그는 참가신청을 쓰지 않아요" framed />
  if (!data.me && !data.isAdmin) return <LoginTeaser />
  const admin = !!data.isAdmin

  async function act(body: Record<string, unknown>, tag: string, ok?: string) {
    setBusy(tag)
    try {
      const res = await fetch(`${api}/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: gameDate, ...body }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '처리하지 못했어요'); return }
      if (j.ticket) toast.success(j.ticket)
      else if (ok) toast.success(ok)
      await load()
    } finally { setBusy(null) }
  }

  function place(e: RsvpEntryView, teamId: string) {
    if (!teamId && e.ticket_used) {
      const back = confirm(`${e.name} 님 배치를 취소해요.\n쓴 비정규 티켓 1장을 돌려줄까요?\n(확인 = 돌려줌 · 취소 = 그대로 둠, 다시 배치해도 또 빠지지 않아요)`)
      void act({ action: 'place', playerId: e.player_id, teamId: null, returnTicket: back }, e.player_id, '배치를 취소했어요')
      return
    }
    if (teamId && e.kind === 'non_regular' && !e.ticket_used && !confirm(`${e.name} 님을 배치하면 비정규 티켓 1장이 빠져요. 계속할까요?`)) return
    void act({ action: 'place', playerId: e.player_id, teamId: teamId || null }, e.player_id, teamId ? '배치했어요' : '배치를 취소했어요')
  }

  const unplacedRegular = yes.filter(e => e.kind === 'regular' && !e.placed_team_id && e.suggested_team_id).length
  const counts = countByKind(yes)

  return (
    <div className="space-y-3 lg:space-y-4 max-w-lg lg:max-w-4xl lg:mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">
          참가신청{gameDate ? ` · ${dateLabel(gameDate)}` : ''}
        </h2>
        {admin && gameDate && (
          <div className="inline-flex gap-1">
            <button type="button" onClick={() => setDate(shift(gameDate, -7))} className="mm-press inline-flex items-center min-h-11 px-2 text-sm font-bold border border-[color:var(--mm-rule)]" style={{ color: 'var(--mm-ink)' }}><ChevronLeft size={16} />지난 주</button>
            <button type="button" onClick={() => setDate(shift(gameDate, 7))} className="mm-press inline-flex items-center min-h-11 px-2 text-sm font-bold border border-[color:var(--mm-rule)]" style={{ color: 'var(--mm-ink)' }}>다음 주<ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {!gameDate ? (
        <EmptyState title="지금은 열린 참가신청이 없어요" description="매주 월요일 0시에 그 주 토요일 신청이 열려요." framed />
      ) : (
        <>
          {/* 내 참/불 — 홈 카드와 같은 카드(이번 주일 때만) */}
          {!date && data.me && <RsvpHomeCard leagueId={leagueId} base={base} showBoard={false} />}

          {/* 팀별 현황 — 단톡방 공지 캡처와 같은 모양(색 점 · 팀명 · 인원 · 이름 · 포지션). 어드민은 색 점으로 유니폼 색을 고른다. */}
          <RsvpTeamBoard leagueId={leagueId} gameDate={gameDate} teams={data.teams ?? []} yes={yes} entries={entries} admin={admin} onChanged={load}
            myGuestIds={data.me?.my_guest_ids ?? []} canCancelGuests={data.window?.phase === 'open'} />

          <div className="grid gap-3 lg:gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
            <div className="space-y-3 min-w-0">
              {KIND_ORDER.map(kind => {
                const rows = yes.filter(e => e.kind === kind)
                if (!admin) return null
                return (
                  <SectionCard key={kind} variant="standalone">
                    <h3 className="font-black text-lg mb-2" style={{ color: 'var(--mm-ink)' }}>참 · {KIND_LABEL[kind]} <span className="tabular-nums" style={{ color: 'var(--mm-muted)' }}>{rows.length}명</span></h3>
                    {rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>아직 없어요</p> : (
                      <ul className="space-y-1.5">
                        {rows.map((e, i) => (
                          <li key={e.player_id} className="flex items-center justify-between gap-2 flex-wrap py-1.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                            <span className="inline-flex items-baseline gap-2 min-w-0">
                              <span className="text-xs tabular-nums w-5 text-right" style={{ color: 'var(--mm-muted)' }}>{i + 1}</span>
                              <span className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{e.kind === 'guest' ? guestLine(e) : e.name}</span>
                              {e.kind === 'guest' && e.answered_by && <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>{e.answered_by}</span>}
                              {kind === 'non_regular' && admin && (
                                <span className="text-xs" style={{ color: e.ticket_used ? 'var(--mm-ink-soft)' : e.tickets_left > 0 ? 'var(--mm-muted)' : 'var(--mm-live-bg)' }}>
                                  {e.ticket_used ? '티켓 사용함' : `티켓 ${e.tickets_left}장`}
                                </span>
                              )}
                              {!admin && e.placed_team_id && <span className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{teamName(e.placed_team_id)}</span>}
                            </span>
                            {admin && (
                              <span className="inline-flex items-center gap-1.5 flex-wrap">
                                {kind === 'guest' && (
                                  <label className="inline-flex items-center gap-1 min-h-11 text-xs font-bold cursor-pointer" style={{ color: 'var(--mm-ink)' }}>
                                    <input type="checkbox" checked={e.guest_paid} disabled={busy === e.player_id}
                                      onChange={ev => act({ action: 'guest_paid', playerId: e.player_id, paid: ev.target.checked }, e.player_id)} />게스트비
                                  </label>
                                )}
                                <select
                                  aria-label={`${e.name} 팀 배치`} value={e.placed_team_id ?? ''} disabled={busy === e.player_id}
                                  onChange={ev => place(e, ev.target.value)}
                                  className="min-h-11 px-2 text-sm border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]"
                                  style={{ color: 'var(--mm-ink)' }}
                                >
                                  <option value="">배치 안 함</option>
                                  {(data.teams ?? []).map(t => (
                                    <option key={t.id} value={t.id}>{t.name}{t.id === e.suggested_team_id ? ' ★' : ''}</option>
                                  ))}
                                </select>
                                <button type="button" disabled={busy === e.player_id || (!!e.placed_team_id && e.kind !== 'guest')} onClick={() => {
                                    if (e.kind === 'guest' && !confirm(`${e.name} 님 게스트 신청을 취소할까요? (이번 주 신청이 지워져요)`)) return
                                    void act({ action: 'set_answer', playerId: e.player_id, answer: 'no' }, e.player_id, e.kind === 'guest' ? '게스트 신청을 취소했어요' : '불참으로 옮겼어요')
                                  }}
                                  className="mm-press min-h-11 px-2 text-xs font-bold border border-[color:var(--mm-rule)] disabled:opacity-40" style={{ color: 'var(--mm-ink-soft)' }}>{e.kind === 'guest' ? '게스트 취소' : '불참으로'}</button>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </SectionCard>
                )
              })}
            </div>

            <div className="space-y-3 min-w-0">
              <SectionCard variant="standalone">
                <div className="font-black text-2xl tabular-nums" style={{ color: yes.length > data.capacity ? 'var(--mm-live-bg)' : 'var(--mm-ink)' }}>참 {yes.length}명 / {data.capacity}</div>
                <div className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>정규 {counts.regular} · 비정규 {counts.non_regular} · 게스트 {counts.guest}</div>
                {yes.length > data.capacity && <p className="text-xs font-bold mt-1" style={{ color: 'var(--mm-live-bg)' }}>정원을 넘었어요 — 팀장·총무가 협의해 정해요(7명 팀 등).</p>}
                {admin && unplacedRegular > 0 && (
                  <button type="button" disabled={busy === 'bulk'} onClick={() => act({ action: 'place_suggested' }, 'bulk', `정규 ${unplacedRegular}명을 이번 달 팀으로 배치했어요`)}
                    className="mm-press w-full mt-3 min-h-11 text-sm font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}>
                    <Wand2 size={16} aria-hidden />정규 {unplacedRegular}명을 이번 달 팀(★)으로 한 번에
                  </button>
                )}
              </SectionCard>

              {admin && (
                <SectionCard variant="standalone">
                  <h3 className="font-black text-base mb-1" style={{ color: 'var(--mm-ink)' }}>불참 <span style={{ color: 'var(--mm-muted)' }}>{no.length}명</span></h3>
                  <p className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>{no.length ? no.map(e => e.name).join(' · ') : '없어요'}</p>
                  <h3 className="font-black text-base mt-3 mb-1" style={{ color: 'var(--mm-ink)' }}>아직 답 안 한 정규권 보유자</h3>
                  <p className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
                    {(data.unanswered ?? []).filter(u => u.kind === 'regular').map(u => u.name).join(' · ') || '없어요'}
                  </p>
                  <div className="mt-3 space-y-2">
                    <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>대신 「참」 넣기 (회원)</div>
                    <select value={addPid} onChange={e => setAddPid(e.target.value)} aria-label="참으로 넣을 사람"
                      className="w-full min-h-11 px-2 text-sm border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]" style={{ color: 'var(--mm-ink)' }}>
                      <option value="">사람 고르기</option>
                      {(data.unanswered ?? []).map(u => <option key={u.player_id} value={u.player_id}>{u.name} · {KIND_LABEL[u.kind]}</option>)}
                    </select>
                    <button type="button" disabled={!addPid || busy === 'add'}
                      onClick={async () => { await act({ action: 'set_answer', playerId: addPid, answer: 'yes' }, 'add', '참으로 넣었어요'); setAddPid('') }}
                      className="mm-press w-full min-h-11 text-sm font-black disabled:opacity-50" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}>참으로 넣기</button>
                    <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>게스트는 부르는 회원이 홈 카드의 「게스트 신청」으로 넣어요.</p>
                  </div>
                </SectionCard>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
