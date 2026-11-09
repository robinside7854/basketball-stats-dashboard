'use client'
// 미라클 월렛 화면 (2026-11-09 운영진)
//   회원: 잔액 · 충전 요청(입금 안내 → 금액·입금자명) · 사용 내역(장부) · 충전 요청 이력 — 본인 것만.
//   어드민(누구나) · CEO: 아래 WalletAdminPanel — 충전 승인/반려 · 회원별 잔액 · 보정.
//   돈이라 캐시를 쓰지 않는다(라우트 no-store).
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Wallet, Copy, Loader2, X } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import SectionCard from '@/components/league/ui/SectionCard'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import EmptyState from '@/components/league/ui/EmptyState'
import { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import WalletAdminPanel from './WalletAdminPanel'
import { LedgerList, RequestList, fmtP, type LedgerItem, type RequestItem } from './walletParts'

interface WalletRes {
  enabled: boolean
  name?: string
  bank?: string | null
  me?: { balance: number; ledger: LedgerItem[]; requests: RequestItem[] } | null
}

const QUICK = [10_000, 30_000, 50_000, 100_000]

export default function WalletPageClient({ leagueId }: { leagueId: string }) {
  const { user, loading: authLoading } = useCurrentUser()
  const { isEditMode } = useLeagueEditMode()
  const [data, setData] = useState<WalletRes | null>(null)
  const [tab, setTab] = useState<'ledger' | 'requests'>('ledger')
  const [amount, setAmount] = useState('')
  const [depositor, setDepositor] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/wallet`, { cache: 'no-store' })
    if (res.ok) setData(await res.json())
    else setData({ enabled: false })
  }, [leagueId])

  useEffect(() => { if (!authLoading) void load() }, [authLoading, load, user?.player_id])
  useEffect(() => { if (user?.name && !depositor) setDepositor(user.name) }, [user?.name, depositor])

  if (authLoading || !data) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[color:var(--mm-muted)]" aria-label="불러오는 중" /></div>
  }
  if (!data.enabled) {
    return <EmptyState icon={Wallet} title="이 팀은 월렛을 쓰지 않아요" framed />
  }

  const name = data.name ?? '월렛'
  const me = data.me
  const pending = me?.requests.find(r => r.status === 'pending') ?? null

  async function submit() {
    const n = Number(amount.replace(/[,\s]/g, ''))
    if (!Number.isInteger(n) || n <= 0) { toast.error('금액을 숫자로 적어 주세요'); return }
    if (!depositor.trim()) { toast.error('입금자명을 적어 주세요'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/wallet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: n, depositor_name: depositor.trim() }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error ?? '요청하지 못했어요'); return }
      toast.success('충전 요청을 보냈어요. 어드민이 입금을 확인하면 포인트가 들어와요')
      setAmount('')
      await load()
    } finally { setBusy(false) }
  }

  async function cancel(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/wallet?requestId=${id}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) toast.error(j.error ?? '취소하지 못했어요')
      else toast.success('충전 요청을 취소했어요')
      await load()
    } finally { setBusy(false) }
  }

  function copyBank() {
    if (!data?.bank) return
    const digits = data.bank.match(/[\d-]{8,}/)?.[0] ?? data.bank
    navigator.clipboard?.writeText(digits).then(() => toast.success('계좌번호를 복사했어요'), () => {})
  }

  return (
    <div className="space-y-4 lg:space-y-5 max-w-lg lg:max-w-2xl lg:mx-auto">
      <h2 className="font-black text-[28px] lg:text-[40px] leading-none text-[color:var(--mm-ink)] tracking-tight">{name}</h2>

      {!me ? (
        user ? <EmptyState icon={Wallet} title="가입 승인 후에 쓸 수 있어요" framed /> : <LoginTeaser />
      ) : (
        <>
          {/* 잔액 */}
          <SectionCard variant="standalone">
            <div className="text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>내 포인트</div>
            <div className="font-black text-[40px] leading-tight tabular-nums" style={{ color: 'var(--mm-ink)' }}>{fmtP(me.balance)}</div>
            <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>유효기간 없음 · 1원 = 1P</div>
          </SectionCard>

          {/* 충전 */}
          <SectionCard variant="standalone">
            <h3 className="font-black text-lg mb-3" style={{ color: 'var(--mm-ink)' }}>충전하기</h3>
            {pending ? (
              <div className="space-y-2">
                <p className="text-sm" style={{ color: 'var(--mm-ink)' }}>
                  <b className="tabular-nums">{fmtP(pending.amount)}</b> 충전 요청을 어드민이 확인하고 있어요 (입금자 {pending.depositor_name}).
                </p>
                <button
                  type="button" disabled={busy} onClick={() => cancel(pending.id)}
                  className="mm-press inline-flex items-center gap-1 min-h-11 px-3 text-sm font-bold border border-[color:var(--mm-rule)]"
                  style={{ color: 'var(--mm-ink)' }}
                >
                  <X size={16} aria-hidden />요청 취소
                </button>
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
                <div className="flex flex-wrap gap-2">
                  {QUICK.map(q => (
                    <button
                      key={q} type="button" onClick={() => setAmount(String(q))}
                      className="mm-press min-h-11 px-3 text-sm font-bold border"
                      style={{
                        borderColor: Number(amount) === q ? 'var(--mm-ink)' : 'var(--mm-rule)',
                        background: Number(amount) === q ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                        color: Number(amount) === q ? 'var(--mm-black)' : 'var(--mm-ink)',
                      }}
                    >
                      {q.toLocaleString()}원
                    </button>
                  ))}
                </div>
                <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                  입금한 금액(원)
                  <input
                    inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ''))}
                    className="mt-1 w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base tabular-nums"
                    placeholder="예: 30000"
                  />
                </label>
                <label className="block text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                  입금자명 (통장에 찍힌 이름)
                  <input
                    value={depositor} onChange={e => setDepositor(e.target.value)} maxLength={40}
                    className="mt-1 w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base"
                  />
                </label>
                <button
                  type="button" disabled={busy || !amount} onClick={submit}
                  className="mm-press w-full min-h-12 font-black disabled:opacity-50"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                >
                  {busy ? '보내는 중' : '충전 요청 보내기'}
                </button>
              </div>
            )}
          </SectionCard>

          {/* 내역 */}
          <SectionCard variant="standalone">
            <SegmentedTabs
              ariaLabel="월렛 내역" value={tab} onChange={setTab} fullWidth size="sm"
              items={[{ key: 'ledger', label: '사용 내역' }, { key: 'requests', label: '충전 요청' }]}
            />
            <div className="mt-3">
              {tab === 'ledger' ? <LedgerList rows={me.ledger} /> : <RequestList rows={me.requests} />}
            </div>
          </SectionCard>
        </>
      )}

      {isEditMode && <WalletAdminPanel leagueId={leagueId} onChanged={load} />}
    </div>
  )
}
