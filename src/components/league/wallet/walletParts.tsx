'use client'
// 미라클 월렛 — 회원 화면 · 어드민 화면이 같이 쓰는 목록 (장부 · 충전 요청)
import type { ReactNode } from 'react'
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
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString()}P`
}

export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function LedgerList({ rows }: { rows: LedgerItem[] }) {
  if (rows.length === 0) return <EmptyState title="아직 내역이 없어요" variant="compact" />
  return (
    <ul>
      {rows.map(r => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div className="min-w-0">
            <div className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{KIND_LABEL[r.kind]}</div>
            {r.memo && <div className="text-xs" style={{ color: 'var(--mm-ink-soft)' }}>{r.memo}</div>}
            <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{fmtWhen(r.created_at)}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="font-black tabular-nums" style={{ color: r.amount > 0 ? '#059669' : 'var(--mm-ink)' }}>{fmtSigned(r.amount)}</div>
            <div className="text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>잔액 {fmtP(r.balance_after)}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}

const STATUS_STYLE: Record<RequestItem['status'], { bg: string; fg: string }> = {
  pending: { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },
  approved: { bg: '#059669', fg: '#fff' },
  rejected: { bg: '#C4362B', fg: '#fff' },
  cancelled: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)' },
}

// 충전 요청 목록 (2026-11-09 운영진 — 요청·처리 시각이 한 줄에 나란히 있어 읽기 어려웠다)
//   한 장 = 머리(상태 칩 · 금액) + 「요청」 줄 + 「처리」 줄. 줄마다 왼쪽에 이름표를 고정 폭으로 둔다.
export function RequestList({ rows }: { rows: RequestItem[] }) {
  if (rows.length === 0) return <EmptyState title="아직 충전 요청이 없어요" variant="compact" />
  return (
    <ul className="space-y-2">
      {rows.map(r => {
        const st = STATUS_STYLE[r.status]
        const handled = r.status !== 'pending' && r.reviewed_at
        return (
          <li key={r.id} className="p-3" style={{ border: '1px solid var(--mm-rule)' }}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 min-w-0">
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 text-xs font-black" style={{ background: st.bg, color: st.fg, borderRadius: 'var(--mm-radius-chip)' }}>
                  {STATUS_LABEL[r.status]}
                </span>
                <span className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{r.kind === 'refund' ? '환불' : '충전'}</span>
                {r.name && <span className="font-bold text-sm break-keep" style={{ color: 'var(--mm-ink-soft)' }}>{r.name}</span>}
              </span>
              <span className="shrink-0 font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{r.kind === 'refund' ? `${r.amount.toLocaleString()}원` : fmtP(r.amount)}</span>
            </div>
            <dl className="mt-2 grid grid-cols-[3rem_1fr] gap-x-2 gap-y-1 text-xs">
              <dt className="font-bold" style={{ color: 'var(--mm-muted)' }}>요청</dt>
              <dd style={{ color: 'var(--mm-ink-soft)' }}>
                {fmtWhen(r.created_at)} · {r.kind === 'refund' ? `받을 계좌 ${r.refund_account ?? ''} (${r.depositor_name})` : `입금자 ${r.depositor_name}`}
              </dd>
              <dt className="font-bold" style={{ color: 'var(--mm-muted)' }}>처리</dt>
              <dd style={{ color: 'var(--mm-ink-soft)' }}>
                {handled
                  ? <>{fmtWhen(r.reviewed_at!)}{r.reviewed_by_label ? ` · ${r.status === 'cancelled' ? '본인 취소' : r.reviewed_by_label}` : ''}</>
                  : '어드민 확인 기다리는 중'}
              </dd>
              {r.admin_note && (
                <>
                  <dt className="font-bold" style={{ color: 'var(--mm-muted)' }}>메모</dt>
                  <dd style={{ color: 'var(--mm-ink-soft)' }}>{r.admin_note}</dd>
                </>
              )}
            </dl>
          </li>
        )
      })}
    </ul>
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
