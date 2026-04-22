'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, ExternalLink, Eye, EyeOff, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import type { League } from '@/types/league'

const DOW_LABELS: Record<string, string> = {
  monday: '월요일', tuesday: '화요일', wednesday: '수요일', thursday: '목요일',
  friday: '금요일', saturday: '토요일', sunday: '일요일',
}
const STATUS_OPTIONS = [
  { value: 'upcoming', label: '예정', color: 'text-yellow-400' },
  { value: 'active',   label: '진행 중', color: 'text-green-400' },
  { value: 'completed', label: '완료', color: 'text-gray-400' },
]

export default function LeagueAdminSettingsPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const router = useRouter()

  const [league, setLeague] = useState<League | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await fetch(`/api/leagues/${leagueId}`)
      if (res.ok) {
        const data: League = await res.json()
        setLeague(data)
        setStatus(data.status)
        setPin(data.edit_pin ?? '0000')
      } else {
        router.push('/admin/leagues')
      }
      setLoading(false)
    }
    load()
  }, [leagueId, router])

  async function saveStatus() {
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setSaving(false)
    if (res.ok) toast.success('상태 저장 완료')
    else toast.error('저장 실패')
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_pin: pin }),
    })
    setSaving(false)
    if (res.ok) toast.success('PIN 저장 완료')
    else toast.error('저장 실패')
  }

  function reissuePin() {
    if (!confirm('PIN을 재발급하면 기존 PIN은 즉시 무효화됩니다.')) return
    setPin(String(Math.floor(1000 + Math.random() * 9000)))
    setPinVisible(true)
  }

  if (loading) return <div className="flex justify-center items-center h-40"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
  if (!league) return null

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white">{league.name}</h1>
          <p className="text-gray-500 text-sm">{league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별' : '연간'}</p>
        </div>
        <a
          href={`https://basketball-stats-dashboard.vercel.app/league/${league.org_slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors shrink-0"
        >
          <ExternalLink size={12} />
          대시보드
        </a>
      </div>

      {/* 리그 정보 (읽기 전용) */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-white text-sm">리그 정보</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-gray-500">공개 슬러그</p><p className="text-white font-mono">/league/{league.org_slug}</p></div>
          <div><p className="text-xs text-gray-500">정기 경기 요일</p><p className="text-white">{DOW_LABELS[league.match_day] ?? league.match_day}</p></div>
          <div><p className="text-xs text-gray-500">첫 정기 일정</p><p className="text-white">{league.start_date}</p></div>
          <div><p className="text-xs text-gray-500">시즌 구분</p><p className="text-white">{league.season_type === 'quarterly' ? '분기별 (3개월)' : '연간 (1년)'}</p></div>
        </div>
      </div>

      {/* 리그 상태 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-white text-sm">리그 상태</h2>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                status === opt.value
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
              }`}
            >
              <span className={status === opt.value ? opt.color : ''}>{opt.label}</span>
            </button>
          ))}
        </div>
        <Button onClick={saveStatus} disabled={saving || status === league.status} className="w-full bg-blue-600 hover:bg-blue-500 cursor-pointer">
          {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          상태 저장
        </Button>
      </div>

      {/* PIN 관리 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-white text-sm">편집 PIN 관리</h2>
        <p className="text-xs text-gray-500">리그 대시보드에서 편집 모드 진입 시 사용하는 4자리 PIN입니다</p>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              type={pinVisible ? 'text' : 'password'}
              value={pin}
              onChange={e => setPin(e.target.value.slice(0, 4))}
              maxLength={4}
              placeholder="4자리 PIN"
              className="bg-gray-800 border-gray-700 text-white font-mono text-xl tracking-[0.5em]"
            />
          </div>
          <button
            onClick={() => setPinVisible(v => !v)}
            className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={reissuePin}
            title="랜덤 재발급"
            className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw size={14} />
          </button>
          <Button onClick={savePin} disabled={saving} className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0">
            저장
          </Button>
        </div>
      </div>

      {/* 일정 생성 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-white text-sm">일정 관리</h2>
        <p className="text-xs text-gray-500">리그 팀 구성 완료 후 일정을 자동 생성합니다. 기존 일정은 삭제됩니다.</p>
        <Button
          onClick={async () => {
            if (!confirm('기존 일정이 모두 삭제되고 새로 생성됩니다. 계속하시겠습니까?')) return
            const res = await fetch(`/api/leagues/${leagueId}/schedule`, { method: 'POST' })
            if (res.ok) {
              const d = await res.json()
              toast.success(`일정 ${d.count}개 생성 완료`)
            } else {
              const d = await res.json()
              toast.error(d.error ?? '생성 실패')
            }
          }}
          variant="outline"
          className="w-full border-gray-700 text-gray-300 hover:text-white cursor-pointer"
        >
          일정 자동 생성
        </Button>
      </div>
    </div>
  )
}
