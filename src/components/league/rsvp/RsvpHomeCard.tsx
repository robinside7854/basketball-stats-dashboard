'use client'
// 홈 맨 위 「이번 주 참가신청」 카드 (2026-11-09 운영진 — 월요일 00시가 되면 홈 상단에 뜨고, 거기서 바로 참/불)
//   월~금: 참/불 버튼 + 지금 몇 명(정원 대비) · 마감(어드민이 누르거나 토요일)되면 안 보인다(다음 주는 월요일에 열린다).
//   열고 닫는 것은 서버 시각 계산(lib/rsvp/weekly.ts) — 이 카드는 받은 window 를 그대로 그린다.
//   비회원·참가신청을 안 쓰는 리그면 아무것도 그리지 않는다.
//   홈은 내 참/불·게스트 신청만. 팀별 현황은 /rsvp(회원 보기 전용 · 어드민만 배치·수정).
import { useCallback, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Check, X, ChevronRight, CalendarCheck, UserPlus } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import type { RsvpRes } from './rsvpTypes'
import { dateLabel, countByKind } from './rsvpTypes'
import GuestRequestSheet from './GuestRequestSheet'

export default function RsvpHomeCard({ leagueId, base }: { leagueId: string; base: string }) {
  const [data, setData] = useState<RsvpRes | null>(null)
  const [busy, setBusy] = useState(false)
  // 화면이 다시 그려지기 전의 빠른 두 번 누르기도 막는다(버튼 disabled 는 다음 그리기부터 먹는다)
  const inFlight = useRef(false)
  const [guestOpen, setGuestOpen] = useState(false)
  const api = `/api/leagues/${leagueId}/rsvp`

  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' }).catch(() => null)
    if (res?.ok) setData(await res.json())
  }, [api])
  useEffect(() => { void load() }, [load])

  // 마감되면(어드민 마감 · 경기일) 홈에서 사라진다 — 2026-11-09 운영진. 명단은 일정 탭에서.
  if (!data?.enabled || !data.window || data.window.phase !== 'open' || (!data.me && !data.isAdmin)) return null
  const win = data.window
  const open = win.phase === 'open'
  const yes = (data.entries ?? []).filter(e => e.answer === 'yes')
  const counts = countByKind(yes)
  const me = data.me
  const myTeam = me?.placed_team_id ? data.teams?.find(t => t.id === me.placed_team_id) ?? null : null
  const over = yes.length > data.capacity
  // 배치된 비정규·게스트는 「참」은 그대로(이미 참) · 「불」로 취소는 본인이 할 수 있다(티켓 자동 반환, 2026-11-09 운영진).
  const locked = !!me?.placed_team_id && me.kind !== 'regular'
  // 티켓이 없어도 포인트가 티켓값 이상이면 배치 때 자동 발행(2026-11-10 운영진)
  const canPayByPoints = data.ticket_price != null && (data.my_balance ?? 0) >= data.ticket_price

  async function answer(a: 'yes' | 'no') {
    if (a === 'no' && locked && !confirm(`이번 주 참가를 취소할까요?\n팀 배치가 풀리고${me?.kind === 'non_regular' ? ', 쓴 비정규 티켓 1장은 내 월렛에 그대로 남아요(다음에 쓸 수 있어요)' : ''}.`)) return
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answer: a }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '저장하지 못했어요'); return }
      toast.success(a === 'yes' ? (j.ticket_bought ? '참가로 표시했어요 — 포인트로 비정규 티켓 1장을 샀어요' : '참가로 표시했어요') : j.ticket_returned ? '참가를 취소했어요 — 티켓 1장은 내 월렛에 남아요' : '불참으로 표시했어요')
      await load()
    } finally { setBusy(false); inFlight.current = false }
  }

  const btn = (a: 'yes' | 'no') => {
    const on = me?.answer === a
    return {
      background: on ? (a === 'yes' ? 'var(--mm-yellow)' : 'var(--mm-ink)') : 'var(--mm-panel)',
      // 고르기 전에도 참 = 초록 · 불 = 빨강으로 표시(바탕은 칠하지 않음) — 2026-11-09 운영진
      color: on ? (a === 'yes' ? 'var(--mm-black)' : 'var(--mm-panel)') : (a === 'yes' ? '#059669' : 'var(--mm-live-bg)'),
      border: `2px solid ${on ? (a === 'yes' ? 'var(--mm-black)' : 'var(--mm-ink)') : (a === 'yes' ? '#05966966' : 'color-mix(in srgb, var(--mm-live-bg) 40%, transparent)')}`,
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
            <button type="button" disabled={busy || !open} onClick={() => answer('no')}
              className="mm-press min-h-14 text-lg font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-60" style={btn('no')}>
              <X size={20} aria-hidden />불
            </button>
          </div>
          <p className="text-sm mt-2" style={{ color: 'var(--mm-ink-soft)' }}>
            {myTeam ? <>✅ <b style={{ color: 'var(--mm-ink)' }}>{myTeam.name}</b>팀으로 배치됐어요.{open ? (locked && me.kind === 'non_regular' ? ' 못 나오게 되면 마감 전에 「불」 — 티켓은 내 월렛에 남아요.' : ' 못 나오게 되면 마감 전에 「불」로 바꿔 주세요.') : ''}</>
              : me.answer === 'yes'
                ? (me.kind === 'regular' ? '정규권이 있어요 — 팀 배치를 기다려 주세요.'
                  : me.kind === 'guest' ? '게스트 참가 — 대기명단에 들어갔어요. 어드민이 팀 수요에 맞춰 정해요. 게스트비는 같은 통장으로.'
                    : me.tickets_left > 0 ? `비정규 참가 — 대기명단에 들어갔어요. 어드민이 팀 수요에 맞춰 배치하고, 그때 티켓 1장을 써요 (남은 티켓 ${me.tickets_left}장).`
                      : canPayByPoints ? `비정규 참가 — 대기명단에 들어갔어요. 포인트로 티켓 1장(${(data.ticket_price ?? 0).toLocaleString()}P)이 자동으로 준비돼요.`
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
          {me.answer === 'yes' && me.kind === 'non_regular' && !me.month_team_id && me.tickets_left === 0 && !canPayByPoints && !myTeam && (
            <p className="text-sm font-bold mt-1 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', color: 'var(--mm-ink)' }}>
              포인트가 모자라요 — 팀에 배치되려면 {(data.ticket_price ?? 0).toLocaleString()}P가 필요해요.{' '}
              <Link href={`${base}/wallet`} className="underline underline-offset-2">충전하기</Link>
            </p>
          )}
        </>
      )}

      {/* 팀별 현황은 홈에서 뺐다(2026-11-09 운영진 — 홈 카드가 너무 길었다). 「신청 현황 보기」 화면에서 본다. */}

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        {me && open && (
          <button type="button" onClick={() => setGuestOpen(true)}
            className="mm-press inline-flex items-center gap-1.5 min-h-11 px-3 text-sm font-bold border border-[color:var(--mm-rule)]" style={{ color: 'var(--mm-ink)' }}>
            <UserPlus size={16} aria-hidden />게스트 신청
          </button>
        )}
        {over && <span className="text-xs font-bold" style={{ color: 'var(--mm-live-bg)' }}>정원을 넘었어요 — 팀장·총무가 정해요</span>}
        {/* 홈은 내 신청만 — 팀별 현황은 「신청 현황」 화면(회원 보기 전용 · 어드민만 배치·수정, 2026-11-09 운영진) */}
        <Link href={`${base}/rsvp`} className="mm-press ml-auto inline-flex items-center gap-1 min-h-11 text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
          {data.isAdmin ? '신청 현황 · 팀 배치' : '신청 현황 보기'} <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {me && <GuestRequestSheet leagueId={leagueId} open={guestOpen} onClose={() => setGuestOpen(false)} onDone={load} pool={data.guest_pool ?? []} guestPrice={data.guest_price ?? null} myBalance={data.my_balance ?? null} />}
    </SectionCard>
  )
}
