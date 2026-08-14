'use client'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { CalendarDays, Plus, Trash2, Loader2, Lock, Zap, BarChart2, ChevronDown, Pencil, Clock, MapPin, Users, CalendarOff } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import SubTabLoadingSkeleton from '@/components/league/SubTabLoadingSkeleton'

// is_skipped = 휴관 등으로 안 모인 주. 지우는 대신 표시로 남긴다 —
// 지우면 '일정 등록'을 누를 때마다 start_date 기준으로 다시 만들어져 되살아난다.
// start_time·place·capacity 는 앞으로 있을 경기에만 채운다(참여신청용). 과거 날짜는 전부 null 이다 —
// 이제 와서 알 수도 없고, 기록을 보는 데 필요하지도 않다.
type ScheduleDate = {
  id: string; date: string; is_skipped?: boolean
  start_time?: string | null; place?: string | null; capacity?: number | null
}
type Quarter = { id: string; year: number; quarter: number; start_date?: string | null; end_date?: string | null }

/** 오늘(로컬) YYYY-MM-DD. 미래 일정 판정 기준 — 문자열 비교로 시간대 문제를 피한다. */
function todayYmd(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** '20:00:00' → '20:00'. DB 는 time 이라 초까지 온다. */
function hhmm(t?: string | null): string {
  return t ? t.slice(0, 5) : ''
}

// 한 번에 보여줄 날짜 카드 수 — 나머지는 "더 보기" 로 점진 노출한다.
// 흡수된 구 박스스코어 목록은 5일씩 서버 페이지네이션이었다. 이 페이지는 편집(추가/삭제)이
// 같은 배열을 공유해야 해서 서버 페이지네이션 대신, 이미 fetch 해 둔 배열을 클라이언트에서
// 점진 노출하는 방식을 택했다(삭제 직후 "몇 페이지째였는지" 추적이 필요 없어진다).
// 실측(2026-08-09): 미라클 리그 32개 날짜, 모바일은 1열 그리드라 한 번에 다 펼치면 스크롤이
// 과하다 — 10장이면 초기 노출 분량이 구 목록 2페이지(10일)와 비슷해 이 값으로 잡았다.
const INITIAL_VISIBLE = 10
const REVEAL_STEP = 10

// ⚠ 이 컴포넌트는 반드시 파일 최상단(모듈 스코프)에 둔다. 렌더 함수 안에서 정의하면
//    리렌더마다 새 컴포넌트 타입이 되어 입력칸이 매번 교체되고, 한글 IME 조합이 글자마다
//    끊긴다("체육관" → "ㅊ ㅔ ..."). 장소는 한글 입력칸이라 여기에 정통으로 걸린다.
function ScheduleDetailEditor({
  sd, saving, onSave, onCancel,
}: {
  sd: ScheduleDate
  saving: boolean
  onSave: (patch: { start_time: string; place: string; capacity: string }) => void
  onCancel: () => void
}) {
  const [time, setTime] = useState(hhmm(sd.start_time))
  const [place, setPlace] = useState(sd.place ?? '')
  const [capacity, setCapacity] = useState(sd.capacity ? String(sd.capacity) : '')

  return (
    <div
      className="flex flex-col gap-2 pt-2"
      style={{ borderTop: '1px solid var(--mm-rule)' }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-[120px_1fr_110px] gap-2">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--mm-muted)' }}>시작 시간</span>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 min-w-0 col-span-2 sm:col-span-1">
          <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--mm-muted)' }}>장소</span>
          <Input value={place} onChange={e => setPlace(e.target.value)} placeholder="예: 상암 체육관" className="min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: 'var(--mm-muted)' }}>정원</span>
          <Input
            type="number" min={1} inputMode="numeric"
            value={capacity} onChange={e => setCapacity(e.target.value)}
            placeholder="무제한" className="min-h-[44px]"
          />
        </label>
      </div>
      {/* 비워 두면 지워진다는 걸 미리 알린다 — 저장하고 나서 사라진 걸 발견하면 되돌릴 방법이 없다. */}
      <p className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>비워 두면 표시하지 않습니다 · 정원 빈칸 = 무제한</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({ start_time: time, place, capacity })}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 text-[11px] font-black tracking-widest uppercase px-4 py-2 min-h-[44px] cursor-pointer disabled:opacity-50 transition-shadow duration-200"
          style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}
        >
          {saving && <Loader2 size={13} className="animate-spin" aria-hidden />}
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center text-[11px] font-bold tracking-widest uppercase px-4 py-2 min-h-[44px] cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
          style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
        >
          취소
        </button>
      </div>
    </div>
  )
}

function ScheduleContent() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()
  const searchParams = useSearchParams()
  // 구 /boxscore 목록에서 리다이렉트로 들어온 ?quarter= 보존 — 공유된 링크의 분기 필터가 이어지게 한다.
  const quarterFromRedirect = searchParams.get('quarter')

  const [dates, setDates] = useState<ScheduleDate[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [autoGenerating, setAutoGenerating] = useState(false)
  const [deletingDate, setDeletingDate] = useState<string | null>(null)
  const [datesWithStats, setDatesWithStats] = useState<Set<string>>(new Set())
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQFilter, setSelectedQFilter] = useState<'all' | string>(quarterFromRedirect || 'all')
  const [dateQuarterMap, setDateQuarterMap] = useState<Record<string, string>>({})
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const today = todayYmd()

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

  // 리다이렉트로 들어온 quarter 파라미터가 실존하는 분기인지 로드 후 검증 — 없는 값이면
  // (오래된 링크·오타) 조용히 '전체' 로 폴백한다.
  useEffect(() => {
    if (selectedQFilter !== 'all' && quarters.length > 0 && !quarters.some(q => q.id === selectedQFilter)) {
      setSelectedQFilter('all')
    }
  }, [quarters, selectedQFilter])

  // 분기 필터를 바꾸면 이전 필터 기준으로 늘려둔 "더 보기" 상태를 초기값으로 되돌린다.
  useEffect(() => { setVisibleCount(INITIAL_VISIBLE) }, [selectedQFilter])

  // 일정 등록과 영상 연동을 한 번에 — 원래 두 화면에 흩어져 있던 두 버튼을 합쳤다(2026-08-10).
  // 실제 운영에서는 늘 붙어서 일어난다: 경기를 하고 나면 날짜를 등록하고 영상을 붙인다.
  // 유튜브 채널이 없거나 키가 없으면 일정 등록만 하고 그 사실을 안내한다(전체 실패로 만들지 않는다).
  async function autoGenerate() {
    setAutoGenerating(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/schedule-dates/sync`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok) {
        // 한 줄에 다 담는다 — 세 개의 토스트가 연달아 뜨면 무엇이 됐는지 오히려 안 읽힌다.
        const parts: string[] = []
        if (data.inserted > 0) {
          // 예정 일정은 따로 센다 — 참여신청을 붙일 날짜가 몇 개 생겼는지가 총무의 관심사다.
          const future = data.inserted_future ?? 0
          parts.push(future > 0 ? `일정 ${data.inserted}개 등록 (예정 ${future}개)` : `일정 ${data.inserted}개 등록`)
        }
        if (data.synced_dates > 0) parts.push(`영상 ${data.synced_videos}개 연동 (${data.synced_dates}일)`)
        if (data.skipped_marked > 0) parts.push(`미실시 ${data.skipped_marked}일 정리`)
        toast.success(parts.length > 0 ? parts.join(' · ') : '변경 사항 없음 — 이미 최신입니다')
        if (data.youtube_note) toast.message(data.youtube_note, { duration: 6000 })
        load()
      } else {
        toast.error(data.error ?? '동기화 실패')
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

  // 시간·장소·정원 저장 — 예정 일정에만 쓴다.
  async function saveDetails(date: string, patch: { start_time: string; place: string; capacity: string }) {
    setSavingDate(date)
    const res = await fetch(`/api/leagues/${leagueId}/schedule-dates`, {
      method: 'PATCH',
      headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, ...patch }),
    })
    setSavingDate(null)
    if (res.ok) {
      const updated: ScheduleDate = await res.json()
      // 목록 전체를 다시 불러오지 않는다 — 한 칸 고쳤는데 화면이 통째로 깜빡이면
      // 여러 날짜를 연달아 입력할 때 방금 어디를 고쳤는지 놓친다.
      setDates(prev => prev.map(d => (d.date === date ? { ...d, ...updated } : d)))
      setEditingDate(null)
      toast.success('일정 정보 저장 완료')
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '저장 실패')
    }
  }

  // 대관 없음 지정/해제. 지정하면 참여신청 대상에서 빠진다(서버가 is_skipped 를 보고 거른다).
  async function toggleSkip(date: string, next: boolean) {
    setSavingDate(date)
    const res = await fetch(`/api/leagues/${leagueId}/schedule-dates`, {
      method: 'PATCH',
      headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, is_skipped: next }),
    })
    setSavingDate(null)
    if (res.ok) {
      const updated: ScheduleDate = await res.json()
      setDates(prev => prev.map(d => (d.date === date ? { ...d, ...updated } : d)))
      if (next) setEditingDate(null)
      toast.success(next ? '대관 없음으로 지정 — 이 주는 신청을 받지 않습니다' : '대관 없음 해제')
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '변경 실패')
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

  // 분기 판정은 '그 날 치른 경기의 분기'가 정본이다. 하지만 앞으로 있을 날짜에는 경기가 없어
  // 그 지도에 안 잡힌다 — 분기 탭을 누르면 예정 일정이 통째로 사라져 보인다.
  // 그래서 경기가 없을 때만 분기의 기간(start_date~end_date)으로 되짚는다. 기간이 비어 있는
  // 분기는 되짚지 못하는데, 그건 '전체'에서만 보이면 되는 문제라 억지로 맞추지 않는다.
  function quarterOf(date: string): string | undefined {
    const fromGames = dateQuarterMap[date]
    if (fromGames) return fromGames
    return quarters.find(q => q.start_date && q.end_date && date >= q.start_date && date <= q.end_date)?.id
  }

  const filteredSortedDates = [...dates]
    .filter(sd => selectedQFilter === 'all' || quarterOf(sd.date) === selectedQFilter)
    .sort((a, b) => b.date.localeCompare(a.date))
  const visibleDates = filteredSortedDates.slice(0, visibleCount)
  const hasMoreDates = filteredSortedDates.length > visibleCount

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
            일정 등록 + 영상 연동
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
          editorHint="위 입력창에서 날짜를 추가하거나 '일정 등록 + 영상 연동' 을 눌러 보세요"
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
          {visibleDates.map(sd => {
            const isFuture = sd.date >= today
            // 앞으로 있을 경기. 접힌 날은 제외한다 — 접혔다는 건 '안 모인다'는 뜻이라
            // 예정으로 부르면 거짓말이 되고, 참여신청도 받으면 안 된다.
            const upcoming = isFuture && !sd.is_skipped
            const hasDetails = !!(sd.start_time || sd.place || sd.capacity)
            return (
            <div
              key={sd.id}
              className="flex flex-col gap-2"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                padding: '16px 20px',
              }}
            >
              <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 min-w-0">
                <CalendarDays size={18} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} />
                <span
                  className="font-bold break-keep min-w-0"
                  style={{ color: 'var(--mm-ink)', fontSize: 'clamp(17px, 4.6vw, 20px)', letterSpacing: '-0.005em', lineHeight: 1.15, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                >
                  {formatDate(sd.date)}
                </span>
                {upcoming && (
                  <span
                    className="shrink-0 text-[10px] font-black uppercase px-2 py-0.5"
                    style={{
                      background: 'var(--mm-yellow-soft)',
                      color: 'var(--mm-yellow-strong)',
                      border: '1px solid var(--mm-yellow)',
                      borderRadius: 'var(--mm-radius-chip)',
                      letterSpacing: '0.12em',
                    }}
                  >
                    예정
                  </span>
                )}
                {/* 같은 플래그(is_skipped)를 시제로만 가른다 — 담는 사실은 '이 날은 경기가 없다'로
                    같다. 앞으로의 주에 '미실시'라고 쓰면 아직 벌어지지도 않은 일을 단정하게 된다. */}
                {sd.is_skipped && (
                  <span
                    className="shrink-0 text-[10px] font-black uppercase px-2 py-0.5"
                    style={{
                      background: 'var(--mm-neutral-bg)',
                      color: 'var(--mm-neutral-fg)',
                      borderRadius: 'var(--mm-radius-chip)',
                      letterSpacing: '0.12em',
                    }}
                    title={isFuture
                      ? '대관이 없어 이번 주는 모이지 않습니다. 참여신청도 받지 않습니다.'
                      : '영상도 기록도 없이 일주일이 지나 미실시로 정리된 날짜입니다. 자동 등록으로 다시 생기지 않습니다.'}
                  >
                    {isFuture ? '대관 없음' : '미실시'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* 예정 일정에는 박스스코어 자리를 두지 않는다 — 아직 치르지 않은 경기의
                    비활성 버튼은 자리만 차지하고 누를 일이 영영 없다. */}
                {!upcoming && (datesWithStats.has(sd.date) ? (
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
                ))}
                {/* 대관 없음 토글 — 지정하면 그 주는 참여신청을 받지 않는다.
                    되돌릴 수 있어야 한다: 대관이 뒤늦게 잡히는 일이 흔하다. */}
                {isEditMode && isFuture && (
                  <button
                    onClick={() => toggleSkip(sd.date, !sd.is_skipped)}
                    disabled={savingDate === sd.date}
                    className="inline-flex items-center gap-1.5 justify-center text-[11px] font-bold tracking-widest uppercase px-3 py-2 min-h-[44px] transition-colors cursor-pointer disabled:opacity-50 hover:bg-[color:var(--mm-panel-alt)]"
                    style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
                  >
                    <CalendarOff size={12} aria-hidden />
                    {sd.is_skipped ? '되돌리기' : '대관 없음'}
                  </button>
                )}
                {isEditMode && upcoming && (
                  <button
                    onClick={() => setEditingDate(editingDate === sd.date ? null : sd.date)}
                    className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest uppercase px-3 py-2 min-h-[44px] transition-colors cursor-pointer hover:bg-[color:var(--mm-panel-alt)]"
                    style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                    aria-expanded={editingDate === sd.date}
                  >
                    <Pencil size={12} aria-hidden />
                    {hasDetails ? '수정' : '시간·장소'}
                  </button>
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

              {/* 시간·장소·정원 — 입력된 것만 그린다. 비어 있으면 줄 자체가 없다.
                  '미정'을 나열하면 과거 날짜 32개가 전부 '미정 · 미정'으로 도배된다. */}
              {hasDetails && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[30px] text-[12.5px]" style={{ color: 'var(--mm-ink-soft)' }}>
                  {sd.start_time && (
                    <span className="inline-flex items-center gap-1"><Clock size={13} aria-hidden style={{ color: 'var(--mm-muted)' }} />{hhmm(sd.start_time)}</span>
                  )}
                  {sd.place && (
                    <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={13} aria-hidden className="shrink-0" style={{ color: 'var(--mm-muted)' }} /><span className="break-keep">{sd.place}</span></span>
                  )}
                  {sd.capacity && (
                    <span className="inline-flex items-center gap-1"><Users size={13} aria-hidden style={{ color: 'var(--mm-muted)' }} />정원 {sd.capacity}명</span>
                  )}
                </div>
              )}

              {isEditMode && upcoming && editingDate === sd.date && (
                <ScheduleDetailEditor
                  sd={sd}
                  saving={savingDate === sd.date}
                  onCancel={() => setEditingDate(null)}
                  onSave={patch => saveDetails(sd.date, patch)}
                />
              )}
            </div>
          )})}
        </div>

        {/* 더 보기 — 이미 fetch 된 배열을 점진 노출(서버 재요청 없음). 남은 개수를 라벨에
            보여줘 몇 번 눌러야 끝인지 미리 가늠할 수 있게 한다. */}
        {hasMoreDates && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + REVEAL_STEP)}
              className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-widest uppercase px-5 py-2.5 min-h-[44px] transition-colors cursor-pointer hover:bg-[color:var(--mm-panel-alt)]"
              style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
            >
              <ChevronDown size={14} aria-hidden />
              더 보기 ({filteredSortedDates.length - visibleDates.length}개 남음)
            </button>
          </div>
        )}
        </>
      )}
    </div>
    </>
  )
}

// searchParams(useSearchParams)를 읽는 컴포넌트는 Suspense 경계 없이 페이지 최상단에 두면
// 빌드가 실패한다 — 내부 컴포넌트를 분리하고 여기서 감싼다. 폴백은 다른 서브탭과 동일한
// 스켈레톤(SubTabLoadingSkeleton) 재사용 — 검색 파라미터는 즉시 읽히므로 실제로는 거의 보이지 않는다.
export default function LeagueSchedulePage() {
  return (
    <Suspense fallback={<SubTabLoadingSkeleton />}>
      <ScheduleContent />
    </Suspense>
  )
}
