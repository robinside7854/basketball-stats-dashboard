'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Eye, EyeOff, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function NewLeaguePage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug
  const router = useRouter()

  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  function randomPin() {
    setPin(String(Math.floor(1000 + Math.random() * 9000)))
    setPinVisible(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('리그 이름을 입력하세요'); return }
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }

    setLoading(true)
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_slug: orgSlug,
        name: name.trim(),
        edit_pin: pin,
        season_year: new Date().getFullYear(),
        start_date: new Date().toISOString().split('T')[0],
      }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      toast.error(data.error ?? '생성 실패')
      return
    }
    toast.success('리그가 생성되었습니다')
    router.push(`/league/${orgSlug}/${data.id}`)
  }

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orgs/${orgSlug}/leagues`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">새 리그 생성</h1>
          <p className="text-gray-500 text-sm">생성 후 리그 대시보드에서 상세 설정을 진행합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">리그 이름 *</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예) 미라클모닝 2026 봄리그"
            className="bg-gray-800 border-gray-700 text-white"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">편집 PIN *</label>
          <div className="flex items-center gap-2">
            <Input
              type={pinVisible ? 'text' : 'password'}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4자리 숫자"
              maxLength={4}
              className="bg-gray-800 border-gray-700 text-white font-mono text-xl tracking-[0.5em] flex-1"
            />
            <button
              type="button"
              onClick={() => setPinVisible(v => !v)}
              className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="button"
              onClick={randomPin}
              className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title="랜덤 생성"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          <p className="text-xs text-gray-600">리그 대시보드의 편집 모드 진입 시 사용합니다. 잘 보관하세요.</p>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 cursor-pointer">
          {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          리그 생성 및 대시보드 열기
        </Button>
      </form>
    </div>
  )
}
