'use client'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { CalendarDays, Plus, Trash2, Loader2, Lock, Zap, BarChart2 } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'

type ScheduleDate = { id: string; date: string }
type Quarter = { id: string; year: number; quarter: number }

export default function LeagueSchedulePage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [dates, setDates] = useState<ScheduleDate[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [deletingDate, setDeletingDate] = useState<string | null>(null)
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
    <div className="mm-brand space-y-6">
      <LeagueSubTabs group="games" />
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 md:px-8 py-5"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        <div>
          <h2
            className="font-bold"
            style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em' }}
          >
            경기 일정
          </h2>
          <p
            className="text-[12px] tracking-[0.16em] uppercase font-bold mt-1"
            style={{ color: 'var(--mm-muted)' }}
          >
            총 {dates.length}개 날짜 등록됨
          </p>
        </div>
        {isEditMode ? (
          <button
            onClick={autoGenerate}
            disabled={autoGenerating}
            className="inline-flex items-center justify-center gap-1.5 text-[11px] font-black tracking-widest uppercase px-4 py-2 min-h-[44px] transition-shadow duration-200 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35)] cursor-pointer disabled:opacity-50"
            style={{
              background: 'var(--mm-yellow)',
              color: 'var(--mm-black)',
            }}
          >
            {autoGenerating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
            자동 일정 등록
          </button>
        ) : (
          <button
            onClick={openPinModal}
            className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest uppercase px-4 py-2 min-h-[44px] transition-colors cursor-pointer"
            style={{
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-muted)',
              background: 'var(--mm-panel)',
            }}
          >
            <Lock size={12} />편집 모드
          </button>
        )}
      </div>

      {/* 날짜 추가 */}
      {isEditMode && (
        <div
          className="p-4 sm:p-5 flex flex-wrap items-end gap-2 sm:gap-3"
          style={{
            background: 'var(--mm-panel-alt)',
            border: '1px solid var(--mm-rule)',
          }}
        >
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <label
              className="text-[11px] tracking-[0.16em] uppercase font-bold"
              style={{ color: 'var(--mm-muted)' }}
            >
              경기 날짜 추가
            </label>
            <Input
              type="date"
              value={newDate}
              onChange={e => setNewDate(e.target.value)}
              className="min-h-[44px]"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                color: 'var(--mm-ink)',
                borderRadius: 0,
              }}
            />
          </div>
          <button
            onClick={addDate}
            disabled={adding}
            className="inline-flex items-center justify-center gap-1.5 text-[11px] font-black tracking-widest uppercase px-4 py-2 min-h-[44px] transition-shadow duration-200 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35)] cursor-pointer disabled:opacity-50 shrink-0"
            style={{
              background: 'var(--mm-ink)',
              color: 'var(--mm-panel)',
            }}
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
            정규전 추가
          </button>
        </div>
      )}

      {/* 날짜 목록 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <BasketballLoader size={32} />
        </div>
      ) : dates.length === 0 ? (
        <EmptyState
          Icon={CalendarDays}
          title="등록된 일정이 없습니다"
          description="경기 일정을 추가하면 여기에 목록으로 표시됩니다."
          isEditMode={isEditMode}
          editorHint="위 입력창에서 날짜를 추가하거나 '자동 생성' 을 눌러 보세요"
        />
      ) : (
        <>
        {/* 분기 필터 탭 */}
        {quarters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {[{ id: 'all', label: '전체' }, ...quarters.map(q => ({ id: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q` }))].map(tab => {
              const active = selectedQFilter === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setSelectedQFilter(tab.id)}
                  className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] min-w-[44px] text-[11px] font-black tracking-widest uppercase transition-colors cursor-pointer"
                  style={{
                    background: active ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                    color: active ? 'var(--mm-black)' : 'var(--mm-muted)',
                    border: active ? '1px solid var(--mm-yellow)' : '1px solid var(--mm-rule)',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[...dates]
            .filter(sd => selectedQFilter === 'all' || dateQuarterMap[sd.date] === selectedQFilter)
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(sd => (
            <div
              key={sd.id}
              className="flex items-center justify-between transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)]"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                padding: '16px 20px',
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <CalendarDays size={18} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} />
                <span
                  className="font-bold break-keep min-w-0"
                  style={{ color: 'var(--mm-ink)', fontSize: 'clamp(17px, 4.6vw, 20px)', letterSpacing: '-0.005em', lineHeight: 1.15, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {formatDate(sd.date)}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {datesWithStats.has(sd.date) ? (
                  <Link
                    href={`/league/${orgSlug}/${leagueId}/boxscore/${sd.date}`}
                    className="inline-flex items-center justify-center gap-1.5 text-[11px] font-black tracking-widest uppercase px-4 py-2 min-h-[44px] transition-colors cursor-pointer btn-press"
                    style={{
                      background: 'var(--mm-yellow-soft)',
                      color: 'var(--mm-yellow-strong)',
                      border: '1px solid var(--mm-yellow)',
                    }}
                  >
                    <BarChart2 size={12} />박스스코어
                  </Link>
                ) : (
                  <span
                    className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest uppercase px-4 py-2 min-h-[44px] cursor-not-allowed select-none"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      color: 'var(--mm-muted)',
                      border: '1px solid var(--mm-rule)',
                      opacity: 0.6,
                    }}
                  >
                    <BarChart2 size={12} />박스스코어
                  </span>
                )}
                {isEditMode && (
                  <button
                    onClick={() => removeDate(sd.date)}
                    disabled={deletingDate === sd.date}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors cursor-pointer disabled:opacity-40 hover:bg-[color:var(--mm-panel-alt)]"
                    style={{ color: 'var(--mm-muted)' }}
                    aria-label="일정 삭제"
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
    </>
  )
}
