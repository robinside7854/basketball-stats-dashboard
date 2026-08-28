'use client'
// 접근 요청 (/admin/request-access) — 로그인 불필요.
//
// 이메일 하나만 받고, 제출하면 무조건 같은 안내로 끝난다.
// "이미 관리자입니다" / "이미 요청하셨습니다" 로 갈라 보여주면 아무나 주소를 하나씩 넣어보며
// 누가 온볼 운영자인지 밖에서 알아낼 수 있다. 서버(POST /api/admin/access-requests)도
// 같은 이유로 항상 { ok: true } 를 준다 — 화면과 API 양쪽이 같은 약속을 지켜야 의미가 있다.
import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

export default function RequestAccessPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? '요청을 접수하지 못했습니다')
        setSubmitting(false)
        return
      }
      setDone(true)
    } catch {
      setError('요청을 접수하지 못했습니다 — 잠시 후 다시 시도하세요')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--mm-ink)] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Basketball size={24} className="text-[var(--mm-yellow-strong)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)]">온볼 운영</h1>
          <p className="text-sm text-[var(--mm-muted)] mt-1">플랫폼 콘솔 접근 요청</p>
        </div>

        {done ? (
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-3 text-center">
            <CheckCircle2 size={24} className="text-[var(--mm-positive)] mx-auto" aria-hidden="true" />
            <h2 className="text-base font-bold text-[var(--mm-ink)]">요청이 접수되었습니다</h2>
            <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed">
              승인되면 초대 링크를 받게 됩니다.
            </p>
            <div className="pt-2">
              <Link
                href="/admin/login"
                className="min-h-11 flex items-center justify-center rounded-lg border border-[var(--mm-rule)] text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] text-sm font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
              >
                로그인 화면으로
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-4">
            <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed">
              운영 콘솔은 초대받은 사람만 들어올 수 있습니다. 이메일을 남기면 운영자가 확인 후
              초대 링크를 보냅니다.
            </p>
            <div>
              <label htmlFor="request-email" className="text-xs text-[var(--mm-muted)] mb-1.5 block">
                이메일
              </label>
              <input
                id="request-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full min-h-11 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] text-base sm:text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus:border-[var(--mm-yellow-strong)] transition-colors"
              />
            </div>

            {error && <p role="alert" className="text-xs text-[var(--mm-negative)]">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="w-full min-h-11 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium py-2.5 rounded-lg text-sm transition-opacity flex items-center justify-center gap-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:outline-none"
            >
              {submitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
              요청 보내기
            </button>

            <p className="text-center">
              <Link
                href="/admin/login"
                className="text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer underline underline-offset-2"
              >
                로그인 화면으로 돌아가기
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
