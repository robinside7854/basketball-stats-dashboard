'use client'
import { useActionState, useEffect, useState } from 'react'
import Link from 'next/link'
import { loginAction } from './actions'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Basketball } from '@/components/league/BasketballIcons'

// '아이디 저장' 은 **이메일만** 저장한다. 비밀번호는 어떤 경우에도 저장하지 않는다 —
// localStorage 는 같은 출처의 스크립트가 전부 읽을 수 있는 평문 저장소다.
const EMAIL_KEY = 'onball_admin_email'

export default function AdminLoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined)
  const [email, setEmail] = useState('')
  const [rememberId, setRememberId] = useState(false)
  const [welcome, setWelcome] = useState(false)

  // localStorage/쿼리는 서버 렌더에 없다 — 초기값을 비워 두고 마운트 후 채워야 하이드레이션이 어긋나지 않는다.
  // useSearchParams 대신 window.location 을 읽는 이유: 이 페이지를 Suspense 로 감싸지 않아도 되게 하려는 것.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    // 초대 수락 직후 넘어온 경우 — 방금 만든 계정을 다시 타이핑하게 하지 않는다.
    const fromInvite = params.get('email')
    setWelcome(params.get('welcome') === '1')

    const saved = localStorage.getItem(EMAIL_KEY)
    if (fromInvite) {
      setEmail(fromInvite)
    } else if (saved) {
      setEmail(saved)
      setRememberId(true)
    }
  }, [])

  // 저장 여부는 제출 시점에 확정한다 — 체크만 하고 로그인을 포기한 경우까지 남길 이유가 없다.
  function handleSubmit(formData: FormData) {
    try {
      if (formData.get('rememberId') === 'on') {
        localStorage.setItem(EMAIL_KEY, String(formData.get('email') ?? ''))
      } else {
        localStorage.removeItem(EMAIL_KEY)
      }
    } catch {
      // 시크릿 모드 등 저장이 막힌 환경 — 로그인 자체는 그대로 진행한다.
    }
    formAction(formData)
  }

  const inputClass =
    'w-full min-h-11 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus:border-[var(--mm-yellow-strong)] transition-colors'
  const checkboxClass =
    'w-4 h-4 shrink-0 accent-[var(--mm-yellow-strong)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none'

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--mm-ink)] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Basketball size={24} className="text-[var(--mm-yellow-strong)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)]">온볼 운영</h1>
          {/* 동호회 어드민이 잘못 찾아왔을 때 여기가 자기 자리가 아님을 알 수 있어야 한다 */}
          <p className="text-sm text-[var(--mm-muted)] mt-1">플랫폼 콘솔 · 동호회 운영진용이 아닙니다</p>
        </div>

        {welcome && (
          <div className="mb-4 rounded-xl border border-[var(--mm-positive)]/30 bg-[var(--mm-positive-bg)] px-4 py-3 flex items-start gap-2">
            <CheckCircle2 size={16} className="text-[var(--mm-positive-fg)] mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-[var(--mm-positive-fg)] leading-relaxed">
              계정이 만들어졌습니다. 방금 설정한 비밀번호로 로그인하세요.
            </p>
          </div>
        )}

        <form action={handleSubmit} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="text-xs text-[var(--mm-muted)] mb-1.5 block">이메일</label>
            <input
              id="login-email"
              type="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className={inputClass}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="text-xs text-[var(--mm-muted)] mb-1.5 block">비밀번호</label>
            <input
              id="login-password"
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-0.5">
            <label htmlFor="login-remember-id" className="flex items-center gap-2 text-xs text-[var(--mm-ink-soft)] cursor-pointer select-none">
              <input
                id="login-remember-id"
                type="checkbox"
                name="rememberId"
                checked={rememberId}
                onChange={(e) => setRememberId(e.target.checked)}
                className={checkboxClass}
              />
              아이디 저장
            </label>
            {/* value="true" — authorize() 가 문자열 'true' 로 읽는다 (src/lib/auth.ts) */}
            <label htmlFor="login-remember" className="flex items-center gap-2 text-xs text-[var(--mm-ink-soft)] cursor-pointer select-none">
              <input
                id="login-remember"
                type="checkbox"
                name="remember"
                value="true"
                className={checkboxClass}
              />
              로그인 유지
            </label>
          </div>

          {/* 오답 안내와 잠금 안내가 같은 자리에 뜬다 (문구는 서버가 정한다 — actions.ts).
              잠금 안내는 "몇 분 뒤에 다시" 를 포함하므로, 한 줄로 흘리지 않고 박스로 세워
              사용자가 계속 두드리지 않게 한다. */}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-[var(--mm-negative)]/30 bg-[var(--mm-negative)]/10 px-3 py-2.5"
            >
              <p className="text-xs text-[var(--mm-negative)] leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full min-h-11 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium py-2.5 rounded-lg text-sm transition-opacity flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
          >
            {pending && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            로그인
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-[var(--mm-muted)]">
          권한이 없으신가요?{' '}
          <Link
            href="/admin/request-access"
            className="text-[var(--mm-ink)] font-medium hover:text-[var(--mm-yellow-strong)] transition-colors cursor-pointer underline underline-offset-2"
          >
            접근 요청하기
          </Link>
        </p>
      </div>
      <Toaster richColors theme="dark" />
    </div>
  )
}
