'use client'
// 미라클 월렛 — 어드민 칸 (팀 어드민 누구나 · CEO, 2026-11-09 운영진)
//   ① 확인 기다리는 충전 요청 — 통장에 찍힌 입금자명·금액을 보고 승인/반려
//   ② 회원별 잔액(합계) — 누르면 그 회원의 내역 + 보정(이유 필수, 회원도 내역에서 본다)
//   ③ 최근 처리한 요청
//   서버가 매 요청 canEditLeague 로 다시 확인한다 — 이 칸이 보이는 것은 화면 표시일 뿐.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Check, X, Search } from 'lucide-react'
import { refreshPendingCharges } from '@/lib/hooks/usePendingCharges'
import SectionCard from '@/components/league/ui/SectionCard'
import Sheet from '@/components/league/ui/Sheet'
import { LedgerList, RequestList, fmtP, fmtWhen, type LedgerItem, type RequestItem } from './walletParts'

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
  const [adjAmount, setAdjAmount] = useState('')
  const [adjSign, setAdjSign] = useState<1 | -1>(1)
  const [adjMemo, setAdjMemo] = useState('')
  const [showRecent, setShowRecent] = useState(false)
  // 회원별 잔액 — 세로로 너무 길었다(2026-11-09 운영진) → 이름 찾기 + 「잔액 있는 사람만」 + 여러 칸 격자
  const [query, setQuery] = useState('')
  const [onlyWithBalance, setOnlyWithBalance] = useState(true)

  const api = `/api/leagues/${leagueId}/wallet/admin`
  const load = useCallback(async () => {
    const res = await fetch(api, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
  }, [api])
  useEffect(() => { void load() }, [load])

  async function post(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? '처리하지 못했어요'); return false }
    return true
  }

  async function review(r: RequestItem, decision: 'approve' | 'reject') {
    let note: string | null = null
    if (decision === 'approve') {
      if (!confirm(`${r.name} · 입금자 「${r.depositor_name}」 ${fmtP(r.amount)}\n통장에서 입금을 확인했나요? 승인하면 바로 포인트가 들어갑니다.`)) return
    } else {
      note = prompt('반려 이유 (회원에게 보여요 · 비워도 됨)', '입금 확인이 안 돼요')
      if (note === null) return
    }
    setBusyId(r.id)
    try {
      if (await post({ action: 'review', requestId: r.id, decision, note })) {
        toast.success(decision === 'approve' ? `${r.name} 님에게 ${fmtP(r.amount)} 충전했어요` : '반려했어요')
        await load(); onChanged(); void refreshPendingCharges(leagueId)
      }
    } finally { setBusyId(null) }
  }

  async function openMember(m: AdminRes['members'][number]) {
    setOpenPlayer(m); setLedger(null); setAdjAmount(''); setAdjMemo(''); setAdjSign(1)
    const res = await fetch(`${api}?playerId=${m.player_id}`, { cache: 'no-store' })
    if (res.ok) setLedger((await res.json()).ledger)
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
        <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>어드민 · 충전 확인</h3>
        <p className="text-xs mb-3" style={{ color: 'var(--mm-muted)' }}>통장에 찍힌 입금자명과 금액이 맞으면 승인해요. 어드민 누구나 할 수 있고, 처리한 사람이 기록에 남아요.</p>
        {data.pending.length === 0 ? (
          <p className="text-sm py-2" style={{ color: 'var(--mm-ink-soft)' }}>확인을 기다리는 요청이 없어요</p>
        ) : (
          <ul>
            {data.pending.map(r => (
              <li key={r.id} className="py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <div className="min-w-0">
                  <div className="font-black" style={{ color: 'var(--mm-ink)' }}>{r.name} <span className="tabular-nums">{fmtP(r.amount)}</span></div>
                  <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>입금자 {r.depositor_name} · {fmtWhen(r.created_at)}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button" disabled={busyId === r.id} onClick={() => review(r, 'approve')}
                    className="mm-press inline-flex items-center gap-1 min-h-11 px-3 text-sm font-black disabled:opacity-50"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                  ><Check size={16} aria-hidden />승인</button>
                  <button
                    type="button" disabled={busyId === r.id} onClick={() => review(r, 'reject')}
                    className="mm-press inline-flex items-center gap-1 min-h-11 px-3 text-sm font-bold border border-[color:var(--mm-rule)] disabled:opacity-50"
                    style={{ color: 'var(--mm-ink)' }}
                  ><X size={16} aria-hidden />반려</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => setShowRecent(v => !v)} className="mt-2 min-h-11 text-sm font-bold underline" style={{ color: 'var(--mm-ink-soft)' }}>
          {showRecent ? '최근 처리 접기' : `최근 처리 보기 (${data.recent.length})`}
        </button>
        {showRecent && <RequestList rows={data.recent} />}
      </SectionCard>

      <SectionCard variant="standalone">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>회원별 잔액</h3>
          <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
            합계 {fmtP(data.total)} · 잔액 있는 회원 {data.members.filter(m => m.balance > 0).length}명
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2 mb-2">
          <label className="relative flex-1 min-w-[160px]">
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mm-muted)' }} />
            <input
              value={query} onChange={e => setQuery(e.target.value)} placeholder="이름 찾기" aria-label="회원 이름 찾기"
              className="w-full min-h-11 pl-9 pr-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base"
            />
          </label>
          {([true, false] as const).map(v => (
            <button
              key={String(v)} type="button" onClick={() => setOnlyWithBalance(v)}
              className="mm-press min-h-11 px-3 text-sm font-bold border"
              style={{
                borderColor: onlyWithBalance === v ? 'var(--mm-ink)' : 'var(--mm-rule)',
                background: onlyWithBalance === v ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                color: onlyWithBalance === v ? 'var(--mm-black)' : 'var(--mm-ink)',
              }}
            >{v ? '잔액 있는 사람' : '전체'}</button>
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
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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
          {ledger ? <LedgerList rows={ledger} /> : <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>불러오는 중</p>}
        </div>
      </Sheet>
    </>
  )
}
