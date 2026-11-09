'use client'
// 홈 맨 위 「이번 주 참가신청」 카드 (2026-11-09 운영진 — 월요일 00시가 되면 홈 상단에 뜨고, 거기서 바로 참/불)
//   월~금: 참/불 버튼 + 지금 몇 명(정원 대비) · 토: 마감 — 내 배치 결과 · 일: 안 보인다(다음 주는 월요일에 열린다).
//   열고 닫는 것은 서버 시각 계산(lib/rsvp/weekly.ts) — 이 카드는 받은 window 를 그대로 그린다.
//   비회원·참가신청을 안 쓰는 리그면 아무것도 그리지 않는다.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, X, ChevronRight, CalendarCheck, UserPlus } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import type { RsvpRes } from './rsvpTypes'
import { dateLabel, countByKind } from './rsvpTypes'
import RsvpTeamBoard from './RsvpTeamBoard'
import GuestRequestSheet from './GuestRequestSheet'

export default function RsvpHomeCard({ leagueId, base, showBoard = true }: { leagueId: string; base: string; showBoard?: boolean }) {
  const [data, setData] = useState<RsvpRes | null>(null)
  const [busy, setBusy] = useState(false)
  const [guestOpen, setGuestOpen] = useState(false)
  const api = `/api/leagues/${leagueId}/rsvp`

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setData(await res.json())
  }, [api])
  useEffect(() => { void load() }, [load])

  if (!data?.enabled || !data.window || (!data.me && !data.isAdmin)) return null
  const win = data.window
  const open = win.phase === 'open'
  const yes = (data.entries ?? []).filter(e => e.answer === 'yes')
  const counts = countByKind(yes)
  const me = data.me
  const myTeam = me?.placed_team_id ? data.teams?.find(t => t.id === me.placed_team_id) ?? null : null
  const over = yes.length > data.capacity
  // 정규의 자동 배치는 본인이 참/불로 바꿀 수 있다. 비정규·게스트의 배치(티켓·어드민)는 잠근다.
  const locked = !!me?.placed_team_id && me.kind !== 'regular'

  async function answer(a: 'yes' | 'no') {
    setBusy(true)
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: a }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '저장하지 못했어요'); return }
      toast.success(a === 'yes' ? '참가로 표시했어요' : '불참으로 표시했어요')
      await load()
    } finally { setBusy(false) }
  }

  const btn = (a: 'yes' | 'no') => {
    const on = me?.answer === a
    return {
      background: on ? (a === 'yes' ? 'var(--mm-yellow)' : 'var(--mm-ink)') : 'var(--mm-panel)',
      color: on ? (a === 'yes' ? 'var(--mm-black)' : 'var(--mm-panel)') : 'var(--mm-ink)',
      border: `2px solid ${on ? (a === 'yes' ? 'var(--mm-black)' : 'var(--mm-ink)') : 'var(--mm-rule)'}`,
    }
  }

  return (
    <SectionCard variant="standalone" emphasized>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="text-xs font-black inline-flex items-center gap-1" style={{ color: 'var(--mm-muted)' }}>
            <CalendarCheck size={14} aria-hidden />{open ? `참가신청 · ${dateLabel(win.closesAt!)} 밤까지` : '참가신청 마감'}
          </div>
          <h2 className="font-black text-xl leading-tight mt-0.5" style={{ color: 'var(--mm-ink)' }}>
            {open ? `이번 주 ${dateLabel(win.gameDate)} 나오나요?` : `${dateLabel(win.gameDate)} 참가 명단`}
          </h2>
        </div>
        <div className="text-right">
          <div className="font-black text-lg tabular-nums" style={{ color: over ? 'var(--mm-live-bg)' : 'var(--mm-ink)' }}>참 {yes.length}명 / {data.capacity}</div>
          <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>정규 {counts.regular} · 비정규 {counts.non_regular} · 게스트 {counts.guest}</div>
        </div>
      </div>

      {me && (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button type="button" disabled={busy || !open || locked} onClick={() => answer('yes')}
              className="mm-press min-h-14 text-lg font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-60" style={btn('yes')}>
              <Check size={20} aria-hidden />참
            </button>
            <button type="button" disabled={busy || !open || locked} onClick={() => answer('no')}
              className="mm-press min-h-14 text-lg font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-60" style={btn('no')}>
              <X size={20} aria-hidden />불
            </button>
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--mm-ink-soft)' }}>
            {myTeam ? <>✅ <b style={{ color: 'var(--mm-ink)' }}>{myTeam.name}</b>팀으로 배치됐어요.{!locked && open ? ' 못 나오게 되면 마감 전에 「불」로 바꿔 주세요.' : ''}</>
              : me.answer === 'yes'
                ? (me.kind === 'regular' ? '정규권이 있어요 — 팀 배치를 기다려 주세요.'
                  : me.kind === 'guest' ? '게스트 참가 — 대기명단에 들어갔어요. 어드민이 팀 수요에 맞춰 정해요. 게스트비는 같은 통장으로.'
                    : me.tickets_left > 0 ? `비정규 참가 — 대기명단에 들어갔어요. 어드민이 팀 수요에 맞춰 배치하고, 그때 티켓 1장을 써요 (남은 티켓 ${me.tickets_left}장).`
                      : null)
                : me.answer === 'no' ? '불참으로 표시했어요. 마감 전에는 언제든 바꿀 수 있어요.'
                  : open ? '아직 답하지 않았어요.' : '이번 주는 답하지 않았어요.'}
          </p>
          {me.kind === 'non_regular' && me.month_team_id && (
            <p className="text-sm font-bold mt-1 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', color: 'var(--mm-ink)' }}>
              이번 달 {data.teams?.find(t => t.id === me.month_team_id)?.name ?? ''}팀 정규인데 정규권이 없어요 — 정규권이 있으면 「참」만 눌러도 팀이 바로 정해져요.{' '}
              <Link href={`${base}/wallet`} className="underline underline-offset-2">정규권 사기</Link>
            </p>
          )}
          {me.answer === 'yes' && me.kind === 'non_regular' && !me.month_team_id && me.tickets_left === 0 && !myTeam && (
            <p className="text-sm font-bold mt-1 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', color: 'var(--mm-ink)' }}>
              비정규 티켓이 없어요 — 팀에 배치되려면 1장이 필요해요.{' '}
              <Link href={`${base}/wallet`} className="underline underline-offset-2">월렛에서 사기</Link>
            </p>
          )}
        </>
      )}

      {showBoard && (data.teams ?? []).length > 0 && (
        <div className="mt-3">
          <RsvpTeamBoard leagueId={leagueId} gameDate={win.gameDate} teams={data.teams ?? []} yes={yes} admin={!!data.isAdmin} onChanged={load} compact />
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        {me && open && (
          <button type="button" onClick={() => setGuestOpen(true)}
            className="mm-press inline-flex items-center gap-1.5 min-h-11 px-3 text-sm font-bold border border-[color:var(--mm-rule)]" style={{ color: 'var(--mm-ink)' }}>
            <UserPlus size={16} aria-hidden />게스트 신청
          </button>
        )}
        {over && <span className="text-xs font-bold" style={{ color: 'var(--mm-live-bg)' }}>정원을 넘었어요 — 팀장·총무가 정해요</span>}
        <Link href={`${base}/rsvp`} className="mm-press ml-auto inline-flex items-center gap-1 min-h-11 text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
          {data.isAdmin ? '명단 · 대기명단 배치' : '참가 명단 보기'} <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {me && <GuestRequestSheet leagueId={leagueId} open={guestOpen} onClose={() => setGuestOpen(false)} onDone={load} />}
    </SectionCard>
  )
}
