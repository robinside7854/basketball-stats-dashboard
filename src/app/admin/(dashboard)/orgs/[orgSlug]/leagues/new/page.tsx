'use client'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function NewLeaguePage() {
  const params = useParams<{ orgSlug: string }>()
  const orgSlug = params.orgSlug
  const router = useRouter()
  const currentYear = new Date().getFullYear()

  const [name, setName] = useState('')
  const [seasonYear, setSeasonYear] = useState(currentYear)
  const [startDate, setStartDate] = useState('')
  const [totalRounds, setTotalRounds] = useState(8)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !startDate) {
      toast.error('리그 이름과 시작일은 필수입니다')
      return
    }
    setLoading(true)
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_slug: orgSlug, name, season_year: seasonYear, start_date: startDate, total_rounds: totalRounds }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) {
      toast.error(data.error ?? '생성 실패')
      return
    }
    toast.success('리그가 생성되었습니다')
    router.push(`/admin/orgs/${orgSlug}/leagues/${data.id}`)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orgs/${orgSlug}/leagues`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-white">새 리그 만들기</h1>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">
        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">리그 이름 *</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="예: 파란날개 내부 리그"
            className="bg-gray-800 border-gray-700 text-white"
            required
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">시즌 연도</label>
          <Input
            type="number"
            value={seasonYear}
            onChange={e => setSeasonYear(Number(e.target.value))}
            min={2020}
            max={2099}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">시작일 *</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white"
            required
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">총 라운드 수</label>
          <Input
            type="number"
            value={totalRounds}
            onChange={e => setTotalRounds(Number(e.target.value))}
            min={1}
            max={50}
            className="bg-gray-800 border-gray-700 text-white"
          />
          <p className="text-xs text-gray-600 mt-1">라운드마다 7일 간격으로 일정이 자동 배정됩니다</p>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 cursor-pointer"
        >
          {loading ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
          리그 생성
        </Button>
      </form>
    </div>
  )
}
