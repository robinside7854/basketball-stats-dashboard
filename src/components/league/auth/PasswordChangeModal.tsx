'use client'
// 로그인 회원 · 비밀번호 변경 모달
//   PATCH /api/leagues/[leagueId]/auth/password { currentPassword, newPassword }
//   초기/재설정 비번(기본 '123456' 또는 생일) 사용 중이면 변경 유도.
import { useState, useCallback, useEffect } from 'react'
import { X, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  leagueId: string
  isDefaultPassword?: boolean
  onClose: () => void
  onDone: () => void   // 성공 시 상위에서 세션 refresh
}

export default function PasswordChangeModal({ leagueId, isDefaultPassword, onClose, onDone }: Props) {
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const submit = useCallback(async () => {
    if (saving) return
    if (!cur) { toast.error('현재 비밀번호를 입력하세요'); return }
    if (nw.length < 4) { toast.error('새 비밀번호는 4자 이상이어야 합니다'); return }
    if (nw !== confirm) { toast.error('새 비밀번호 확인이 일치하지 않습니다'); return }
    if (nw === cur) { toast.error('현재 비밀번호와 다른 비밀번호를 사용하세요'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      })
      const d = await r.json() as { ok?: boolean; error?: string }
      if (!r.ok || !d.ok) throw new Error(d.error ?? '변경 실패')
      toast.success('비밀번호가 변경되었습니다')
      onDone()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '변경 실패')
    } finally {
      setSaving(false)
    }
  }, [saving, cur, nw, confirm, leagueId, onClose, onDone])

  const inputCls = 'w-full min-h-[44px] px-3 py-2 text-sm bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]'

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="비밀번호 변경"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-sm bg-[color:var(--mm-panel)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)', borderRadius: 8 }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
          <div className="inline-flex items-center gap-2">
            <KeyRound size={16} className="text-[color:var(--mm-black)]" aria-hidden />
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--mm-black)]">비밀번호 변경</span>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors hover:bg-black/10 cursor-pointer text-[color:var(--mm-black)]">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {isDefaultPassword && (
            <p className="text-[12px] leading-relaxed px-3 py-2 rounded-sm" style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}>
              현재 <b>초기 비밀번호</b>를 사용 중이에요. 안전을 위해 나만 아는 비밀번호로 변경하세요.
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>현재 비밀번호</label>
            <input type={show ? 'text' : 'password'} value={cur} onChange={e => setCur(e.target.value)}
              autoComplete="current-password" className={inputCls} style={{ color: 'var(--mm-ink)' }} placeholder="현재 비밀번호" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>새 비밀번호</label>
            <div className="relative">
              <input type={show ? 'text' : 'password'} value={nw} onChange={e => setNw(e.target.value)}
                autoComplete="new-password" className={inputCls} style={{ color: 'var(--mm-ink)', paddingRight: 44 }} placeholder="새 비밀번호 (4자 이상)" />
              <button type="button" onClick={() => setShow(v => !v)} aria-label={show ? '비밀번호 숨기기' : '비밀번호 표시'}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] inline-flex items-center justify-center cursor-pointer" style={{ color: 'var(--mm-muted)' }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>새 비밀번호 확인</label>
            <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password" className={inputCls} style={{ color: 'var(--mm-ink)' }} placeholder="새 비밀번호 다시 입력"
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
          <button type="button" onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors"
            style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}>
            취소
          </button>
          <button type="button" onClick={submit} disabled={saving}
            className="min-h-[40px] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} aria-hidden />}
            변경
          </button>
        </div>
      </div>
    </div>
  )
}
