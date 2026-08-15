'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

// /admin/orgs/new 를 이관. API(/api/admin/teams POST)는 2026-08-15 에 실제 생성으로
// 열렸다 — onboard-club.mjs 의 팀 생성 단계를 그대로 옮긴 것이라 이 폼이 보내는
// {name, org_slug, accent_color, edit_pin} 그대로 맞는다.
// 단 teams.org_id NOT NULL 해제(마이그레이션 108)가 선행되어야 하며, 미적용이면
// API 가 503 과 함께 "DB 준비가 필요합니다" 를 돌려준다.
export default function NewTeamPage() {
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
    const res = await fetch('/api/admin/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? '생성 실패')
    } else {
      toast.success(`${form.name} 팀 생성 완료!`)
      router.push(`/admin/teams/${data.id}`)
    }
    setLoading(false)
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer p-2 -ml-2 rounded-lg min-h-11 min-w-11 flex items-center justify-center">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--mm-ink)]">새 팀 추가</h1>
          <p className="text-[var(--mm-muted)] text-sm">새로운 농구팀을 등록합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-6 space-y-5">
        <div>
          <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">팀 이름 *</label>
          <Input value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="파란날개 청년부" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
        </div>
        <div>
          <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">URL 슬러그 (영문, 소문자) *</label>
          <div className="flex items-center gap-2">
            <span className="text-[var(--mm-muted)] text-sm">도메인.com/</span>
            <Input value={form.org_slug} onChange={e => handleChange('org_slug', e.target.value)} placeholder="paranalgae-youth" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>
          <p className="text-xs text-[var(--mm-muted)] mt-1">영문, 숫자, 하이픈만 허용 (예: blue-wings)</p>
        </div>
        <div>
          <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">편집 PIN (4자리) *</label>
          <Input
            value={form.edit_pin}
            onChange={e => handleChange('edit_pin', e.target.value.slice(0, 4))}
            placeholder="0000"
            maxLength={4}
            className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-32"
          />
          <p className="text-xs text-[var(--mm-muted)] mt-1">이 팀이 경기 기록 편집 시 사용하는 PIN</p>
        </div>
        <div>
          <label className="text-xs text-[var(--mm-muted)] mb-1.5 block">대표 색상</label>
          <div className="flex items-center gap-3">
            <input type="color" value={form.accent_color} onChange={e => handleChange('accent_color', e.target.value)}
              className="w-10 h-10 rounded-lg border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] cursor-pointer" />
            <span className="text-sm text-[var(--mm-ink-soft)]">{form.accent_color}</span>
          </div>
        </div>

        <div className="pt-2 flex gap-3">
          <Button type="submit" disabled={loading} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer min-h-11">
            {loading ? <><Loader2 size={14} className="mr-1.5 animate-spin" />생성 중...</> : '팀 생성'}
          </Button>
          <Link href="/admin/leagues">
            <Button type="button" variant="outline" className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] cursor-pointer min-h-11">취소</Button>
          </Link>
        </div>
      </form>
    </div>
  )
}
