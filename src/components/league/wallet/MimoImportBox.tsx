'use client'
// 미모바스켓 잔액 옮기기 — 어드민 탭 맨 아래 (2026-11-09 운영진)
//   ① 미모에서 뽑은 「이름, 잔액, 비정규 티켓」을 붙여 넣는다 → ② 미리보기(이름 짝짓기 · 지금 온볼 잔액 · 상태)
//   → ③ 「옮기기」(짝이 맞은 사람만, 두 번 눌러도 한 번만 들어간다) → 같은 표가 대조표가 된다(미모 잔액 = 온볼 잔액?).
import { useState } from 'react'
import { toast } from 'sonner'
import { Pager, pageSlice } from './walletParts'

interface Row {
  name: string; balance: number; tickets: number
  status: 'ok' | 'not_found' | 'dup_name' | 'already' | 'empty'
  onball_name: string | null; onball_balance: number | null
}

const LABEL: Record<Row['status'], { t: string; c: string }> = {
  ok: { t: '옮길 수 있음', c: '#059669' },
  already: { t: '옮김', c: 'var(--mm-ink-soft)' },
  empty: { t: '잔액·티켓 없음', c: 'var(--mm-muted)' },
  not_found: { t: '온볼에 없는 이름', c: 'var(--mm-live-bg)' },
  dup_name: { t: '같은 이름 여럿', c: 'var(--mm-live-bg)' },
}

// 미모 Supabase SQL 편집기에서 돌리면 그대로 붙여 넣을 수 있는 결과가 나온다(읽기만 하는 조회).
const EXPORT_SQL = `select name, point_balance, non_regular_ticket_count
from users
where point_balance <> 0 or non_regular_ticket_count <> 0
order by name;`

export default function MimoImportBox({ leagueId, onDone }: { leagueId: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(0)

  async function call(action: 'mimo_preview' | 'mimo_apply') {
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/wallet/admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, text }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '처리하지 못했어요'); return }
      setRows(j.rows); setPage(0)
      if (action === 'mimo_apply') {
        toast.success(`${j.people}명 옮겼어요 · ${Number(j.points).toLocaleString()}P · 티켓 ${j.tickets}장`)
        if (j.failed?.length) toast.error(`${j.failed.length}명 실패 — ${j.failed.map((f: { name: string }) => f.name).join(', ')}`)
        onDone()
      }
    } finally { setBusy(false) }
  }

  const ok = rows?.filter(r => r.status === 'ok') ?? []
  const problems = rows?.filter(r => r.status === 'not_found' || r.status === 'dup_name') ?? []
  const sum = (rs: Row[]) => rs.reduce((a, r) => a + r.balance, 0)

  return (
    <details className="mt-1">
      <summary className="cursor-pointer font-black text-lg min-h-11 flex items-center" style={{ color: 'var(--mm-ink)' }}>미모바스켓 잔액 옮기기</summary>
      <div className="mt-2 space-y-3 text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
        <ol className="list-decimal pl-5 space-y-1">
          <li>미모바스켓 Supabase → SQL 편집기에서 아래 조회를 돌려 결과를 복사해요(읽기만 해요).</li>
          <li>아래 칸에 붙여 넣고 「미리보기」 — 온볼 회원과 이름으로 짝지어요.</li>
          <li>빨간 줄(이름이 다르거나 겹침)은 이름을 온볼 표기로 고쳐 다시 미리보기.</li>
          <li>「옮기기」 — 잔액은 「입금한 돈」으로, 비정규 티켓은 장수대로 들어가요. 두 번 눌러도 한 번만 들어가요.</li>
        </ol>
        <pre className="p-2 text-xs overflow-x-auto whitespace-pre-wrap" style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>{EXPORT_SQL}</pre>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder={'이름, 잔액, 비정규 티켓\n김로빈, 43000, 2'}
          className="w-full p-2 text-sm border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]" style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }} />
        <div className="flex gap-2 flex-wrap">
          <button type="button" disabled={busy || !text.trim()} onClick={() => call('mimo_preview')} className="mm-press min-h-11 px-4 font-black border border-[color:var(--mm-rule)] disabled:opacity-50" style={{ color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>미리보기</button>
          {ok.length > 0 && (
            <button type="button" disabled={busy}
              onClick={() => { if (confirm(`${ok.length}명 · ${sum(ok).toLocaleString()}P · 티켓 ${ok.reduce((a, r) => a + r.tickets, 0)}장을 옮길까요?${problems.length ? `\n(확인 필요 ${problems.length}줄은 건너뜀)` : ''}`)) void call('mimo_apply') }}
              className="mm-press min-h-11 px-4 font-black disabled:opacity-50" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}>
              {ok.length}명 옮기기
            </button>
          )}
        </div>
        {rows && (
          <>
            <p className="font-bold" style={{ color: 'var(--mm-ink)' }}>
              {rows.length}줄 · 미모 잔액 합 {sum(rows).toLocaleString()}P · 옮길 수 있음 {ok.length} · 옮김 {rows.filter(r => r.status === 'already').length} · 확인 필요 <span style={{ color: problems.length ? 'var(--mm-live-bg)' : undefined }}>{problems.length}</span>
            </p>
            <ul>
              {pageSlice(rows, page, 10).map((r, i) => {
                const diff = r.status === 'already' && r.onball_balance != null ? r.onball_balance - r.balance : null
                return (
                  <li key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 py-2 flex-wrap" style={{ borderTop: i ? '1px solid var(--mm-rule)' : undefined }}>
                    <span className="min-w-0">
                      <b style={{ color: 'var(--mm-ink)' }}>{r.name}</b>
                      <span className="ml-2 text-xs font-bold" style={{ color: LABEL[r.status].c }}>{LABEL[r.status].t}</span>
                    </span>
                    <span className="tabular-nums text-right">
                      미모 {r.balance.toLocaleString()}P{r.tickets ? ` · 티켓 ${r.tickets}` : ''}
                      {r.onball_balance != null && <> → 온볼 {r.onball_balance.toLocaleString()}P</>}
                      {diff != null && diff !== 0 && <span className="ml-1 font-bold" style={{ color: 'var(--mm-live-bg)' }}>(차이 {diff > 0 ? '+' : ''}{diff.toLocaleString()})</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
            <Pager page={page} total={rows.length} size={10} onChange={setPage} />
            <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>「옮김」 줄의 차이는 옮긴 뒤 충전·구매가 있었으면 생겨요. 옮긴 직후 차이가 있으면 어드민 「보정」으로 맞춰요.</p>
          </>
        )}
      </div>
    </details>
  )
}
