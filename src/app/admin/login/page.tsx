'use client'
import { useActionState } from 'react'
import { loginAction } from './actions'
import { Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'

export default function AdminLoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, undefined)

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏀</span>
          </div>
          <h1 className="text-xl font-bold text-white">Admin</h1>
          <p className="text-sm text-gray-500 mt-1">Basketball Stats 관리자</p>
        </div>

        <form action={formAction} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">이메일</label>
            <input
              type="email"
              name="email"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500 transition-colors"
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">비밀번호</label>
            <input
              type="password"
              name="password"
              required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm outline-none focus:border-blue-500 transition-colors"
              placeholder="••••••••"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
