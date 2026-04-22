'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

export default function NewLeaguePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  function handleNameChange(v: string) {
    setName(v)
    const auto = v.toLowerCase()
      .replace(/[가-힣]/g, c => {
        // 간단한 음역: 한글은 그냥 제거하고 영문/숫자만 유지
        return ''
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setSlug(auto || '')
  }

  function randomPin() {
    setPin(String(Math.floor(1000 + Math.random() * 9000)))
    setPinVisible(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('리그 이름을 입력하세요'); return }
    if (!slug.trim()) { toast.error('슬러그 URL을 입력하세요'); return }
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }

    setLoading(true)
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), org_slug: slug.trim(), edit_pin: pin }),
    })
    setLoading(false)

    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? '생성 실패')
      return
    }
    const data = await res.json()
    toast.success('리그가 생성되었습니다')
    router.push(`/league/${data.org_slug}/${data.id}`)
  }

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">새 리그 생성</h1>
          <p className="text-gray-500 text-sm">생성 후 리그 대시보드에서 상세 설정을 진행합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">

        {/* 리그 이름 */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">리그 이름 *</label>
          <Input
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="예) 미라클모닝 2026 봄리그"
            className="bg-gray-800 border-gray-700 text-white"
            autoFocus
          />
        </div>

        {/* 슬러그 */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">공개 URL 슬러그 *</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0 font-mono">/league/</span>
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="miracle-morning"
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
          </div>
          {slug && (
            <p className="text-xs text-gray-600 font-mono">
              basketball-stats-dashboard.vercel.app/league/{slug}
            </p>
          )}
        </div>

        {/* PIN */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-medium">편집 PIN *</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Input
                type={pinVisible ? 'text' : 'password'}
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="4자리 숫자"
                maxLength={4}
                className="bg-gray-800 border-gray-700 text-white font-mono text-xl tracking-[0.5em] pr-10"
              />
            </div>
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
              className="px-3 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-xs transition-colors cursor-pointer shrink-0"
            >
              랜덤
            </button>
          </div>
          <p className="text-xs text-gray-600">리그 대시보드의 편집 모드 진입 시 사용합니다</p>
        </div>

        <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 cursor-pointer mt-2">
          {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          리그 생성 및 대시보드 열기
        </Button>
      </form>
    </div>
  )
}
