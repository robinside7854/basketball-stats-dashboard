'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

const DOW_OPTIONS = [
  { value: 'monday',    label: '월요일' },
  { value: 'tuesday',   label: '화요일' },
  { value: 'wednesday', label: '수요일' },
  { value: 'thursday',  label: '목요일' },
  { value: 'friday',    label: '금요일' },
  { value: 'saturday',  label: '토요일' },
  { value: 'sunday',    label: '일요일' },
]

export default function NewLeaguePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [matchDay, setMatchDay] = useState('saturday')
  const [startDate, setStartDate] = useState('')
  const [totalRounds, setTotalRounds] = useState(9)
  const [gamesPerRound, setGamesPerRound] = useState(1)
  const [seasonYear, setSeasonYear] = useState(new Date().getFullYear())
  const [loading, setLoading] = useState(false)

  function handleNameChange(v: string) {
    setName(v)
    const auto = v.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    setSlug(auto)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !startDate || !slug.trim()) {
      toast.error('이름, 공개 슬러그, 첫 정기 일정 날짜는 필수입니다')
      return
    }
    setLoading(true)
    const res = await fetch('/api/leagues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_slug: slug.trim(),
        name: name.trim(),
        season_year: seasonYear,
        start_date: startDate,
        match_day: matchDay,
        total_rounds: totalRounds,
        games_per_round: gamesPerRound,
      }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json()
      toast.error(d.error ?? '생성 실패')
      return
    }
    const data = await res.json()
    toast.success('리그가 생성되었습니다')
    router.push(`/admin/leagues/${data.id}`)
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/leagues" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">새 리그 생성</h1>
          <p className="text-gray-500 text-sm">독립 리그를 생성합니다</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-5">

        {/* 리그 이름 */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">리그 이름 *</label>
          <Input
            value={name}
            onChange={e => handleNameChange(e.target.value)}
            placeholder="예) 미라클모닝농구단 2026 봄리그"
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>

        {/* 공개 슬러그 */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">공개 URL 슬러그 *</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">/league/</span>
            <Input
              value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="miracle-morning"
              className="bg-gray-800 border-gray-700 text-white font-mono"
            />
          </div>
          <p className="text-xs text-gray-600">
            공개 페이지: basketball-stats-dashboard.vercel.app/league/{slug || '...'}
          </p>
        </div>

        <div className="border-t border-gray-800 pt-4 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">정기 일정 설정</p>

          {/* 정기 경기 요일 */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">정기 경기 요일</label>
            <select
              value={matchDay}
              onChange={e => setMatchDay(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
            >
              {DOW_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* 첫 정기 일정 날짜 */}
          <div className="space-y-1.5">
            <label className="text-xs text-gray-400">첫 정기 일정 날짜 *</label>
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white"
            />
            <p className="text-xs text-gray-600">
              이 날짜를 기준으로 매 {DOW_OPTIONS.find(d => d.value === matchDay)?.label} 일정이 자동 생성됩니다
            </p>
          </div>

          {/* 정규일정 횟수 + 경기 수 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">정규일정 총 횟수</label>
              <Input
                type="number"
                min={1}
                max={52}
                value={totalRounds}
                onChange={e => setTotalRounds(Number(e.target.value))}
                className="bg-gray-800 border-gray-700 text-white"
              />
              <p className="text-xs text-gray-600">몇 주(번) 동안 진행하는지</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">정규일정 당 경기 수</label>
              <Input
                type="number"
                min={1}
                max={10}
                value={gamesPerRound}
                onChange={e => setGamesPerRound(Number(e.target.value))}
                className="bg-gray-800 border-gray-700 text-white"
              />
              <p className="text-xs text-gray-600">경기일마다 열리는 경기 수</p>
            </div>
          </div>
        </div>

        {/* 시즌 연도 */}
        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">시즌 연도</label>
          <Input
            type="number"
            value={seasonYear}
            onChange={e => setSeasonYear(Number(e.target.value))}
            className="bg-gray-800 border-gray-700 text-white"
          />
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
