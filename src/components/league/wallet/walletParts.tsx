'use client'
// 미라클 월렛 — 회원 화면 · 어드민 화면이 같이 쓰는 목록 (장부 · 충전 요청)
import EmptyState from '@/components/league/ui/EmptyState'

export interface LedgerItem {
  id: string
  kind: 'opening' | 'charge' | 'purchase' | 'refund' | 'adjust'
  amount: number
  balance_after: number
  memo: string | null
  created_at: string
}

export interface RequestItem {
  id: string
  league_player_id: string
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
  purchase: '사용',
  refund: '환불',
  adjust: '어드민 보정',
}

export const STATUS_LABEL: Record<RequestItem['status'], string> = {
  pending: '확인 중',
  approved: '충전됨',
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

export function RequestList({ rows }: { rows: RequestItem[] }) {
  if (rows.length === 0) return <EmptyState title="아직 충전 요청이 없어요" variant="compact" />
  return (
    <ul>
      {rows.map(r => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div className="min-w-0">
            <div className="font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>
              {r.name ? `${r.name} · ` : ''}입금자 {r.depositor_name}
            </div>
            <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>
              요청 {fmtWhen(r.created_at)}
              {r.reviewed_at && r.status !== 'pending' ? ` · 처리 ${fmtWhen(r.reviewed_at)}` : ''}
              {r.reviewed_by_label && r.status !== 'cancelled' ? ` · ${r.reviewed_by_label}` : ''}
            </div>
            {r.admin_note && <div className="text-xs" style={{ color: 'var(--mm-ink-soft)' }}>메모: {r.admin_note}</div>}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{fmtP(r.amount)}</div>
            <div className="text-xs font-bold" style={{ color: r.status === 'rejected' ? '#C4362B' : 'var(--mm-muted)' }}>{STATUS_LABEL[r.status]}</div>
          </div>
        </li>
      ))}
    </ul>
  )
}
