'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Eye, EyeOff, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Team {
  id: string
  org_slug: string
  sub_slug: string
  name: string
  accent_color: string | null
  is_active: boolean
  edit_pin: string
}

interface Props {
  orgSlug: string
  teams: Team[]
  statsPerTeam: { teamId: string; players: number; tournaments: number }[]
}

function PinCard({ team, orgSlug }: { team: Team; orgSlug: string }) {
  const [pin, setPin] = useState(team.edit_pin ?? '')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)

  async function reissue() {
    if (!confirm(`[${team.sub_slug}] PIN을 재발급하면 기존 PIN은 즉시 무효화됩니다.`)) return
    setLoading(true)
    const newPin = String(Math.floor(1000 + Math.random() * 9000))
    const res = await fetch(`/api/admin/orgs/${orgSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_slug: team.sub_slug, edit_pin: newPin }),
    })
    if (res.ok) {
      setPin(newPin)
      setVisible(true)
      toast.success(`[${team.sub_slug}] 새 PIN: ${newPin}`)
    } else {
      toast.error('재발급 실패')
    }
    setLoading(false)
  }

  async function savePin() {
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast.error('PIN은 숫자 4자리여야 합니다')
      return
    }
    setLoading(true)
    const res = await fetch(`/api/admin/orgs/${orgSlug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_slug: team.sub_slug, edit_pin: pin }),
    })
    if (res.ok) toast.success(`[${team.sub_slug}] PIN 저장 완료`)
    else toast.error('저장 실패')
    setLoading(false)
  }

  const accentColor = team.accent_color ?? '#3b82f6'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
          <span className="font-bold text-white">{team.name}</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-mono"
            style={{ color: accentColor, backgroundColor: `${accentColor}20`, border: `1px solid ${accentColor}40` }}
          >
            {team.sub_slug}
          </span>
        </div>
        <a
          href={`https://basketball-stats-dashboard.vercel.app/${orgSlug}/${team.sub_slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
        >
          <ExternalLink size={12} />
          사이트
        </a>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            type={visible ? 'text' : 'password'}
            value={pin}
            onChange={e => setPin(e.target.value.slice(0, 4))}
            maxLength={4}
            placeholder="4자리 PIN"
            className="bg-gray-800 border-gray-700 text-white font-mono text-xl tracking-[0.5em] pr-10"
          />
        </div>
        <button
          onClick={() => setVisible(v => !v)}
          className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer shrink-0"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        <button
          onClick={reissue}
          disabled={loading}
          title="랜덤 PIN 재발급"
          className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer shrink-0"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
        <Button size="sm" onClick={savePin} disabled={loading} className="bg-blue-600 hover:bg-blue-500 shrink-0 cursor-pointer">
          저장
        </Button>
      </div>
      <p className="text-xs text-gray-600">이 팀의 경기 기록 편집 모드 진입 시 사용하는 PIN입니다</p>
    </div>
  )
}

export default function OrgDetailClient({ orgSlug, teams, statsPerTeam }: Props) {
  const router = useRouter()
  const [orgName, setOrgName] = useState(teams[0]?.name.replace(/ (청년부|장년부|youth|senior)$/i, '') ?? '')
  const [saving, setSaving] = useState(false)

  const totalPlayers = statsPerTeam.reduce((s, t) => s + t.players, 0)
  const totalTournaments = statsPerTeam.reduce((s, t) => s + t.tournaments, 0)

  async function handleSaveName() {
    setSaving(true)
    // org 단위 이름 변경은 각 sub-team에 반영
    for (const team of teams) {
      const suffix = team.sub_slug === 'youth' ? ' 청년부' : team.sub_slug === 'senior' ? ' 장년부' : ` ${team.sub_slug}`
      await fetch(`/api/admin/orgs/${orgSlug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_slug: team.sub_slug, name: `${orgName}${suffix}` }),
      })
    }
    toast.success('저장 완료')
    router.refresh()
    setSaving(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/admin/orgs" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{orgName}</h1>
          <span className="text-gray-500 text-sm">/{orgSlug}</span>
        </div>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-3 gap-3">
        {[['선수', totalPlayers], ['대회', totalTournaments], ['팀', teams.length]].map(([label, val]) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-2xl font-black text-white">{val}</p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* 기본 정보 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="font-semibold text-white">기본 정보</h2>
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">클럽 이름</label>
          <div className="flex gap-2">
            <Input value={orgName} onChange={e => setOrgName(e.target.value)} className="bg-gray-800 border-gray-700 text-white" />
            <Button onClick={handleSaveName} disabled={saving} className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0">
              {saving ? <Loader2 size={14} className="animate-spin" /> : '저장'}
            </Button>
          </div>
        </div>
      </div>

      {/* 팀별 PIN 관리 */}
      <div className="space-y-3">
        <h2 className="font-semibold text-white px-1">편집 PIN 관리</h2>
        <p className="text-xs text-gray-500 px-1">각 팀은 독립적인 PIN을 사용합니다. 숫자 4자리를 직접 입력하거나 🔄로 무작위 발급합니다.</p>
        {teams.map(team => (
          <PinCard key={team.id} team={team} orgSlug={orgSlug} />
        ))}
      </div>
    </div>
  )
}
