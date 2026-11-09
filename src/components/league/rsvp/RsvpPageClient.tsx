'use client'
// 참가 명단 화면 (/rsvp, 2026-11-09 운영진)
//   회원: 이번 주 「참」 명단(구분 · 배치 팀) + 내 참/불.
//   어드민: 지난 주·다음 주로 옮겨 보기 · 대기명단(비정규·게스트)을 끌어서 팀 배치(비정규면 이때 티켓 1장, 폰은 팀 고르기) ·
//           정규를 이번 달 팀으로 한 번에 · 게스트비 받음 · 대신 참/불 눌러 주기 · 불참·미응답 명단.
//   정원은 안내만 — 넘쳐도 막지 않는다(팀장·총무 회의).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Loader2, Wand2, Lock } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import EmptyState from '@/components/league/ui/EmptyState'
import { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import RsvpHomeCard from './RsvpHomeCard'
import RsvpTeamBoard from './RsvpTeamBoard'
import { countByKind, dateLabel, type RsvpRes } from './rsvpTypes'

/** 아래 두 칸 공용 머리 — 제목 한 줄 + 오른쪽 작은 상태 글자 */
function BoxHead({ title, note, tone = 'muted' }: { title: string; note?: string; tone?: 'muted' | 'live' }) {
  return (
    <div className="flex items-baseline justify-between gap-2 flex-wrap">
      <span className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>{title}</span>
      {note && <span className="text-xs font-bold" style={{ color: tone === 'live' ? '#059669' : 'var(--mm-muted)' }}>{note}</span>}
    </div>
  )
}

function shift(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}


export default function RsvpPageClient({ leagueId, base, initialDate = null, embedded = false }: { leagueId: string; base: string; initialDate?: string | null; embedded?: boolean }) {
  const [date, setDate] = useState<string | null>(initialDate)
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

  if (!data) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[color:var(--mm-muted)]" aria-label="불러오는 중" /></div>
  if (!data.enabled) return <EmptyState title="이 리그는 참가신청을 쓰지 않아요" framed />
  // 일정 탭 안(embedded): 그날 신청 기록이 하나도 없으면 아무것도 그리지 않는다
  if (embedded && (data.entries ?? []).length === 0 && !data.closure) return <p className="text-sm py-2" style={{ color: 'var(--mm-muted)' }}>이 날짜에는 참가신청 기록이 없어요.</p>
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



  const closed = data.window?.phase !== 'open'
  const locked = !!data.locked
  const over = yes.length > data.capacity
  const unplacedRegular = yes.filter(e => e.kind === 'regular' && !e.placed_team_id && e.suggested_team_id).length
  const counts = countByKind(yes)

  return (
    <div className={embedded ? 'space-y-3' : 'space-y-3 lg:space-y-4 max-w-lg lg:max-w-4xl lg:mx-auto'}>
      {!embedded && <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">
          참가신청{gameDate ? ` · ${dateLabel(gameDate)}` : ''}
        </h2>
        {admin && gameDate && (
          <div className="inline-flex gap-1">
            <button type="button" onClick={() => setDate(shift(gameDate, -7))} className="mm-press inline-flex items-center min-h-11 px-2 text-sm font-bold border border-[color:var(--mm-rule)]" style={{ color: 'var(--mm-ink)' }}><ChevronLeft size={16} />지난 주</button>
            <button type="button" onClick={() => setDate(shift(gameDate, 7))} className="mm-press inline-flex items-center min-h-11 px-2 text-sm font-bold border border-[color:var(--mm-rule)]" style={{ color: 'var(--mm-ink)' }}>다음 주<ChevronRight size={16} /></button>
          </div>
        )}
      </div>}

      {!gameDate ? (
        <EmptyState title="지금은 열린 참가신청이 없어요" description="매주 월요일 0시에 그 주 토요일 신청이 열려요." framed />
      ) : (
        <>
          {/* 내 참/불 — 홈 카드와 같은 카드(이번 주일 때만) */}
          {!date && data.me && <RsvpHomeCard leagueId={leagueId} base={base} showBoard={false} />}

          {/* 팀별 현황 — 단톡방 공지 캡처와 같은 모양(색 점 · 팀명 · 인원 · 이름 · 포지션). 어드민은 색 점으로 유니폼 색을 고른다. */}
          <RsvpTeamBoard leagueId={leagueId} gameDate={gameDate} teams={data.teams ?? []} yes={yes} entries={entries} admin={admin && !locked} onChanged={load}
            myGuestIds={data.me?.my_guest_ids ?? []} canCancelGuests={data.window?.phase === 'open'} adminVote />

          {/* 아래 한 줄 — 참가 인원 | 대신 「참」 넣기(어드민) 병렬(2026-11-09 운영진). 두 칸은 같은 틀(머리 한 줄 + 내용).
              종전의 「참 · 정규/비정규/게스트」 세로 목록과 불참·미응답 목록은 뺐다 — 팀 카드의 ✓ / ? / ✕ 와 대기명단이 같은 일을 한다. */}
          <div className={`grid gap-3 lg:gap-4 ${admin && !locked ? 'sm:grid-cols-2' : ''} items-stretch`}>
            <SectionCard variant="standalone">
              <BoxHead title="참가 인원" note={closed ? (data.closure?.closed_by_label ? `마감 · ${data.closure.closed_by_label}` : '마감') : '신청 중'} tone={closed ? 'muted' : 'live'} />
              <div className="mt-2 flex items-baseline gap-1.5 tabular-nums">
                <span className="font-black text-3xl leading-none" style={{ color: over ? 'var(--mm-live-bg)' : 'var(--mm-ink)' }}>{yes.length}</span>
                <span className="text-base font-bold" style={{ color: 'var(--mm-muted)' }}>/ 정원 {data.capacity}명</span>
              </div>
              <div className="mt-1.5 text-sm tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>정규 {counts.regular} · 비정규 {counts.non_regular} · 게스트 {counts.guest} · 불참 {no.length}</div>
              {over && <p className="text-xs font-bold mt-1" style={{ color: 'var(--mm-live-bg)' }}>정원을 넘었어요 — 팀장·총무가 협의해 정해요(7명 팀 등).</p>}
              {locked && <p className="text-xs font-bold mt-1" style={{ color: 'var(--mm-ink-soft)' }}>그날 기록이 시작돼 명단은 더 고칠 수 없어요.</p>}
              {admin && !locked && (
                <div className="mt-3 space-y-2">
                  {unplacedRegular > 0 && (
                    <button type="button" disabled={busy === 'bulk'} onClick={() => act({ action: 'place_suggested' }, 'bulk', `정규 ${unplacedRegular}명을 이번 달 팀으로 배치했어요`)}
                      className="mm-press w-full min-h-11 text-sm font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}>
                      <Wand2 size={16} aria-hidden />정규 {unplacedRegular}명을 이번 달 팀(★)으로 한 번에
                    </button>
                  )}
                  {!closed ? (
                    <button type="button" disabled={busy === 'close'}
                      onClick={() => { if (confirm(`${dateLabel(gameDate)} 참가신청을 마감할까요?\n· 홈 화면 카드가 사라지고 회원은 참/불을 못 바꿔요\n· 그날 일정과 빈 경기 칸이 만들어져요\n· 명단은 일정 탭에서 기록 전까지 고칠 수 있어요`)) void act({ action: 'close' }, 'close', '마감했어요 — 일정 탭에 그날 일정이 생겼어요') }}
                      className="mm-press w-full min-h-11 text-sm font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                      style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>
                      <Lock size={15} aria-hidden />참가신청 마감하기
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      {!embedded && <Link href={`${base}/schedule`} className="mm-press flex-1 min-h-11 px-3 text-sm font-bold inline-flex items-center justify-center gap-1 border border-[color:var(--mm-rule)]"
                        style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>일정 탭에서 보기<ChevronRight size={15} aria-hidden /></Link>}
                      {data.can_reopen && (
                        <button type="button" disabled={busy === 'reopen'} onClick={() => { if (confirm('마감을 취소하고 다시 신청을 받을까요? 홈 화면 카드가 다시 보여요.')) void act({ action: 'reopen' }, 'reopen', '마감을 취소했어요') }}
                          className="mm-press min-h-11 px-3 text-sm font-bold underline disabled:opacity-50" style={{ color: 'var(--mm-muted)' }}>마감 취소</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {admin && !locked && (
              <SectionCard variant="standalone">
                <BoxHead title="대신 「참」 넣기" note="비정규만 · 정규는 팀 카드의 V/X" />
                <div className="mt-2 flex gap-2">
                  <select value={addPid} onChange={e => setAddPid(e.target.value)} aria-label="참으로 넣을 사람"
                    className="flex-1 min-w-0 min-h-11 px-2 text-sm border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]" style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>
                    <option value="">사람 고르기</option>
                    {(data.unanswered ?? []).filter(u => u.kind === 'non_regular').map(u => <option key={u.player_id} value={u.player_id}>{u.name}</option>)}
                  </select>
                  <button type="button" disabled={!addPid || busy === 'add'}
                    onClick={async () => { await act({ action: 'set_answer', playerId: addPid, answer: 'yes' }, 'add', '참으로 넣었어요 — 대기명단에서 팀에 끌어다 놓으세요'); setAddPid('') }}
                    className="mm-press shrink-0 min-h-11 px-4 text-sm font-black disabled:opacity-50" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>참으로 넣기</button>
                </div>
                <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)' }}>게스트는 부르는 회원이 홈 카드의 「게스트 신청」으로 넣어요.</p>
              </SectionCard>
            )}
          </div>
        </>
      )}
    </div>
  )
}
