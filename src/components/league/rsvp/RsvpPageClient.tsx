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
import { countByKind, dateLabel, type RsvpRes } from './rsvpTypes'

function shift(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}


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
            myGuestIds={data.me?.my_guest_ids ?? []} canCancelGuests={data.window?.phase === 'open'} adminVote />

          {/* 아래 한 줄 — 참가 인원 현황 | 대신 「참」 넣기(어드민) 병렬(2026-11-09 운영진).
              종전의 「참 · 정규/비정규/게스트」 세로 목록과 불참·미응답 목록은 뺐다 — 팀 카드의 ✓ / ? / ✕ 와 대기명단이 같은 일을 한다. */}
          <div className={`grid gap-3 lg:gap-4 ${admin ? 'sm:grid-cols-2' : ''} items-start`}>
            <SectionCard variant="standalone">
              <div className="font-black text-2xl tabular-nums" style={{ color: yes.length > data.capacity ? 'var(--mm-live-bg)' : 'var(--mm-ink)' }}>참 {yes.length}명 / {data.capacity}</div>
              <div className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>정규 {counts.regular} · 비정규 {counts.non_regular} · 게스트 {counts.guest} · 불참 {no.length}</div>
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
                <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>대신 「참」 넣기 <span className="font-normal" style={{ color: 'var(--mm-muted)' }}>비정규 · 정규는 팀 카드의 V/X</span></div>
                <div className="mt-2 flex gap-2">
                  <select value={addPid} onChange={e => setAddPid(e.target.value)} aria-label="참으로 넣을 사람"
                    className="flex-1 min-w-0 min-h-11 px-2 text-sm border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]" style={{ color: 'var(--mm-ink)' }}>
                    <option value="">사람 고르기</option>
                    {(data.unanswered ?? []).filter(u => u.kind === 'non_regular').map(u => <option key={u.player_id} value={u.player_id}>{u.name}</option>)}
                  </select>
                  <button type="button" disabled={!addPid || busy === 'add'}
                    onClick={async () => { await act({ action: 'set_answer', playerId: addPid, answer: 'yes' }, 'add', '참으로 넣었어요 — 대기명단에서 팀에 끌어다 놓으세요'); setAddPid('') }}
                    className="mm-press shrink-0 min-h-11 px-4 text-sm font-black disabled:opacity-50" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}>참으로 넣기</button>
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
