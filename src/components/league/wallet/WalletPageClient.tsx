'use client'
// 미라클 월렛 화면 (2026-11-09 운영진 · 토스 포인트/쿠폰함/거래내역 화면 참고로 다시 짬)
//   맨 위 「내 월렛 | 어드민」 — 어드민 일은 따로 탭(선수이자 어드민인 사람이 헷갈리지 않게). 어드민 탭은 운영진에게만.
//   내 월렛 = ① 포인트 카드(잔액 · 충전 · 환불 — 둘 다 창으로 열림) ② 내 티켓(정규권 = 검정·금색 카드, 비정규 = 노란 표 한 장씩) + 「티켓 사기」 창
//            ③ 내역 하나(포인트 · 티켓 · 요청을 한 줄 목록으로, 칩으로 거르기).
//   금액 계산(보너스·환불 가능액·티켓 가격)은 서버 DB 함수가 정본이다 — 화면은 미리보기만 한다.
import { stripReservedDepositor } from '@/lib/wallet/depositorName'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Wallet, Copy, Loader2, X, Minus, Plus, Ticket, Crown, ArrowDownLeft, ArrowUpRight, Clock, RotateCcw } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { usePendingCharges } from '@/lib/hooks/usePendingCharges'
import SectionCard from '@/components/league/ui/SectionCard'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import Sheet from '@/components/league/ui/Sheet'
import EmptyState from '@/components/league/ui/EmptyState'
import { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import WalletAdminPanel from './WalletAdminPanel'
import {
  KIND_LABEL, STATUS_LABEL, fmtP, fmtSigned, monthLabel, Pager, pageSlice,
  type LedgerItem, type RequestItem, type TicketItem,
} from './walletParts'

interface Rules { bonus_min: number | null; bonus_pct: number; regular_pass_price: number | null; non_regular_price: number | null }

interface WalletRes {
  enabled: boolean
  name?: string
  bank?: string | null
  rules?: Rules
  months?: [string, string]
  /** 정규권 판매(134) — 운영진이 연 기간 · 정원 안에서만 산다 */
  pass_sales?: PassSaleLite[]
  /** 카카오뱅크 입금 알림 연결 — 입금만 하면 자동 충전(129) */
  auto_charge?: boolean
  /** 운영진(팀 어드민)은 정규권 무료(136) */
  pass_free?: boolean
  me?: { balance: number; refundable: number; ledger: LedgerItem[]; requests: RequestItem[]; tickets: TicketItem[] } | null
}

type PassSaleLite = { month: string; opens_at: string; closes_at: string; capacity: number; sold: number; state: 'upcoming' | 'open' | 'closed' }
/** 11/25(화) 10:00 */
function whenKst(iso: string): string {
  const d = new Date(iso)
  const md = d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).replace(/\.\s*/g, '/').replace(/\/$/, '')
  const wd = d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', weekday: 'short' })
  const hm = d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${md}(${wd}) ${hm}`
}
/** 정규권 판매 상태 한 줄 */
function saleLine(s: PassSaleLite | undefined): string {
  if (!s) return '판매 전'
  if (s.state === 'upcoming') return `${whenKst(s.opens_at)} 판매 시작`
  if (s.state === 'closed' || s.sold >= s.capacity) return '판매 마감'
  return `판매 중 · 남은 자리 ${s.capacity - s.sold}`
}

const QUICK = [10_000, 30_000, 50_000, 100_000]
const GREEN = '#059669'
const GOLD = '#D4AF37'

function bonusOf(amount: number, r?: Rules): number {
  if (!r || r.bonus_min == null || amount < r.bonus_min) return 0
  return Math.floor(amount * r.bonus_pct / 100)
}

const BTN_PRIMARY = { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }
const BTN_GHOST = { background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }
const INPUT = 'mt-1 w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base'
/** 11월 · 12월 */
const mon = (m: string) => `${Number(m.slice(5, 7))}월`

// ── 티켓 그림 ────────────────────────────────────────────────
/** 정규권 — 검정 바탕 + 금색 테두리·왕관(비정규보다 고급스럽게, 2026-11-09 운영진) */
function RegularPassCard({ month, owned, onBuy, sale }: { month: string; owned: boolean; onBuy?: () => void; sale?: PassSaleLite }) {
  if (!owned) {
    // 정규권은 운영진이 판매를 열 때만(2026-11-10) — 판매 중일 때만 누를 수 있다
    const open = sale?.state === 'open' && sale.sold < sale.capacity
    return (
      <button type="button" onClick={open ? onBuy : undefined} disabled={!open}
        className="mm-press flex flex-col items-start justify-between p-3 min-h-[84px] text-left disabled:cursor-default"
        style={{ border: `1.5px dashed ${open ? GOLD : 'var(--mm-rule)'}`, borderRadius: 'var(--mm-radius-card)', color: 'var(--mm-muted)' }}>
        <span className="inline-flex items-center gap-1 text-xs font-bold"><Crown size={14} aria-hidden />{mon(month)} 정규권</span>
        <span className="text-sm font-black break-keep" style={{ color: open ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>{open ? `${saleLine(sale)} · 사기` : saleLine(sale)}</span>
      </button>
    )
  }
  return (
    <div className="relative flex flex-col justify-between p-3 min-h-[84px] overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #141414 0%, #2a2a2a 55%, #3b3115 100%)', border: `1.5px solid ${GOLD}`, borderRadius: 'var(--mm-radius-card)', color: '#fff' }}
      aria-label={`${monthLabel(month)} 정규권 있음`}>
      <span aria-hidden className="absolute -right-3 -top-3 w-16 h-16 rounded-full" style={{ background: `radial-gradient(circle, ${GOLD}55, transparent 70%)` }} />
      <span className="inline-flex items-center gap-1 text-xs font-black" style={{ color: GOLD }}><Crown size={14} strokeWidth={2.5} aria-hidden />정규권</span>
      <span className="text-xl font-black leading-none">{mon(month)}</span>
    </div>
  )
}

/** 비정규 티켓 한 장 — 노란 표(양옆 홈) */
function NonRegularStub() {
  return (
    <span aria-hidden className="relative inline-flex items-center justify-center w-9 h-6"
      style={{ background: 'var(--mm-yellow)', border: '1px solid var(--mm-black)', borderRadius: 4 }}>
      {/* 양옆 반원 홈 — 바탕(비정규 칸 색)으로 칠해 파낸 것처럼 */}
      <span className="absolute -left-[4px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: 'var(--mm-panel-alt)', borderRight: '1px solid var(--mm-black)' }} />
      <span className="absolute -right-[4px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ background: 'var(--mm-panel-alt)', borderLeft: '1px solid var(--mm-black)' }} />
      <Ticket size={13} strokeWidth={2.5} style={{ color: 'var(--mm-black)' }} />
    </span>
  )
}

// ── 내역 한 줄(포인트 · 티켓 · 요청을 한 목록으로) ────────────────
type Filter = 'all' | 'point' | 'ticket' | 'request'
interface Row {
  id: string
  at: string
  group: 'point' | 'ticket' | 'request'
  title: string
  sub: string | null
  right: string
  rightColor: string
  under: string | null
  chip?: { label: string; bg: string; fg: string }
  tone: 'in' | 'out' | 'ticket' | 'pass' | 'wait'
}

const REQ_CHIP: Record<RequestItem['status'], { bg: string; fg: string }> = {
  pending: { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },
  approved: { bg: GREEN, fg: '#fff' },
  rejected: { bg: '#C4362B', fg: '#fff' },
  cancelled: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)' },
}

function buildRows(ledger: LedgerItem[], requests: RequestItem[], tickets: TicketItem[]): Row[] {
  const rows: Row[] = []
  for (const l of ledger) {
    rows.push({
      id: `l-${l.id}`, at: l.created_at, group: 'point',
      title: l.memo?.startsWith('게스트비 돌려받음') ? '게스트비 돌려받음' : l.memo?.startsWith('게스트비') ? '게스트비' :
        l.kind === 'purchase' && l.memo?.startsWith('정규권') ? '정규권 구매' : l.kind === 'purchase' && l.memo?.includes('비정규') ? '비정규 티켓 구매' : KIND_LABEL[l.kind], sub: l.memo,
      right: fmtSigned(l.amount), rightColor: l.amount > 0 ? GREEN : 'var(--mm-ink)', under: `잔액 ${fmtP(l.balance_after)}`,
      // 티켓을 사고 돌려받은 줄은 종류 그림으로(정규권 = 왕관 · 비정규 = 표) — 2026-11-09 운영진(둘이 같아 헷갈렸다)
      tone: (l.kind === 'purchase' || l.kind === 'refund') && l.memo?.startsWith('정규권') ? 'pass'
        : (l.kind === 'purchase' || l.kind === 'refund') && l.memo?.includes('비정규') ? 'ticket'
          : l.amount > 0 ? 'in' : 'out',
    })
  }
  // 승인된 요청은 장부(충전·환불 송금)에 이미 있다 — 기다리는 것·반려·취소만 요청으로 보인다.
  for (const r of requests) {
    if (r.status === 'approved') continue
    rows.push({
      id: `r-${r.id}`, at: r.created_at, group: 'request', title: r.kind === 'refund' ? '환불 요청' : '충전 요청',
      sub: [r.kind === 'refund' ? `${r.refund_account ?? ''} (${r.depositor_name})` : `입금자 ${r.depositor_name}`, r.admin_note].filter(Boolean).join(' · '),
      right: `${r.amount.toLocaleString()}원`, rightColor: 'var(--mm-ink-soft)', under: null,
      chip: { label: STATUS_LABEL[r.status], ...REQ_CHIP[r.status] }, tone: 'wait',
    })
  }
  for (const t of tickets) {
    const name = t.kind === 'regular_pass' && t.month ? `${monthLabel(t.month)} 정규권` : '비정규 티켓'
    const tt: Row['tone'] = t.kind === 'regular_pass' ? 'pass' : 'ticket'
    rows.push({ id: `tb-${t.id}`, at: t.created_at, group: 'ticket', title: `${name} 구매`, sub: null, right: fmtP(t.price), rightColor: 'var(--mm-ink-soft)', under: null, tone: tt })
    if (t.status === 'used' && t.used_date) {
      rows.push({ id: `tu-${t.id}`, at: `${t.used_date}T12:00:00+09:00`, group: 'ticket', title: `${name} 사용`, sub: t.used_note, right: '1장', rightColor: 'var(--mm-ink)', under: null, tone: tt })
    }
    if (t.status === 'returned') {
      rows.push({ id: `tr-${t.id}`, at: t.created_at, group: 'ticket', title: `${name} 돌려받음`, sub: [t.returned_by_label, t.returned_note].filter(Boolean).join(' · ') || null, right: `+${fmtP(t.price)}`, rightColor: GREEN, under: null, tone: tt })
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at))
}

const kstDay = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }).replace(/\.\s?/g, '.').replace(/\.$/, '')
const kstTime = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })

function RowIcon({ tone }: { tone: Row['tone'] }) {
  const map = {
    in: { Icon: ArrowDownLeft, bg: '#05966918', fg: GREEN },
    out: { Icon: ArrowUpRight, bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)' },
    ticket: { Icon: Ticket, bg: 'var(--mm-yellow-soft)', fg: 'var(--mm-ink)' },
    pass: { Icon: Crown, bg: '#1a1a1a', fg: GOLD },
    wait: { Icon: Clock, bg: 'var(--mm-panel-alt)', fg: 'var(--mm-muted)' },
  }[tone]
  return (
    <span aria-hidden className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full" style={{ background: map.bg, color: map.fg }}>
      <map.Icon size={17} strokeWidth={2.4} />
    </span>
  )
}

const FIRST = 8

function History({ rows, fill = false }: { rows: Row[]; fill?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const shown = filter === 'all' ? rows.filter(r => !(r.group === 'ticket' && r.title.endsWith('구매'))) : rows.filter(r => r.group === filter)
  const waiting = rows.filter(r => r.chip?.label === STATUS_LABEL.pending).length
  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: '전체' }, { key: 'point', label: '포인트' }, { key: 'ticket', label: '티켓' },
    { key: 'request', label: waiting > 0 ? `요청 ${waiting}` : '요청' },
  ]
  return (
    <SectionCard variant="standalone" className={fill ? 'lg:h-full lg:flex lg:flex-col' : ''}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>내역</h3>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="내역 거르기">
          {chips.map(c => (
            <button key={c.key} type="button" aria-pressed={filter === c.key} onClick={() => { setFilter(c.key); setPage(0) }}
              className="mm-press min-h-9 px-3 text-sm font-bold"
              style={{ background: filter === c.key ? 'var(--mm-ink)' : 'var(--mm-panel-alt)', color: filter === c.key ? 'var(--mm-panel)' : 'var(--mm-ink-soft)', borderRadius: 999 }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <div className="py-6 text-center text-sm" style={{ color: 'var(--mm-muted)' }}>아직 내역이 없어요</div>
      ) : (
        <ul className={`mt-1 ${fill ? 'lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1' : ''}`}>
          {pageSlice(shown, page, FIRST).map((r, i, arr) => {
            const day = kstDay(r.at)
            const newDay = i === 0 || kstDay(arr[i - 1].at) !== day
            return (
              <li key={r.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: i === 0 ? undefined : '1px solid var(--mm-rule)' }}>
                <span className="shrink-0 w-9 text-xs font-bold tabular-nums" style={{ color: newDay ? 'var(--mm-ink-soft)' : 'transparent' }}>{day}</span>
                <RowIcon tone={r.tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{r.title}</span>
                    {r.chip && <span className="inline-flex items-center px-1.5 text-[11px] font-black" style={{ background: r.chip.bg, color: r.chip.fg, borderRadius: 'var(--mm-radius-chip)' }}>{r.chip.label}</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{kstTime(r.at)}{r.sub ? ` · ${r.sub}` : ''}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-black tabular-nums text-sm" style={{ color: r.rightColor }}>{r.right}</div>
                  {r.under && <div className="text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>{r.under}</div>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <Pager page={page} total={shown.length} size={FIRST} onChange={setPage} />
    </SectionCard>
  )
}

// ── 화면 ────────────────────────────────────────────────────
export default function WalletPageClient({ leagueId, initialTab = 'me' }: { leagueId: string; initialTab?: 'me' | 'admin' }) {
  const { user, loading: authLoading } = useCurrentUser()
  const { isEditMode } = useLeagueEditMode()
  const pendingCount = usePendingCharges(leagueId)
  const [data, setData] = useState<WalletRes | null>(null)
  const [view, setView] = useState<'me' | 'admin'>(initialTab)
  const [sheet, setSheet] = useState<null | 'charge' | 'refund' | 'buy'>(null)
  const [buyKind, setBuyKind] = useState<'regular_pass' | 'non_regular'>('regular_pass')
  const [buyMonth, setBuyMonth] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [depositor, setDepositor] = useState('')
  const [qty, setQty] = useState(1)
  const [refundHolder, setRefundHolder] = useState('')
  const [refundBank, setRefundBank] = useState('')
  const [refundAccount, setRefundAccount] = useState('')
  const [busy, setBusy] = useState(false)
  const [otherName, setOtherName] = useState(false)
  const [useDiscount, setUseDiscount] = useState(true)

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

  const me = data?.me ?? null
  const rows = useMemo(() => me ? buildRows(me.ledger, me.requests, me.tickets) : [], [me])

  if (authLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[color:var(--mm-muted)]" aria-label="불러오는 중" /></div>
  }
  if (!data.enabled) {
    return <EmptyState icon={Wallet} title="이 팀은 월렛을 쓰지 않아요" framed />
  }

  const name = data.name ?? '월렛'
  const rules = data.rules
  const months = data.months ?? []
  const sales = data.pass_sales ?? []
  const saleOf = (m: string) => sales.find(x => x.month === m)
  const ownedMonthsPre = new Set((me?.tickets ?? []).filter(t => t.kind === 'regular_pass' && (t.status === 'active' || t.status === 'used')).map(t => t.month))
  /** 지금 살 수 있는 달 — 판매 중 · 자리 있음 · 아직 없음 */
  const openMonths = sales.filter(x => x.state === 'open' && x.sold < x.capacity && !ownedMonthsPre.has(x.month)).map(x => x.month)
  // 판매 중인 달이 이번 달·다음 달 밖이면(드묾) 카드 칸에 더한다
  const cardMonths = [...new Set([...months, ...openMonths])].sort()
  const pending = me?.requests.find(r => r.status === 'pending') ?? null
  const activeTickets = me?.tickets.filter(t => t.status === 'active') ?? []
  const nonRegularLeft = activeTickets.filter(t => t.kind === 'non_regular').length
  const ownedMonths = new Set((me?.tickets ?? []).filter(t => t.kind === 'regular_pass' && (t.status === 'active' || t.status === 'used')).map(t => t.month))
  const typedAmount = Number(amount || 0)
  const previewBonus = bonusOf(typedAmount, rules)
  const regPrice = rules?.regular_pass_price ?? 0
  const nrPrice = rules?.non_regular_price ?? 0
  // 남은 비정규 티켓으로 정규권 할인(2026-11-10 운영진) — 장당 비정규 값, 정규권 값을 넘지 않게
  const passFree = !!data.pass_free
  const discountN = buyKind === 'regular_pass' && !passFree && useDiscount && nrPrice > 0 ? Math.min(nonRegularLeft, Math.floor(regPrice / nrPrice)) : 0
  const buyPrice = buyKind === 'regular_pass' ? (passFree ? 0 : regPrice - discountN * nrPrice) : nrPrice * qty
  const afterBuy = (me?.balance ?? 0) - buyPrice
  const buyable = buyKind === 'regular_pass' ? !!buyMonth && openMonths.includes(buyMonth) : qty >= 1

  async function post(body: Record<string, unknown>, ok: string): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '처리하지 못했어요'); return false }
      // 입금이 먼저 와 있어 바로 승인됐으면 그렇게 알린다(2026-11-10 리뷰 — 늘 「어드민이 확인하면」이라고 떴다)
      toast.success(j.auto_approved ? '입금이 확인돼 바로 충전됐어요' : ok)
      await load()
      return true
    } finally { setBusy(false) }
  }

  async function submitCharge() {
    if (!Number.isInteger(typedAmount) || typedAmount <= 0) { toast.error('금액을 숫자로 적어 주세요'); return }
    if (!depositor.trim()) { toast.error('입금자명을 적어 주세요'); return }
    const got = typedAmount + bonusOf(typedAmount, rules)
    if (await post({ action: 'charge', amount: typedAmount, depositor_name: depositor.trim() },
      `충전 요청을 보냈어요. 어드민이 입금을 확인하면 ${fmtP(got)}가 들어와요`)) { setAmount(''); setSheet(null) }
  }

  async function submitBuy() {
    if (buyKind === 'regular_pass') {
      setBusy(true)
      try {
        const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'buy', kind: 'regular_pass', month: buyMonth, useTickets: discountN }) })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(j.error ?? '사지 못했어요'); await load(); return }
        // 전 달 정규였으면 같은 팀으로 자동 배정(서버) — 결과를 그대로 알린다
        const team = j.team_name ? (j.assigned === 'auto' ? `지난달처럼 ${j.team_name}팀이에요` : `${j.team_name}팀이에요`) : '팀은 운영진이 정해요'
        toast.success(`${monthLabel(buyMonth!)} 정규권을 ${j.free ? '받았어요(운영진 무료)' : '샀어요'} — ${team}`)
        await load()
        setSheet(null)
      } finally { setBusy(false) }
      return
    }
    const ok = await post({ action: 'buy', kind: 'non_regular', qty }, `비정규 티켓 ${qty}장을 샀어요`)
    if (ok) { setQty(1); setSheet(null) }
  }

  async function requestRefund() {
    if (!me) return
    const acct = refundAccount.replace(/[^\d-]/g, '')
    if (!refundBank.trim() || !acct || !refundHolder.trim()) { toast.error('은행 · 계좌번호 · 예금주를 모두 적어 주세요'); return }
    if (acct.replace(/-/g, '').length < 8) { toast.error('계좌번호를 다시 확인해 주세요'); return }
    const lost = me.balance - me.refundable
    if (!confirm(`${me.refundable.toLocaleString()}원 환불을 요청할까요?${lost > 0 ? `\n환불하면 남은 ${fmtP(lost)}(보너스 등)는 사라지고 잔액이 0P 가 돼요.` : ''}`)) return
    if (await post({ action: 'refund', holder: refundHolder.trim(), account: `${refundBank.trim()} ${acct}` },
      '환불 요청을 보냈어요. 어드민이 송금하면 내역에 보여요')) setSheet(null)
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

  function openBuy(kind: 'regular_pass' | 'non_regular', month?: string) {
    setBuyKind(kind)
    setBuyMonth(month ?? openMonths[0] ?? null)
    setUseDiscount(true)
    setSheet('buy')
  }

  const chip = (selected: boolean) => ({
    borderColor: selected ? 'var(--mm-ink)' : 'var(--mm-rule)',
    background: selected ? 'var(--mm-yellow)' : 'var(--mm-panel)',
    color: selected ? 'var(--mm-black)' : 'var(--mm-ink)',
    borderRadius: 'var(--mm-radius-ctl)',
  })

  return (
    <div className="space-y-3 max-w-lg lg:max-w-4xl lg:mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">{name}</h2>
        {isEditMode && (
          <SegmentedTabs ariaLabel="월렛 보기" value={view} onChange={setView} size="sm"
            items={[{ key: 'me', label: '내 월렛' }, { key: 'admin', label: '어드민', count: pendingCount }]} />
        )}
      </div>

      {view === 'admin' && isEditMode ? (
        <WalletAdminPanel leagueId={leagueId} onChanged={load} />
      ) : !me ? (
        user ? <EmptyState icon={Wallet} title="가입 승인 후에 쓸 수 있어요" framed /> : <LoginTeaser />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
          <div className="space-y-3 min-w-0">
            {/* ① 포인트 — 토스 「내 포인트」처럼: 작은 이름표 + 큰 숫자 + 오른쪽 버튼 */}
            <SectionCard variant="standalone">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>내 포인트</div>
                  <div className="font-black text-[36px] leading-tight tabular-nums" style={{ color: 'var(--mm-ink)' }}>{fmtP(me.balance)}</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => setSheet('refund')} className="mm-press min-h-11 px-3 text-sm font-bold" style={BTN_GHOST}>환불</button>
                  <button type="button" onClick={() => setSheet('charge')} className="mm-press min-h-11 px-4 text-sm font-black" style={BTN_PRIMARY}>충전</button>
                </div>
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--mm-ink-soft)' }}>환불 가능 {me.refundable.toLocaleString()}원 · 유효기간 없음</div>
              {pending && (
                <div className="mt-2 flex items-center justify-between gap-2 px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <span className="text-sm min-w-0" style={{ color: 'var(--mm-ink)' }}>
                    <Clock size={14} aria-hidden className="inline -mt-0.5 mr-1" />
                    {pending.kind === 'refund' ? '환불' : '충전'} <b className="tabular-nums">{pending.amount.toLocaleString()}원</b> 확인 중
                  </span>
                  <button type="button" disabled={busy} onClick={() => cancel(pending.id)}
                    className="mm-press shrink-0 inline-flex items-center gap-0.5 min-h-9 px-2 text-xs font-bold underline" style={{ color: 'var(--mm-ink-soft)' }}>
                    <X size={13} aria-hidden />취소
                  </button>
                </div>
              )}
            </SectionCard>

            {/* ② 내 티켓 — 한눈에(정규권 카드 · 비정규 표 장수) */}
            <SectionCard variant="standalone">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>내 티켓</h3>
                <button type="button" onClick={() => openBuy(openMonths.length > 0 ? 'regular_pass' : 'non_regular')}
                  className="mm-press min-h-9 px-3 text-sm font-black inline-flex items-center gap-1" style={BTN_PRIMARY}>
                  <Plus size={15} aria-hidden />티켓 사기
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {cardMonths.map(m => <RegularPassCard key={m} month={m} owned={ownedMonths.has(m)} sale={saleOf(m)} onBuy={() => openBuy('regular_pass', m)} />)}
              </div>
              <button type="button" onClick={() => openBuy('non_regular')}
                className="mm-press mt-2 w-full flex items-center justify-between gap-2 p-3 text-left"
                style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-card)' }}>
                <span className="min-w-0">
                  <span className="block text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>비정규 티켓 · 팀에 배치될 때 1장</span>
                  {nonRegularLeft > 0 ? (
                    <span className="mt-1.5 flex flex-wrap items-center gap-2" aria-label={`비정규 티켓 ${nonRegularLeft}장`}>
                      {Array.from({ length: Math.min(nonRegularLeft, 8) }).map((_, i) => <NonRegularStub key={i} />)}
                      {nonRegularLeft > 8 && <span className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>+{nonRegularLeft - 8}</span>}
                    </span>
                  ) : (
                    <span className="block mt-0.5 text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>없음 · 사기</span>
                  )}
                </span>
                <span className="shrink-0 font-black text-2xl tabular-nums" style={{ color: 'var(--mm-ink)' }}>{nonRegularLeft}<span className="text-sm font-bold">장</span></span>
              </button>
            </SectionCard>
          </div>

          {/* ③ 내역 하나 */}
          {/* 내역 — PC 에서는 왼쪽(포인트·티켓) 칸과 같은 높이로 맞추고 안에서 넘긴다(2026-11-09 운영진 — 내역만 세로로 길었다) */}
          <div className="min-w-0 lg:relative">
            <div className="lg:absolute lg:inset-0"><History rows={rows} fill /></div>
          </div>
        </div>
      )}

      {/* ── 창: 티켓 사기 — 고르기 한 번 + 사기 버튼 하나 ── */}
      <Sheet open={sheet === 'buy'} onClose={() => setSheet(null)} title="티켓 사기" width="md">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="티켓 종류">
            <button type="button" role="radio" aria-checked={buyKind === 'regular_pass'} onClick={() => { setBuyKind('regular_pass'); if (!buyMonth || !openMonths.includes(buyMonth)) setBuyMonth(openMonths[0] ?? null) }}
              className="mm-press p-3 text-left"
              style={buyKind === 'regular_pass'
                ? { background: 'linear-gradient(135deg, #141414, #3b3115)', border: `2px solid ${GOLD}`, color: '#fff', borderRadius: 'var(--mm-radius-card)' }
                : { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-card)' }}>
              <span className="inline-flex items-center gap-1 text-sm font-black" style={{ color: buyKind === 'regular_pass' ? GOLD : 'var(--mm-ink)' }}><Crown size={15} aria-hidden />정규권</span>
              <span className="block mt-1 font-black tabular-nums">{fmtP(regPrice)}<span className="text-xs font-bold"> / 한 달</span></span>
              <span className="block text-xs mt-0.5" style={{ opacity: 0.75 }}>그 달 경기 모두</span>
            </button>
            <button type="button" role="radio" aria-checked={buyKind === 'non_regular'} onClick={() => setBuyKind('non_regular')}
              className="mm-press p-3 text-left"
              style={buyKind === 'non_regular'
                ? { background: 'var(--mm-yellow)', border: '2px solid var(--mm-black)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-card)' }
                : { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-card)' }}>
              <span className="inline-flex items-center gap-1 text-sm font-black"><Ticket size={15} aria-hidden />비정규</span>
              <span className="block mt-1 font-black tabular-nums">{fmtP(nrPrice)}<span className="text-xs font-bold"> / 1회</span></span>
              <span className="block text-xs mt-0.5" style={{ opacity: 0.75 }}>배치될 때 1장씩</span>
            </button>
          </div>

          {buyKind === 'regular_pass' ? (
            openMonths.length === 0 ? (
              <div className="p-3 text-sm break-keep space-y-0.5" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink-soft)' }}>
                <div className="font-bold" style={{ color: 'var(--mm-ink)' }}>지금은 정규권을 팔지 않아요</div>
                <div>운영진이 판매를 열면 살 수 있어요.</div>
                {sales.filter(x => x.state === 'upcoming').map(x => <div key={x.month}>{mon(x.month)} 정규권 · {whenKst(x.opens_at)} 판매 시작</div>)}
              </div>
            ) : (
            <div className="space-y-2">
              <div className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>어느 달?</div>
              <div className="grid grid-cols-2 gap-2">
                {openMonths.map(m => {
                  const sl = saleOf(m)!
                  return (
                    <button key={m} type="button" onClick={() => setBuyMonth(m)} aria-pressed={buyMonth === m}
                      className="mm-press min-h-11 px-3 py-1.5 text-sm font-bold border text-left" style={chip(buyMonth === m)}>
                      <span className="block">{monthLabel(m)}</span>
                      <span className="block text-xs font-bold break-keep" style={{ opacity: 0.8 }}>남은 자리 {sl.capacity - sl.sold}/{sl.capacity}</span>
                    </button>
                  )
                })}
              </div>
              {buyMonth && saleOf(buyMonth) && <p className="text-xs break-keep" style={{ color: 'var(--mm-muted)' }}>{whenKst(saleOf(buyMonth)!.closes_at)} 마감 · 선착순</p>}
              {passFree && (
                <p className="px-3 py-2 text-sm font-bold break-keep" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }}>
                  운영진은 정규권이 무료예요.
                </p>
              )}
              {!passFree && nonRegularLeft > 0 && nrPrice > 0 && (
                <label className="flex items-center gap-2 min-h-11 px-3 text-sm font-bold cursor-pointer" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }}>
                  <input type="checkbox" checked={useDiscount} onChange={e => setUseDiscount(e.target.checked)} className="w-4 h-4" />
                  <span className="break-keep">남은 비정규 티켓 {Math.min(nonRegularLeft, Math.floor(regPrice / nrPrice))}장으로 할인</span>
                </label>
              )}
            </div>
            )
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>몇 장?</span>
              <div className="inline-flex items-center border border-[color:var(--mm-rule)]" style={{ borderRadius: 'var(--mm-radius-ctl)' }}>
                <button type="button" aria-label="한 장 빼기" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))} className="mm-press w-11 h-11 inline-flex items-center justify-center disabled:opacity-40"><Minus size={16} /></button>
                <span className="w-10 text-center font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{qty}</span>
                <button type="button" aria-label="한 장 더하기" disabled={qty >= 10} onClick={() => setQty(q => Math.min(10, q + 1))} className="mm-press w-11 h-11 inline-flex items-center justify-center disabled:opacity-40"><Plus size={16} /></button>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm p-3" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
            <dt style={{ color: 'var(--mm-ink-soft)' }}>내 포인트</dt><dd className="text-right tabular-nums" style={{ color: 'var(--mm-ink)' }}>{fmtP(me?.balance ?? 0)}</dd>
            {discountN > 0 && <><dt style={{ color: 'var(--mm-ink-soft)' }}>티켓 할인 ({discountN}장)</dt><dd className="text-right tabular-nums" style={{ color: GREEN }}>−{fmtP(discountN * nrPrice)}</dd></>}
            <dt style={{ color: 'var(--mm-ink-soft)' }}>쓸 포인트</dt><dd className="text-right tabular-nums font-bold" style={{ color: 'var(--mm-ink)' }}>−{fmtP(buyPrice)}</dd>
            <dt className="font-bold" style={{ color: 'var(--mm-ink)' }}>남는 포인트</dt>
            <dd className="text-right tabular-nums font-black" style={{ color: afterBuy < 0 ? 'var(--mm-live-bg)' : 'var(--mm-ink)' }}>{fmtP(afterBuy)}</dd>
          </dl>
          {buyKind === 'non_regular' && <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>한 달에 2번 이상 나온다면 정규권을 추천해요.</p>}

          {buyKind === 'regular_pass' && openMonths.length === 0 ? null : afterBuy < 0 ? (
            <button type="button" onClick={() => setSheet('charge')} className="mm-press w-full min-h-12 font-black" style={BTN_PRIMARY}>
              포인트가 {fmtP(-afterBuy)} 모자라요 · 충전하기
            </button>
          ) : (
            <button type="button" disabled={busy || !buyable} onClick={submitBuy} className="mm-press w-full min-h-12 font-black disabled:opacity-50" style={BTN_PRIMARY}>
              {busy ? '사는 중' : buyPrice === 0 && buyKind === 'regular_pass' ? '무료로 받기' : `${fmtP(buyPrice)}로 사기`}
            </button>
          )}
        </div>
      </Sheet>

      {/* ── 창: 충전 ── */}
      {/* 입금 알림이 연결돼 있으면 「입금만 하면 자동 충전」이 먼저, 충전 요청은 「다른 이름으로 입금했어요」 뒤로(2026-11-10 운영진) */}
      <Sheet open={sheet === 'charge'} onClose={() => { setSheet(null); setOtherName(false) }} title="충전하기" width="md">
        {data.auto_charge && !otherName ? (
          <div className="space-y-3">
            <div className="px-4 py-4 text-center" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-card)' }}>
              <div className="text-lg font-black break-keep" style={{ color: 'var(--mm-ink)' }}>모임통장으로 입금만 하면<br />1분 안에 자동 충전돼요</div>
              {/* 한 줄 한 문장 — 「보내/도 돼요」처럼 어절 한가운데서 꺾이지 않게(2026-11-10 운영진) */}
              <div className="mt-1.5 text-sm break-keep space-y-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
                <div>꼭 <b style={{ color: 'var(--mm-ink)' }}>본인 이름{user?.name ? `(${user.name})` : ''}</b>으로 보내 주세요</div>
                <div>충전 요청은 안 보내도 돼요</div>
              </div>
            </div>
            {data.bank && (
              <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                <span className="font-bold text-sm min-w-0 break-keep" style={{ color: 'var(--mm-ink)' }}>{data.bank}</span>
                <button type="button" onClick={copyBank} className="mm-press shrink-0 inline-flex items-center gap-1 min-h-11 px-2 text-sm font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
                  <Copy size={16} aria-hidden />계좌번호 복사
                </button>
              </div>
            )}
            {rules?.bonus_min != null && rules.bonus_pct > 0 && (
              <p className="text-sm font-bold break-keep" style={{ color: 'var(--mm-ink)' }}>
                {(rules.bonus_min / 10000).toLocaleString()}만원 이상 {rules.bonus_pct}% 보너스 · <span className="whitespace-nowrap">5만원 → {fmtP(50000 + bonusOf(50000, rules))}</span>
              </p>
            )}
            <p className="text-xs break-keep" style={{ color: 'var(--mm-muted)' }}>들어오면 잔액이 바로 늘어나요.<br />1~2분이 지나도 그대로면 어드민에게 알려 주세요.</p>
            <button type="button" onClick={() => setOtherName(true)} className="mm-press w-full min-h-11 text-sm font-bold underline underline-offset-2" style={{ color: 'var(--mm-ink-soft)' }}>
              다른 이름으로 입금했어요
            </button>
          </div>
        ) : pending ? (
          <p className="text-sm" style={{ color: 'var(--mm-ink)' }}>확인을 기다리는 요청이 있어요. 요청은 하나씩만 보낼 수 있어요 — 포인트 카드의 「취소」로 지우고 다시 보낼 수 있어요.</p>
        ) : (
          <div className="space-y-3">
            {rules?.bonus_min != null && rules.bonus_pct > 0 && (
              <p className="text-sm font-bold px-3 py-2" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-ctl)' }}>
                {(rules.bonus_min / 10000).toLocaleString()}만원 이상 {rules.bonus_pct}% 보너스 · <span className="whitespace-nowrap">5만원 → {fmtP(50000 + bonusOf(50000, rules))}</span>
              </p>
            )}
            {data.bank && (
              <div>
                <div className="text-xs font-bold mb-1" style={{ color: 'var(--mm-muted)' }}>① 이 계좌로 입금</div>
                <div className="flex items-center justify-between gap-2 pl-3 pr-1 py-1" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <span className="font-bold text-sm min-w-0 break-keep" style={{ color: 'var(--mm-ink)' }}>{data.bank}</span>
                  <button type="button" onClick={copyBank} className="mm-press shrink-0 inline-flex items-center gap-1 min-h-11 px-2 text-sm font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
                    <Copy size={16} aria-hidden />복사
                  </button>
                </div>
              </div>
            )}
            <div>
              <div className="text-xs font-bold mb-1" style={{ color: 'var(--mm-muted)' }}>② 입금한 금액</div>
              <div className="grid grid-cols-4 gap-1.5">
                {QUICK.map(q => (
                  <button key={q} type="button" onClick={() => setAmount(String(q))} className="mm-press min-h-11 px-1 text-sm font-bold border whitespace-nowrap" style={chip(typedAmount === q)}>
                    {(q / 10000).toLocaleString()}만원
                  </button>
                ))}
              </div>
              <input inputMode="numeric" aria-label="입금한 금액(원)" value={amount ? Number(amount).toLocaleString() : ''} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, '').replace(/^0+/, ''))} className={`${INPUT} tabular-nums`} style={{ borderRadius: 'var(--mm-radius-ctl)' }} placeholder="직접 적기 (원)" />
              {typedAmount > 0 && (
                <p className="text-sm mt-1" style={{ color: 'var(--mm-ink)' }}>
                  들어올 포인트 <b className="tabular-nums">{fmtP(typedAmount + previewBonus)}</b>{previewBonus > 0 ? ` (보너스 ${fmtP(previewBonus)})` : ''}
                </p>
              )}
            </div>
            <label className="block text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
              ③ 입금자명 (통장에 찍힌 이름)
              <input value={depositor} onChange={e => setDepositor(stripReservedDepositor(e.target.value))} maxLength={40} className={INPUT} style={{ borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }} />
            </label>
            <button type="button" disabled={busy || !amount} onClick={submitCharge} className="mm-press w-full min-h-12 font-black disabled:opacity-50" style={BTN_PRIMARY}>
              {busy ? '보내는 중' : '충전 요청 보내기'}
            </button>
            <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>{data.auto_charge ? '가족·다른 사람 계좌처럼 내 이름이 아닌 이름으로 보냈을 때만 써요. 적은 입금자명으로 들어오면 자동으로 들어가요.' : '어드민이 통장을 확인하면 포인트가 들어와요.'}</p>
          </div>
        )}
      </Sheet>

      {/* ── 창: 환불 ── */}
      <Sheet open={sheet === 'refund'} onClose={() => setSheet(null)} title="환불" width="md">
        {me && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>지금 환불받을 수 있는 돈</span>
              <span className="font-black text-2xl tabular-nums" style={{ color: 'var(--mm-ink)' }}>{me.refundable.toLocaleString()}원</span>
            </div>
            <p className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
              입금한 돈에서 쓴 만큼을 빼고 돌려드려요. <b style={{ color: 'var(--mm-ink)' }}>보너스 포인트는 빼고</b> 정산하고, 환불하면 남은 포인트는 사라져 잔액이 0P 가 돼요.
            </p>
            <details className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
              <summary className="cursor-pointer font-bold min-h-9 flex items-center gap-1" style={{ color: 'var(--mm-ink)' }}><RotateCcw size={14} aria-hidden />예시 보기</summary>
              <div className="mt-1 p-3 space-y-2" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                <div>5만원 충전 → 55,000P → 12,000P 사용<div className="font-bold" style={{ color: 'var(--mm-ink)' }}>환불 50,000 − 12,000 = 38,000원</div></div>
                <div>10만원 충전 → 110,000P → 105,000P 사용<div className="font-bold" style={{ color: 'var(--mm-ink)' }}>100,000 − 105,000 → 환불 금액 없음</div></div>
              </div>
            </details>
            {me.refundable > 0 && !pending ? (
              <>
                {/* 은행 · 계좌번호를 따로 받는다 — 어드민이 계좌번호만 한 번에 복사하게(2026-11-09 운영진) */}
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
                  <label className="block text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
                    은행
                    <input value={refundBank} onChange={e => setRefundBank(e.target.value)} maxLength={20} list="wallet-banks" className={INPUT} style={{ borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }} placeholder="예: 카카오뱅크" />
                    <datalist id="wallet-banks">
                      {['카카오뱅크', '토스뱅크', '국민', '신한', '우리', '하나', '농협', '기업', '케이뱅크', '새마을', '우체국', 'SC제일', '수협', '부산', '대구'].map(b => <option key={b} value={b} />)}
                    </datalist>
                  </label>
                  <label className="block text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
                    계좌번호 (숫자만)
                    <input inputMode="numeric" value={refundAccount} onChange={e => setRefundAccount(e.target.value.replace(/[^\d-]/g, ''))} maxLength={30} className={`${INPUT} tabular-nums`} style={{ borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }} placeholder="3333000000000" />
                  </label>
                </div>
                <label className="block text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
                  예금주
                  <input value={refundHolder} onChange={e => setRefundHolder(e.target.value)} maxLength={40} className={INPUT} style={{ borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink)' }} />
                </label>
                <button type="button" disabled={busy} onClick={requestRefund} className="mm-press w-full min-h-12 font-black disabled:opacity-50" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  {me.refundable.toLocaleString()}원 환불 요청
                </button>
              </>
            ) : (
              <p className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
                {pending ? '확인을 기다리는 요청이 있어 지금은 환불을 요청할 수 없어요.' : '지금은 환불받을 금액이 없어요.'}
              </p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
