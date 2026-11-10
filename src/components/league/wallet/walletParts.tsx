'use client'
// 미라클 월렛 — 회원 화면 · 어드민 화면이 같이 쓰는 목록 (장부 · 충전 요청)
import { useState, type ReactNode } from 'react'
import EmptyState from '@/components/league/ui/EmptyState'

export interface LedgerItem {
  id: string
  kind: 'opening' | 'charge' | 'bonus' | 'purchase' | 'refund' | 'adjust' | 'withdraw' | 'forfeit'
  amount: number
  balance_after: number
  memo: string | null
  created_at: string
}

export interface RequestItem {
  id: string
  league_player_id: string
  kind: 'charge' | 'refund'
  refund_account: string | null
  amount: number
  depositor_name: string
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  admin_note: string | null
  reviewed_by_label: string | null
  reviewed_at: string | null
  created_at: string
  name?: string
}

export const KIND_LABEL: Record<LedgerItem['kind'], string> = {
  opening: '미모바스켓에서 옮김',
  charge: '충전',
  bonus: '충전 보너스',
  purchase: '티켓 구매',
  refund: '티켓 돌려받음',
  adjust: '어드민 보정',
  withdraw: '환불 송금',
  forfeit: '환불 때 소멸',
}

export const STATUS_LABEL: Record<RequestItem['status'], string> = {
  pending: '확인 중',
  approved: '완료',
  rejected: '반려',
  cancelled: '취소',
}

export function fmtP(n: number): string {
  return `${n.toLocaleString()}P`
}

export function fmtSigned(n: number): string {
  if (n === 0) return '0P'
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}P`
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// 쪽 나누기(2026-11-09 운영진 — 「더 보기」로 펼치면 화면이 끝없이 길어졌다). 회원 내역 · 어드민 칸 공용.
const FIRST = 6

/** 그 쪽에 보일 줄 — page 는 0부터 */
export function pageSlice<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice(page * size, page * size + size)
}

/** ‹ 1 2 3 … 9 › — 한 쪽뿐이면 그리지 않는다 */
export function Pager({ page, total, size, onChange }: { page: number; total: number; size: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / size)
  if (pages <= 1) return null
  // 처음·끝·지금 앞뒤 한 쪽만 숫자로, 사이는 「…」 칸(글자 말줄임이 아니라 쪽 건너뜀 표시)
  const nums: Array<number | 'gap'> = []
  for (let i = 0; i < pages; i++) {
    if (i === 0 || i === pages - 1 || Math.abs(i - page) <= 1) nums.push(i)
    else if (nums[nums.length - 1] !== 'gap') nums.push('gap')
  }
  const btn = 'mm-press inline-flex items-center justify-center min-w-9 min-h-9 px-2 text-sm font-bold tabular-nums disabled:opacity-30'
  return (
    <nav aria-label="쪽 넘기기" className="mt-2 flex items-center justify-center gap-1 flex-wrap">
      <button type="button" className={btn} disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="앞 쪽" style={{ color: 'var(--mm-ink-soft)' }}>‹</button>
      {nums.map((n, i) => n === 'gap'
        ? <span key={`g${i}`} aria-hidden className="px-1 text-sm" style={{ color: 'var(--mm-muted)' }}>·</span>
        : (
          <button key={n} type="button" className={btn} aria-current={n === page ? 'page' : undefined} onClick={() => onChange(n)}
            style={{ background: n === page ? 'var(--mm-ink)' : 'transparent', color: n === page ? 'var(--mm-panel)' : 'var(--mm-ink-soft)', borderRadius: 999 }}>
            {n + 1}
          </button>
        ))}
      <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onChange(page + 1)} aria-label="다음 쪽" style={{ color: 'var(--mm-ink-soft)' }}>›</button>
    </nav>
  )
}

export function LedgerList({ rows, monthFilter = false }: { rows: LedgerItem[]; monthFilter?: boolean }) {
  const [page, setPage] = useState(0)
  const [month, setMonth] = useState('')
  if (rows.length === 0) return <EmptyState title="아직 내역이 없어요" variant="compact" />
  const months = [...new Set(rows.map(r => monthKey(r.created_at)))]
  const shown = month ? rows.filter(r => monthKey(r.created_at) === month) : rows
  const plus = shown.filter(r => r.amount > 0).reduce((a, r) => a + r.amount, 0)
  const minus = shown.filter(r => r.amount < 0).reduce((a, r) => a + r.amount, 0)
  return (
    <>
    {monthFilter && months.length > 1 && (
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <MonthSelect value={month} months={months} allLabel="전체 기간" onChange={v => { setMonth(v); setPage(0) }} />
        {month && <span className="text-xs tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>들어옴 {fmtSigned(plus)} · 나감 {fmtSigned(minus)}</span>}
      </div>
    )}
    <ul>
      {pageSlice(shown, page, FIRST).map(r => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div className={`min-w-0 ${WRAP}`}>
            <div className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{KIND_LABEL[r.kind]}</div>
            {r.memo && <div className="text-xs" style={{ color: 'var(--mm-ink-soft)' }}>{r.memo}</div>}
            <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{fmtWhen(r.created_at)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-black tabular-nums whitespace-nowrap" style={{ color: r.amount > 0 ? '#059669' : 'var(--mm-ink)' }}>{fmtSigned(r.amount)}</div>
            <div className="text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>잔액 {fmtP(r.balance_after)}</div>
          </div>
        </li>
      ))}
    </ul>
    <Pager page={page} total={shown.length} size={FIRST} onChange={setPage} />
    </>
  )
}

const STATUS_STYLE: Record<RequestItem['status'], { bg: string; fg: string }> = {
  pending: { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },
  approved: { bg: '#059669', fg: '#fff' },
  rejected: { bg: '#C4362B', fg: '#fff' },
  cancelled: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)' },
}

/** 처리한 사람 이름표를 짧게 — 자동 처리는 「자동 확인」으로(긴 이름표가 폰에서 두세 줄로 꺾였다, 2026-11-10) */
function actorShort(r: RequestItem): string | null {
  if (r.status === 'cancelled') return '본인 취소'
  const l = r.reviewed_by_label
  if (!l) return null
  if (l.startsWith('자동')) return '자동 확인(입금 알림)'
  return l
}

// 「한국어는 어절 단위로만」 꺾고, 띄어쓰기 없는 긴 값(이메일·계좌)은 모자랄 때만 꺾는다.
const WRAP = 'break-keep [overflow-wrap:anywhere]'

/** 달 고르기 — 'YYYY-MM' 목록(최근이 앞). 회원 내역·처리 내역 공용(2026-11-10 운영진 「월별로 보기」). */
export function MonthSelect({ value, months, onChange, allLabel }: { value: string; months: string[]; onChange: (v: string) => void; allLabel?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} aria-label="달 고르기"
      className="min-h-11 px-2 text-sm font-bold border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]"
      style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>
      {allLabel && <option value="">{allLabel}</option>}
      {months.map(m => <option key={m} value={m}>{Number(m.slice(0, 4))}년 {Number(m.slice(5, 7))}월</option>)}
    </select>
  )
}

/** 'YYYY-MM' (KST) */
export function monthKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 7)
}

// 충전·환불 요청 목록 (2026-11-10 운영진 — 폰에서 이름·내용이 어색하게 꺾였다)
//   한 장 = ① 상태 칩 · 종류 ……… 금액  ② 이름(굵게, 한 줄)  ③ 「요청 시각 · 입금자」  ④ 「처리 시각 · 처리한 사람」  ⑤ 메모
//   이름표 칸(3rem)을 없애 내용 폭을 넓혔고, 글은 어절 단위로만 꺾는다.
export function RequestList({ rows, emptyTitle }: { rows: RequestItem[]; emptyTitle?: string }) {
  const [page, setPage] = useState(0)
  if (rows.length === 0) return <EmptyState title={emptyTitle ?? '아직 충전 요청이 없어요'} variant="compact" />
  return (
    <>
    <ul className="space-y-2">
      {pageSlice(rows, page, FIRST).map(r => {
        const st = STATUS_STYLE[r.status]
        const handled = r.status !== 'pending' && r.reviewed_at
        const who = actorShort(r)
        return (
          <li key={r.id} className="p-3" style={{ border: '1px solid var(--mm-rule)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 shrink-0">
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-black whitespace-nowrap" style={{ background: st.bg, color: st.fg, borderRadius: 'var(--mm-radius-chip)' }}>
                  {STATUS_LABEL[r.status]}
                </span>
                <span className="text-xs font-bold whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>{r.kind === 'refund' ? '환불' : '충전'}</span>
              </span>
              <span className="font-black tabular-nums whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>{r.kind === 'refund' ? `${r.amount.toLocaleString()}원` : fmtP(r.amount)}</span>
            </div>
            {r.name && <div className={`mt-1 font-black ${WRAP}`} style={{ color: 'var(--mm-ink)' }}>{r.name}</div>}
            <div className={`mt-1 text-xs space-y-0.5 ${WRAP}`} style={{ color: 'var(--mm-ink-soft)' }}>
              <div>
                <span className="font-bold" style={{ color: 'var(--mm-muted)' }}>요청</span>{' '}
                <span className="whitespace-nowrap">{fmtWhen(r.created_at)}</span>
                {' · '}{r.kind === 'refund' ? <>받을 계좌 {r.refund_account ?? ''} ({r.depositor_name})</> : <>입금자 {r.depositor_name}</>}
              </div>
              <div>
                <span className="font-bold" style={{ color: 'var(--mm-muted)' }}>처리</span>{' '}
                {handled ? <><span className="whitespace-nowrap">{fmtWhen(r.reviewed_at!)}</span>{who ? ` · ${who}` : ''}</> : '어드민 확인 기다리는 중'}
              </div>
              {r.admin_note && <div><span className="font-bold" style={{ color: 'var(--mm-muted)' }}>메모</span> {r.admin_note}</div>}
            </div>
          </li>
        )
      })}
    </ul>
    <Pager page={page} total={rows.length} size={FIRST} onChange={setPage} />
    </>
  )
}

export interface TicketItem {
  id: string
  kind: 'regular_pass' | 'non_regular'
  month: string | null
  price: number
  status: 'active' | 'used' | 'returned'
  used_date: string | null
  used_note: string | null
  returned_by_label: string | null
  returned_note: string | null
  actor_label: string | null
  created_at: string
}

export function monthLabel(m: string): string {
  const [y, mm] = m.split('-').map(Number)
  return `${y}년 ${mm}월`
}

export function ticketTitle(t: TicketItem): string {
  return t.kind === 'regular_pass' && t.month ? `정규권 ${monthLabel(t.month)}` : '비정규 티켓'
}

const TICKET_STATUS: Record<TicketItem['status'], { label: string; bg: string; fg: string }> = {
  active: { label: '사용 가능', bg: '#059669', fg: '#fff' },
  used: { label: '사용함', bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)' },
  returned: { label: '돌려받음', bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)' },
}

/** 티켓 목록 — 회원 화면 · 어드민 회원 시트 공용. actions 를 주면 줄마다 버튼(어드민). */
export function TicketList({ rows, actions }: { rows: TicketItem[]; actions?: (t: TicketItem) => ReactNode }) {
  if (rows.length === 0) return <EmptyState title="아직 산 티켓이 없어요" variant="compact" />
  return (
    <ul className="space-y-2">
      {rows.map(t => {
        const st = TICKET_STATUS[t.status]
        return (
          <li key={t.id} className="p-3" style={{ border: '1px solid var(--mm-rule)' }}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-black" style={{ background: st.bg, color: st.fg, borderRadius: 'var(--mm-radius-chip)' }}>{st.label}</span>
                <span className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{ticketTitle(t)}</span>
              </span>
              <span className="font-black tabular-nums text-sm" style={{ color: 'var(--mm-ink)' }}>{fmtP(t.price)}</span>
            </div>
            <div className="mt-1 text-xs space-y-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
              <div>산 날 {fmtWhen(t.created_at)}</div>
              {t.status === 'used' && t.used_date && <div>사용 {t.used_date}{t.used_note ? ` · ${t.used_note}` : ''}</div>}
              {t.status === 'returned' && <div>돌려받음{t.returned_by_label ? ` · ${t.returned_by_label}` : ''}{t.returned_note ? ` · ${t.returned_note}` : ''}</div>}
            </div>
            {actions && <div className="mt-2 flex flex-wrap gap-2">{actions(t)}</div>}
          </li>
        )
      })}
    </ul>
  )
}
