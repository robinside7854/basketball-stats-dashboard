'use client'
// 로그인/가입 모달
//   Step 1 · 안내: "지금도 이용 가능하지만 가입하면 더 많은 기능…"
//   Step 2 · 로그인 or 가입 폼 · 탭 전환
//   가입: 이름 + 생년월일 6자리 → 어드민 승인 대기 안내
//   로그인: 아이디 + 비번 → 성공 시 세션 쿠키 · 컨텍스트 refresh
import { useState, useEffect } from 'react'
import { X, LogIn, UserPlus, ArrowRight, Info } from 'lucide-react'
import { toast } from 'sonner'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

interface Props {
  leagueId: string
  onClose: () => void
}

type Step = 'intro' | 'login' | 'signup'

export default function LoginModal({ leagueId, onClose }: Props) {
  const [step, setStep] = useState<Step>('intro')
  const { refresh } = useCurrentUser()

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="로그인"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md bg-[color:var(--mm-panel)] rounded-md overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)', boxShadow: '0 24px 60px -12px rgba(0,0,0,0.55)' }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <h2 className="font-jersey font-black uppercase text-lg" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
            {step === 'intro' ? '로그인 안내' : step === 'login' ? '로그인' : '가입 요청'}
          </h2>
          <button onClick={onClose} className="p-1.5 min-h-[36px] min-w-[36px] flex items-center justify-center rounded cursor-pointer" style={{ color: 'var(--mm-muted)' }} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {step === 'intro' && <IntroStep onProceed={() => setStep('login')} />}
          {step === 'login' && (
            <LoginForm
              leagueId={leagueId}
              onSuccess={async () => { await refresh(); onClose(); toast.success('로그인 성공') }}
              onSwitchSignup={() => setStep('signup')}
            />
          )}
          {step === 'signup' && (
            <SignupForm
              leagueId={leagueId}
              onDone={() => setStep('login')}
              onSwitchLogin={() => setStep('login')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─────── Step 1 · 안내 ───────
function IntroStep({ onProceed }: { onProceed: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2.5" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', padding: '12px 14px', borderRadius: '4px' }}>
        <Info size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--mm-yellow-strong)' }} />
        <div className="text-[13px] leading-relaxed" style={{ color: 'var(--mm-ink)' }}>
          {/* 멀티테넌트 전환(온볼): LoginModal 은 leagueName prop 없이 leagueId 만 받으므로 특정 클럽명 대신 중립 문구 사용 */}
          <p className="font-bold mb-1">지금도 우리 팀 스탯 서비스를 이용할 수 있어요.</p>
          <p style={{ color: 'var(--mm-ink-soft)' }}>
            가입하면 <b>개인화 대시보드</b> · <b>내 뱃지 컬렉션</b> 등 더 많은 기능이 열립니다.
          </p>
        </div>
      </div>

      <div className="text-[12px] space-y-2 pt-1" style={{ color: 'var(--mm-muted)' }}>
        <p>· 가입은 <b>이름 + 생년월일 6자리</b> 만 필요합니다.</p>
        <p>· 어드민 승인 후 로그인 가능해요.</p>
        <p>· 초기 아이디는 <b>이름</b>, 초기 비밀번호는 <b>생년월일 6자리</b> · 언제든 변경 가능.</p>
      </div>

      <button
        onClick={onProceed}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] font-jersey font-black uppercase tracking-[0.14em] text-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)]"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: 'none', borderRadius: '4px' }}
      >
        로그인하기
        <ArrowRight size={16} />
      </button>
    </div>
  )
}

// ─────── Step 2 · 로그인 ───────
function LoginForm({ leagueId, onSuccess, onSwitchSignup }: { leagueId: string; onSuccess: () => void | Promise<void>; onSwitchSignup: () => void }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!loginId.trim() || !password) { toast.error('아이디와 비밀번호를 입력하세요'); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loginId: loginId.trim(), password }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error ?? '로그인 실패'); return }
      await onSuccess()
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FieldLabel>아이디 (초기값: 이름)</FieldLabel>
      <input
        type="text"
        value={loginId}
        onChange={e => setLoginId(e.target.value)}
        autoComplete="username"
        className="input"
        style={inputStyle}
        placeholder="이름 (예: 김로빈)"
      />
      <FieldLabel>비밀번호 (초기값: 생년월일 6자리)</FieldLabel>
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        autoComplete="current-password"
        className="input"
        style={inputStyle}
        placeholder="YYMMDD"
      />
      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] font-jersey font-black uppercase tracking-[0.14em] text-sm cursor-pointer transition-colors"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: 'none', borderRadius: '4px', opacity: busy ? 0.6 : 1 }}
      >
        <LogIn size={16} />
        {busy ? '로그인 중…' : '로그인'}
      </button>
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onSwitchSignup}
          className="text-xs font-bold underline cursor-pointer"
          style={{ color: 'var(--mm-muted)' }}
        >
          아직 계정이 없나요? 가입 요청 →
        </button>
      </div>
      <p className="text-[11px] text-center pt-2" style={{ color: 'var(--mm-muted)' }}>
        비밀번호를 잊었다면 관리자에게 초기화 요청하세요 (초기화 시 <b>123456</b>)
      </p>
    </form>
  )
}

// ─────── Step 3 · 가입 요청 ───────
function SignupForm({ leagueId, onDone, onSwitchLogin }: { leagueId: string; onDone: () => void; onSwitchLogin: () => void }) {
  const [name, setName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [rosterNames, setRosterNames] = useState<string[]>([])

  // #4 로스터 이름 자동완성 — 등록명과 불일치로 인한 가입 실패 방지
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/players`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: Array<{ name?: string }>) => setRosterNames([...new Set(rows.map(p => p.name).filter((n): n is string => !!n))]))
      .catch(() => { /* 무시 */ })
  }, [leagueId])

  // #5 접수 완료 시 '승인 대기' 플래그 저장 → 재방문 시 로그인 버튼에 배지 노출
  useEffect(() => {
    if (done) { try { localStorage.setItem(`mm_signup_pending:${leagueId}`, '1') } catch { /* 무시 */ } }
  }, [done, leagueId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!name.trim()) { toast.error('이름을 입력하세요'); return }
    if (!/^\d{6}$/.test(birthdate)) { toast.error('생년월일은 6자리 (YYMMDD) 로 입력'); return }
    setBusy(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), birthdate }),
      })
      const d = await r.json()
      if (!r.ok) {
        if (d.status === 'approved') {
          toast.info('이미 승인된 계정이에요. 로그인하세요.')
          onSwitchLogin()
          return
        }
        if (d.status === 'pending') {
          toast.info(d.message ?? '이미 승인 대기 중')
          setDone(true)
          return
        }
        toast.error(d.error ?? d.message ?? '가입 실패')
        return
      }
      setDone(true)
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="space-y-4 text-center py-4">
        <div className="text-4xl">✅</div>
        <p className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>가입 요청이 접수되었습니다</p>
        <p className="text-[13px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
          관리자 승인 후 로그인 가능해요.<br />
          승인되면 <b>이름</b> / <b>생년월일 6자리</b> 로 로그인하세요.
        </p>
        <button
          onClick={onDone}
          className="w-full min-h-[44px] font-jersey font-black uppercase tracking-[0.14em] text-sm cursor-pointer"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          로그인 화면으로
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FieldLabel>이름</FieldLabel>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        className="input"
        style={inputStyle}
        placeholder="선수 등록된 이름과 동일하게"
        list="mm-roster-names"
        autoComplete="off"
      />
      <datalist id="mm-roster-names">
        {rosterNames.map(n => <option key={n} value={n} />)}
      </datalist>
      <FieldLabel>생년월일 6자리 (초기 비밀번호로 사용)</FieldLabel>
      <input
        type="text"
        inputMode="numeric"
        pattern="\d{6}"
        maxLength={6}
        value={birthdate}
        onChange={e => setBirthdate(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
        className="input"
        style={inputStyle}
        placeholder="예: 900101 (YYMMDD)"
      />
      <p className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>
        · 이름은 선수 명단에 등록된 이름과 동일해야 해요<br />
        · 생년월일 6자리는 <b>초기 로그인 비밀번호</b>로 사용됩니다 (로그인 후 변경 가능)<br />
        · 접수 후 관리자가 승인하면 로그인 가능
      </p>
      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] font-jersey font-black uppercase tracking-[0.14em] text-sm cursor-pointer transition-colors"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: 'none', borderRadius: '4px', opacity: busy ? 0.6 : 1 }}
      >
        <UserPlus size={16} />
        {busy ? '접수 중…' : '가입 요청'}
      </button>
      <div className="text-center pt-2">
        <button
          type="button"
          onClick={onSwitchLogin}
          className="text-xs font-bold underline cursor-pointer"
          style={{ color: 'var(--mm-muted)' }}
        >
          ← 로그인 화면으로
        </button>
      </div>
    </form>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11px] font-black uppercase tracking-[0.10em] mt-3 mb-1" style={{ color: 'var(--mm-muted)' }}>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--mm-panel-alt)',
  color: 'var(--mm-ink)',
  border: '1px solid var(--mm-rule)',
  borderRadius: '3px',
  fontSize: '14px',
  minHeight: 44,
  outline: 'none',
}
