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
                {r.name && <span className="font-bold text-sm break-keep" style={{ color: 'var(--mm-ink)' }}>{r.name}</span>}
              </span>
              <span className="shrink-0 font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{fmtP(r.amount)}</span>
            </div>
            <dl className="mt-2 grid grid-cols-[3rem_1fr] gap-x-2 gap-y-1 text-xs">
              <dt className="font-bold" style={{ color: 'var(--mm-muted)' }}>요청</dt>
              <dd style={{ color: 'var(--mm-ink-soft)' }}>{fmtWhen(r.created_at)} · 입금자 {r.depositor_name}</dd>
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
