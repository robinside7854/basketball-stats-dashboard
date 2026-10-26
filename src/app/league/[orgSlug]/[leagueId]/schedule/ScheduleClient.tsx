'use client'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import { useState, useEffect, useRef, Suspense, Fragment } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { CalendarDays, Plus, Trash2, Loader2, Zap, BarChart2, ChevronDown, Pencil, Clock, MapPin, Users, CalendarOff, PenLine } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import SubTabLoadingSkeleton from '@/components/league/SubTabLoadingSkeleton'
import TournamentSchedule from '@/components/league/TournamentSchedule'
import { RecordBar } from '@/components/league/ui/viz'
import Chip from '@/components/league/ui/Chip'
import { pickCurrentQuarter } from '@/lib/league/currentQuarter'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import { tallyDayRecord, identityKeyOf, type DayRecord } from '@/lib/stats/dayRecord'

// is_skipped = 휴관 등으로 안 모인 주. 지우는 대신 표시로 남긴다 —
// 지우면 '일정 등록'을 누를 때마다 start_date 기준으로 다시 만들어져 되살아난다.
// start_time·place·capacity 는 앞으로 있을 경기에만 채운다(참여신청용). 과거 날짜는 전부 null 이다 —
// 이제 와서 알 수도 없고, 기록을 보는 데 필요하지도 않다.
type ScheduleDate = {
  id: string; date: string; is_skipped?: boolean
  start_time?: string | null; place?: string | null; capacity?: number | null
}
// 날짜 카드에 보여 줄 그날 결과 — 팀별 승패. 규칙은 lib/stats/dayRecord.ts 한 벌(홈·하이라이트·박스스코어와 같다):
//   친선전 제외(친선전뿐인 날은 친선전으로 세고 「친선전」 표시) · 정체성 키(team_id + 그 분기 이름)로 묶음 · 승률 → 득실.
//   (종전엔 이름으로 묶고 승−패 순이라, 같은 날 홈과 순서가 달랐다.)
type DayGame = {
  id: string; slot_num: number | null; is_exhibition: boolean
  home: string; away: string; home_score: number; away_score: number
}
type DayResult = { record: DayRecord; games: DayGame[] }
type CompleteGame = {
  id: string; slot_num?: number | null
  date: string; quarter_id?: string; is_exhibition?: boolean
  home_score: number | null; away_score: number | null
  home_team_id: string | null; away_team_id: string | null
  // /games 가 분기 이름(override)으로 이미 풀어 준다
  home_team?: { id: string; name: string; color: string | null } | null
  away_team?: { id: string; name: string; color: string | null } | null
}

function buildDayResults(games: CompleteGame[]): Record<string, DayResult> {
  const byDate: Record<string, CompleteGame[]> = {}
  for (const g of games) (byDate[g.date] ??= []).push(g)
  const side = (t: CompleteGame['home_team']) => t ? { key: identityKeyOf(t.id, t.name), name: t.name, color: t.color } : null
  const out: Record<string, DayResult> = {}
  for (const [date, gs] of Object.entries(byDate)) {
    const sorted = [...gs].sort((x, y) => (x.slot_num ?? 999) - (y.slot_num ?? 999))
    out[date] = {
      record: tallyDayRecord(sorted.map(g => ({
        home: side(g.home_team), away: side(g.away_team),
        home_score: g.home_score, away_score: g.away_score,
        is_complete: true, is_exhibition: g.is_exhibition,
      }))),
      games: sorted.filter(g => g.home_team && g.away_team).map(g => ({
        id: g.id, slot_num: g.slot_num ?? null, is_exhibition: !!g.is_exhibition,
        home: g.home_team!.name, away: g.away_team!.name,
        home_score: g.home_score ?? 0, away_score: g.away_score ?? 0,
      })),
    }
  }
  return out
}

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
  sd, saving, defaults, onSave, onCancel,
}: {
  sd: ScheduleDate
  saving: boolean
  /** 고정 대관 — 빈칸으로 두면 이 값이 쓰인다. 미리 채워 넣지 않는다(아래 주석 참조). */
  defaults: { start_time: string | null; place: string | null; capacity: number | null } | null
  onSave: (patch: { start_time: string; place: string; capacity: string }) => void
  onCancel: () => void
}) {
  // ⚠ 고정 대관 값을 미리 채워 넣지 않는다. 채우면 저장하는 순간 그 날짜의 '예외'로 굳어,
  //    나중에 설정에서 장소를 바꿔도 이 날만 옛 장소에 남는다. 빈칸 = 고정 대관을 따른다.
  const [time, setTime] = useState(hhmm(sd.start_time))
  const [place, setPlace] = useState(sd.place ?? '')
  const [capacity, setCapacity] = useState(sd.capacity ? String(sd.capacity) : '')

  const ph = {
    time: defaults?.start_time ? `기본 ${hhmm(defaults.start_time)}` : '미정',
    place: defaults?.place ? `기본 ${defaults.place}` : '예: 상암 체육관',
    capacity: defaults?.capacity ? `기본 ${defaults.capacity}명` : '무제한',
  }

  return (
    <div
      className="flex flex-col gap-2 pt-2"
      style={{ borderTop: '1px solid var(--mm-rule)' }}
    >
      <div className="grid grid-cols-2 sm:grid-cols-[120px_1fr_110px] gap-2">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="t-label font-medium">시작 시간</span>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="min-h-[44px]" />
        </label>
        {/* 폰: 장소를 먼저 한 줄로 두고 시간·정원을 나란히 — 시간·정원이 각자 반 칸만 차지해 오른쪽이 비던 배치 */}
        <label className="flex flex-col gap-1 min-w-0 col-span-2 sm:col-span-1 order-first sm:order-none">
          <span className="t-label font-medium">장소</span>
          <Input value={place} onChange={e => setPlace(e.target.value)} placeholder={ph.place} className="min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="t-label font-medium">정원</span>
          <Input
            type="number" min={1} inputMode="numeric"
            value={capacity} onChange={e => setCapacity(e.target.value)}
            placeholder={ph.capacity} className="min-h-[44px]"
          />
        </label>
      </div>
      {/* 빈칸의 뜻을 밝힌다 — 저장하고 나서 값이 사라진 걸 발견하면 되돌릴 방법이 없다. */}
      <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
        {defaults && (defaults.start_time || defaults.place)
          ? '비워 두면 설정의 고정 대관을 따릅니다 · 이 날만 다를 때 입력하세요'
          : '비워 두면 표시하지 않습니다 · 정원 빈칸 = 무제한'}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({ start_time: time, place, capacity })}
          disabled={saving}
          className="inline-flex items-center justify-center gap-1.5 text-sm font-black whitespace-nowrap px-4 py-2 min-h-[44px] cursor-pointer disabled:opacity-50 transition-shadow duration-200"
          style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}
        >
          {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
          저장
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center text-sm font-medium whitespace-nowrap px-4 py-2 min-h-[44px] cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
          style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
        >
          취소
        </button>
      </div>
    </div>
  )
}

/**
 * 「경기」 탭 본문 — 묶음 성격에 따라 완전히 다른 화면이다.
 *
 *   리그   → 아래 ScheduleContent (날짜를 깔고 그 날짜에 슬롯을 채운다)
 *   대회   → TournamentSchedule   (대회 → 경기 를 손으로 등록한다)
 *
 * 리그 일정은 "매주 같은 요일에 모인다"를 전제로 start_date 부터 주간 날짜를 자동 생성한다.
 * 대회 묶음에 그게 돌아 **토요일 43개**가 깔려 있었고, 정작 대회 경기는 한 건도 없는데
 * 화면은 일정으로 가득 차 있었다(2026-08-30 사용자 지적). 이제 대회는 이 갈래로 빠진다.
 */
type VenueDefaults = { start_time: string | null; place: string | null; capacity: number | null }

// 리그/대회 판정과 고정 대관 값은 서버(page.tsx)가 넘긴다 (2026-10-26 점검 MVP 3) —
//   종전엔 판정 하나를 위해 `/api/leagues/{id}` 를 받고 나서야 일정 요청을 시작했고(2단 대기),
//   일정 쪽에서 같은 주소를 또 받았다(요청 4 → 2).
function GamesTab({ mode, venueDefaults }: { mode: 'league' | 'tournament'; venueDefaults: VenueDefaults | null }) {
  const { leagueId, orgSlug } = useParams<{ orgSlug: string; leagueId: string }>()
  if (mode === 'tournament') {
    return (
      <div className="mm-brand space-y-6">
        <LeagueSubTabs group="games" />
        <TournamentSchedule leagueId={leagueId} base={`/league/${orgSlug}/${leagueId}`} />
      </div>
    )
  }
  return <ScheduleContent venueDefaults={venueDefaults} />
}

function ScheduleContent({ venueDefaults }: { venueDefaults: VenueDefaults | null }) {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const { isEditMode, leagueHeaders } = useLeagueEditMode()
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
  // 분기 목록은 LeagueQuarterContext 하나에서 받는다(2026-10-12 리뉴얼 5단계 — 종전엔 여기서 `/quarters` 를 또 불렀다).
  const { quarters, ready: quartersReady } = useLeagueQuarter()
  const [selectedQFilter, setSelectedQFilter] = useState<'all' | string>(quarterFromRedirect || 'all')
  const [dateQuarterMap, setDateQuarterMap] = useState<Record<string, string>>({})
  const [dayResults, setDayResults] = useState<Record<string, DayResult>>({})
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE)
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const today = todayYmd()

  async function load() {
    setLoading(true)
    const [dRes, gRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/schedule-dates`),
      fetch(`/api/leagues/${leagueId}/games?complete=true`),
    ])
    if (dRes.ok) setDates(await dRes.json())
    if (gRes.ok) {
      const games: CompleteGame[] = await gRes.json()
      setDatesWithStats(new Set(games.map(g => g.date)))
      setDayResults(buildDayResults(games))
      const dqMap: Record<string, string> = {}
      for (const g of games) {
        if (g.date && g.quarter_id && !dqMap[g.date]) dqMap[g.date] = g.quarter_id
      }
      setDateQuarterMap(dqMap)
    }
    setLoading(false)
  }

  // 기본 필터는 이번 분기 — 스탯·팀 탭과 같은 기준(2026-10-11). 리다이렉트로 분기가 지정됐으면 그걸 쓴다.
  //   분기 목록이 확정된 뒤 **한 번만** 고른다.
  const qDefaultedRef = useRef(false)
  useEffect(() => {
    if (!quartersReady || qDefaultedRef.current) return
    qDefaultedRef.current = true
    if (quarterFromRedirect) return
    const cur = pickCurrentQuarter(quarters)
    if (cur) setSelectedQFilter(cur.id)
  }, [quartersReady, quarters, quarterFromRedirect])

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

  // 영상으로 일정 맞추기 (2026-10-12 운영진 결정 — 「영상이 올라온 날 = 경기한 날」).
  //   영상이 올라온 날짜를 일정에 넣고 영상을 붙이며, 아무 흔적 없는 날짜(예정·영상 없는 지난 날)는
  //   빈 슬롯째 지운다. 지우는 일이라 먼저 미리보기(dryRun)로 무엇이 바뀌는지 보여 주고 확인받는다.
  //   매일 밤 자동으로도 돈다(/api/cron/video-schedule) — 이 버튼은 「지금 바로」용이다.
  async function autoGenerate() {
    setAutoGenerating(true)
    try {
      const call = (dryRun: boolean) => fetch(`/api/leagues/${leagueId}/schedule-dates/video-sync`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const pre = await call(true)
      const plan = await pre.json()
      if (!pre.ok) { toast.error(plan.error ?? '확인 실패'); return }
      const added: string[] = plan.added ?? []
      const synced: Array<{ date: string }> = plan.synced ?? []
      const pruned: Array<{ date: string; future: boolean }> = plan.pruned ?? []
      if (added.length === 0 && synced.length === 0 && pruned.length === 0) {
        toast.success(plan.error ? `변경 없음 · ${plan.error}` : '변경 없음 — 이미 영상과 맞습니다')
        return
      }
      const fmt = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
      const lines: string[] = []
      if (added.length) lines.push(`추가: ${added.map(fmt).join(', ')}`)
      if (synced.length) lines.push(`영상 연동: ${synced.map(x => fmt(x.date)).join(', ')}`)
      if (pruned.length) lines.push(`삭제(경기 없음): ${pruned.map(x => fmt(x.date) + (x.future ? '(예정)' : '')).join(', ')}`)
      if (!window.confirm(`영상 기준으로 일정을 맞춥니다.\n\n${lines.join('\n')}\n\n기록이나 영상이 있는 날짜는 지우지 않습니다. 진행할까요?`)) return
      const res = await call(false)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? '실패'); return }
      const mapped = (data.synced ?? []).reduce((s: number, x: { mapped: number }) => s + (x.mapped ?? 0), 0)
      const parts: string[] = []
      if (data.added?.length) parts.push(`${data.added.length}일 추가`)
      if (mapped > 0) parts.push(`영상 ${mapped}개 연동`)
      if (data.pruned?.length) parts.push(`${data.pruned.length}일 삭제`)
      toast.success(parts.join(' · ') || '완료')
      load()
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setAutoGenerating(false)
    }
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
      toast.success(next ? '대관 없음으로 지정 — 이 주는 모이지 않습니다' : '대관 없음 해제')
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '변경 실패')
    }
  }

  async function removeDate(date: string) {
    if (!confirm(`${date} 일정을 삭제하시겠습니까?\n해당 날짜의 빈 경기 슬롯도 함께 삭제됩니다.\n(이미 기록이 있는 경기는 지워지지 않습니다)`)) return
    setDeletingDate(date)

    // 해당 날짜의 경기 슬랏부터 지운다.
    // 이전 구현은 PATCH 에 `{ _delete: true }` 를 보냈는데 그런 처리가 라우트에 없어
    // 계속 조용히 실패했다 — 응답을 안 봤기 때문에 화면만 성공으로 보였고, 날짜만
    // 사라지고 슬랏은 리그에 남았다. 이제 전용 DELETE 를 쓰고 결과를 확인한다.
    const gamesRes = await fetch(`/api/leagues/${leagueId}/games?date=${date}`).catch(() => null)
    if (!gamesRes?.ok) {
      setDeletingDate(null)
      toast.error('해당 날짜의 경기를 확인하지 못해 중단했습니다')
      return
    }
    const games: { id: string }[] = await gamesRes.json()

    const results = await Promise.all(
      games.map(g =>
        fetch(`/api/leagues/${leagueId}/games?gameId=${g.id}`, {
          method: 'DELETE',
          headers: leagueHeaders,
        }).catch(() => null)
      )
    )
    // 409 = 기록이 있어 서버가 거절한 경기. 남은 슬랏이 있으면 날짜를 지우면 안 된다 —
    // 날짜만 사라지고 경기가 떠도는 게 바로 지금까지의 상태였다.
    const blocked = results.filter(r => r?.status === 409).length
    const failed = results.filter(r => !r || (!r.ok && r.status !== 409)).length
    if (blocked > 0 || failed > 0) {
      setDeletingDate(null)
      toast.error(
        blocked > 0
          ? `기록이 있는 경기 ${blocked}건이 있어 일정을 삭제하지 않았습니다`
          : '경기 슬랏을 지우지 못해 일정을 삭제하지 않았습니다'
      )
      load()
      return
    }

    const dateRes = await fetch(`/api/leagues/${leagueId}/schedule-dates?date=${date}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    }).catch(() => null)
    setDeletingDate(null)
    if (dateRes?.ok) toast.success('일정 삭제 완료')
    else toast.error('일정을 삭제하지 못했습니다')
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
        className="px-4 py-4 lg:px-6 lg:py-5 space-y-3"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderRadius: 'var(--mm-radius-card)', boxShadow: 'var(--mm-edge-light), var(--mm-shadow-sm)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="font-black"
            style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em' }}
          >
            경기 일정
          </h2>
          <p
            className="t-label font-medium mt-1 tabular-nums"
            style={{ color: 'var(--mm-muted)' }}
          >
            {/* 「총 N개 날짜 등록됨」은 운영 지표라 운영진에게만 (2026-10-26) */}
            {isEditMode ? `총 ${dates.length}개 날짜 등록됨` : '날짜를 누르면 그날 기록을 볼 수 있어요'}
          </p>
        </div>
        {isEditMode ? (
          <button
            onClick={autoGenerate}
            disabled={autoGenerating}
            className="inline-flex items-center justify-center gap-1.5 text-sm font-black whitespace-nowrap px-4 py-2 min-h-[44px] transition-shadow duration-200 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35)] cursor-pointer disabled:opacity-50"
            style={{
              background: 'var(--mm-yellow)',
              color: 'var(--mm-black)',
            }}
          >
            {autoGenerating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            영상으로 일정 맞추기
          </button>
        ) : null}
        </div>
        {/* 분기 필터 — 제목 카드 안으로 (배경 위에 칩만 떠 있지 않게, 2026-10-13) */}
        {!loading && dates.length > 0 && quarters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap pt-3" style={{ borderTop: '1px solid var(--mm-rule)' }}>
            {[{ id: 'all', label: '전체' }, ...quarters.map(q => ({ id: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q` }))].map(tab => {
              return (
                <Chip
                  key={tab.id}
                  as="button"
                  size="md"
                  selected={selectedQFilter === tab.id}
                  onClick={() => setSelectedQFilter(tab.id)}
                  className="min-w-[44px]"
                >
                  {tab.label}
                </Chip>
              )
            })}
          </div>
        )}
      </div>

      {/* 날짜 추가 */}
      {isEditMode && (
        <div
          className="px-4 py-4 lg:px-6 lg:py-5 flex flex-wrap items-end gap-2 sm:gap-3"
          style={{
            background: 'var(--mm-panel-alt)',
            border: '1px solid var(--mm-rule)',
            borderRadius: 'var(--mm-radius-card)',
          }}
        >
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <label
              className="t-label font-medium"
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
          {/* 폰: 날짜 칸(최소 220px) 옆에 안 들어가 버튼만 아랫줄 왼쪽에 덩그러니 남았다 → 폰에서는 꽉 찬 폭 */}
          <button
            onClick={addDate}
            disabled={adding}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 text-sm font-black whitespace-nowrap px-4 py-2 min-h-[44px] transition-shadow duration-200 hover:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.35)] cursor-pointer disabled:opacity-50 shrink-0"
            style={{
              background: 'var(--mm-ink)',
              color: 'var(--mm-panel)',
            }}
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            정규전 추가
          </button>
        </div>
      )}

      {/* 날짜 목록 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <BasketballLoader size={24} />
        </div>
      ) : dates.length === 0 ? (
        <EmptyState
          Icon={CalendarDays}
          title="등록된 일정이 없습니다"
          description="경기 일정을 추가하면 여기에 목록으로 표시됩니다."
          isEditMode={isEditMode}
          editorHint="영상이 올라오면 매일 밤 자동으로 등록됩니다. 지금 바로 하려면 「영상으로 일정 맞추기」를 누르세요"
        />
      ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibleDates.map(sd => {
            const isFuture = sd.date >= today
            // 앞으로 있을 경기. 접힌 날은 제외한다 — 접혔다는 건 '안 모인다'는 뜻이라
            // 예정으로 부르면 거짓말이 되고, 참여신청도 받으면 안 된다.
            // ⚠ 오늘도 isFuture 다(`>=`). 경기를 마감한 당일에는 이미 결과가 있는데 '예정'으로 남아
            //   박스스코어 버튼이 숨었다(2026-10-10 신고 — 홈 「최근 라운드」에선 열리는데 일정표엔 없다).
            //   마감된 경기가 있는 날은 예정이 아니다.
            const upcoming = isFuture && !sd.is_skipped && !datesWithStats.has(sd.date)
            // 이 날만의 예외가 있는가 — 편집 버튼 라벨('시간·장소' vs '수정')을 가른다.
            const hasOwnDetails = !!(sd.start_time || sd.place || sd.capacity)
            // 화면에 실제로 보일 값. 고정 대관은 예정 일정에만 씌운다 —
            // 과거 32개 날짜에 오늘 설정한 장소를 소급해 붙이면 없던 사실이 생긴다.
            const eff = upcoming
              ? {
                start_time: sd.start_time ?? venueDefaults?.start_time ?? null,
                place: sd.place ?? venueDefaults?.place ?? null,
                capacity: sd.capacity ?? venueDefaults?.capacity ?? null,
              }
              : { start_time: sd.start_time ?? null, place: sd.place ?? null, capacity: sd.capacity ?? null }
            const hasDetails = !!(eff.start_time || eff.place || eff.capacity)
            const boxscoreEl = datesWithStats.has(sd.date) ? (
              <Link
                href={`/league/${orgSlug}/${leagueId}/boxscore/${sd.date}`}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-black whitespace-nowrap px-4 py-2 min-h-[44px] transition-colors cursor-pointer btn-press"
                style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)', border: '1px solid var(--mm-yellow)' }}
              >
                <BarChart2 size={14} />박스스코어
              </Link>
            ) : (
              <span
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap px-4 py-2 min-h-[44px] cursor-not-allowed select-none"
                style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)' }}
              >
                <BarChart2 size={14} />박스스코어
              </span>
            )
            return (
            <div
              key={sd.id}
              className="flex flex-col gap-2.5 px-4 py-4 lg:px-6"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                borderRadius: 'var(--mm-radius-card)', boxShadow: 'var(--mm-edge-light), var(--mm-shadow-sm)',
              }}
            >
              {/* 날짜 바로 옆에 박스스코어를 붙인다 — PC 2열에서 justify-between 이면 날짜와 버튼 사이가
                  카드 폭만큼 벌어져 눈이 왕복했다(2026-10-12). 좁으면 버튼만 다음 줄로 내려간다. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <CalendarDays size={20} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} />
                {/* ⚠ overflowWrap:'anywhere' 를 걸면 안 된다. 편집 모드에서 오른쪽 버튼들이
                    자리를 차지하면 남은 폭이 한 글자까지 좁아지고, 그때 날짜가 세로로
                    한 글자씩 쪼개진다("2 0 2 6 년 8 월..."). 날짜는 절대 단어 중간에서
                    끊으면 안 되는 문자열이다 — break-keep 만으로 충분하다. */}
                <span
                  className="font-bold break-keep min-w-0"
                  style={{ color: 'var(--mm-ink)', fontSize: 'clamp(16px, 4.2vw, 20px)', letterSpacing: '-0.005em', lineHeight: 1.2 }}
                >
                  {formatDate(sd.date)}
                </span>
                {upcoming && (
                  <Chip tone="accent">예정</Chip>
                )}
                {/* 같은 플래그(is_skipped)를 시제로만 가른다 — 담는 사실은 '이 날은 경기가 없다'로
                    같다. 앞으로의 주에 '미실시'라고 쓰면 아직 벌어지지도 않은 일을 단정하게 된다. */}
                {sd.is_skipped && (
                  <Chip
                    tone="neutral"
                    title={isFuture
                      ? '대관이 없어 이번 주는 모이지 않습니다.'
                      : '영상도 기록도 없이 일주일이 지나 미실시로 정리된 날짜입니다. 자동 등록으로 다시 생기지 않습니다.'}
                  >
                    {isFuture ? '이번 주 쉬어요' : '경기 없음'}
                  </Chip>
                )}
              </div>
              {/* 읽기 모드에서만 날짜와 같은 줄에 붙인다. 편집 모드에서는 버튼이 최대 3개까지
                  늘어나 같은 줄에 두면 날짜 폭이 한 글자까지 눌린다 — 아래 별도 행으로 내린다. */}
              {!isEditMode && !upcoming && <div className="shrink-0">{boxscoreEl}</div>}
              </div>

              {/* 편집 액션 — 폭이 모자라면 줄바꿈된다. 날짜를 밀지 않는다. */}
              {isEditMode && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* 기록 진입점 — 날짜 목록은 여기 하나다 (2026-10-11). 기록 화면에 따로 있던
                      날짜 목록을 걷어냈다. 오늘·지난 날짜에만 둔다(앞날은 기록할 것이 없다). */}
                  {!sd.is_skipped && sd.date <= today && (
                    <Link
                      href={`/league/${orgSlug}/${leagueId}/record?date=${sd.date}`}
                      className="inline-flex items-center gap-1.5 justify-center text-sm font-bold whitespace-nowrap px-3 py-2 min-h-[44px] transition-colors cursor-pointer"
                      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)' }}
                    >
                      <PenLine size={14} aria-hidden />
                      기록하기
                    </Link>
                  )}
                  {!upcoming && boxscoreEl}
                  {/* 대관 없음 토글 — 지정하면 그 주는 모이지 않는 것으로 표시한다.
                      되돌릴 수 있어야 한다: 대관이 뒤늦게 잡히는 일이 흔하다. */}
                  {isFuture && (
                    <button
                      onClick={() => toggleSkip(sd.date, !sd.is_skipped)}
                      disabled={savingDate === sd.date}
                      className="inline-flex items-center gap-1.5 justify-center text-sm font-medium whitespace-nowrap px-3 py-2 min-h-[44px] transition-colors cursor-pointer disabled:opacity-50 hover:bg-[color:var(--mm-panel-alt)]"
                      style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
                    >
                      <CalendarOff size={14} aria-hidden />
                      {sd.is_skipped ? '되돌리기' : '대관 없음'}
                    </button>
                  )}
                  {upcoming && (
                    <button
                      onClick={() => setEditingDate(editingDate === sd.date ? null : sd.date)}
                      className="inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap px-3 py-2 min-h-[44px] transition-colors cursor-pointer hover:bg-[color:var(--mm-panel-alt)]"
                      style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                      aria-expanded={editingDate === sd.date}
                    >
                      <Pencil size={14} aria-hidden />
                      {hasOwnDetails ? '수정' : '시간·장소'}
                    </button>
                  )}
                  <button
                    onClick={() => removeDate(sd.date)}
                    disabled={deletingDate === sd.date}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] ml-auto transition-colors cursor-pointer disabled:opacity-40 hover:bg-[color:var(--mm-panel-alt)]"
                    style={{ color: 'var(--mm-muted)' }}
                    aria-label="일정 삭제"
                  >
                    {deletingDate === sd.date
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                </div>
              )}

              {/* 그날 결과 — 팀별 승패 (2026-10-11). 예전엔 「일정·결과」인데 결과가 하나도 없어서
                  누가 이겼는지 보려면 날짜마다 박스스코어를 열어야 했다. 승패는 색만이 아니라 숫자로 쓴다. */}
              {!upcoming && dayResults[sd.date] && (() => {
                const { record: rec, games: dayGames } = dayResults[sd.date]
                if (rec.regularGames === 0 && rec.exhibitionGames === 0) return null
                return (
                <div className="px-3 py-2.5 space-y-1.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
                    {rec.regularGames > 0 && <span className="font-bold">{rec.regularGames}경기</span>}
                    {rec.exhibitionGames > 0 && <span className="font-medium">친선 {rec.exhibitionGames}경기</span>}
                    {/* 친선전뿐인 날 — 승패를 숨기지 않고 친선전으로 센 것임을 밝힌다(순위·스탯에는 안 들어간다) */}
                    {rec.exhibitionOnly && rec.teams.length > 0 && <Chip tone="neutral">친선전 전적</Chip>}
                  </div>
                  {/* 팀별 그날 승패 — 이름 칸 폭 고정 + 막대(칸 안에 「2승」 글자). 360px 에서도 이름 6자 + 막대 3칸이 들어간다 */}
                  {rec.teams.length > 0 && (
                    <div className="grid grid-cols-[minmax(0,5.5rem)_1fr] sm:grid-cols-[minmax(0,7rem)_1fr] items-center gap-x-2 gap-y-1.5 max-w-md">
                      {rec.teams.map((t, ti) => (
                        <Fragment key={t.key}>
                          <span className="inline-flex items-center gap-1.5 min-w-0" title={t.name}>
                            <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color ?? 'var(--mm-muted)' }} />
                            <span className={`text-xs truncate ${ti === 0 ? 'font-black' : 'font-bold'}`} style={{ color: 'var(--mm-ink)' }}>{t.name}</span>
                          </span>
                          <RecordBar wins={t.wins} losses={t.losses} draws={t.draws} height={22} />
                        </Fragment>
                      ))}
                    </div>
                  )}
                  {/* 경기별 바로가기 (2026-10-15) — 홈 경기 타일처럼 그 경기를 펼친 박스스코어로. 처음엔 접어 둔다
                      (하루 9경기면 카드가 두 배로 길어진다). <details> 라 상태·스크립트가 없다. */}
                  {dayGames.length > 0 && (
                    <details className="group">
                      <summary
                        className="list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1 min-h-[44px] text-xs font-bold cursor-pointer"
                        style={{ color: 'var(--mm-ink-soft)' }}
                      >
                        경기별 결과 {dayGames.length}경기
                        <ChevronDown size={14} aria-hidden className="transition-transform group-open:rotate-180" />
                      </summary>
                      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pb-1">
                        {dayGames.map((g, gi) => {
                          const hw = g.home_score > g.away_score, aw = g.away_score > g.home_score
                          const num = g.slot_num ?? gi + 1
                          return (
                            <li key={g.id}>
                              <Link
                                href={`/league/${orgSlug}/${leagueId}/boxscore/${sd.date}?game=${g.id}`}
                                className="mm-press flex items-center gap-1.5 min-h-[44px] px-2.5 text-xs tabular-nums hover:brightness-95"
                                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink-soft)' }}
                                aria-label={`${num}경기 ${g.home} ${g.home_score} 대 ${g.away_score} ${g.away}${g.is_exhibition ? ' 친선전' : ''} 박스스코어`}
                              >
                                {/* 「10경기」(두 자리)가 36px 칸을 넘어 홈 팀 이름에 붙었다 → 40px */}
                                <span className="shrink-0 w-10 whitespace-nowrap font-bold" style={{ color: 'var(--mm-muted)' }}>{num}경기</span>
                                <span className={`min-w-0 flex-1 truncate text-right ${hw ? 'font-black' : ''}`} style={{ color: hw ? 'var(--mm-ink)' : undefined }}>{g.home}</span>
                                <span className="shrink-0 font-black" style={{ color: 'var(--mm-ink)' }}>{g.home_score}:{g.away_score}</span>
                                <span className={`min-w-0 flex-1 truncate ${aw ? 'font-black' : ''}`} style={{ color: aw ? 'var(--mm-ink)' : undefined }}>{g.away}</span>
                                {g.is_exhibition && <span className="shrink-0 text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>친선</span>}
                              </Link>
                            </li>
                          )
                        })}
                      </ol>
                    </details>
                  )}
                </div>
                )
              })()}

              {/* 시간·장소·정원 — 입력된 것만 그린다. 비어 있으면 줄 자체가 없다.
                  '미정'을 나열하면 과거 날짜 32개가 전부 '미정 · 미정'으로 도배된다. */}
              {hasDetails && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-[30px] text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
                  {eff.start_time && (
                    <span className="inline-flex items-center gap-1"><Clock size={14} aria-hidden style={{ color: 'var(--mm-muted)' }} />{hhmm(eff.start_time)}</span>
                  )}
                  {eff.place && (
                    <span className="inline-flex items-center gap-1 min-w-0"><MapPin size={14} aria-hidden className="shrink-0" style={{ color: 'var(--mm-muted)' }} /><span className="break-keep">{eff.place}</span></span>
                  )}
                  {eff.capacity && (
                    <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden style={{ color: 'var(--mm-muted)' }} />정원 {eff.capacity}명</span>
                  )}
                  {/* 고정 대관을 그대로 따르는 날인지 밝힌다. 안 밝히면 그 날만 따로 입력해 둔
                      값인 줄 알고, 설정에서 장소를 바꿨을 때 왜 여기까지 바뀌는지 모른다. */}
                  {upcoming && !hasOwnDetails && (
                    <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>고정 대관</span>
                  )}
                </div>
              )}

              {isEditMode && upcoming && editingDate === sd.date && (
                <ScheduleDetailEditor
                  sd={sd}
                  defaults={venueDefaults}
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
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap px-5 py-2.5 min-h-[44px] transition-colors cursor-pointer hover:bg-[color:var(--mm-panel-alt)]"
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
export default function ScheduleClient({ mode, venueDefaults }: { mode: 'league' | 'tournament'; venueDefaults: VenueDefaults | null }) {
  return (
    <Suspense fallback={<SubTabLoadingSkeleton />}>
      <GamesTab mode={mode} venueDefaults={venueDefaults} />
    </Suspense>
  )
}
