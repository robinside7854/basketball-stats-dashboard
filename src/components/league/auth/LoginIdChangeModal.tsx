'use client'
// 로그인 회원 · 아이디 변경 (2026-11-10 운영진 — 아이디와 실명을 따로)
//   PATCH /api/leagues/[leagueId]/auth/login-id { loginId, password }
import { useState, useEffect } from 'react'
import { X, AtSign, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { LOGIN_ID_RULE } from '@/lib/auth/loginId'

export default function LoginIdChangeModal({ leagueId, current, onClose, onDone }: { leagueId: string; current: string; onClose: () => void; onDone: () => void }) {
  const [next, setNext] = useState('')
  const [pw, setPw] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  async function submit() {
    if (saving) return
    if (!next.trim()) { toast.error('새 아이디를 입력하세요'); return }
    if (!pw) { toast.error('비밀번호를 입력하세요'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/login-id`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: next.trim(), password: pw }),
      })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (!r.ok || !d.ok) throw new Error(d.error ?? '변경 실패')
      toast.success('아이디를 바꿨어요. 다음부터 새 아이디로 로그인하세요.')
      onDone(); onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '변경 실패')
    } finally { setSaving(false) }
  }

  const inputCls = 'w-full min-h-[44px] px-3 py-2 text-sm bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-[var(--mm-radius-ctl)] focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow-strong)]'
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true" aria-label="아이디 변경">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-sm bg-[color:var(--mm-panel)] shadow-[var(--mm-shadow-lg)] overflow-hidden flex flex-col break-keep"
        style={{ border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-card)' }}>
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
          <span className="inline-flex items-center gap-2 text-xs font-black text-[color:var(--mm-black)]"><AtSign size={16} aria-hidden />아이디 변경</span>
          <button type="button" onClick={onClose} aria-label="닫기" className="mm-press min-w-[44px] min-h-[44px] inline-flex items-center justify-center cursor-pointer text-[color:var(--mm-black)]"><X size={20} /></button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>지금 아이디 <b style={{ color: 'var(--mm-ink)' }}>{current}</b></p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--mm-muted)' }}>새 아이디</label>
            <input value={next} onChange={e => setNext(e.target.value)} autoComplete="username" className={inputCls} style={{ color: 'var(--mm-ink)' }} placeholder={LOGIN_ID_RULE} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--mm-muted)' }}>비밀번호 확인</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="current-password" className={inputCls} style={{ color: 'var(--mm-ink)' }}
              placeholder="지금 비밀번호" onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
          <button type="button" onClick={onClose} className="mm-press min-h-[44px] px-4 text-xs font-bold cursor-pointer"
            style={{ borderRadius: 'var(--mm-radius-ctl)', background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}>취소</button>
          <button type="button" onClick={submit} disabled={saving} className="mm-press min-h-[44px] px-4 text-xs font-black cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ borderRadius: 'var(--mm-radius-ctl)', background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <AtSign size={14} aria-hidden />}변경
          </button>
        </div>
      </div>
    </div>
  )
}
