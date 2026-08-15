'use client'
// 비밀번호 재설정 (/admin/reset-password/[token]) — 로그인 불필요.
//
// 비밀번호를 잊은 공동관리자가 여는 유일한 화면이라, 미들웨어의 /admin 로그인 검사에서
// 빠져 있다(src/middleware.ts ADMIN_PUBLIC). 인증은 URL 의 토큰 자체가 한다.
//
// 구조는 초대 화면(/admin/invite/[token])과 일부러 똑같이 뒀다 — 같은 토큰 방식이고,
// 받는 사람 입장에서 하는 일도 '비밀번호를 정한다' 로 같다. 다른 점은 두 가지다.
//   1) 이메일을 가려서 보여준다(ro***@example.com). 이미 존재하는 관리자 계정의 주소라
//      링크가 엉뚱한 사람에게 갔을 때 주소를 그대로 알려주면 안 된다.
//   2) 링크 수명이 24시간이다(초대는 72시간). 계정을 통째로 가져갈 수 있는 링크라 짧다.
import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

const MIN_PASSWORD_LENGTH = 10

// server_error 는 서버가 준 사유가 아니라 화면이 붙이는 사유다 — 조회 자체가 실패했을 때
// 'not_found'(존재하지 않는 링크)로 뭉뚱그리면, 멀쩡한 링크를 받은 사람이 링크를 버린다.
type Check =
  | { ok: true; maskedEmail: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'revoked' | 'server_error' }

const REASON_TITLE: Record<string, string> = {
  not_found: '존재하지 않는 링크입니다',
  expired: '링크가 만료되었습니다',
  used: '이미 사용된 링크입니다',
  revoked: '회수된 링크입니다',
  server_error: '링크를 확인하지 못했습니다',
}

const REASON_BODY: Record<string, string> = {
  not_found: '링크가 잘못되었거나 일부만 복사되었을 수 있습니다. 받은 링크 전체를 다시 확인해 주세요.',
  expired: '재설정 링크는 만들어진 뒤 24시간 동안만 쓸 수 있습니다. 운영자에게 새 링크를 요청해 주세요.',
  used: '이 링크로 비밀번호가 이미 바뀌었습니다. 새로 정한 비밀번호로 로그인하세요.',
  revoked: '운영자가 이 링크를 회수했습니다. 필요하다면 새 링크를 요청해 주세요.',
  server_error: '링크에 문제가 있는 것이 아니라, 확인이 잠시 실패했습니다. 다시 시도해 주세요.',
}

export default function AdminResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)

  const [check, setCheck] = useState<Check | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // 이 라우트는 유효성 결과를 200 으로 준다 — 따라서 !res.ok 는 진짜 서버 오류다.
  const loadCheck = useCallback(async () => {
    setCheck(null)
    const res = await fetch(`/api/admin/reset-password/${encodeURIComponent(token)}`).catch(() => null)
    if (!res?.ok) { setCheck({ ok: false, reason: 'server_error' }); return }
    const data = await res.json().catch(() => null)
    setCheck((data as Check | null) ?? { ok: false, reason: 'server_error' })
  }, [token])

  useEffect(() => { void loadCheck() }, [loadCheck])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다`)
      return
    }
    if (password !== confirm) {
      setError('비밀번호가 서로 다릅니다')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/reset-password/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? '비밀번호를 바꾸지 못했습니다')
        setSubmitting(false)
        return
      }
      // 로그인 화면으로 곧장 보내지 않고 완료 화면을 한 번 거친다. 이메일을 가려서만 알고
      // 있어 로그인 폼을 미리 채워줄 수 없기 때문에(초대 화면과 다른 점), 바로 넘기면
      // "바뀐 게 맞나?" 를 확인할 자리가 사라진다.
      setDone(true)
    } catch {
      setError('비밀번호를 바꾸지 못했습니다 — 잠시 후 다시 시도하세요')
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full min-h-11 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus:border-[var(--mm-yellow-strong)] transition-colors'

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--mm-ink)] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Basketball size={24} className="text-[var(--mm-yellow-strong)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)]">온볼 운영</h1>
          <p className="text-sm text-[var(--mm-muted)] mt-1">비밀번호 재설정</p>
        </div>

        {done && (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-3 text-center">
            <CheckCircle2 size={28} className="text-[var(--mm-positive)] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--mm-ink)]">비밀번호를 바꿨습니다</h2>
            <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed">
              새 비밀번호로 로그인하세요. 이 링크는 소진되어 다시 쓸 수 없습니다.
            </p>
            <div className="pt-2">
              <Link
                href="/admin/login"
                className="min-h-11 flex items-center justify-center rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
              >
                로그인 화면으로
              </Link>
            </div>
          </div>
        )}

        {!done && check === null && (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 flex items-center justify-center gap-2 text-sm text-[var(--mm-muted)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            링크를 확인하는 중…
          </div>
        )}

        {!done && check && !check.ok && (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-3 text-center">
            <AlertCircle size={28} className="text-[var(--mm-negative)] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--mm-ink)]">
              {REASON_TITLE[check.reason]}
            </h2>
            <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed">
              {REASON_BODY[check.reason]}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              {/* 조회 실패일 때만 재시도를 준다 — 만료·사용됨은 다시 눌러도 결과가 같다 */}
              {check.reason === 'server_error' && (
                <button
                  type="button"
                  onClick={() => void loadCheck()}
                  className="min-h-11 flex items-center justify-center rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
                >
                  다시 시도
                </button>
              )}
              <Link
                href="/admin/login"
                className="min-h-11 flex items-center justify-center rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
              >
                로그인 화면으로
              </Link>
            </div>
          </div>
        )}

        {!done && check?.ok && (
          <form onSubmit={submit} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-4">
            <div className="rounded-lg bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] px-3 py-2.5">
              <p className="text-xs text-[var(--mm-muted)]">재설정할 계정</p>
              <p className="text-sm font-semibold text-[var(--mm-ink)] break-all mt-0.5">{check.maskedEmail}</p>
            </div>

            <p className="text-xs text-[var(--mm-ink-soft)] leading-relaxed">
              새 비밀번호를 정하면 이 링크는 즉시 소진되고, 이전에 로그인해 둔 기기의 세션도 모두 끊깁니다.
            </p>

            <div>
              <label htmlFor="reset-password" className="text-xs text-[var(--mm-muted)] mb-1.5 block">
                새 비밀번호
              </label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-describedby="reset-password-hint"
                placeholder="••••••••••"
                className={inputClass}
              />
              <p id="reset-password-hint" className="text-xs text-[var(--mm-muted)] mt-1.5">
                {MIN_PASSWORD_LENGTH}자 이상
              </p>
            </div>

            <div>
              <label htmlFor="reset-confirm" className="text-xs text-[var(--mm-muted)] mb-1.5 block">
                새 비밀번호 확인
              </label>
              <input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="••••••••••"
                className={inputClass}
              />
            </div>

            {/* 에러는 제출 버튼 바로 위 — 문제가 생긴 자리 근처에 둔다 */}
            {error && (
              <p role="alert" className="text-xs text-[var(--mm-negative)]">{error}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-11 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium py-2.5 rounded-lg text-sm transition-opacity flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
            >
              {submitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              비밀번호 바꾸기
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
