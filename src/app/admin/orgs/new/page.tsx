'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function NewOrgPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', org_slug: '', accent_color: '#3b82f6', edit_pin: '' })

  function handleChange(k: string, v: string) {
    setForm(prev => {
      const next = { ...prev, [k]: v }
      if (k === 'name') {
        next.org_slug = v.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      }
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.org_slug || !form.edit_pin) {
      toast.error('모든 필드를 입력해주세요')
      return
    }
    setLoading(true)
    const res = await fetch('/api/admin/orgs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? '생성 실패')
    } else {
      toast.success(`${form.name} Org 생성 완료!`)
      router.push(`/admin/orgs/${form.org_slug}`)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/orgs" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">새 Org 추가</h1>
          <p className="text-gray-400 text-sm">새로운 농구 클럽을 등록합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">클럽 이름 *</label>
          <Input value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="파란날개" className="bg-gray-800 border-gray-700 text-white" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">URL 슬러그 (영문, 소문자) *</label>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 text-sm">도메인.com/</span>
            <Input value={form.org_slug} onChange={e => handleChange('org_slug', e.target.value)} placeholder="paranalgae" className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <p className="text-xs text-gray-600 mt-1">영문, 숫자, 하이픈만 허용 (예: blue-wings)</p>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">편집 PIN (4자리) *</label>
          <Input
            value={form.edit_pin}
            onChange={e => handleChange('edit_pin', e.target.value.slice(0, 4))}
            placeholder="0000"
            maxLength={4}
            className="bg-gray-800 border-gray-700 text-white w-32"
          />
          <p className="text-xs text-gray-600 mt-1">해당 팀이 경기 기록 편집 시 사용하는 PIN</p>
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">대표 색상</label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.accent_color} onChange={e => handleChange('accent_color', e.target.value)}
              className="w-10 h-10 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer" />
            <span className="text-sm text-gray-300">{form.accent_color}</span>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-500">
            {loading ? <><Loader2 size={14} className="mr-1.5 animate-spin" />생성 중...</> : 'Org 생성'}
          </Button>
          <Link href="/admin/orgs">
            <Button type="button" variant="outline" className="border-gray-700 text-gray-300">취소</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
