'use client'
// 카카오뱅크 입금 알림 자동 승인 — 월렛 어드민 탭 (2026-11-09 운영진, 마이그레이션 128)
//   ① 「연결 비밀번호 만들기」 → 받는 주소 · 비밀번호(이때 한 번만 보임)를 통장 주인 폰의 알림 자동화 앱에 넣는다.
//   ② 그 뒤로 입금 알림이 오면 이름·금액이 딱 맞는 충전 요청이 저절로 승인된다(보너스 포함).
//   ③ 아래 「최근 받은 알림」에서 무엇이 자동 승인됐고 무엇이 손으로 남았는지 본다.
//   설정 순서는 docs/kakaobank-auto-approve-guide.md.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { fmtWhen } from './walletParts'

type Ev = { id: string; raw_text: string; amount: number | null; status: 'matched' | 'unmatched' | 'ambiguous' | 'ignored'; created_at: string; name: string | null }
type State = { ready: boolean; connected?: boolean; created_at?: string | null; last_used_at?: string | null; events?: Ev[] }

const STATUS: Record<Ev['status'], { t: string; c: string }> = {
  matched: { t: '자동 승인', c: '#059669' },
  unmatched: { t: '짝 없음', c: 'var(--mm-live-bg)' },
  ambiguous: { t: '여러 명 — 손으로', c: 'var(--mm-live-bg)' },
  ignored: { t: '입금 아님·중복', c: 'var(--mm-muted)' },
}

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); toast.success(`${what}를 복사했어요`) }
  catch { toast.error('복사하지 못했어요') }
}

export default function BankAutoBox({ leagueId }: { leagueId: string }) {
  const api = `/api/leagues/${leagueId}/wallet/admin`
  const [st, setSt] = useState<State | null>(null)
  const [issued, setIssued] = useState<{ token: string; url: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch(`${api}?bank=1`, { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setSt(await r.json())
  }, [api])
  useEffect(() => { void load() }, [load])

  async function post(action: 'bank_token' | 'bank_disconnect') {
    if (action === 'bank_token' && st?.connected && !confirm('새로 만들면 지금 폰에 넣어 둔 비밀번호는 더 이상 안 돼요. 새로 만들까요?')) return
    if (action === 'bank_disconnect' && !confirm('자동 승인을 끌까요? 폰에서 보내는 알림을 더 이상 받지 않아요.')) return
    setBusy(true)
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? '처리하지 못했어요'); return }
      setIssued(action === 'bank_token' ? { token: j.token, url: j.url } : null)
      toast.success(action === 'bank_token' ? '연결 비밀번호를 만들었어요 — 지금 폰에 넣어 주세요' : '자동 승인을 껐어요')
      await load()
    } finally { setBusy(false) }
  }

  if (!st?.ready) return null
  const btn = 'mm-press inline-flex items-center gap-1 min-h-10 px-3 text-sm font-bold'

  return (
    <details className="mt-1">
      <summary className="cursor-pointer font-black text-lg min-h-11 flex items-center gap-2" style={{ color: 'var(--mm-ink)' }}>
        카카오뱅크 입금 자동 승인
        <span className="text-xs font-bold px-1.5" style={{ color: st.connected ? '#059669' : 'var(--mm-muted)', border: '1px solid currentColor', borderRadius: 'var(--mm-radius-chip)' }}>
          {st.connected ? '켜짐' : '꺼짐'}
        </span>
      </summary>
      <div className="mt-2 space-y-3 text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
        <p>
          통장 주인 폰(안드로이드)에 온 카카오뱅크 입금 알림을 온볼이 받아, <b style={{ color: 'var(--mm-ink)' }}>입금자명과 금액이 딱 맞는 충전 요청</b>을 저절로 승인해요(보너스 포함).
          같은 이름·같은 금액이 둘이거나 짝이 없으면 지금처럼 손으로 승인해요. 회원이 입금부터 하고 요청을 나중에 보내도 48시간 안이면 짝지어요.
        </p>
        {st.connected && (
          <p>
            연결함 {st.created_at ? fmtWhen(st.created_at) : ''} · 마지막으로 받은 알림 {st.last_used_at ? fmtWhen(st.last_used_at) : '아직 없음'}
          </p>
        )}

        {issued && (
          <div className="p-3 space-y-2" style={{ border: '2px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-card)', background: 'var(--mm-yellow-soft)' }}>
            <b className="block" style={{ color: 'var(--mm-ink)' }}>폰의 자동화 앱에 넣을 값 — 이 화면을 닫으면 비밀번호는 다시 볼 수 없어요</b>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>받는 주소 (URL)</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all" style={{ color: 'var(--mm-ink)' }}>{issued.url}</code>
                <button type="button" className={btn} onClick={() => copy(issued.url, '주소')} style={{ color: 'var(--mm-ink)' }}><Copy size={14} aria-hidden />복사</button>
              </div>
            </div>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>머리글 이름 x-bank-token 의 값 (비밀번호)</div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all" style={{ color: 'var(--mm-ink)' }}>{issued.token}</code>
                <button type="button" className={btn} onClick={() => copy(issued.token, '비밀번호')} style={{ color: 'var(--mm-ink)' }}><Copy size={14} aria-hidden />복사</button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => post('bank_token')} className={`${btn} disabled:opacity-50`}
            style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>
            {st.connected ? '비밀번호 새로 만들기' : '연결 비밀번호 만들기'}
          </button>
          {st.connected && (
            <button type="button" disabled={busy} onClick={() => post('bank_disconnect')} className={`${btn} border disabled:opacity-50`}
              style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-live-bg)', borderRadius: 'var(--mm-radius-ctl)' }}>
              자동 승인 끄기
            </button>
          )}
        </div>

        {(st.events?.length ?? 0) > 0 && (
          <div>
            <b className="block mb-1" style={{ color: 'var(--mm-ink)' }}>최근 받은 알림</b>
            <ul>
              {st.events!.map(e => (
                <li key={e.id} className="py-2 flex items-start justify-between gap-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="min-w-0">
                    <div style={{ color: 'var(--mm-ink)' }}>{e.raw_text}</div>
                    <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{fmtWhen(e.created_at)}{e.name ? ` · ${e.name} 님 충전 승인` : ''}</div>
                  </div>
                  <span className="shrink-0 text-xs font-black whitespace-nowrap" style={{ color: STATUS[e.status].c }}>{STATUS[e.status].t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
