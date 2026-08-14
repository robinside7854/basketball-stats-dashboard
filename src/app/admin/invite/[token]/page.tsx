'use client'
// 초대 수락 (/admin/invite/[token]) — 로그인 불필요.
//
// 아직 계정이 없는 사람이 여는 유일한 화면이라, 미들웨어의 /admin 로그인 검사에서 빠져 있다
// (src/middleware.ts ADMIN_PUBLIC). 인증은 URL 의 토큰 자체가 한다.
//
// 실패 사유를 네 갈래로 나눠 보여주는 이유: '만료'는 다시 요청하면 되고, '이미 사용됨'은
// 그냥 로그인하면 되고, '취소됨'은 초대한 사람에게 물어봐야 한다. 하나로 뭉뚱그리면
// 받는 사람이 다음에 뭘 해야 할지 알 수 없다. (여긴 토큰 소지자만 오므로 열거 위험이 없다)
import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, Loader2 } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

const MIN_PASSWORD_LENGTH = 10

type Check =
  | { ok: true; email: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'used' | 'revoked' }

const REASON_TITLE: Record<string, string> = {
  not_found: '존재하지 않는 초대입니다',
  expired: '초대가 만료되었습니다',
  used: '이미 사용된 초대입니다',
  revoked: '취소된 초대입니다',
}

const REASON_BODY: Record<string, string> = {
  not_found: '링크가 잘못되었거나 일부만 복사되었을 수 있습니다. 받은 링크 전체를 다시 확인해 주세요.',
  expired: '초대 링크는 만들어진 뒤 72시간 동안만 쓸 수 있습니다. 초대한 분께 새 링크를 요청해 주세요.',
  used: '이 초대로 계정이 이미 만들어졌습니다. 설정한 비밀번호로 로그인하세요.',
  revoked: '초대한 분이 이 링크를 회수했습니다. 필요하다면 새로 초대를 요청해 주세요.',
}

export default function AdminInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()

  const [check, setCheck] = useState<Check | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/invite/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data: Check) => { if (alive) setCheck(data) })
      .catch(() => { if (alive) setCheck({ ok: false, reason: 'not_found' }) })
    return () => { alive = false }
  }, [token])

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
      const res = await fetch(`/api/admin/invite/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, name: name.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? '계정을 만들지 못했습니다')
        setSubmitting(false)
        return
      }
      // 로그인 화면이 이메일을 미리 채워두도록 넘긴다 — 방금 만든 계정을 다시 타이핑하게 하지 않는다.
      const email = check?.ok ? check.email : ''
      router.push(`/admin/login?email=${encodeURIComponent(email)}&welcome=1`)
    } catch {
      setError('계정을 만들지 못했습니다 — 잠시 후 다시 시도하세요')
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
          <p className="text-sm text-[var(--mm-muted)] mt-1">공동관리자 초대</p>
        </div>

        {check === null && (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 flex items-center justify-center gap-2 text-sm text-[var(--mm-muted)]">
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            초대를 확인하는 중…
          </div>
        )}

        {check && !check.ok && (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-3 text-center">
            <AlertCircle size={28} className="text-[var(--mm-negative)] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--mm-ink)]">
              {REASON_TITLE[check.reason]}
            </h2>
            <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed">
              {REASON_BODY[check.reason]}
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                href="/admin/login"
                className="min-h-11 flex items-center justify-center rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
              >
                로그인 화면으로
              </Link>
              <Link
                href="/admin/request-access"
                className="min-h-11 flex items-center justify-center rounded-lg border border-[var(--mm-rule)] text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] text-sm font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
              >
                접근 요청하기
              </Link>
            </div>
          </div>
        )}

        {check?.ok && (
          <form onSubmit={submit} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-4">
            <div className="rounded-lg bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] px-3 py-2.5">
              <p className="text-xs text-[var(--mm-muted)]">초대받은 계정</p>
              <p className="text-sm font-semibold text-[var(--mm-ink)] break-all mt-0.5">{check.email}</p>
            </div>

            <div>
              <label htmlFor="invite-name" className="text-xs text-[var(--mm-muted)] mb-1.5 block">
                이름 <span className="text-[var(--mm-muted)]">(선택)</span>
              </label>
              <input
                id="invite-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="홍길동"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="invite-password" className="text-xs text-[var(--mm-muted)] mb-1.5 block">
                비밀번호
              </label>
              <input
                id="invite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-describedby="invite-password-hint"
                placeholder="••••••••••"
                className={inputClass}
              />
              <p id="invite-password-hint" className="text-xs text-[var(--mm-muted)] mt-1.5">
                {MIN_PASSWORD_LENGTH}자 이상
              </p>
            </div>

            <div>
              <label htmlFor="invite-confirm" className="text-xs text-[var(--mm-muted)] mb-1.5 block">
                비밀번호 확인
              </label>
              <input
                id="invite-confirm"
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
              계정 만들기
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
