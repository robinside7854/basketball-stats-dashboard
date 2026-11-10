'use client'
// 미라클 월렛 — 어드민 칸 (팀 어드민 누구나 · CEO, 2026-11-09 운영진)
//   ① 확인 기다리는 요청 — 충전(통장 입금 확인 → 승인, 5만원↑ 보너스는 자동) · 환불(회원 계좌로 송금 → 「송금했어요」)
//   ② 회원별 잔액(합계) — 누르면 그 회원의 내역 · 티켓(사용 처리 · 돌려주기) + 보정(이유 필수, 회원도 내역에서 본다)
//   ③ 처리 내역 — 달별 · 충전/환불 · 그 달 합계(2026-11-10 운영진)
//   서버가 매 요청 canEditLeague 로 다시 확인한다 — 이 칸이 보이는 것은 화면 표시일 뿐.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Search, Copy } from 'lucide-react'
import { refreshPendingCharges } from '@/lib/hooks/usePendingCharges'
import SectionCard from '@/components/league/ui/SectionCard'
import Sheet from '@/components/league/ui/Sheet'
import MimoImportBox from './MimoImportBox'
import BankAutoBox from './BankAutoBox'
import { LedgerList, RequestList, TicketList, MonthSelect, monthKey, fmtP, fmtWhen, ticketTitle, type LedgerItem, type RequestItem, type TicketItem } from './walletParts'

/** 월렛이 생긴 달(2026-11)부터 이번 달까지, 최근이 앞 */
function walletMonths(): string[] {
  const now = monthKey(new Date().toISOString())
  const out: string[] = []
  let [y, m] = now.split('-').map(Number)
  while (out.length < 36 && (y > 2026 || (y === 2026 && m >= 11))) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1; if (m === 0) { m = 12; y -= 1 }
  }
  return out
}

/** 환불 계좌에서 계좌번호(숫자·하이픈)만 — 「카카오뱅크 3333000000000」 → 「3333000000000」 */
function accountDigits(a: string | null): string | null {
  const m = (a ?? '').match(/\d[\d-]{6,}\d/)
  return m ? m[0] : null
}

function copyAccount(a: string | null) {
  const d = accountDigits(a)
  if (!d) return
  navigator.clipboard?.writeText(d).then(() => toast.success(`계좌번호를 복사했어요 · ${d}`), () => toast.error('복사하지 못했어요'))
}

interface AdminRes {
  pending: RequestItem[]
  recent: RequestItem[]
  members: Array<{ player_id: string; name: string; balance: number }>
  total: number
}

export default function WalletAdminPanel({ leagueId, onChanged }: { leagueId: string; onChanged: () => void }) {
  const [data, setData] = useState<AdminRes | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [openPlayer, setOpenPlayer] = useState<{ player_id: string; name: string; balance: number } | null>(null)
  const [ledger, setLedger] = useState<LedgerItem[] | null>(null)
  const [tickets, setTickets] = useState<TicketItem[]>([])
  const [refundable, setRefundable] = useState(0)
  const [sheetTab, setSheetTab] = useState<'ledger' | 'tickets'>('tickets')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjSign, setAdjSign] = useState<1 | -1>(1)
  const [adjMemo, setAdjMemo] = useState('')
  // 처리 내역 — 달별로 보기(2026-11-10 운영진) · 종류(전체·충전·환불)
  const [histMonth, setHistMonth] = useState(() => monthKey(new Date().toISOString()))
  const [histKind, setHistKind] = useState<'all' | 'charge' | 'refund'>('all')
  const [history, setHistory] = useState<RequestItem[] | null>(null)
  // 회원별 잔액 — 세로로 너무 길었다(2026-11-09 운영진) → 이름 찾기 + 「잔액 있는 사람만」 + 여러 칸 격자
  const [query, setQuery] = useState('')
  const [onlyWithBalance, setOnlyWithBalance] = useState(true)

  const api = `/api/leagues/${leagueId}/wallet/admin`
  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
  }, [api])
  useEffect(() => { void load() }, [load])
  const loadHistory = useCallback(async () => {
    setHistory(null)
    const res = await fetch(`${api}?history=${histMonth}`, { cache: 'no-store' })
    const j = res.ok ? await res.json() : { rows: [] }
    setHistory(j.rows ?? [])
  }, [api, histMonth])
  useEffect(() => { void loadHistory() }, [loadHistory])

  async function post(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? '처리하지 못했어요'); return false }
    return true
  }

  async function review(r: RequestItem, decision: 'approve' | 'reject') {
    const refund = r.kind === 'refund'
    let note: string | null = null
    if (decision === 'approve') {
      const msg = refund
        ? `${r.name} 님 환불 ${r.amount.toLocaleString()}원\n받을 계좌: ${r.refund_account ?? ''} (${r.depositor_name})\n\n이 계좌로 송금했나요? 「확인」을 누르면 장부에 환불이 기록되고 회원 잔액이 0P 가 돼요.\n(금액은 지금 시점으로 다시 계산돼요)`
        : `${r.name} · 입금자 「${r.depositor_name}」 ${r.amount.toLocaleString()}원\n통장에서 입금을 확인했나요? 승인하면 바로 포인트가 들어갑니다(5만원 이상이면 보너스도).`
      if (!confirm(msg)) return
    } else {
      note = prompt('반려 이유 (회원에게 보여요 · 비워도 됨)', refund ? '' : '입금 확인이 안 돼요')
      if (note === null) return
    }
    setBusyId(r.id)
    try {
      if (await post({ action: 'review', requestId: r.id, decision, note })) {
        toast.success(decision === 'reject' ? '반려했어요' : refund ? `${r.name} 님 환불을 기록했어요` : `${r.name} 님 충전을 승인했어요`)
        await load(); void loadHistory(); onChanged(); void refreshPendingCharges(leagueId)
      }
    } finally { setBusyId(null) }
  }

  async function openMember(m: AdminRes['members'][number]) {
    setOpenPlayer(m); setLedger(null); setTickets([]); setRefundable(0); setAdjAmount(''); setAdjMemo(''); setAdjSign(1)
    const res = await fetch(`${api}?playerId=${m.player_id}`, { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json() as { ledger: LedgerItem[]; tickets: TicketItem[]; refundable: number }
      setLedger(j.ledger); setTickets(j.tickets ?? []); setRefundable(j.refundable ?? 0)
    }
  }

  async function reopen(delta = 0) {
    if (!openPlayer) return
    await load(); onChanged()
    await openMember({ ...openPlayer, balance: openPlayer.balance + delta })
  }

  // 비정규 티켓 사용 처리 — 참가신청(다음 단계)이 붙기 전까지 어드민이 손으로 한다.
  async function useTicket() {
    if (!openPlayer) return
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    const date = prompt(`${openPlayer.name} 님 비정규 티켓 한 장을 사용 처리해요.\n경기 날짜 (YYYY-MM-DD)`, today)
    if (date === null) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) { toast.error('날짜를 2026-11-14 처럼 적어 주세요'); return }
    setBusyId('use')
    try {
      if (await post({ action: 'use_ticket', playerId: openPlayer.player_id, date: date.trim(), note: '어드민 사용 처리' })) {
        toast.success('비정규 티켓 한 장을 사용 처리했어요')
        await reopen()
      }
    } finally { setBusyId(null) }
  }

  async function returnTicket(t: TicketItem) {
    const note = prompt(`${ticketTitle(t)} — ${fmtP(t.price)}를 돌려줘요(포인트 환불).\n이유 (필수 · 회원도 내역에서 봐요)`, '')
    if (note === null) return
    if (!note.trim()) { toast.error('이유를 적어 주세요'); return }
    setBusyId(t.id)
    try {
      if (await post({ action: 'return_ticket', ticketId: t.id, note: note.trim() })) {
        toast.success('티켓을 돌려줬어요')
        await reopen(t.price)
      }
    } finally { setBusyId(null) }
  }

  async function adjust() {
    if (!openPlayer) return
    const n = Number(adjAmount)
    if (!Number.isInteger(n) || n <= 0) { toast.error('금액을 숫자로 적어 주세요'); return }
    if (!adjMemo.trim()) { toast.error('이유를 적어 주세요'); return }
    const signed = n * adjSign
    if (!confirm(`${openPlayer.name} 님 ${signed > 0 ? '+' : '−'}${n.toLocaleString()}P\n이유: ${adjMemo.trim()}\n장부에 남고 되돌리려면 반대 보정을 해야 해요.`)) return
    setBusyId('adjust')
    try {
      if (await post({ action: 'adjust', playerId: openPlayer.player_id, amount: signed, memo: adjMemo.trim() })) {
        toast.success('보정했어요')
        await load(); onChanged()
        await openMember({ ...openPlayer, balance: openPlayer.balance + signed })
      }
    } finally { setBusyId(null) }
  }

  if (!data) return null

  return (
    <>
      <SectionCard variant="standalone" emphasized>
        <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>어드민 · 충전·환불 확인</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--mm-muted)' }}>충전은 통장에 찍힌 입금자명·금액이 맞으면 승인(5만원 이상이면 보너스 자동), 환불은 회원 계좌로 송금한 뒤 「송금했어요」. 어드민 누구나 할 수 있고, 처리한 사람이 기록에 남아요.</p>
        {data.pending.length === 0 ? (
          <p className="text-sm py-2" style={{ color: 'var(--mm-ink-soft)' }}>확인을 기다리는 요청이 없어요</p>
        ) : (
          <ul>
            {data.pending.map(r => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <div className="min-w-0 flex-1 basis-56">
                  <div className="font-black" style={{ color: 'var(--mm-ink)' }}>
                    <span className="inline-flex items-center px-1.5 mr-1.5 text-xs" style={{ background: r.kind === 'refund' ? 'var(--mm-live-bg)' : 'var(--mm-yellow)', color: r.kind === 'refund' ? '#fff' : 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}>{r.kind === 'refund' ? '환불' : '충전'}</span>
                    {r.name} <span className="tabular-nums whitespace-nowrap">{r.amount.toLocaleString()}원</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                    {r.kind === 'refund' ? <>보낼 계좌 <span className="whitespace-nowrap">{r.refund_account ?? ''}</span> ({r.depositor_name})</> : `입금자 ${r.depositor_name}`} · <span className="whitespace-nowrap">{fmtWhen(r.created_at)}</span>
                  </div>
                  {r.kind === 'refund' && accountDigits(r.refund_account) && (
                    // 계좌번호만 복사(은행 이름·예금주 빼고) — 송금 앱에 바로 붙여 넣게(2026-11-09 운영진)
                    <button type="button" onClick={() => copyAccount(r.refund_account)}
                      className="mm-press mt-1 inline-flex items-center gap-1 min-h-9 px-2 text-xs font-bold border border-[color:var(--mm-rule)]"
                      style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-chip)' }}>
                      <Copy size={13} aria-hidden />계좌번호 복사 <span className="tabular-nums" style={{ color: 'var(--mm-muted)' }}>{accountDigits(r.refund_account)}</span>
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 shrink-0 ml-auto">
                  <button
                    type="button" disabled={busyId === r.id} onClick={() => review(r, 'approve')}
                    className="mm-press inline-flex items-center gap-1 min-h-11 px-2.5 text-sm font-black whitespace-nowrap disabled:opacity-50"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                  ><Check size={16} aria-hidden />{r.kind === 'refund' ? '송금했어요' : '승인'}</button>
                  <button
                    type="button" disabled={busyId === r.id} onClick={() => review(r, 'reject')}
                    className="mm-press inline-flex items-center gap-1 min-h-11 px-2.5 text-sm font-bold whitespace-nowrap border border-[color:var(--mm-rule)] disabled:opacity-50"
                    style={{ color: 'var(--mm-ink)' }}
                  ><X size={16} aria-hidden />반려</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 처리 내역 — 달별(2026-11-10 운영진). 처리한 날(KST) 기준 · 그 달 합계를 위에 */}
      <SectionCard variant="standalone">
        <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>처리 내역</h3>
        <div className="mt-2 mb-2 flex flex-wrap items-center gap-1.5">
          <MonthSelect value={histMonth} months={walletMonths()} onChange={setHistMonth} />
          {(['all', 'charge', 'refund'] as const).map(k => (
            <button key={k} type="button" onClick={() => setHistKind(k)}
              className="mm-press min-h-11 px-3 text-sm font-bold border whitespace-nowrap"
              style={{
                borderColor: histKind === k ? 'var(--mm-ink)' : 'var(--mm-rule)',
                background: histKind === k ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                color: histKind === k ? 'var(--mm-black)' : 'var(--mm-ink)',
              }}>{k === 'all' ? '전체' : k === 'charge' ? '충전' : '환불'}</button>
          ))}
        </div>
        {history === null ? <p className="text-sm py-2" style={{ color: 'var(--mm-muted)' }}>불러오는 중</p> : (() => {
          const ok = (r: RequestItem) => r.status === 'approved'
          const charges = history.filter(r => r.kind === 'charge' && ok(r))
          const refunds = history.filter(r => r.kind === 'refund' && ok(r))
          const sum = (rs: RequestItem[]) => rs.reduce((a, r) => a + r.amount, 0)
          const shown = history.filter(r => histKind === 'all' || r.kind === histKind)
          return (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <div className="px-3 py-2" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <div className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>충전 완료 {charges.length}건</div>
                  <div className="font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{sum(charges).toLocaleString()}원</div>
                </div>
                <div className="px-3 py-2" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <div className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>환불 송금 {refunds.length}건</div>
                  <div className="font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{sum(refunds).toLocaleString()}원</div>
                </div>
              </div>
              <RequestList key={`${histMonth}-${histKind}`} rows={shown} emptyTitle="이 달에 처리한 요청이 없어요" />
            </>
          )
        })()}
      </SectionCard>

      <SectionCard variant="standalone">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>회원별 잔액</h3>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
            합계 {fmtP(data.total)} · 잔액 있는 회원 {data.members.filter(m => m.balance > 0).length}명
          </span>
        </div>
        <div className="flex items-center gap-1.5 mt-2 mb-2">
          <label className="relative flex-1 min-w-0 basis-28">
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mm-muted)' }} />
            <input
              value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 찾기" aria-label="회원 이름 찾기"
              className="w-full min-h-11 pl-9 pr-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base"
            />
          </label>
          {([true, false] as const).map(v => (
            <button
              key={String(v)} type="button" onClick={() => setOnlyWithBalance(v)}
              className="mm-press shrink-0 min-h-11 px-2.5 text-sm font-bold border whitespace-nowrap"
              style={{
                borderColor: onlyWithBalance === v ? 'var(--mm-ink)' : 'var(--mm-rule)',
                background: onlyWithBalance === v ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                color: onlyWithBalance === v ? 'var(--mm-black)' : 'var(--mm-ink)',
              }}
            >{v ? '잔액 있음' : '전체'}</button>
          ))}
        </div>
        {(() => {
          const q = query.trim().normalize('NFC').replace(/\s/g, '')
          const shown = data.members.filter(m =>
            (q ? m.name.normalize('NFC').replace(/\s/g, '').includes(q) : !onlyWithBalance || m.balance > 0))
          if (shown.length === 0) {
            return <p className="text-sm py-2" style={{ color: 'var(--mm-ink-soft)' }}>{q ? '찾는 이름이 없어요' : '잔액이 있는 회원이 없어요 — 「전체」를 눌러 보세요'}</p>
          }
          return (
            <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
              {shown.map(m => (
                <li key={m.player_id}>
                  <button
                    type="button" onClick={() => openMember(m)}
                    className="mm-press w-full flex flex-col items-start gap-0.5 min-h-11 px-2.5 py-1.5 text-left border border-[color:var(--mm-rule)] hover:bg-[color:var(--mm-panel-alt)]"
                  >
                    <span className="font-bold text-sm break-keep" style={{ color: 'var(--mm-ink)' }}>{m.name}</span>
                    <span className="tabular-nums font-black text-sm" style={{ color: m.balance > 0 ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{fmtP(m.balance)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        })()}
        <p className="text-xs mt-2" style={{ color: 'var(--mm-muted)' }}>이름을 누르면 그 회원의 내역과 보정 칸이 열려요. 검색하면 잔액이 없는 회원도 나와요.</p>
      </SectionCard>

      {/* 미모바스켓 잔액 옮기기(2026-11-09 운영진) — 한 번 쓰고 마는 일이라 접어 둔다 */}
      <SectionCard variant="standalone">
        <BankAutoBox leagueId={leagueId} />
        <MimoImportBox leagueId={leagueId} onDone={() => { void load(); onChanged() }} />
      </SectionCard>

      <Sheet open={!!openPlayer} onClose={() => setOpenPlayer(null)} title={openPlayer ? `${openPlayer.name} · ${fmtP(openPlayer.balance)}` : ''}>
        <div className="space-y-4">
          <div className="space-y-2 p-3" style={{ background: 'var(--mm-panel-alt)' }}>
            <div className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>보정 (잘못 들어간 것 바로잡기)</div>
            <div className="flex gap-2">
              {([1, -1] as const).map(s => (
                <button
                  key={s} type="button" onClick={() => setAdjSign(s)}
                  className="mm-press min-h-11 px-3 text-sm font-bold border"
                  style={{
                    borderColor: adjSign === s ? 'var(--mm-ink)' : 'var(--mm-rule)',
                    background: adjSign === s ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                    color: adjSign === s ? 'var(--mm-black)' : 'var(--mm-ink)',
                  }}
                >{s > 0 ? '더하기' : '빼기'}</button>
              ))}
              <input
                inputMode="numeric" value={adjAmount} onChange={e => setAdjAmount(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="금액" aria-label="보정 금액"
                className="flex-1 min-w-0 min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base tabular-nums"
              />
            </div>
            <input
              value={adjMemo} onChange={e => setAdjMemo(e.target.value)} maxLength={200}
              placeholder="이유 (필수 · 회원도 내역에서 봐요)" aria-label="보정 이유"
              className="w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base"
            />
            <button
              type="button" disabled={busyId === 'adjust'} onClick={adjust}
              className="mm-press w-full min-h-11 font-black disabled:opacity-50"
              style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}
            >보정하기</button>
          </div>
          <p className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
            비정규 티켓 남은 {tickets.filter(t => t.kind === 'non_regular' && t.status === 'active').length}장 · 환불 가능 {refundable.toLocaleString()}원
          </p>
          <div className="flex gap-2">
            {(['tickets', 'ledger'] as const).map(k => (
              <button
                key={k} type="button" onClick={() => setSheetTab(k)}
                className="mm-press flex-1 min-h-11 text-sm font-bold border"
                style={{
                  borderColor: sheetTab === k ? 'var(--mm-ink)' : 'var(--mm-rule)',
                  background: sheetTab === k ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                  color: sheetTab === k ? 'var(--mm-black)' : 'var(--mm-ink)',
                }}
              >{k === 'tickets' ? '티켓' : '포인트 내역'}</button>
            ))}
          </div>
          {!ledger ? <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>불러오는 중</p> : sheetTab === 'ledger' ? <LedgerList rows={ledger} monthFilter /> : (
            <div className="space-y-2">
              {tickets.some(t => t.kind === 'non_regular' && t.status === 'active') && (
                <button
                  type="button" disabled={busyId === 'use'} onClick={useTicket}
                  className="mm-press w-full min-h-11 text-sm font-black border border-[color:var(--mm-ink)] disabled:opacity-50"
                  style={{ color: 'var(--mm-ink)' }}
                >비정규 티켓 한 장 사용 처리</button>
              )}
              <TicketList
                rows={tickets}
                actions={t => t.status === 'returned' ? null : (
                  <button
                    type="button" disabled={busyId === t.id} onClick={() => returnTicket(t)}
                    className="mm-press min-h-11 px-3 text-sm font-bold border border-[color:var(--mm-rule)] disabled:opacity-50"
                    style={{ color: 'var(--mm-ink)' }}
                  >돌려주기 (포인트 환불)</button>
                )}
              />
            </div>
          )}
        </div>
      </Sheet>
    </>
  )
}
