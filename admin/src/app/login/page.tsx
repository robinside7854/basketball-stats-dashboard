'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Lock } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.ok) {
      router.push('/')
    } else {
      setError('이메일 또는 비밀번호가 올바르지 않습니다')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-4">
            <Lock size={24} className="text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">어드민 로그인</h1>
          <p className="text-gray-400 text-sm mt-1">Basketball Stats Admin</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">이메일</label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">비밀번호</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="bg-gray-900 border-gray-700 text-white placeholder:text-gray-600 focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold h-11"
          >
            {loading ? <><Loader2 size={16} className="mr-2 animate-spin" />로그인 중...</> : '로그인'}
          </Button>
        </form>
      </div>
    </div>
  )
}
