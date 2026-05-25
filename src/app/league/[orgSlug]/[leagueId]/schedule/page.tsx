'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { CalendarDays, Plus, Trash2, Loader2, Lock, Zap, BarChart2 } from 'lucide-react'
import DailyBoxscoreModal from '@/components/league/DailyBoxscoreModal'

type ScheduleDate = { id: string; date: string }
type Quarter = { id: string; year: number; quarter: number }

export default function LeagueSchedulePage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [dates, setDates] = useState<ScheduleDate[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [deletingDate, setDeletingDate] = useState<string | null>(null)
  const [boxscoreDate, setBoxscoreDate] = useState<string | null>(null)
  const [datesWithStats, setDatesWithStats] = useState<Set<string>>(new Set())
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQFilter, setSelectedQFilter] = useState<'all' | string>('all')
  const [dateQuarterMap, setDateQuarterMap] = useState<Record<string, string>>({})

  async function load() {
    setLoading(true)
    const [dRes, gRes, qRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/schedule-dates`),
      fetch(`/api/leagues/${leagueId}/games?complete=true`),
      fetch(`/api/leagues/${leagueId}/quarters`),
    ])
    if (dRes.ok) setDates(await dRes.json())
    if (gRes.ok) {
      const games: { date: string; quarter_id?: string }[] = await gRes.json()
      setDatesWithStats(new Set(games.map(g => g.date)))
      const dqMap: Record<string, string> = {}
      for (const g of games) {
        if (g.date && g.quarter_id && !dqMap[g.date]) dqMap[g.date] = g.quarter_id
      }
      setDateQuarterMap(dqMap)
    }
    if (qRes.ok) setQuarters(await qRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [leagueId])

  async function autoGenerate() {
    setAutoGenerating(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/schedule-dates/auto`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        if (data.inserted === 0) {
          toast.success(data.message ?? '이미 모두 등록되어 있습니다')
        } else {
          toast.success(`${data.inserted}개 날짜 자동 등록 완료 (${data.from} ~ ${data.to})`)
        }
        load()
      } else {
        toast.error(data.error ?? '자동 생성 실패')
      }
    } catch {
      toast.error('네트워크 오류')
    }
    setAutoGenerating(false)
  }

  async function addDate() {
    if (!newDate) { toast.error('날짜를 선택하세요'); return }
    setAdding(true)
    const res = await fetch(`/api/leagues/${leagueId}/schedule-dates`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ date: newDate }),
    })
    setAdding(false)
    if (res.ok) {
      toast.success('일정 날짜 추가 완료')
      setNewDate('')
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '추가 실패')
    }
  }

  async function addExhibitionDate() {
    if (!newDate) { toast.error('날짜를 선택하세요'); return }
    if (!confirm(
      `${newDate} 친선 4쿼터·2경기를 등록하시겠습니까?\n\n` +
      `· 미라클 vs 모닝 2팀 (없으면 자동 생성)\n` +
      `· 8개 슬롯 (1·2차전 × 4쿼터)\n` +
      `· 리그 순위에서 제외 / 개인 스탯에는 반영\n\n` +
      `※ 이 날짜에 빈 정규 슬롯이 있으면 자동 삭제 후 재구성됩니다.\n` +
      `※ 이미 기록·시작된 경기가 있으면 차단됩니다 — record 페이지의 개별 친선 토글을 사용하세요.`
    )) return
    setAdding(true)
    const res = await fetch(`/api/leagues/${leagueId}/exhibition/init`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ date: newDate }),
    })
    setAdding(false)
    if (res.ok) {
      toast.success('친선 4쿼터·2경기 등록 완료')
      setNewDate('')
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '친선전 등록 실패')
    }
  }

  async function removeDate(date: string) {
    if (!confirm(`${date} 일정을 삭제하시겠습니까?\n해당 날짜의 경기 슬랏도 모두 삭제됩니다.`)) return
    setDeletingDate(date)

    // 해당 날짜 게임도 삭제
    const supaRes = await fetch(
      `/api/leagues/${leagueId}/games?date=${date}`,
    )
    const games = supaRes.ok ? await supaRes.json() : []
    await Promise.all(
      games.map((g: { id: string }) =>
        fetch(`/api/leagues/${leagueId}/games?gameId=${g.id}`, {
          method: 'PATCH',
          headers: leagueHeaders,
          body: JSON.stringify({ _delete: true }),
        })
      )
    )

    await fetch(`/api/leagues/${leagueId}/schedule-dates?date=${date}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    setDeletingDate(null)
    toast.success('일정 삭제 완료')
    load()
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
  }

  return (
    <>
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">경기 일정</h2>
          <p className="text-gray-500 text-sm">총 {dates.length}개 날짜 등록됨</p>
        </div>
        {isEditMode ? (
          <button
            onClick={autoGenerate}
            disabled={autoGenerating}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {autoGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            자동 일정 등록
          </button>
        ) : (
          <button
            onClick={openPinModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <Lock size={12} />편집 모드
          </button>
        )}
      </div>

      {/* 날짜 추가 */}
      {isEditMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-gray-400">경기 날짜 추가</label>
            <Input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white"
            />
          </div>
          <Button
            onClick={addDate}
            disabled={adding}
            className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0"
            size="sm"
          >
            {adding ? <Loader2 size={13} className="animate-spin mr-1" /> : <Plus size={13} className="mr-1" />}
            정규전 추가
          </Button>
          <Button
            onClick={addExhibitionDate}
            disabled={adding}
            title="2팀(미라클 vs 모닝) · 10분 4쿼터 · 2경기 — 리그 순위 제외"
            className="bg-amber-600 hover:bg-amber-500 cursor-pointer shrink-0"
            size="sm"
          >
            {adding ? <Loader2 size={13} className="animate-spin mr-1" /> : <Plus size={13} className="mr-1" />}
            친선전 추가
          </Button>
        </div>
      )}

      {/* 날짜 목록 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : dates.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-800 rounded-xl text-gray-500">
          <CalendarDays size={28} className="mx-auto mb-2 text-gray-500" />
          <p className="text-sm">등록된 일정이 없습니다</p>
          {isEditMode && <p className="text-xs mt-1">위 입력창에서 날짜를 추가하세요</p>}
        </div>
      ) : (
        <>
        {/* 분기 필터 탭 */}
        {quarters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {[{ id: 'all', label: '전체' }, ...quarters.map(q => ({ id: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q` }))].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedQFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                  selectedQFilter === tab.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          {[...dates]
            .filter(sd => selectedQFilter === 'all' || dateQuarterMap[sd.date] === selectedQFilter)
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(sd => (
            <div key={sd.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between hover:border-gray-700 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <div className="flex items-center gap-3">
                <CalendarDays size={16} className="text-blue-400 shrink-0" />
                <span className="text-white font-semibold text-base">{formatDate(sd.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                {datesWithStats.has(sd.date) ? (
                  <button
                    onClick={() => setBoxscoreDate(sd.date)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-900/40 border border-indigo-600/60 text-indigo-300 hover:bg-indigo-800/60 hover:text-indigo-200 cursor-pointer transition-colors btn-press"
                  >
                    <BarChart2 size={12} />박스스코어
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-800/30 border border-gray-800/50 text-gray-700 cursor-not-allowed select-none">
                    <BarChart2 size={12} />박스스코어
                  </span>
                )}
                {isEditMode && (
                  <button
                    onClick={() => removeDate(sd.date)}
                    disabled={deletingDate === sd.date}
                    className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 p-1"
                  >
                    {deletingDate === sd.date
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        </>
      )}
    </div>
    {boxscoreDate && (
      <DailyBoxscoreModal
        leagueId={leagueId}
        date={boxscoreDate}
        onClose={() => setBoxscoreDate(null)}
      />
    )}
    </>
  )
}
