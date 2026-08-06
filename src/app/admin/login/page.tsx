'use client'
import { useActionState } from 'react'
import { loginAction } from './actions'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Basketball } from '@/components/league/BasketballIcons'

export default function AdminLoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined)

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-[var(--mm-ink)] rounded-xl flex items-center justify-center mx-auto mb-4">
            <Basketball size={24} className="text-[var(--mm-yellow-strong)]" />
          </div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)]">온볼 운영</h1>
          {/* 동호회 어드민이 잘못 찾아왔을 때 여기가 자기 자리가 아님을 알 수 있어야 한다 */}
          <p className="text-sm text-[var(--mm-muted)] mt-1">플랫폼 콘솔 · 동호회 운영진용이 아닙니다</p>
        </div>

        <form action={formAction} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">이메일</label>
            <input
              type="email"
              name="email"
              required
              className="w-full bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] text-sm outline-none focus:border-[var(--mm-yellow-strong)] transition-colors"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">비밀번호</label>
            <input
              type="password"
              name="password"
              required
              className="w-full bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-3 py-2.5 text-[var(--mm-ink)] text-sm outline-none focus:border-[var(--mm-yellow-strong)] transition-colors"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-[var(--mm-negative)]">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            {pending && <Loader2 size={14} className="animate-spin" />}
            로그인
          </button>
        </form>
      </div>
      <Toaster richColors theme="dark" />
    </div>
  )
}
