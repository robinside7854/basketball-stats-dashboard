'use client'
// 홈 맨 위 「이번 주 참가신청」 카드 (2026-11-09 운영진 — 월요일 00시가 되면 홈 상단에 뜨고, 거기서 바로 참/불)
//   월~금: 참/불 버튼 + 지금 몇 명(정원 대비) · 마감(어드민이 누르거나 토요일)되면 안 보인다(다음 주는 월요일에 열린다).
//   열고 닫는 것은 서버 시각 계산(lib/rsvp/weekly.ts) — 이 카드는 받은 window 를 그대로 그린다.
//   비회원·참가신청을 안 쓰는 리그면 아무것도 그리지 않는다.
//   홈은 내 참/불·게스트 신청만. 팀별 현황은 /rsvp(회원 보기 전용 · 어드민만 배치·수정).
import { useCallback, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Check, X, ChevronRight, UserPlus } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import type { RsvpRes } from './rsvpTypes'
import { dateLabel, countByKind } from './rsvpTypes'
import GuestRequestSheet from './GuestRequestSheet'

export default function RsvpHomeCard({ leagueId, base }: { leagueId: string; base: string }) {
  const { memberPreview } = useLeagueEditMode()
  const [data, setData] = useState<RsvpRes | null>(null)
  const [showVote, setShowVote] = useState(false)   // UPCOMING 카드에서 「참·불 바꾸기」를 눌렀을 때만 참/불 화면
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
  if (!data?.enabled || !data.window || (!data.me && !data.isAdmin)) return null
  // 이번 주인데 마감됐으면(운영진 마감·경기일) 참/불 대신 UPCOMING 만 — 종전엔 카드가 통째로 사라졌다(2026-11-26 운영진)
  const closedThisWeek = data.window.phase !== 'open' && !!data.window.opensAt
  if (data.window.phase !== 'open' && !closedThisWeek) return null
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
      toast.success(a === 'yes' ? (j.ticket_bought ? '참가 완료 · 티켓 1장 구매' : '참가 완료') : j.ticket_returned ? '참가 취소 · 티켓은 월렛에 남음' : '불참 완료')
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

  // 대기명단까지 전부 팀에 배치되면 참/불 대신 UPCOMING EVENT 바로가기(2026-11-26 운영진 — 마감 없이 명단만 보면 된다)
  const allPlaced = yes.length > 0 && yes.every(e => !!e.placed_team_id)
  if (closedThisWeek || (allPlaced && !showVote)) {
    return (
      <SectionCard variant="standalone" emphasized>
        <Link href={`${base}/rsvp`} className="mm-press flex items-center gap-3 -m-1 p-1">
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-black tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>UPCOMING EVENT</span>
            <span className="block font-black text-xl leading-tight mt-0.5" style={{ color: 'var(--mm-ink)' }}>{dateLabel(win.gameDate)} 참가 명단</span>
            <span className="block text-sm mt-1" style={{ color: 'var(--mm-ink-soft)' }}>
              {myTeam ? <>내 팀 <b style={{ color: 'var(--mm-ink)' }}>{myTeam.name}</b> · </> : null}참가 {yes.length}명 · {allPlaced ? '팀 배치 완료' : '팀 배치 중'}
            </span>
          </span>
          <ChevronRight size={22} aria-hidden style={{ color: 'var(--mm-ink)' }} />
        </Link>
        {me && !closedThisWeek && (
          <button type="button" onClick={() => setShowVote(true)} className="mm-press mt-2 min-h-9 text-xs font-bold underline underline-offset-4" style={{ color: 'var(--mm-muted)' }}>
            참·불 바꾸기
          </button>
        )}
      </SectionCard>
    )
  }

  return (
    <SectionCard variant="standalone" emphasized>
      {/* MATCHDAY 머리띠(2026-11-27 운영진 — 체육관 스킨) */}
      <div className="-mx-4 -mt-4 lg:-mx-6 lg:-mt-5 mb-3 px-4 lg:px-6 py-2 flex items-center justify-between gap-2 text-sm font-black"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}>
        <span className="tracking-[0.14em]">MATCHDAY</span><span className="whitespace-nowrap">{dateLabel(win.gameDate)}</span>
      </div>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="font-black text-xl leading-tight mt-0.5" style={{ color: 'var(--mm-ink)' }}>
            {open ? `이번 주 ${dateLabel(win.gameDate)} 나오나요?` : `${dateLabel(win.gameDate)} 참가 명단`}
          </h2>
        </div>
      </div>
      {/* 정원 칸(인벤토리) — 공 하나 = 한 자리(2026-11-24 운영진). 주황 농구공 = 참석 · 검정 농구공 = 남은 자리.
          종전 검정·노랑 네모는 검정이 오히려 빈 칸처럼 보였다. 정원을 넘으면 넘친 공에 빨간 테. */}
      {(() => {
        const capN = data.capacity ?? yes.length
        const cap = Math.max(capN, yes.length)
        const left = Math.max(0, capN - yes.length)
        return (
          <div className="mt-3">
            <div className="grid grid-cols-9 gap-1" role="img" aria-label={`참 ${yes.length}명, 남은 자리 ${left}`}>
              {Array.from({ length: cap }, (_, i) => <Ball key={i} on={i < yes.length} over={i >= capN} />)}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--mm-muted)' }}>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-3.5 inline-block"><Ball on /></span>참석 {yes.length}</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="w-3.5 inline-block"><Ball on={false} /></span>남은 자리 {left}</span>
              <span className="whitespace-nowrap">정규 {counts.regular} · 비정규 {counts.non_regular} · 게스트 {counts.guest}</span>
            </div>
          </div>
        )
      })()}

      {me && (
        <>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <button type="button" disabled={busy || !open || locked} onClick={() => answer('yes')}
              className="mm-press min-h-14 text-lg font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-60" style={btn('yes')}>
              <Check size={20} aria-hidden />참
            </button>
            {/* 정규권이 없는 사람(비정규)은 「불」을 누를 일이 없다 — 나올 때만 「참」(2026-11-15 운영진).
                「참」을 눌러 둔 뒤 취소할 때만 「불」이 살아난다. */}
            <button type="button" disabled={busy || !open || (me.kind !== 'regular' && me.answer !== 'yes')} onClick={() => answer('no')}
              title={me.kind !== 'regular' && me.answer !== 'yes' ? '비정규는 나올 때만 「참」을 눌러요' : undefined}
              className="mm-press min-h-14 text-lg font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-60" style={btn('no')}>
              <X size={20} aria-hidden />불
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--mm-ink-soft)' }}>
            {myTeam ? <>✅ <b style={{ color: 'var(--mm-ink)' }}>{myTeam.name}</b> 배치 완료.{open ? (locked && me.kind === 'non_regular' ? ' 불참 시 마감 전 「불」. 티켓은 월렛에 남음.' : ' 불참 시 마감 전 「불」 클릭.') : ''}</>
              : me.answer === 'yes'
                ? (me.kind === 'regular' ? '정규권 확인. 팀 배치 대기 중.'
                  : me.kind === 'guest' ? '대기명단 등록. 운영진이 팀 배치. 게스트비는 같은 통장으로.'
                    : me.tickets_left > 0 ? `대기명단 등록. 운영진이 팀 배치. 티켓 ${me.tickets_left}장 보유.`
                      : canPayByPoints ? `대기명단 등록. 마감 때 포인트 ${(data.ticket_price ?? 0).toLocaleString()}P 차감.`
                        : null)
                : me.answer === 'no' ? '불참 완료. 마감 전 변경 가능.'
                  : open ? (me.kind === 'regular' ? '정규 멤버는 참·불 필수.' : '비정규는 나올 때만 「참」.') : '이번 주 미응답.'}
          </p>
          {me.kind === 'non_regular' && me.month_team_id && (() => {
            // 정규권은 운영진이 판매를 열 때만(130, 2026-11-10 운영진)
            const ps = data.pass_sale
            const selling = ps?.state === 'open' && ps.sold < ps.capacity
            return (
              <p className="text-sm font-bold mt-1 px-3 py-2 break-keep" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', color: 'var(--mm-ink)' }}>
                이번 달 {data.teams?.find(t => t.id === me.month_team_id)?.name ?? ''}팀 정규인데 정규권이 없어요.{' '}
                {selling ? <>정규권 판매 중이에요(남은 자리 {ps!.capacity - ps!.sold}). <Link href={`${base}/wallet`} className="underline underline-offset-2">정규권 사기</Link></>
                  : '정규권은 운영진이 판매를 열 때 살 수 있어요.'}
              </p>
            )
          })()}
          {/* 포인트 부족은 「참」을 누르기 전에 미리 — 입금만 하면 자동 충전(2026-11-10 운영진) */}
          {me.kind === 'non_regular' && !me.month_team_id && me.tickets_left === 0 && !canPayByPoints && !myTeam && me.answer !== 'no' && (
            <div className="text-sm mt-1 px-3 py-2 break-keep space-y-1" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', color: 'var(--mm-ink)' }}>
              {/* 핵심만 두 줄(2026-11-15 CEO) — 「모임통장」 같은 통장 이름은 화면에 박지 않는다 */}
              <div className="font-bold">포인트 부족 · {(data.ticket_price ?? 0).toLocaleString()}P 필요</div>
              {data.auto_charge ? (
                <>
                  <div>본인 이름 입금 시 1분 안 자동 충전.</div>
                  {data.wallet_bank && (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold">{data.wallet_bank}</span>
                      <button type="button" onClick={() => {
                        const digits = data.wallet_bank!.match(/[\d-]{8,}/)?.[0] ?? data.wallet_bank!
                        navigator.clipboard?.writeText(digits).then(() => toast.success('계좌번호를 복사했어요'), () => {})
                      }} className="mm-press inline-flex items-center gap-1 min-h-9 px-2 text-sm font-bold underline underline-offset-2">계좌번호 복사</button>
                    </div>
                  )}
                </>
              ) : <Link href={`${base}/wallet`} className="font-bold underline underline-offset-2">충전하기</Link>}
            </div>
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
        {over && <span className="text-xs font-bold" style={{ color: 'var(--mm-live-bg)' }}>정원 초과 · 팀장·총무 협의</span>}
        {/* 홈은 내 신청만 — 팀별 현황은 「신청 현황」 화면(회원 보기 전용 · 어드민만 배치·수정, 2026-11-09 운영진) */}
        <Link href={`${base}/rsvp`} className="mm-press ml-auto inline-flex items-center gap-1 min-h-11 text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
          {data.isAdmin && !memberPreview ? '신청 현황 · 팀 배치' : '신청 현황 보기'} <ChevronRight size={16} aria-hidden />
        </Link>
      </div>
      {me && <GuestRequestSheet leagueId={leagueId} open={guestOpen} onClose={() => setGuestOpen(false)} onDone={load} pool={data.guest_pool ?? []} guestPrice={data.guest_price ?? null} myBalance={data.my_balance ?? null} />}
    </SectionCard>
  )
}

/** 농구공 한 개 — on = 주황(참석) · off = 검정(남은 자리) */
function Ball({ on, over = false }: { on: boolean; over?: boolean }) {
  const fill = on ? '#F08A24' : '#2A2622'
  const line = on ? '#7A3B0C' : '#5C5650'
  return (
    <svg viewBox="0 0 24 24" className="block w-full h-auto" aria-hidden>
      <circle cx="12" cy="12" r="10.5" fill={fill} stroke={over ? 'var(--mm-live-bg)' : line} strokeWidth={over ? 2.5 : 1.2} />
      <g fill="none" stroke={line} strokeWidth="1.2">
        <path d="M1.5 12h21M12 1.5v21" />
        <path d="M5 4.5c3 2.2 3 12.8 0 15M19 4.5c-3 2.2-3 12.8 0 15" />
      </g>
    </svg>
  )
}
