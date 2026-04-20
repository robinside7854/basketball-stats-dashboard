'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, RefreshCw, Loader2, ExternalLink, Trash2 } from 'lucide-react'
import Link from 'next/link'

interface Org {
  id: string
  org_slug: string
  name: string
  accent_color: string | null
  is_active: boolean
  edit_pin: string
}

interface Props {
  org: Org
  stats: { players: number; tournaments: number; games: number }
}

export default function OrgDetailClient({ org: initial, stats }: Props) {
  const router = useRouter()
  const [org, setOrg] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [pinVisible, setPinVisible] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/admin/orgs/${org.org_slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: org.name, accent_color: org.accent_color, is_active: org.is_active, edit_pin: org.edit_pin }),
    })
    if (res.ok) {
      toast.success('저장 완료')
      router.refresh()
    } else {
      toast.error('저장 실패')
    }
    setSaving(false)
  }

  async function reissuePin() {
    if (!confirm('PIN을 재발급하면 기존 PIN은 즉시 무효화됩니다. 계속할까요?')) return
    setPinLoading(true)
    const newPin = String(Math.floor(1000 + Math.random() * 9000))
    const res = await fetch(`/api/admin/orgs/${org.org_slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_pin: newPin }),
    })
    if (res.ok) {
      setOrg(prev => ({ ...prev, edit_pin: newPin }))
      setPinVisible(true)
      toast.success(`새 PIN: ${newPin}`)
    } else {
      toast.error('재발급 실패')
    }
    setPinLoading(false)
  }

  async function handleDelete() {
    if (!confirm(`"${org.name}" Org를 삭제하면 관련 모든 데이터가 삭제됩니다.\n정말 삭제하시겠습니까?`)) return
    setDeleteLoading(true)
    const res = await fetch(`/api/admin/orgs/${org.org_slug}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Org 삭제 완료')
      router.push('/admin/orgs')
    } else {
      toast.error('삭제 실패')
    }
    setDeleteLoading(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/orgs" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: org.accent_color ?? '#3b82f6' }} />
          <h1 className="text-2xl font-bold text-white">{org.name}</h1>
          <span className="text-gray-500 text-sm">/{org.org_slug}</span>
        </div>
        <a
          href={`https://basketball-stats-dashboard.vercel.app/${org.org_slug}/youth`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
        >
          <ExternalLink size={12} />
          사이트 보기
        </a>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[['선수', stats.players], ['대회', stats.tournaments], ['경기', stats.games]].map(([label, val]) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-white">{val}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">기본 정보</h2>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">클럽 이름</label>
          <Input value={org.name} onChange={e => setOrg(p => ({ ...p, name: e.target.value }))} className="bg-gray-800 border-gray-700 text-white" />
        </div>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">대표 색상</label>
          <div className="flex items-center gap-3">
            <input type="color" value={org.accent_color ?? '#3b82f6'} onChange={e => setOrg(p => ({ ...p, accent_color: e.target.value }))}
              className="w-10 h-10 rounded-lg border border-gray-700 bg-gray-800 cursor-pointer" />
            <span className="text-sm text-gray-300">{org.accent_color}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400">활성화</label>
          <button
            onClick={() => setOrg(p => ({ ...p, is_active: !p.is_active }))}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${org.is_active ? 'bg-green-500' : 'bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${org.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-gray-300">{org.is_active ? '활성' : '비활성'}</span>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-500 cursor-pointer">
          {saving ? <><Loader2 size={14} className="mr-1.5 animate-spin" />저장 중...</> : '변경사항 저장'}
        </Button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">편집 PIN 관리</h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 flex-1">
            <span className="font-mono text-lg text-white tracking-widest">
              {pinVisible ? org.edit_pin : '••••'}
            </span>
          </div>
          <button onClick={() => setPinVisible(v => !v)} className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer">
            {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button onClick={reissuePin} disabled={pinLoading} className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm cursor-pointer">
            {pinLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            재발급
          </button>
        </div>
        <p className="text-xs text-gray-600">해당 팀이 경기 기록 편집 모드 진입 시 사용하는 PIN입니다</p>
      </div>

      <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-6 space-y-3">
        <h2 className="font-semibold text-red-400">위험 구역</h2>
        <p className="text-sm text-gray-400">Org를 삭제하면 해당 org의 선수, 대회, 경기 기록이 모두 삭제됩니다.</p>
        <Button onClick={handleDelete} disabled={deleteLoading} variant="destructive" className="bg-red-700 hover:bg-red-600 cursor-pointer">
          {deleteLoading ? <><Loader2 size={14} className="mr-1.5 animate-spin" />삭제 중...</> : <><Trash2 size={14} className="mr-1.5" />Org 삭제</>}
        </Button>
      </div>
    </div>
  )
}
