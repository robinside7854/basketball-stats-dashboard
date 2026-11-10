'use client'
// 정규권 판매 — 월렛 어드민 탭 (2026-11-10 운영진, 마이그레이션 134)
//   정규권은 인기가 많아 운영진이 달마다 판매를 연다: 달 · 여는 때 · 닫는 때 · 정원(기본 18명).
//   판매 중에만 회원이 「티켓 사기」에서 정규권을 산다(선착순 · 정원이 차면 자동 마감).
//   산 사람이 전 달 정규였으면 같은 팀으로 그 달 정규에 자동 배정 — 아래 목록에 팀이 보이고, 없으면 「팀 정해야 해요」.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Crown, Copy } from 'lucide-react'
import type { PassSale, PassBuyer } from '@/lib/wallet/passSales'

type Sale = PassSale & { buyers: PassBuyer[] }

const pad = (n: number) => String(n).padStart(2, '0')
/** <input type="datetime-local"> 값(이 기기 시각) */
function localInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function monthKeyOf(d: Date, add = 0): string {
  const x = new Date(d.getFullYear(), d.getMonth() + add, 1)
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`
}
const mon = (m: string) => `${Number(m.slice(5, 7))}월`
function when(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const STATE: Record<PassSale['state'], { t: string; c: string }> = {
  upcoming: { t: '판매 예정', c: 'var(--mm-ink-soft)' },
  open: { t: '판매 중', c: '#059669' },
  closed: { t: '마감', c: 'var(--mm-muted)' },
}

export default function PassSaleBox({ leagueId }: { leagueId: string }) {
  const api = `/api/leagues/${leagueId}/wallet/admin`
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [form, setForm] = useState<{ month: string; opens: string; closes: string; capacity: number } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`${api}?sales=1`, { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setSales(((await r.json()).sales ?? []) as Sale[])
  }, [api])
  useEffect(() => { void load() }, [load])

  function startNew() {
    const now = new Date()
    // 보통 월말에 다음 달 것을 판다 — 15일부터는 다음 달, 그 전이면 이번 달을 기본으로
    const month = monthKeyOf(now, now.getDate() >= 15 ? 1 : 0)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59)
    setForm({ month, opens: localInput(now), closes: localInput(end), capacity: 18 })
  }
  function edit(s: Sale) {
    setForm({ month: s.month, opens: localInput(new Date(s.opens_at)), closes: localInput(new Date(s.closes_at)), capacity: s.capacity })
  }

  async function post(body: Record<string, unknown>, ok: string) {
    setBusy(true)
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? '처리하지 못했어요'); return false }
      toast.success(ok)
      await load()
      return true
    } finally { setBusy(false) }
  }

  async function save() {
    if (!form) return
    const opens = new Date(form.opens), closes = new Date(form.closes)
    if (!(closes > opens)) { toast.error('닫는 때가 여는 때보다 뒤여야 해요'); return }
    if (await post({ action: 'pass_sale', month: form.month, opens_at: opens.toISOString(), closes_at: closes.toISOString(), capacity: form.capacity },
      `${mon(form.month)} 정규권 판매를 저장했어요`)) setForm(null)
  }

  async function copyNotice(s: Sale) {
    const text = `[${mon(s.month)} 정규권 오픈]\n${when(s.opens_at)} ~ ${when(s.closes_at)}\n선착순 ${s.capacity}명 · 앱 「월렛 → 티켓 사기」\n지난달 정규였다면 같은 팀으로 자동 배정돼요.\n남은 비정규 티켓이 있으면 정규권 값에서 할인돼요.`
    try { await navigator.clipboard.writeText(text); toast.success('단톡방 안내문을 복사했어요') }
    catch { toast.error('복사하지 못했어요') }
  }

  if (!sales) return null
  const btn = 'mm-press inline-flex items-center gap-1 min-h-10 px-3 text-sm font-bold'
  const input = 'mt-1 w-full min-h-11 px-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] text-base'

  return (
    <div className="break-keep">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-black text-lg inline-flex items-center gap-1.5" style={{ color: 'var(--mm-ink)' }}>
          <Crown size={18} style={{ color: '#D4AF37' }} aria-hidden />정규권 판매
        </h3>
        {!form && (
          <button type="button" onClick={startNew} className={btn}
            style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>
            판매 열기
          </button>
        )}
      </div>
      <p className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>판매 중에만 회원이 정규권을 살 수 있어요. 정원이 차면 저절로 마감돼요.</p>

      {form && (
        <div className="mt-3 p-3 space-y-2" style={{ border: '2px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-card)', background: 'var(--mm-yellow-soft)' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>달
              <select className={input} value={form.month} onChange={e => setForm({ ...form, month: e.target.value })}>
                {[0, 1, 2].map(i => { const m = monthKeyOf(new Date(), i); return <option key={m} value={m}>{Number(m.slice(0, 4))}년 {mon(m)}</option> })}
              </select>
            </label>
            <label className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>정원
              <input type="number" min={1} max={200} className={input} value={form.capacity} onChange={e => setForm({ ...form, capacity: Number(e.target.value) || 1 })} />
            </label>
            <label className="text-sm font-bold col-span-2 sm:col-span-1" style={{ color: 'var(--mm-ink)' }}>여는 때
              <input type="datetime-local" className={input} value={form.opens} onChange={e => setForm({ ...form, opens: e.target.value })} />
            </label>
            <label className="text-sm font-bold col-span-2 sm:col-span-1" style={{ color: 'var(--mm-ink)' }}>닫는 때
              <input type="datetime-local" className={input} value={form.closes} onChange={e => setForm({ ...form, closes: e.target.value })} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={save} className={`${btn} disabled:opacity-50`}
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}>저장</button>
            <button type="button" onClick={() => setForm(null)} className={`${btn} border`}
              style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>닫기</button>
          </div>
        </div>
      )}

      {sales.length === 0 && !form && <p className="text-sm py-2" style={{ color: 'var(--mm-ink-soft)' }}>열린 판매가 없어요</p>}
      <ul className="mt-2 space-y-2">
        {sales.map(s => {
          const st = s.sold >= s.capacity && s.state === 'open' ? { t: '정원 마감', c: 'var(--mm-muted)' } : STATE[s.state]
          const noTeam = s.buyers.filter(b => !b.team_id)
          return (
            <li key={s.id} className="p-3" style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-black" style={{ color: 'var(--mm-ink)' }}>
                    {mon(s.month)} 정규권 <span className="tabular-nums">{s.sold}/{s.capacity}명</span>
                    <span className="ml-1.5 text-xs font-black" style={{ color: st.c }}>{st.t}</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{when(s.opens_at)} ~ {when(s.closes_at)}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => copyNotice(s)} className={`${btn} border`} style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>
                    <Copy size={14} aria-hidden />안내 복사
                  </button>
                  <button type="button" onClick={() => edit(s)} className={`${btn} border`} style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>고치기</button>
                  {s.state !== 'closed' && (
                    <button type="button" disabled={busy} onClick={() => { if (confirm(`${mon(s.month)} 정규권 판매를 지금 마감할까요?`)) void post({ action: 'pass_sale_close', month: s.month }, '판매를 마감했어요') }}
                      className={`${btn} border disabled:opacity-50`} style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-live-bg)', borderRadius: 'var(--mm-radius-ctl)' }}>지금 마감</button>
                  )}
                </div>
              </div>
              {s.buyers.length > 0 && (
                <ul className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-sm">
                  {s.buyers.map(b => (
                    <li key={b.player_id} style={{ color: 'var(--mm-ink)' }}>
                      {b.name} <span className="text-xs font-bold" style={{ color: b.team_name ? 'var(--mm-ink-soft)' : 'var(--mm-live-bg)' }}>{b.team_name ?? '팀 정해야 해요'}</span>
                    </li>
                  ))}
                </ul>
              )}
              {noTeam.length > 0 && (
                <p className="mt-2 text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
                  지난달 정규가 아니었던 {noTeam.length}명은 「팀 → 명단 편집 → 달별 정규 멤버」에서 팀을 정해 주세요.
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
