'use client'
// 미라클 월렛 화면 (2026-11-09 운영진)
//   회원: 잔액 · 충전(5만원↑ 10% 보너스 미리보기) · 티켓 사기(정규권·비정규) · 내역(사용·요청·티켓) · 환불 규정과 환불 요청 — 본인 것만.
//   어드민(누구나) · CEO: 아래 WalletAdminPanel.
//   금액 계산(보너스·환불 가능액·티켓 가격)은 서버 DB 함수가 정본이다 — 화면은 미리보기만 한다.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wallet, Copy, Loader2, X, Minus, Plus, Ticket } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import SectionCard from '@/components/league/ui/SectionCard'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import EmptyState from '@/components/league/ui/EmptyState'
import { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import WalletAdminPanel from './WalletAdminPanel'
import {
  LedgerList, RequestList, TicketList, fmtP, monthLabel,
  type LedgerItem, type RequestItem, type TicketItem,
} from './walletParts'

interface Rules { bonus_min: number | null; bonus_pct: number; regular_pass_price: number | null; non_regular_price: number | null }

interface WalletRes {
  enabled: boolean
  name?: string
  bank?: string | null
  rules?: Rules
  months?: [string, string]
  me?: { balance: number; refundable: number; ledger: LedgerItem[]; requests: RequestItem[]; tickets: TicketItem[] } | null
}

const QUICK = [10_000, 30_000, 50_000, 100_000]

function bonusOf(amount: number, r?: Rules): number {
  if (!r || r.bonus_min == null || amount < r.bonus_min) return 0
  return Math.floor(amount * r.bonus_pct / 100)
}

const BTN_PRIMARY = { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
const INPUT = 'mt-1 w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base'

export default function WalletPageClient({ leagueId }: { leagueId: string }) {
  const { user, loading: authLoading } = useCurrentUser()
  const { isEditMode } = useLeagueEditMode()
  const [data, setData] = useState<WalletRes | null>(null)
  const [tab, setTab] = useState<'ledger' | 'requests' | 'tickets'>('ledger')
  const [amount, setAmount] = useState('')
  const [depositor, setDepositor] = useState('')
  const [qty, setQty] = useState(1)
  const [refundHolder, setRefundHolder] = useState('')
  const [refundAccount, setRefundAccount] = useState('')
  const [busy, setBusy] = useState(false)

  const api = `/api/leagues/${leagueId}/wallet`
  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    else setData({ enabled: false })
  }, [api])

  useEffect(() => { if (!authLoading) void load() }, [authLoading, load, user?.player_id])
  useEffect(() => {
    if (user?.name && !depositor) setDepositor(user.name)
    if (user?.name && !refundHolder) setRefundHolder(user.name)
  }, [user?.name, depositor, refundHolder])

  if (authLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[color:var(--mm-muted)]" aria-label="불러오는 중" /></div>
  }
  if (!data.enabled) {
    return <EmptyState icon={Wallet} title="이 팀은 월렛을 쓰지 않아요" framed />
  }

  const name = data.name ?? '월렛'
  const me = data.me
  const rules = data.rules
  const pending = me?.requests.find(r => r.status === 'pending') ?? null
  const activeTickets = me?.tickets.filter(t => t.status === 'active') ?? []
  const nonRegularLeft = activeTickets.filter(t => t.kind === 'non_regular').length
  const ownedMonths = new Set(activeTickets.filter(t => t.kind === 'regular_pass').map(t => t.month)
    .concat((me?.tickets ?? []).filter(t => t.kind === 'regular_pass' && t.status === 'used').map(t => t.month)))
  const typedAmount = Number(amount || 0)
  const previewBonus = bonusOf(typedAmount, rules)

  async function post(body: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '처리하지 못했어요'); return false }
      toast.success(ok)
      await load()
      return true
    } finally { setBusy(false) }
  }

  async function submitCharge() {
    if (!Number.isInteger(typedAmount) || typedAmount <= 0) { toast.error('금액을 숫자로 적어 주세요'); return }
    if (!depositor.trim()) { toast.error('입금자명을 적어 주세요'); return }
    const got = typedAmount + bonusOf(typedAmount, rules)
    if (await post({ action: 'charge', amount: typedAmount, depositor_name: depositor.trim() },
      `충전 요청을 보냈어요. 어드민이 입금을 확인하면 ${fmtP(got)}가 들어와요`)) setAmount('')
  }

  async function buyRegular(month: string) {
    const price = rules?.regular_pass_price ?? 0
    if (!confirm(`정규권 ${monthLabel(month)} — ${fmtP(price)}\n포인트로 살까요?`)) return
    await post({ action: 'buy', kind: 'regular_pass', month }, `정규권 ${monthLabel(month)}을 샀어요`)
  }

  async function buyNonRegular() {
    const price = (rules?.non_regular_price ?? 0) * qty
    if (!confirm(`비정규 티켓 ${qty}장 — ${fmtP(price)}\n포인트로 살까요?`)) return
    if (await post({ action: 'buy', kind: 'non_regular', qty }, `비정규 티켓 ${qty}장을 샀어요`)) setQty(1)
  }

  async function requestRefund() {
    if (!me) return
    if (!refundHolder.trim() || !refundAccount.trim()) { toast.error('받을 계좌와 예금주를 적어 주세요'); return }
    const lost = me.balance - me.refundable
    if (!confirm(`${me.refundable.toLocaleString()}원 환불을 요청할까요?${lost > 0 ? `\n환불하면 남은 ${fmtP(lost)}(보너스 등)는 사라지고 잔액이 0P 가 돼요.` : ''}`)) return
    await post({ action: 'refund', holder: refundHolder.trim(), account: refundAccount.trim() },
      '환불 요청을 보냈어요. 어드민이 송금하면 알려 드려요')
  }

  async function cancel(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`${api}?requestId=${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(j.error ?? '취소하지 못했어요')
      else toast.success('요청을 취소했어요')
      await load()
    } finally { setBusy(false) }
  }

  function copyBank() {
    if (!data?.bank) return
    const digits = data.bank.match(/[\d-]{8,}/)?.[0] ?? data.bank
    navigator.clipboard?.writeText(digits).then(() => toast.success('계좌번호를 복사했어요'), () => {})
  }

  const chip = (selected: boolean) => ({
    borderColor: selected ? 'var(--mm-ink)' : 'var(--mm-rule)',
    background: selected ? 'var(--mm-yellow)' : 'var(--mm-panel)',
    color: selected ? 'var(--mm-black)' : 'var(--mm-ink)',
  })

  return (
    <div className="space-y-3 lg:space-y-4 max-w-lg lg:max-w-4xl lg:mx-auto">
      <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">{name}</h2>

      {!me ? (
        user ? <EmptyState icon={Wallet} title="가입 승인 후에 쓸 수 있어요" framed /> : <LoginTeaser />
      ) : (
        <div className="grid gap-3 lg:gap-4 lg:grid-cols-2 lg:items-start">
          <div className="space-y-3 lg:space-y-4 min-w-0">
            {/* 잔액 */}
            <SectionCard variant="standalone">
              <div className="text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>내 포인트</div>
              <div className="font-black text-[40px] leading-tight tabular-nums" style={{ color: 'var(--mm-ink)' }}>{fmtP(me.balance)}</div>
              <div className="text-xs mt-1 space-y-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
                <div>보유 티켓 · 비정규 {nonRegularLeft}장{activeTickets.some(t => t.kind === 'regular_pass') ? ` · 정규권 ${activeTickets.filter(t => t.kind === 'regular_pass').map(t => monthLabel(t.month!)).join(', ')}` : ''}</div>
                <div>지금 환불받을 수 있는 돈 {me.refundable.toLocaleString()}원 · 유효기간 없음</div>
              </div>
            </SectionCard>

            {/* 티켓 사기 */}
            <SectionCard variant="standalone">
              <h3 className="font-black text-lg mb-2 inline-flex items-center gap-2" style={{ color: 'var(--mm-ink)' }}><Ticket size={18} aria-hidden />티켓 사기</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>정규권 <span className="font-normal" style={{ color: 'var(--mm-muted)' }}>· 한 달 {fmtP(rules?.regular_pass_price ?? 0)}</span></div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {(data.months ?? []).map(m => {
                      const owned = ownedMonths.has(m)
                      return (
                        <button
                          key={m} type="button" disabled={busy || owned} onClick={() => buyRegular(m)}
                          className="mm-press min-h-11 px-3 text-sm font-bold border disabled:opacity-60"
                          style={chip(false)}
                        >{monthLabel(m)} {owned ? '· 있음' : '사기'}</button>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>비정규 티켓 <span className="font-normal" style={{ color: 'var(--mm-muted)' }}>· 1회 {fmtP(rules?.non_regular_price ?? 0)} · 팀에 배치될 때 한 장씩 써요</span></div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <div className="inline-flex items-center border border-[color:var(--mm-rule)]">
                      <button type="button" aria-label="한 장 빼기" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))} className="mm-press w-11 h-11 inline-flex items-center justify-center disabled:opacity-40"><Minus size={16} /></button>
                      <span className="w-10 text-center font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{qty}</span>
                      <button type="button" aria-label="한 장 더하기" disabled={qty >= 10} onClick={() => setQty(q => Math.min(10, q + 1))} className="mm-press w-11 h-11 inline-flex items-center justify-center disabled:opacity-40"><Plus size={16} /></button>
                    </div>
                    <button type="button" disabled={busy} onClick={buyNonRegular} className="mm-press flex-1 min-h-11 px-3 font-black disabled:opacity-50" style={BTN_PRIMARY}>
                      {qty}장 사기 · {fmtP((rules?.non_regular_price ?? 0) * qty)}
                    </button>
                  </div>
                </div>
                <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>한 달에 2번 이상 나온다면 정규권이 더 싸요.</p>
              </div>
            </SectionCard>

            {/* 충전 */}
            <SectionCard variant="standalone">
              <h3 className="font-black text-lg mb-2" style={{ color: 'var(--mm-ink)' }}>충전하기</h3>
              {rules?.bonus_min != null && rules.bonus_pct > 0 && (
                <p className="text-sm font-bold mb-2 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', border: '1px solid var(--mm-yellow-strong)' }}>
                  {(rules.bonus_min / 10000).toLocaleString()}만원 이상 충전하면 {rules.bonus_pct}% 보너스! 5만원 → {fmtP(50000 + bonusOf(50000, rules))} · 10만원 → {fmtP(100000 + bonusOf(100000, rules))}
                </p>
              )}
              {pending ? (
                <div className="space-y-2">
                  <p className="text-sm" style={{ color: 'var(--mm-ink)' }}>
                    {pending.kind === 'refund'
                      ? <>환불 <b className="tabular-nums">{pending.amount.toLocaleString()}원</b> 요청을 어드민이 처리하고 있어요.</>
                      : <><b className="tabular-nums">{pending.amount.toLocaleString()}원</b> 충전 요청을 어드민이 확인하고 있어요 (입금자 {pending.depositor_name}).</>}
                    {' '}요청은 하나씩만 보낼 수 있어요.
                  </p>
                  <button
                    type="button" disabled={busy} onClick={() => cancel(pending.id)}
                    className="mm-press inline-flex items-center gap-1 min-h-11 px-3 text-sm font-bold border border-[color:var(--mm-rule)]"
                    style={{ color: 'var(--mm-ink)' }}
                  ><X size={16} aria-hidden />요청 취소</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <ol className="text-sm space-y-1 list-decimal pl-5" style={{ color: 'var(--mm-ink-soft)' }}>
                    <li>아래 계좌로 입금해요</li>
                    <li>입금한 금액과 입금자명을 적어 요청을 보내요</li>
                    <li>어드민이 통장을 확인하면 포인트가 들어와요</li>
                  </ol>
                  {data.bank && (
                    <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2" style={{ background: 'var(--mm-panel-alt)' }}>
                      <span className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{data.bank}</span>
                      <button type="button" onClick={copyBank} className="mm-press inline-flex items-center gap-1 min-h-11 px-2 text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                        <Copy size={16} aria-hidden />복사
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {QUICK.map(q => (
                      <button key={q} type="button" onClick={() => setAmount(String(q))} className="mm-press min-h-11 px-2 text-sm font-bold border" style={chip(typedAmount === q)}>
                        {(q / 10000).toLocaleString()}만원
                      </button>
                    ))}
                  </div>
                  <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                    입금한 금액(원)
                    <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))} className={`${INPUT} tabular-nums`} placeholder="예: 50000" />
                  </label>
                  {typedAmount > 0 && (
                    <p className="text-sm" style={{ color: 'var(--mm-ink)' }}>
                      들어올 포인트 <b className="tabular-nums">{fmtP(typedAmount + previewBonus)}</b>
                      {previewBonus > 0 ? ` (보너스 ${fmtP(previewBonus)} 포함)` : ''}
                    </p>
                  )}
                  <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                    입금자명 (통장에 찍힌 이름)
                    <input value={depositor} onChange={e => setDepositor(e.target.value)} maxLength={40} className={INPUT} />
                  </label>
                  <button type="button" disabled={busy || !amount} onClick={submitCharge} className="mm-press w-full min-h-12 font-black disabled:opacity-50" style={BTN_PRIMARY}>
                    {busy ? '보내는 중' : '충전 요청 보내기'}
                  </button>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-3 lg:space-y-4 min-w-0">
            {/* 내역 */}
            <SectionCard variant="standalone">
              <SegmentedTabs
                ariaLabel="월렛 내역" value={tab} onChange={setTab} fullWidth size="sm"
                items={[{ key: 'ledger', label: '포인트 내역' }, { key: 'requests', label: '충전·환불 요청' }, { key: 'tickets', label: '티켓' }]}
              />
              <div className="mt-3">
                {tab === 'ledger' ? <LedgerList rows={me.ledger} /> : tab === 'requests' ? <RequestList rows={me.requests} /> : <TicketList rows={me.tickets} />}
              </div>
            </SectionCard>

            {/* 환불 */}
            <SectionCard variant="standalone">
              <details>
                <summary className="min-h-11 flex items-center justify-between gap-2 cursor-pointer font-black text-lg" style={{ color: 'var(--mm-ink)' }}>
                  환불
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>지금 {me.refundable.toLocaleString()}원</span>
                </summary>
                <div className="mt-2 space-y-3">
                  <div className="text-sm space-y-2" style={{ color: 'var(--mm-ink-soft)' }}>
                    <p>보유하고 있는 포인트에 대해 환불 요청을 하면 환불해 드려요. 단, <b style={{ color: 'var(--mm-ink)' }}>보너스 포인트는 빼고</b> 정산해요.</p>
                    <div className="p-3 space-y-2" style={{ background: 'var(--mm-panel-alt)' }}>
                      <div>
                        <b style={{ color: 'var(--mm-ink)' }}>예시 1)</b> 5만원 충전 → 55,000P → 12,000P 사용 → 43,000P 보유
                        <div className="font-bold" style={{ color: 'var(--mm-ink)' }}>환불 50,000 − 12,000 = 38,000원 (보너스 5,000P 제외)</div>
                      </div>
                      <div>
                        <b style={{ color: 'var(--mm-ink)' }}>예시 2)</b> 10만원 충전 → 110,000P → 105,000P 사용 → 5,000P 보유
                        <div className="font-bold" style={{ color: 'var(--mm-ink)' }}>환불 100,000 − 105,000 = −5,000원 → 환불 금액 없음</div>
                      </div>
                    </div>
                    <p>환불하면 남은 포인트(보너스 등)는 모두 사라지고 잔액이 0P 가 돼요.</p>
                  </div>
                  {me.refundable > 0 && !pending ? (
                    <div className="space-y-2">
                      <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                        받을 계좌 (은행 · 계좌번호)
                        <input value={refundAccount} onChange={e => setRefundAccount(e.target.value)} maxLength={80} className={INPUT} placeholder="예: 카카오뱅크 3333-00-0000000" />
                      </label>
                      <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                        예금주
                        <input value={refundHolder} onChange={e => setRefundHolder(e.target.value)} maxLength={40} className={INPUT} />
                      </label>
                      <button type="button" disabled={busy} onClick={requestRefund} className="mm-press w-full min-h-11 font-black disabled:opacity-50" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}>
                        {me.refundable.toLocaleString()}원 환불 요청
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
                      {pending ? '확인을 기다리는 요청이 있어 지금은 환불을 요청할 수 없어요.' : '지금은 환불받을 금액이 없어요.'}
                    </p>
                  )}
                </div>
              </details>
            </SectionCard>
          </div>
        </div>
      )}

      {isEditMode && <WalletAdminPanel leagueId={leagueId} onChanged={load} />}
    </div>
  )
}
