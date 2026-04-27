'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Lock, Loader2, Play, Square, ChevronLeft,
  CheckCircle2, Circle, Youtube, RefreshCw, UserPlus,
} from 'lucide-react'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LeagueEventInputPad from '@/components/league/LeagueEventInputPad'
import LeagueSubstitutionPanel from '@/components/league/LeagueSubstitutionPanel'
import LeagueStatsPanel from '@/components/league/LeagueStatsPanel'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'

type ScheduleDate = { id: string; date: string }
type GameSlot = {
  id: string; slot_num: number; date: string; is_complete: boolean; is_started: boolean
  home_score: number; away_score: number
  youtube_url?: string | null; youtube_start_offset?: number
  home_team_id?: string | null; away_team_id?: string | null
  quarter_id?: string | null
  home_team?: { id: string; name: string; color: string } | null
  away_team?: { id: string; name: string; color: string } | null
}
type MinRow = { id: string; league_player_id: string; league_game_id: string; out_time: number | null }
type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }
type IrregularPlayer = LeaguePlayer & { team_id: string | null; is_regular: boolean | null }

// ── 메인 페이지 ──────────────────────────────────────────────
export default function LeagueRecordPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <Lock size={32} className="text-gray-600" />
        <div>
          <div className="text-lg font-bold text-white">편집 모드 전용</div>
          <p className="text-gray-400 text-sm mt-1">경기 기록은 편집 모드에서만 가능합니다</p>
        </div>
        <button onClick={openPinModal} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer transition-colors">
          PIN 입력
        </button>
      </div>
    )
  }

  return <RecordInner leagueId={leagueId} leagueHeaders={leagueHeaders} />
}

// ── 내부 컴포넌트 ─────────────────────────────────────────────
function RecordInner({ leagueId, leagueHeaders }: { leagueId: string; leagueHeaders: Record<string, string> }) {
  const { setCurrentGame } = useGameStore()
  const { setLineup, resetLineup } = useLineupStore()

  const [scheduleDates, setScheduleDates] = useState<ScheduleDate[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<GameSlot[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [leagueYtChannel, setLeagueYtChannel] = useState<string | null>(null)
  const [plusOneAge, setPlusOneAge] = useState<number | null>(null)
  const [dateStats, setDateStats] = useState<Record<string, { total: number; yt: number }>>({})
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [loadingDates, setLoadingDates] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [initializingSlots, setInitializingSlots] = useState(false)
  const [ytSyncing, setYtSyncing] = useState(false)
  const [bulkSyncing, setBulkSyncing] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const [minutes, setMinutes] = useState<MinRow[]>([])
  const [statsRefresh, setStatsRefresh] = useState(0)
  const [mobileTab, setMobileTab] = useState<'record' | 'stats'>('record')

  // 분기별 홈/어웨이 선수 명단
  const [homeRoster, setHomeRoster] = useState<RosterPlayer[]>([])
  const [awayRoster, setAwayRoster] = useState<RosterPlayer[]>([])
  const [irregularRoster, setIrregularRoster] = useState<IrregularPlayer[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [pendingIrregular, setPendingIrregular] = useState<IrregularPlayer | null>(null)
  const [addingIrregular, setAddingIrregular] = useState(false)

  // 팀 선택 (슬랏별)
  const [pendingHome, setPendingHome] = useState('')
  const [pendingAway, setPendingAway] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)

  // 경기 진행
  const [gameStarted, setGameStarted] = useState(false)
  const [startingGame, setStartingGame] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [liveScore, setLiveScore] = useState<{ home: number; away: number } | null>(null)

  // 선발 체크: 선택된 선수 ID 셋 (홈+어웨이 통합)
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set())

  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null

  async function bulkSyncYoutube() {
    if (!leagueYtChannel) { toast.error('설정 탭에서 YouTube 채널을 먼저 지정하세요'); return }
    const targets = scheduleDates.filter(sd => {
      const stat = dateStats[sd.date]
      return !stat || stat.yt < stat.total || stat.total === 0
    })
    if (targets.length === 0) { toast.success('모든 날짜가 이미 연동 완료되어 있습니다'); return }
    setBulkSyncing(true)
    setBulkProgress({ done: 0, total: targets.length })
    let successCount = 0
    for (const sd of targets) {
      try {
        const res = await fetch(`/api/leagues/${leagueId}/youtube-sync`, {
          method: 'POST',
          headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelHandle: leagueYtChannel, date: sd.date }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.mapped > 0) successCount++
      } catch { /* 네트워크 오류 무시 후 계속 */ }
      setBulkProgress(p => ({ ...p, done: p.done + 1 }))
    }
    setBulkSyncing(false)
    fetch(`/api/leagues/${leagueId}/games`).then(r => r.json()).then(buildDateStats).catch(() => null)
    toast.success(`일괄 연동 완료: ${successCount}/${targets.length}개 날짜 처리됨`)
  }

  function buildDateStats(games: { date: string; youtube_url?: string | null }[]) {
    const stats: Record<string, { total: number; yt: number }> = {}
    for (const g of games) {
      if (!stats[g.date]) stats[g.date] = { total: 0, yt: 0 }
      stats[g.date].total++
      if (g.youtube_url) stats[g.date].yt++
    }
    setDateStats(stats)
  }

  // 초기 로드
  useEffect(() => {
    async function init() {
      setLoadingDates(true)
      const [dRes, tRes, pRes, lRes, gRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/schedule-dates`),
        fetch(`/api/leagues/${leagueId}/teams`),
        fetch(`/api/leagues/${leagueId}/players`),
        fetch(`/api/leagues/${leagueId}`),
        fetch(`/api/leagues/${leagueId}/games`),
      ])
      if (dRes.ok) setScheduleDates(await dRes.json())
      if (tRes.ok) setTeams(await tRes.json())
      if (pRes.ok) setAllPlayers(await pRes.json())
      if (lRes.ok) {
        const ld = await lRes.json()
        setLeagueYtChannel(ld.youtube_channel ?? null)
        setPlusOneAge(ld.plus_one_age ?? null)
      }
      if (gRes.ok) buildDateStats(await gRes.json())
      setLoadingDates(false)
    }
    init()
  }, [leagueId])

  async function loadRoster(slot: GameSlot) {
    if (!slot.home_team_id || !slot.away_team_id) return
    setRosterLoading(true)
    const rRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/roster`)
    if (rRes.ok) {
      const rd = await rRes.json()
      const home: RosterPlayer[] = rd.home ?? []
      const away: RosterPlayer[] = rd.away ?? []
      // team_id 배정된 선수 전원 포함 (비정규도 팀에 배정되면 선택 가능)
      setHomeRoster(home)
      setAwayRoster(away)
    }
    // 비정규 선수: quarter players에서 is_regular=false (team_id 없는 것 위주) 로드
    if (slot.quarter_id) {
      const qRes = await fetch(`/api/leagues/${leagueId}/quarters/${slot.quarter_id}/players`)
      if (qRes.ok) {
        const qd: IrregularPlayer[] = await qRes.json()
        setIrregularRoster(qd.filter(p => p.is_regular === false))
      } else {
        setIrregularRoster([])
      }
    } else {
      setIrregularRoster([])
    }
    setRosterLoading(false)
  }

  // 날짜 선택 → 슬랏 초기화 + 로드
  async function selectDate(date: string) {
    setSelectedDate(date)
    setSelectedSlotId('')
    resetLineup()
    setGameStarted(false)
    setSlots([])

    if (!date) return
    setInitializingSlots(true)
    const res = await fetch(`/api/leagues/${leagueId}/games`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ date }),
    })
    setInitializingSlots(false)
    if (res.ok) setSlots(await res.json())
    else toast.error('슬랏 생성 실패')
  }

  // 슬랏 선택
  async function selectSlot(slot: GameSlot) {
    setSelectedSlotId(slot.id)
    setPendingHome(slot.home_team_id ?? '')
    setPendingAway(slot.away_team_id ?? '')
    setGameStarted(slot.is_started ?? false)
    setCurrentGame({ id: slot.id } as never)
    resetLineup()
    setHomeRoster([])
    setAwayRoster([])
    setIrregularRoster([])
    setLiveScore(null)

    await loadRoster(slot)

    // 이미 시작된 경기면 현재 점수 로드
    if (slot.is_started) {
      const scoreRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (scoreRes.ok) setLiveScore(await scoreRes.json())
    }

    // 출전 기록 로드
    const res = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${slot.id}`)
    if (res.ok) setMinutes(await res.json())
  }

  async function saveTeams() {
    if (!pendingHome || !pendingAway) { toast.error('홈·어웨이 팀을 모두 선택하세요'); return }
    if (pendingHome === pendingAway) { toast.error('같은 팀을 선택할 수 없습니다'); return }
    setSavingTeam(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ home_team_id: pendingHome, away_team_id: pendingAway }),
    })
    setSavingTeam(false)
    if (res.ok) {
      toast.success('팀 저장 완료')
      await refreshSlots()
      const updated = slots.find(s => s.id === selectedSlotId)
      if (updated) await loadRoster({ ...updated, home_team_id: pendingHome, away_team_id: pendingAway })
    } else toast.error('팀 저장 실패')
  }

  async function syncYoutube() {
    if (!leagueYtChannel) { toast.error('설정 탭에서 YouTube 채널을 먼저 지정하세요'); return }
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setYtSyncing(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/youtube-sync`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelHandle: leagueYtChannel, date: selectedDate }),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (res.ok) {
        toast.success(`${data.mapped}개 경기 YouTube 연동 완료`)
        await refreshSlots()
        fetch(`/api/leagues/${leagueId}/games`).then(r => r.json()).then(buildDateStats).catch(() => null)
      } else {
        const msg = (data.error as string) ?? `YouTube 연동 실패 (${res.status})`
        toast.error(msg, { duration: 6000 })
      }
    } catch (e) {
      toast.error(`네트워크 오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setYtSyncing(false)
    }
  }

  async function refreshSlots() {
    if (!selectedDate) return
    setLoadingSlots(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?date=${selectedDate}`, { cache: 'no-store' })
    if (res.ok) {
      const updated: GameSlot[] = await res.json()
      setSlots(updated)
      if (selectedSlotId) {
        const s = updated.find(x => x.id === selectedSlotId)
        if (s) {
          setPendingHome(s.home_team_id ?? '')
          setPendingAway(s.away_team_id ?? '')
          setGameStarted(s.is_started ?? false)
        }
      }
    }
    setLoadingSlots(false)
  }

  // 선발 체크 모달 열기 (기본: 모두 해제)
  function openStarterPicker() {
    if (homeRoster.length === 0 && awayRoster.length === 0) {
      toast.error('출전 가능한 선수가 없습니다')
      return
    }
    setSelectedStarters(new Set())
    setShowStarterPicker(true)
  }

  function toggleStarter(pid: string) {
    setSelectedStarters(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function selectAllTeam(side: 'home' | 'away') {
    const ids = (side === 'home' ? homeRoster : awayRoster).map(p => p.id)
    setSelectedStarters(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => next.has(id))
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  // 선발 체크된 선수만 onCourt + minutes INSERT
  async function startGame() {
    if (!selectedSlotId) return
    const starterIds = Array.from(selectedStarters)
    if (starterIds.length === 0) {
      toast.error('선발 선수를 1명 이상 선택하세요')
      return
    }
    setStartingGame(true)
    await Promise.all(starterIds.map(pid =>
      fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: pid, quarter: 1, in_time: 0 }),
      })
    ))
    setLineup(starterIds)
    setGameStarted(true)
    setShowStarterPicker(false)
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_started: true }),
    })
    // minutes 재로드
    const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
    if (r.ok) setMinutes(await r.json())
    refreshSlots()
    setStartingGame(false)
  }

  async function completeGame() {
    if (!selectedSlotId) { toast.error('경기를 선택하세요'); return }
    setCompleting(true)
    try {
      const recomputeRes = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (recomputeRes.ok) {
        const scores = await recomputeRes.json()
        setLiveScore(scores)
      }
      const patchRes = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ is_complete: true }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error((err.error as string) ?? `완료 처리 실패 (${patchRes.status})`)
      }
      setShowComplete(false)
      toast.success('경기 완료 처리됨')
      refreshSlots()
    } catch (e) {
      toast.error(`마감 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setCompleting(false)
    }
  }

  // 마감 버튼 클릭 핸들러: 점수 미리 계산 후 모달 표시
  async function openCompleteModal() {
    setShowComplete(true)
    await fetchLiveScore()
  }

  async function fetchLiveScore() {
    if (!selectedSlotId) return
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/recompute`, {
      method: 'POST',
      headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) setLiveScore(await res.json())
  }

  function handleEventSaved() {
    setStatsRefresh(k => k + 1)
    if (selectedSlotId) {
      fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
        .then(r => r.json()).then(setMinutes)
    }
  }

  // 비정규 선수를 홈/어웨이 팀에 추가
  async function addIrregularToTeam(player: IrregularPlayer, side: 'home' | 'away') {
    if (!selectedSlot?.quarter_id) { toast.error('분기 정보가 없습니다'); return }
    const teamId = side === 'home' ? selectedSlot.home_team_id : selectedSlot.away_team_id
    if (!teamId) { toast.error('팀이 지정되지 않았습니다'); return }
    setAddingIrregular(true)
    // 분기 멤버십을 팀에 묶음 (여전히 is_regular=false 유지 — 일회성 추가)
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${selectedSlot.quarter_id}/players`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: player.id, team_id: teamId, is_regular: false }),
    })
    if (!res.ok) {
      setAddingIrregular(false)
      toast.error('비정규 선수 추가 실패')
      return
    }
    // 게임이 시작된 경우, minutes도 INSERT
    if (gameStarted) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: player.id, quarter: 1, in_time: 0 }),
      })
      const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
      if (r.ok) setMinutes(await r.json())
    }
    // roster 재로드
    if (selectedSlot) await loadRoster(selectedSlot)
    setPendingIrregular(null)
    setAddingIrregular(false)
    toast.success(`${player.name} → ${side === 'home' ? selectedSlot.home_team?.name ?? '홈' : selectedSlot.away_team?.name ?? '어웨이'} 추가됨`)
  }

  // 이미 홈/어웨이 명단에 들어있는지 체크
  const assignedIds = new Set([...homeRoster.map(p => p.id), ...awayRoster.map(p => p.id)])

  // ── 로딩 ─────────────────────────────────────────────────
  if (loadingDates) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
  }

  // ── 날짜 없음 ─────────────────────────────────────────────
  if (scheduleDates.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p>등록된 경기 일정이 없습니다</p>
        <p className="text-xs mt-1 text-gray-600">일정 탭에서 날짜를 먼저 추가하세요</p>
      </div>
    )
  }

  // ── 날짜 선택 화면 ─────────────────────────────────────────
  if (!selectedDate) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">경기 기록</h2>
            <p className="text-gray-400 text-sm">기록할 날짜를 선택하세요</p>
          </div>
          {leagueYtChannel && (
            <button
              onClick={bulkSyncYoutube}
              disabled={bulkSyncing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {bulkSyncing
                ? <><Loader2 size={12} className="animate-spin" />{bulkProgress.done}/{bulkProgress.total} 연동 중...</>
                : <><RefreshCw size={12} />전체 날짜 YouTube 연동</>}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {scheduleDates.map(sd => {
            const d = new Date(sd.date + 'T00:00:00')
            const days = ['일', '월', '화', '수', '목', '금', '토']
            const stat = dateStats[sd.date]
            const allLinked = stat && stat.total > 0 && stat.yt === stat.total
            return (
              <button
                key={sd.id}
                onClick={() => selectDate(sd.date)}
                className="w-full text-left bg-gray-900 border border-gray-800 hover:border-blue-500/50 rounded-xl px-5 py-4 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white font-medium">
                    {d.getFullYear()}년 {d.getMonth() + 1}월 {d.getDate()}일
                    <span className="text-gray-400 ml-2 text-sm">({days[d.getDay()]})</span>
                  </span>
                  {stat && stat.total > 0 && (
                    <span className={`flex items-center gap-1 text-xs font-mono shrink-0 ${allLinked ? 'text-red-400' : 'text-gray-500'}`}>
                      <Youtube size={11} className={allLinked ? 'text-red-400' : 'text-gray-600'} />
                      {allLinked ? `${stat.yt}/${stat.total} 연동 완료!` : `${stat.yt}/${stat.total}`}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── 슬랏 초기화 중 ────────────────────────────────────────
  if (initializingSlots) {
    return <div className="flex flex-col items-center gap-3 py-16 text-gray-400"><Loader2 size={24} className="animate-spin" /><span className="text-sm">경기 슬랏 생성 중...</span></div>
  }

  const dateLabel = (() => {
    const d = new Date(selectedDate + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  })()

  // ── 슬랏 그리드 + 기록 UI ─────────────────────────────────
  return (
    <div className="space-y-4">
      {/* 날짜 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => { setSelectedDate(''); setSelectedSlotId(''); setSlots([]) }}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-xl font-bold text-white">{dateLabel} 경기 기록</h2>
      </div>

      {/* YouTube 자동 연동 */}
      <div className="flex items-center justify-between bg-gray-900/60 border border-gray-800 rounded-xl px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Youtube size={14} className="text-red-400 shrink-0" />
          {leagueYtChannel
            ? <span className="font-mono text-red-300">{leagueYtChannel}</span>
            : <span className="text-gray-600">채널 미설정 — 설정 탭에서 지정</span>}
        </div>
        <button
          onClick={syncYoutube}
          disabled={ytSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
        >
          {ytSyncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          YouTube 자동 연동
        </button>
      </div>

      {/* 슬랏 그리드 — PC에서 크게 */}
      <div className="grid grid-cols-5 lg:grid-cols-9 gap-2">
        {slots.map(slot => {
          const isSelected = slot.id === selectedSlotId
          const hasTeams = slot.home_team_id && slot.away_team_id
          const hasYT = !!slot.youtube_url
          return (
            <button
              key={slot.id}
              onClick={() => selectSlot(slot)}
              className={`relative flex flex-col items-center justify-center py-4 rounded-xl border text-base font-bold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : slot.is_complete
                  ? 'bg-green-900/30 border-green-700/50 text-green-400'
                  : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="text-lg">{slot.slot_num}</span>
              <div className="flex items-center gap-0.5 mt-1">
                {hasYT && <Youtube size={10} className="text-red-400" />}
                {slot.is_complete
                  ? <CheckCircle2 size={10} className="text-green-400" />
                  : slot.is_started
                  ? <Circle size={10} className="text-yellow-400" />
                  : hasTeams
                  ? <Circle size={10} className="text-gray-500" />
                  : null}
              </div>
            </button>
          )
        })}
      </div>

      {/* 슬랏 미선택 */}
      {!selectedSlotId && (
        <div className="text-center py-8 text-gray-600 text-sm">
          위 슬랏을 선택하면 기록을 시작할 수 있습니다
        </div>
      )}

      {/* 선택된 슬랏 기록 UI */}
      {selectedSlot && (
        <div className="border-t border-gray-800 pt-4">
          {/* 팀 설정 (항상 상단 compact) */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 shrink-0">경기 {selectedSlot.slot_num}</span>
              <select
                value={pendingHome}
                onChange={e => setPendingHome(e.target.value)}
                disabled={gameStarted}
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-md px-2 py-1.5 text-xs cursor-pointer disabled:opacity-50"
              >
                <option value="">홈 팀 선택</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <span className="text-gray-500 font-bold text-xs shrink-0">vs</span>
              <select
                value={pendingAway}
                onChange={e => setPendingAway(e.target.value)}
                disabled={gameStarted}
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-md px-2 py-1.5 text-xs cursor-pointer disabled:opacity-50"
              >
                <option value="">어웨이 팀 선택</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {!gameStarted && (
                <Button onClick={saveTeams} disabled={savingTeam} size="sm" className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0 text-xs px-3">
                  {savingTeam ? <Loader2 size={11} className="animate-spin" /> : '저장'}
                </Button>
              )}
            </div>
          </div>

          {/* 팀이 지정된 경우: 비디오(좌) + 기록(우) 2열 레이아웃 */}
          {selectedSlot.home_team_id && selectedSlot.away_team_id ? (
            <>
            <div className="lg:grid lg:grid-cols-[5fr_3fr] lg:gap-3 lg:items-start space-y-4 lg:space-y-0">

              {/* ── 좌측: 비디오 + 경기 제어 (sticky) ── */}
              <div className="lg:sticky lg:top-[52px] space-y-2">
                {selectedSlot.youtube_url ? (
                  <div className="bg-black rounded-xl overflow-hidden">
                    <YouTubePlayer
                      key={selectedSlot.youtube_url ?? selectedSlot.id}
                      youtubeUrl={selectedSlot.youtube_url}
                      startOffset={selectedSlot.youtube_start_offset ?? 0}
                    />
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center h-40 text-gray-700 text-sm">
                    영상 미연동
                  </div>
                )}

                {/* 경기 시작/마감 */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  {!gameStarted ? (
                    <Button
                      onClick={openStarterPicker}
                      disabled={startingGame || rosterLoading || (homeRoster.length === 0 && awayRoster.length === 0)}
                      className="w-full bg-green-600 hover:bg-green-500 cursor-pointer"
                      size="sm"
                    >
                      {startingGame
                        ? <><Loader2 size={13} className="mr-1 animate-spin" />시작 중...</>
                        : <><Play size={13} className="mr-1" />경기 시작 (선발 선택)</>}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1 py-1.5 rounded-lg bg-green-900/30 border border-green-800/50 text-green-400 text-xs text-center font-medium">
                        경기 진행 중
                      </div>
                      <button
                        onClick={openCompleteModal}
                        className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold cursor-pointer transition-colors"
                      >
                        <Square size={11} />마감
                      </button>
                    </div>
                  )}
                </div>

                {/* 통계 (데스크탑 좌측 하단) */}
                <div className="hidden lg:block">
                  <LeagueStatsPanel
                    leagueId={leagueId}
                    gameId={selectedSlotId}
                    players={allPlayers}
                    refreshKey={statsRefresh}
                    homeTeamId={selectedSlot?.home_team_id ?? undefined}
                    awayTeamId={selectedSlot?.away_team_id ?? undefined}
                    homePlayers={homeRoster}
                    awayPlayers={awayRoster}
                    homeTeam={selectedSlot?.home_team ?? undefined}
                    awayTeam={selectedSlot?.away_team ?? undefined}
                  />
                </div>
              </div>

              {/* ── 우측: 기록 패널 ── */}
              <div className="space-y-3">
                {/* 모바일 탭 */}
                <div className="flex gap-1 lg:hidden">
                  {(['record', 'stats'] as const).map(tab => (
                    <button key={tab} onClick={() => setMobileTab(tab)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${mobileTab === tab ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}>
                      {tab === 'record' ? '기록' : '통계'}
                    </button>
                  ))}
                </div>

                <div className={mobileTab === 'record' ? '' : 'hidden lg:block'}>
                  {gameStarted ? (
                    <>
                      <LeagueEventInputPad
                        leagueId={leagueId}
                        gameId={selectedSlotId}
                        leagueHeaders={leagueHeaders}
                        homePlayers={homeRoster}
                        awayPlayers={awayRoster}
                        homeTeam={selectedSlot?.home_team ?? undefined}
                        awayTeam={selectedSlot?.away_team ?? undefined}
                        players={allPlayers}
                        plusOneAge={plusOneAge}
                        onEventSaved={() => { handleEventSaved(); fetchLiveScore() }}
                      />

                      {/* 비정규 선수 추가 */}
                      {irregularRoster.length > 0 && (
                        <div className="mt-3 bg-gray-900/60 border border-gray-800 rounded-xl p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <UserPlus size={12} className="text-gray-500" />
                            <p className="text-xs text-gray-400 font-medium">비정규 선수 추가</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {irregularRoster.map(p => {
                              const isAdded = assignedIds.has(p.id)
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => !isAdded && setPendingIrregular(p)}
                                  disabled={isAdded}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                                    isAdded
                                      ? 'bg-gray-800/40 border-gray-800 text-gray-600 cursor-not-allowed line-through'
                                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-blue-500 hover:text-blue-300 cursor-pointer'
                                  }`}
                                >
                                  {p.number ? `#${p.number} ` : ''}{p.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* 실시간 스코어보드 */}
                      <div className="mt-3 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="grid grid-cols-[1fr_auto_1fr]">
                          <div className="py-3 px-4 text-center">
                            <p className="text-[11px] font-bold mb-1 truncate" style={{ color: selectedSlot?.home_team?.color ?? '#3b82f6' }}>
                              {selectedSlot?.home_team?.name ?? '홈팀'}
                            </p>
                            <p className="text-4xl font-black text-white tabular-nums leading-none">{liveScore?.home ?? 0}</p>
                          </div>
                          <div className="flex flex-col items-center justify-center px-3 border-x border-gray-800">
                            <span className="text-[9px] text-green-400 font-bold tracking-widest">LIVE</span>
                            <span className="text-xl text-gray-500 font-black leading-none mt-0.5">:</span>
                          </div>
                          <div className="py-3 px-4 text-center">
                            <p className="text-[11px] font-bold mb-1 truncate" style={{ color: selectedSlot?.away_team?.color ?? '#ef4444' }}>
                              {selectedSlot?.away_team?.name ?? '어웨이팀'}
                            </p>
                            <p className="text-4xl font-black text-white tabular-nums leading-none">{liveScore?.away ?? 0}</p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <LeagueSubstitutionPanel
                          leagueId={leagueId}
                          gameId={selectedSlotId}
                          leagueHeaders={leagueHeaders}
                          players={allPlayers}
                          minutes={minutes}
                          onSubstitution={() => {
                            fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
                              .then(r => r.json()).then(setMinutes)
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12 text-gray-600 text-sm">
                      경기 시작 버튼을 눌러 기록을 시작하세요
                    </div>
                  )}
                </div>

                {/* 통계 (모바일) */}
                <div className={mobileTab === 'stats' ? 'lg:hidden' : 'hidden'}>
                  <LeagueStatsPanel
                    leagueId={leagueId}
                    gameId={selectedSlotId}
                    players={allPlayers}
                    refreshKey={statsRefresh}
                    homeTeamId={selectedSlot?.home_team_id ?? undefined}
                    awayTeamId={selectedSlot?.away_team_id ?? undefined}
                    homePlayers={homeRoster}
                    awayPlayers={awayRoster}
                    homeTeam={selectedSlot?.home_team ?? undefined}
                    awayTeam={selectedSlot?.away_team ?? undefined}
                  />
                </div>
              </div>
            </div>

            {/* 비정규 선수 팀 선택 미니 모달 */}
              {pendingIrregular && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-xs space-y-3">
                    <h3 className="text-white font-bold text-sm">
                      {pendingIrregular.name}을(를) 어느 팀에 추가할까요?
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => addIrregularToTeam(pendingIrregular, 'home')}
                        disabled={addingIrregular}
                        className="flex-1 py-2 rounded-lg text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-opacity"
                        style={{ backgroundColor: selectedSlot?.home_team?.color ?? '#3b82f6' }}
                      >
                        {selectedSlot?.home_team?.name ?? '홈팀'}
                      </button>
                      <button
                        onClick={() => addIrregularToTeam(pendingIrregular, 'away')}
                        disabled={addingIrregular}
                        className="flex-1 py-2 rounded-lg text-white text-xs font-bold cursor-pointer disabled:opacity-50 transition-opacity"
                        style={{ backgroundColor: selectedSlot?.away_team?.color ?? '#ef4444' }}
                      >
                        {selectedSlot?.away_team?.name ?? '어웨이팀'}
                      </button>
                    </div>
                    <button
                      onClick={() => setPendingIrregular(null)}
                      disabled={addingIrregular}
                      className="w-full py-1.5 rounded-lg bg-gray-800 text-gray-400 text-xs cursor-pointer hover:bg-gray-700"
                    >취소</button>
                  </div>
                </div>
              )}

              {/* 선발 체크 모달 */}
              {showStarterPicker && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-white font-bold">선발 선수 선택</h3>
                      <span className="text-xs text-gray-500">{selectedStarters.size}명 선택됨</span>
                    </div>
                    <p className="text-xs text-gray-400">출전할 선수를 체크하세요. 선택되지 않은 선수는 벤치에서 시작합니다.</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* 홈팀 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded"
                            style={{
                              color: selectedSlot?.home_team?.color ?? '#3b82f6',
                              backgroundColor: `${selectedSlot?.home_team?.color ?? '#3b82f6'}22`,
                            }}
                          >
                            {selectedSlot?.home_team?.name ?? '홈팀'} ({homeRoster.length}명)
                          </span>
                          <button
                            onClick={() => selectAllTeam('home')}
                            className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            전체 선택
                          </button>
                        </div>
                        <div className="space-y-1">
                          {homeRoster.map(p => {
                            const checked = selectedStarters.has(p.id)
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer border transition-colors ${
                                  checked
                                    ? 'bg-blue-900/30 border-blue-700/50 text-white'
                                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-800'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleStarter(p.id)}
                                  className="w-4 h-4 cursor-pointer accent-blue-500"
                                />
                                <span className="text-xs font-mono text-gray-500 w-7">
                                  {p.number ? `#${p.number}` : ''}
                                </span>
                                <span className="text-sm font-medium">{p.name}</span>
                              </label>
                            )
                          })}
                          {homeRoster.length === 0 && (
                            <p className="text-xs text-gray-600 px-2 py-3">홈팀 선수가 없습니다</p>
                          )}
                        </div>
                      </div>

                      {/* 어웨이팀 */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span
                            className="text-xs font-bold px-2 py-0.5 rounded"
                            style={{
                              color: selectedSlot?.away_team?.color ?? '#ef4444',
                              backgroundColor: `${selectedSlot?.away_team?.color ?? '#ef4444'}22`,
                            }}
                          >
                            {selectedSlot?.away_team?.name ?? '어웨이팀'} ({awayRoster.length}명)
                          </span>
                          <button
                            onClick={() => selectAllTeam('away')}
                            className="text-[11px] text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            전체 선택
                          </button>
                        </div>
                        <div className="space-y-1">
                          {awayRoster.map(p => {
                            const checked = selectedStarters.has(p.id)
                            return (
                              <label
                                key={p.id}
                                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer border transition-colors ${
                                  checked
                                    ? 'bg-blue-900/30 border-blue-700/50 text-white'
                                    : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-800'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleStarter(p.id)}
                                  className="w-4 h-4 cursor-pointer accent-blue-500"
                                />
                                <span className="text-xs font-mono text-gray-500 w-7">
                                  {p.number ? `#${p.number}` : ''}
                                </span>
                                <span className="text-sm font-medium">{p.name}</span>
                              </label>
                            )
                          })}
                          {awayRoster.length === 0 && (
                            <p className="text-xs text-gray-600 px-2 py-3">어웨이팀 선수가 없습니다</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-gray-800">
                      <Button
                        onClick={startGame}
                        disabled={startingGame || selectedStarters.size === 0}
                        className="flex-1 bg-green-600 hover:bg-green-500 cursor-pointer disabled:opacity-50"
                        size="sm"
                      >
                        {startingGame
                          ? <><Loader2 size={13} className="mr-1 animate-spin" />시작 중...</>
                          : <><Play size={13} className="mr-1" />경기 시작 ({selectedStarters.size}명)</>}
                      </Button>
                      <Button
                        onClick={() => setShowStarterPicker(false)}
                        disabled={startingGame}
                        variant="outline"
                        size="sm"
                        className="border-gray-700 text-gray-400 cursor-pointer"
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* 경기 종료 모달 */}
              {showComplete && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
                    <h3 className="text-white font-bold">경기 마감</h3>
                    <p className="text-xs text-gray-400">이벤트 기반 점수로 자동 계산됩니다.</p>
                    {liveScore && (
                      <div className="bg-gray-800 rounded-xl p-4 text-center">
                        <div className="flex items-center justify-center gap-4">
                          <div>
                            <p className="text-xs text-gray-500 mb-1" style={{ color: selectedSlot?.home_team?.color }}>
                              {selectedSlot?.home_team?.name ?? '홈'}
                            </p>
                            <p className="text-3xl font-black text-white">{liveScore.home}</p>
                          </div>
                          <span className="text-gray-600 font-bold text-lg">vs</span>
                          <div>
                            <p className="text-xs text-gray-500 mb-1" style={{ color: selectedSlot?.away_team?.color }}>
                              {selectedSlot?.away_team?.name ?? '어웨이'}
                            </p>
                            <p className="text-3xl font-black text-white">{liveScore.away}</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">이벤트 합산 기준</p>
                      </div>
                    )}
                    {!liveScore && (
                      <button
                        onClick={fetchLiveScore}
                        className="w-full py-2 rounded-lg bg-gray-800 text-gray-400 text-sm cursor-pointer hover:bg-gray-700"
                      >
                        현재 점수 확인
                      </button>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={completeGame}
                        disabled={completing}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 cursor-pointer disabled:opacity-50"
                        size="sm"
                      >
                        {completing ? <><Loader2 size={12} className="mr-1 animate-spin" />처리 중...</> : '완료 처리'}
                      </Button>
                      <Button
                        onClick={() => { setShowComplete(false); setLiveScore(null) }}
                        disabled={completing}
                        variant="outline"
                        size="sm"
                        className="border-gray-700 text-gray-400 cursor-pointer"
                      >취소</Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-600 text-sm">
              홈·어웨이 팀을 선택하고 저장하면 기록을 시작할 수 있습니다
            </div>
          )}
        </div>
      )}

      {loadingSlots && <div className="hidden" />}
    </div>
  )
}
