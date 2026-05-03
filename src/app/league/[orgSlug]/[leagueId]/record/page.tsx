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
  CheckCircle2, Circle, Youtube, RefreshCw, UserPlus, ClipboardList,
} from 'lucide-react'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LeagueEventInputPad from '@/components/league/LeagueEventInputPad'
import LeagueSubstitutionPanel from '@/components/league/LeagueSubstitutionPanel'
import LeagueStatsPanel from '@/components/league/LeagueStatsPanel'
import GameLogModal from '@/components/league/GameLogModal'
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
  const { setCurrentGame, ytPlayer } = useGameStore()
  const { setLineup, resetLineup, onCourt } = useLineupStore()

  // ── YouTube 원격 제어 ────────────────────────────────────────
  function seekRelative(delta: number) {
    if (!ytPlayer) return
    try { ytPlayer.seekTo((ytPlayer.getCurrentTime() ?? 0) + delta, true) } catch {}
  }
  function togglePlay() {
    if (!ytPlayer) return
    try {
      const state = ytPlayer.getPlayerState()
      if (state === 1 /* PLAYING */) ytPlayer.pauseVideo()
      else ytPlayer.playVideo()
    } catch {}
  }

  // 키보드 단축키: Space(재생/정지), ←/→(±5s), Shift+←/→(±10s)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (!ytPlayer) return
      if (e.code === 'Space')      { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); seekRelative(e.shiftKey ? -10 : -5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(e.shiftKey ? 10 : 5) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const [scheduleDates, setScheduleDates] = useState<ScheduleDate[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<GameSlot[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [leagueYtChannel, setLeagueYtChannel] = useState<string | null>(null)
  const [plusOneAge, setPlusOneAge] = useState<number | null>(null)
  const [dateStats, setDateStats] = useState<Record<string, { total: number; yt: number; complete: number; started: number }>>({})
  const [quarters, setQuarters] = useState<{ id: string; year: number; quarter: number }[]>([])
  const [selectedQFilter, setSelectedQFilter] = useState<'all' | string>('all')
  const [dateQuarterMap, setDateQuarterMap] = useState<Record<string, string>>({})
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [loadingDates, setLoadingDates] = useState(true)
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
  const [reopening, setReopening] = useState(false)
  const [liveScore, setLiveScore] = useState<{ home: number; away: number } | null>(null)
  const [showGameLog, setShowGameLog] = useState(false)
  const [showSubModal, setShowSubModal] = useState(false)
  const [showBoxscoreModal, setShowBoxscoreModal] = useState(false)

  // 선발 체크: 선택된 선수 ID 셋 (홈+어웨이 통합)
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set())

  // 플러스원 충돌 모달
  const [showPlusOneModal, setShowPlusOneModal] = useState(false)
  const [plusOneConflict, setPlusOneConflict] = useState<{ teamName: string; players: RosterPlayer[] } | null>(null)
  const [activePlusOneIds, setActivePlusOneIds] = useState<string[]>([])

  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null

  // 팀 로스터 로드 시 선발 전체 선택으로 자동 초기화
  useEffect(() => {
    if (!gameStarted && (homeRoster.length > 0 || awayRoster.length > 0)) {
      // 정규 선수만 자동 선택 — 비정규(is_regular=false)는 기본 미체크 (GP 오염 방지)
      const regularIds = [...homeRoster, ...awayRoster]
        .filter(p => p.is_regular !== false)
        .map(p => p.id)
      setSelectedStarters(new Set(regularIds))
    }
  }, [homeRoster, awayRoster]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function buildDateStats(games: { date: string; youtube_url?: string | null; is_complete?: boolean; is_started?: boolean }[]) {
    const stats: Record<string, { total: number; yt: number; complete: number; started: number }> = {}
    for (const g of games) {
      if (!stats[g.date]) stats[g.date] = { total: 0, yt: 0, complete: 0, started: 0 }
      stats[g.date].total++
      if (g.youtube_url) stats[g.date].yt++
      if (g.is_complete) stats[g.date].complete++
      else if (g.is_started) stats[g.date].started++
    }
    setDateStats(stats)
  }

  // 초기 로드
  useEffect(() => {
    async function init() {
      setLoadingDates(true)
      const [dRes, tRes, pRes, lRes, gRes, qRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/schedule-dates`),
        fetch(`/api/leagues/${leagueId}/teams`),
        fetch(`/api/leagues/${leagueId}/players`),
        fetch(`/api/leagues/${leagueId}`),
        fetch(`/api/leagues/${leagueId}/games`),
        fetch(`/api/leagues/${leagueId}/quarters`),
      ])
      if (dRes.ok) setScheduleDates(await dRes.json())
      if (tRes.ok) setTeams(await tRes.json())
      if (pRes.ok) setAllPlayers(await pRes.json())
      if (lRes.ok) {
        const ld = await lRes.json()
        setLeagueYtChannel(ld.youtube_channel ?? null)
        setPlusOneAge(ld.plus_one_age ?? null)
      }
      if (qRes.ok) setQuarters(await qRes.json())
      if (gRes.ok) {
        const games = await gRes.json()
        buildDateStats(games)
        // 날짜 → 분기 맵 (게임 기준)
        const dqMap: Record<string, string> = {}
        for (const g of games) {
          if (g.date && g.quarter_id && !dqMap[g.date]) dqMap[g.date] = g.quarter_id
        }
        setDateQuarterMap(dqMap)
      }
      setLoadingDates(false)
    }
    init()
  }, [leagueId])

  async function loadRoster(slot: GameSlot) {
    if (!slot.home_team_id || !slot.away_team_id) return
    setRosterLoading(true)
    let assignedIrregularIds: string[] = []
    const rRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/roster`)
    if (rRes.ok) {
      const rd = await rRes.json()
      const home: RosterPlayer[] = rd.home ?? []
      const away: RosterPlayer[] = rd.away ?? []
      setHomeRoster(home)
      setAwayRoster(away)
      assignedIrregularIds = rd.assigned_irregular_ids ?? []

      // 이미 시작된 경기 로드 시: plus_one 충돌 있으면 자동 팝업
      if (slot.is_started) {
        const homePO = home.filter(p => p.plus_one)
        const awayPO = away.filter(p => p.plus_one)
        const conflict = homePO.length >= 2
          ? { teamName: slot.home_team?.name ?? '홈팀', players: homePO }
          : awayPO.length >= 2
          ? { teamName: slot.away_team?.name ?? '어웨이팀', players: awayPO }
          : null
        if (conflict) {
          setPlusOneConflict(conflict)
          setShowPlusOneModal(true)
        }
      }
    }
    // 비정규 선수 picker: 분기 내 비정규 선수 중 이 경기에 아직 배정 안 된 선수
    if (slot.quarter_id) {
      const qRes = await fetch(`/api/leagues/${leagueId}/quarters/${slot.quarter_id}/players`)
      if (qRes.ok) {
        const qd: IrregularPlayer[] = await qRes.json()
        const assignedSet = new Set(assignedIrregularIds)
        // is_regular=false(명시적 비정규) + null(분기 미배정)은 모두 비정규 후보
        setIrregularRoster(qd.filter(p => p.is_regular !== true && !assignedSet.has(p.id)))
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
    // DB에 저장된 값으로 즉시 초기화 (navigation 복귀 시 0:0 방지)
    if (slot.is_started) {
      setLiveScore({ home: slot.home_score ?? 0, away: slot.away_score ?? 0 })
    } else {
      setLiveScore(null)
    }

    await loadRoster(slot)

    // 이미 시작된 경기면 이벤트 기반 재계산으로 갱신
    if (slot.is_started) {
      const scoreRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (scoreRes.ok) {
        const scores = await scoreRes.json()
        setLiveScore({ home: scores.home_score ?? scores.home ?? 0, away: scores.away_score ?? scores.away ?? 0 })
      }
    }

    // 출전 기록 로드 + 코트 상태 복원 (out_time=null인 선수가 현재 코트)
    const res = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${slot.id}`)
    if (res.ok) {
      const mins: MinRow[] = await res.json()
      setMinutes(mins)
      if (slot.is_started) {
        const courtIds = mins.filter(m => m.out_time === null).map(m => m.league_player_id)
        setLineup(courtIds)
      }
    }
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

  // 선발 체크된 선수만 onCourt + minutes INSERT (실제 로직)
  async function doStartGame(starterIds: string[]) {
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

  // 플러스원 충돌 체크 후 경기 시작
  async function startGame() {
    if (!selectedSlotId) return
    const starterIds = Array.from(selectedStarters)
    if (starterIds.length === 0) { toast.error('선발 선수를 1명 이상 선택하세요'); return }
    const homeStarters = starterIds.filter(id => homeRoster.some(p => p.id === id))
    const awayStarters = starterIds.filter(id => awayRoster.some(p => p.id === id))
    if (homeStarters.length > 5 || awayStarters.length > 5) {
      toast.error(`팀당 선발은 최대 5명입니다 (홈 ${homeStarters.length}명 / 어웨이 ${awayStarters.length}명)`)
      return
    }

    // 플러스원 충돌 체크: 같은 팀 스타터 중 plus_one=true가 2명 이상
    function checkPlusOneConflict(teamStarters: string[], roster: RosterPlayer[], teamName: string) {
      const plusOnePlayers = teamStarters
        .map(id => roster.find(p => p.id === id))
        .filter((p): p is RosterPlayer => !!(p?.plus_one))
      if (plusOnePlayers.length >= 2) return { teamName, players: plusOnePlayers }
      return null
    }
    const homeConflict = checkPlusOneConflict(homeStarters, homeRoster, selectedSlot?.home_team?.name ?? '홈팀')
    const awayConflict = checkPlusOneConflict(awayStarters, awayRoster, selectedSlot?.away_team?.name ?? '어웨이팀')
    const conflict = homeConflict || awayConflict
    if (conflict) {
      setPlusOneConflict(conflict)
      setShowPlusOneModal(true)
      return
    }

    // 플러스원 충돌 없으면 기존 plus_one 플래그 사용
    const allPlusOneIds = [...homeRoster, ...awayRoster]
      .filter(p => selectedStarters.has(p.id) && p.plus_one)
      .map(p => p.id)
    setActivePlusOneIds(allPlusOneIds)
    await doStartGame(starterIds)
  }

  // 플러스원 충돌 모달에서 선택 처리
  async function handlePlusOneSelect(selectedId: string) {
    setShowPlusOneModal(false)
    const conflictTeam = plusOneConflict
    setPlusOneConflict(null)

    // 이미 시작된 경기면 전체 로스터 기준, 아니면 선발 기준
    const base = gameStarted
      ? [...homeRoster, ...awayRoster].filter(p => p.plus_one).map(p => p.id)
      : [...homeRoster, ...awayRoster].filter(p => selectedStarters.has(p.id) && p.plus_one).map(p => p.id)

    // 충돌 팀은 선택된 선수만, 나머지 팀은 전부
    const finalPlusOneIds = base.filter(id => {
      if (conflictTeam?.players.some(p => p.id === id)) return id === selectedId
      return true
    })
    setActivePlusOneIds(finalPlusOneIds)

    // DB에 plus_one_player_id 저장
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ plus_one_player_id: selectedId }),
    })

    // 이미 시작된 경기라면 doStartGame 호출 안 함 (라인업 중복 방지)
    if (!gameStarted) {
      const starterIds = Array.from(selectedStarters)
      await doStartGame(starterIds)
    }
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

  // 마감된 경기를 다시 기록 모드로 복귀 (이벤트 유지, is_complete만 해제)
  async function reopenGame() {
    if (!selectedSlotId) return
    setReopening(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_complete: false }),
    })
    setReopening(false)
    if (!res.ok) { toast.error('전환 실패'); return }
    toast.success('기록 모드로 복귀했습니다. 기존 이벤트는 유지됩니다.')
    await refreshSlots()
    // 코트 상태 복원 (다시 기록하기 후에도 선수 표시 유지)
    const mRes = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
    if (mRes.ok) {
      const mins: MinRow[] = await mRes.json()
      setMinutes(mins)
      const courtIds = mins.filter(m => m.out_time === null).map(m => m.league_player_id)
      setLineup(courtIds)
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
    if (res.ok) {
      const data = await res.json()
      setLiveScore({ home: data.home_score ?? data.home ?? 0, away: data.away_score ?? data.away ?? 0 })
    }
  }

  function handleEventSaved() {
    setStatsRefresh(k => k + 1)
    if (selectedSlotId) {
      fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
        .then(r => r.json()).then(setMinutes)
    }
  }

  // 비정규 선수를 홈/어웨이 팀에 추가 (해당 날짜 경기에만 유효)
  async function addIrregularToTeam(player: IrregularPlayer, side: 'home' | 'away') {
    if (!selectedSlotId) { toast.error('경기를 선택하세요'); return }
    const teamId = side === 'home' ? selectedSlot?.home_team_id : selectedSlot?.away_team_id
    if (!teamId) { toast.error('팀이 지정되지 않았습니다'); return }
    setAddingIrregular(true)
    // 경기별 배정 (league_game_players) — 같은 날짜 같은 팀 경기에도 자동 배정
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/irregular-players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: player.id, team_id: teamId }),
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
    toast.success(`${player.name} → ${side === 'home' ? selectedSlot?.home_team?.name ?? '홈' : selectedSlot?.away_team?.name ?? '어웨이'} 추가됨`)
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
    // 전체 요약 집계
    const totalGames    = Object.values(dateStats).reduce((s, d) => s + d.total,    0)
    const totalComplete = Object.values(dateStats).reduce((s, d) => s + d.complete, 0)
    const totalStarted  = Object.values(dateStats).reduce((s, d) => s + d.started,  0)
    const totalPending  = totalGames - totalComplete - totalStarted

    // 필터 + 역순 정렬
    const filteredDates = [...scheduleDates]
      .filter(sd => selectedQFilter === 'all' || dateQuarterMap[sd.date] === selectedQFilter)
      .sort((a, b) => b.date.localeCompare(a.date))

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
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

        {/* 전체 경기 완료 현황 요약 */}
        {totalGames > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-3 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-green-400" />
              <span className="text-xs text-gray-400">완료</span>
              <span className="text-sm font-black text-green-400 ml-1">{totalComplete}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Play size={13} className="text-amber-400" />
              <span className="text-xs text-gray-400">기록 중</span>
              <span className="text-sm font-black text-amber-400 ml-1">{totalStarted}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Circle size={13} className="text-gray-600" />
              <span className="text-xs text-gray-400">미시작</span>
              <span className="text-sm font-black text-gray-400 ml-1">{totalPending}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-600">전체 {totalGames}경기</span>
              <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${totalGames > 0 ? (totalComplete / totalGames * 100) : 0}%` }} />
              </div>
              <span className="text-xs font-bold text-green-400">{totalGames > 0 ? Math.round(totalComplete / totalGames * 100) : 0}%</span>
            </div>
          </div>
        )}

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

        <div className="space-y-2">
          {filteredDates.map(sd => {
            const d = new Date(sd.date + 'T00:00:00')
            const days = ['일', '월', '화', '수', '목', '금', '토']
            const stat = dateStats[sd.date]
            const allLinked = stat && stat.total > 0 && stat.yt === stat.total
            const allDone   = stat && stat.total > 0 && stat.complete === stat.total
            return (
              <button
                key={sd.id}
                onClick={() => selectDate(sd.date)}
                className={`w-full text-left bg-gray-900 border rounded-xl px-5 py-4 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 cursor-pointer ${allDone ? 'border-green-800/50 hover:border-green-600/60' : 'border-gray-800 hover:border-blue-500/50'}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-white font-semibold text-base">
                    {d.getFullYear()}년 {d.getMonth() + 1}월 {d.getDate()}일
                    <span className="text-gray-400 ml-2 text-base">({days[d.getDay()]})</span>
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    {/* 완료 현황 */}
                    {stat && stat.total > 0 && (
                      <span className={`flex items-center gap-1 text-xs font-bold ${allDone ? 'text-green-400' : stat.complete > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                        <CheckCircle2 size={11} />
                        {stat.complete}/{stat.total}
                        {stat.started > 0 && !allDone && (
                          <span className="text-amber-500 ml-1">({stat.started}진행)</span>
                        )}
                      </span>
                    )}
                    {/* YouTube 연동 */}
                    {stat && stat.total > 0 && stat.yt > 0 && (
                      <span className={`flex items-center gap-1 text-xs font-mono ${allLinked ? 'text-red-400' : 'text-gray-500'}`}>
                        <Youtube size={11} />
                        {stat.yt}/{stat.total}
                      </span>
                    )}
                  </div>
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
      {/* 날짜 헤더 + YouTube 연동 (1행) */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { setSelectedDate(''); setSelectedSlotId(''); setSlots([]) }}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-base font-bold text-white">{dateLabel} 경기 기록</h2>
        {/* YouTube sync — compact, moved inline */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {leagueYtChannel && (
            <span className="text-xs font-mono text-red-300/70 hidden sm:inline">{leagueYtChannel}</span>
          )}
          <button
            onClick={syncYoutube}
            disabled={ytSyncing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {ytSyncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            <span className="hidden sm:inline">YouTube 연동</span>
          </button>
        </div>
      </div>

      {/* 슬랏 그리드 — PC에서 크게 */}
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {slots.map(slot => {
          const isSelected = slot.id === selectedSlotId
          const hasTeams = slot.home_team_id && slot.away_team_id
          const hasYT = !!slot.youtube_url
          return (
            <button
              key={slot.id}
              onClick={() => selectSlot(slot)}
              className={`relative flex flex-col items-center justify-center py-2.5 rounded-xl border text-base font-bold transition-all duration-200 cursor-pointer hover:-translate-y-0.5 ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : slot.is_complete
                  ? 'bg-green-900/30 border-green-700/50 text-green-400'
                  : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="text-base">{slot.slot_num}</span>
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

          {/* 영상 먼저 — 팀 미지정이어도 슬롯 선택 시 즉시 표시 */}
          {selectedSlot.youtube_url && !selectedSlot.home_team_id && (
            <div className="mb-4 rounded-xl overflow-hidden bg-black">
              <YouTubePlayer
                key={selectedSlot.youtube_url + '-pre'}
                youtubeUrl={selectedSlot.youtube_url}
                startOffset={selectedSlot.youtube_start_offset ?? 0}
              />
            </div>
          )}

          {/* 팀이 지정된 경우: 비디오(좌) + 기록(우) 2열 레이아웃 */}
          {selectedSlot.home_team_id && selectedSlot.away_team_id ? (
            <>
            <div className="lg:grid lg:grid-cols-[5fr_3fr] lg:gap-3 space-y-4 lg:space-y-0">

              {/* ── 좌측: 비디오 + 경기 제어 (sticky, 뷰포트 높이 고정) ── */}
              <div className="lg:sticky lg:top-[52px] space-y-2">
                {selectedSlot.youtube_url ? (
                  <div className="relative bg-black rounded-xl overflow-hidden">
                    <YouTubePlayer
                      key={selectedSlot.youtube_url ?? selectedSlot.id}
                      youtubeUrl={selectedSlot.youtube_url}
                      startOffset={selectedSlot.youtube_start_offset ?? 0}
                    />
                    {/* 트랜스포트 컨트롤 오버레이 — 영상 좌하단 */}
                    {ytPlayer && (
                      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-black/75 backdrop-blur-sm rounded-xl px-2 py-1.5">
                        {[
                          { label: '−10', delta: -10 },
                          { label: '−5',  delta: -5  },
                        ].map(({ label, delta }) => (
                          <button key={label} onClick={() => seekRelative(delta)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold text-gray-300 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                            {label}
                          </button>
                        ))}
                        <button onClick={togglePlay}
                          className="px-2.5 py-1 rounded-lg text-sm font-black text-white hover:bg-white/20 cursor-pointer transition-colors mx-0.5">
                          ⏯
                        </button>
                        {[
                          { label: '+5',  delta: 5  },
                          { label: '+10', delta: 10 },
                        ].map(({ label, delta }) => (
                          <button key={label} onClick={() => seekRelative(delta)}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold text-gray-300 hover:text-white hover:bg-white/15 cursor-pointer transition-colors">
                            {label}
                          </button>
                        ))}
                        <span className="text-[9px] text-gray-600 ml-1 hidden lg:inline">Space·←·→</span>
                      </div>
                    )}
                    {/* 스코어보드 오버레이 — 영상 우하단 */}
                    {gameStarted && (
                      <div className="absolute bottom-10 right-3 z-10 pointer-events-none">
                        <div className="flex items-stretch gap-px rounded-xl overflow-hidden shadow-2xl bg-black/80 backdrop-blur-sm border border-white/10 text-white">
                          {/* 홈팀 */}
                          <div className="flex flex-col items-center px-3 py-1.5 min-w-[64px]">
                            <span className="text-[10px] font-bold truncate max-w-[60px]"
                              style={{ color: selectedSlot.home_team?.color ?? '#3b82f6' }}>
                              {selectedSlot.home_team?.name ?? 'HOME'}
                            </span>
                            <span className="text-3xl font-black tabular-nums leading-none mt-0.5">
                              {liveScore?.home ?? selectedSlot.home_score ?? 0}
                            </span>
                          </div>
                          {/* 구분선 + LIVE */}
                          <div className="flex flex-col items-center justify-center px-2 border-x border-white/10">
                            <span className="text-[8px] text-green-400 font-black tracking-widest">LIVE</span>
                            <span className="text-lg font-black text-gray-500 leading-none">:</span>
                          </div>
                          {/* 어웨이팀 */}
                          <div className="flex flex-col items-center px-3 py-1.5 min-w-[64px]">
                            <span className="text-[10px] font-bold truncate max-w-[60px]"
                              style={{ color: selectedSlot.away_team?.color ?? '#ef4444' }}>
                              {selectedSlot.away_team?.name ?? 'AWAY'}
                            </span>
                            <span className="text-3xl font-black tabular-nums leading-none mt-0.5">
                              {liveScore?.away ?? selectedSlot.away_score ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center h-40 text-gray-500 text-sm">
                    영상 미연동
                  </div>
                )}

                {/* 경기 시작/마감 */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                  {selectedSlot?.is_complete ? (
                    <div className="flex items-center justify-center gap-2 py-1.5 rounded-lg bg-gray-800/60 border border-gray-700/50 text-gray-500 text-xs font-medium">
                      <CheckCircle2 size={13} className="text-gray-600" />경기 마감 완료
                    </div>
                  ) : !gameStarted ? (
                    <div className="flex items-center justify-center gap-2 py-1.5 rounded-lg bg-gray-800/40 border border-gray-700/40 text-gray-600 text-xs">
                      <Play size={12} />우측에서 선발 선수 선택 후 시작
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1 py-1.5 rounded-lg bg-green-900/30 border border-green-800/50 text-green-400 text-xs text-center font-medium">
                        경기 진행 중
                      </div>
                      <button
                        onClick={openCompleteModal}
                        className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-bold cursor-pointer transition-colors btn-press"
                      >
                        <Square size={11} />마감
                      </button>
                    </div>
                  )}
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
                  {selectedSlot?.is_complete ? (
                    /* ── 마감된 경기 배너 ── */
                    <div className="space-y-3">
                      <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
                        {/* 최종 스코어 */}
                        <div className="grid grid-cols-[1fr_auto_1fr]">
                          <div className="py-5 px-4 text-center">
                            <p className="text-[11px] font-bold mb-2 truncate" style={{ color: selectedSlot.home_team?.color ?? '#3b82f6' }}>
                              {selectedSlot.home_team?.name ?? '홈팀'}
                            </p>
                            <p className="text-5xl font-black text-white tabular-nums leading-none">{liveScore?.home ?? selectedSlot.home_score}</p>
                          </div>
                          <div className="flex flex-col items-center justify-center px-4 border-x border-gray-800">
                            <span className="text-2xl text-gray-600 font-black leading-none">:</span>
                          </div>
                          <div className="py-5 px-4 text-center">
                            <p className="text-[11px] font-bold mb-2 truncate" style={{ color: selectedSlot.away_team?.color ?? '#ef4444' }}>
                              {selectedSlot.away_team?.name ?? '어웨이팀'}
                            </p>
                            <p className="text-5xl font-black text-white tabular-nums leading-none">{liveScore?.away ?? selectedSlot.away_score}</p>
                          </div>
                        </div>
                        {/* 마감 배너 */}
                        <div className="border-t border-gray-800 py-4 px-6 flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={18} className="text-gray-500" />
                            <span className="text-lg font-black text-gray-400 tracking-tight">마감된 경기입니다</span>
                          </div>
                          <p className="text-[11px] text-gray-500">이벤트 로그에서 수정·삭제, 또는 아래에서 기록 모드로 복귀할 수 있습니다</p>
                        </div>
                        {/* 하단 버튼 행 */}
                        <div className="grid grid-cols-2 border-t border-gray-800/60">
                          <button
                            onClick={() => setShowGameLog(true)}
                            className="py-2.5 flex items-center justify-center gap-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-900/60 text-[11px] font-medium transition-colors cursor-pointer border-r border-gray-800/60"
                          >
                            <ClipboardList size={12} />
                            이벤트 로그
                          </button>
                          <button
                            onClick={reopenGame}
                            disabled={reopening}
                            className="py-2.5 flex items-center justify-center gap-1.5 text-blue-500 hover:text-blue-400 hover:bg-blue-900/20 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50 btn-press"
                          >
                            {reopening
                              ? <><Loader2 size={12} className="animate-spin" />복귀 중...</>
                              : <><RefreshCw size={12} />다시 기록하기</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : gameStarted ? (
                    <>
                      {/* 컴팩트 스코어 스트립 */}
                      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="flex items-stretch">
                          <div className="flex-1 py-2 px-3 flex items-center gap-2">
                            <span className="text-[10px] font-bold truncate" style={{ color: selectedSlot?.home_team?.color ?? '#3b82f6' }}>
                              {selectedSlot?.home_team?.name ?? '홈팀'}
                            </span>
                            <span className="text-2xl font-black text-white tabular-nums leading-none ml-auto">
                              {liveScore?.home ?? selectedSlot?.home_score ?? 0}
                            </span>
                          </div>
                          <div className="flex flex-col items-center justify-center px-2 border-x border-gray-800 shrink-0">
                            <span className="text-[7px] text-green-400 font-bold tracking-widest">LIVE</span>
                            <span className="text-sm text-gray-500 font-black leading-none">:</span>
                          </div>
                          <div className="flex-1 py-2 px-3 flex items-center gap-2">
                            <span className="text-2xl font-black text-white tabular-nums leading-none mr-auto">
                              {liveScore?.away ?? selectedSlot?.away_score ?? 0}
                            </span>
                            <span className="text-[10px] font-bold truncate" style={{ color: selectedSlot?.away_team?.color ?? '#ef4444' }}>
                              {selectedSlot?.away_team?.name ?? '어웨이팀'}
                            </span>
                          </div>
                          <button
                            onClick={() => setShowGameLog(true)}
                            className="border-l border-gray-800 px-3 flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                          >
                            <ClipboardList size={11} />
                            <span className="hidden sm:inline">로그</span>
                          </button>
                          {/* 플러스원 선수 재설정 버튼 — plus_one 선수가 있을 때만 표시 */}
                          {[...homeRoster, ...awayRoster].some(p => p.plus_one) && (
                            <button
                              onClick={() => {
                                const homePO = homeRoster.filter(p => p.plus_one)
                                const awayPO = awayRoster.filter(p => p.plus_one)
                                const conflict = homePO.length >= 2
                                  ? { teamName: selectedSlot?.home_team?.name ?? '홈팀', players: homePO }
                                  : awayPO.length >= 2
                                  ? { teamName: selectedSlot?.away_team?.name ?? '어웨이팀', players: awayPO }
                                  : { teamName: '플러스원', players: [...homePO, ...awayPO] }
                                setPlusOneConflict(conflict)
                                setShowPlusOneModal(true)
                              }}
                              className="border-l border-gray-800 px-2.5 flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                              title="플러스원 선수 설정"
                            >
                              <span className="text-xs">⚡</span>
                              <span className="hidden sm:inline">+1</span>
                            </button>
                          )}
                          <button
                            onClick={() => setShowSubModal(true)}
                            className="border-l border-gray-800 px-2.5 flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                          >
                            <RefreshCw size={11} />
                            <span className="hidden sm:inline">교체</span>
                          </button>
                          <button
                            onClick={() => setShowBoxscoreModal(true)}
                            className="border-l border-gray-800 px-2.5 flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                          >
                            <ClipboardList size={11} />
                            <span className="hidden sm:inline">스탯</span>
                          </button>
                        </div>
                      </div>

                      <LeagueEventInputPad
                        leagueId={leagueId}
                        gameId={selectedSlotId}
                        leagueHeaders={leagueHeaders}
                        homePlayers={homeRoster.filter(p => onCourt.includes(p.id))}
                        awayPlayers={awayRoster.filter(p => onCourt.includes(p.id))}
                        homeTeam={selectedSlot?.home_team ?? undefined}
                        awayTeam={selectedSlot?.away_team ?? undefined}
                        onEventSaved={() => { handleEventSaved(); fetchLiveScore() }}
                        activePlusOneIds={activePlusOneIds.length > 0 ? activePlusOneIds : undefined}
                      />

                      {/* 비정규 선수 추가 */}
                      {irregularRoster.length > 0 && (
                        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
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
                    </>
                  ) : (
                    /* 인라인 선발 선수 선택 — 영상 보면서 선택 가능 */
                    <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 space-y-3">
                      {(() => {
                        const hc = homeRoster.filter(p => selectedStarters.has(p.id)).length
                        const ac = awayRoster.filter(p => selectedStarters.has(p.id)).length
                        return (
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-white">선발 선수 선택</h4>
                            <div className="flex items-center gap-2 text-xs">
                              <span className={hc > 5 ? 'font-bold text-red-400' : 'text-gray-500'}>
                                홈 {hc}/5{hc > 5 && ' ⚠'}
                              </span>
                              <span className={ac > 5 ? 'font-bold text-red-400' : 'text-gray-500'}>
                                어웨이 {ac}/5{ac > 5 && ' ⚠'}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                      <p className="text-xs text-gray-500">영상을 보면서 출전 선수를 확인하세요. 미선택 선수는 벤치 시작입니다.</p>

                      <div className="grid grid-cols-2 gap-3">
                        {/* 홈팀 */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded"
                              style={{ color: selectedSlot?.home_team?.color ?? '#3b82f6', backgroundColor: `${selectedSlot?.home_team?.color ?? '#3b82f6'}22` }}>
                              {selectedSlot?.home_team?.name ?? '홈팀'}
                            </span>
                            <button onClick={() => selectAllTeam('home')} className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">전체</button>
                          </div>
                          <div className="space-y-1">
                            {homeRoster.map(p => {
                              const checked = selectedStarters.has(p.id)
                              const isIrregular = p.is_regular === false
                              return (
                                <label key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border text-xs transition-colors ${
                                  checked ? 'bg-blue-900/30 border-blue-700/50 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                }`}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleStarter(p.id)} className="w-3.5 h-3.5 cursor-pointer accent-blue-500" />
                                  {p.number && <span className="font-mono text-gray-600 w-6">#{p.number}</span>}
                                  <span className="font-medium">{p.name}</span>
                                  {isIrregular && <span className="ml-auto text-[9px] font-bold text-amber-500 border border-amber-700/50 rounded px-1">비정규</span>}
                                </label>
                              )
                            })}
                            {homeRoster.length === 0 && <p className="text-xs text-gray-600 px-2 py-2">선수 없음</p>}
                          </div>
                        </div>

                        {/* 어웨이팀 */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-bold px-2 py-0.5 rounded"
                              style={{ color: selectedSlot?.away_team?.color ?? '#ef4444', backgroundColor: `${selectedSlot?.away_team?.color ?? '#ef4444'}22` }}>
                              {selectedSlot?.away_team?.name ?? '어웨이팀'}
                            </span>
                            <button onClick={() => selectAllTeam('away')} className="text-[10px] text-blue-400 hover:text-blue-300 cursor-pointer">전체</button>
                          </div>
                          <div className="space-y-1">
                            {awayRoster.map(p => {
                              const checked = selectedStarters.has(p.id)
                              const isIrregular = p.is_regular === false
                              return (
                                <label key={p.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer border text-xs transition-colors ${
                                  checked ? 'bg-red-900/30 border-red-700/50 text-white' : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-800'
                                }`}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleStarter(p.id)} className="w-3.5 h-3.5 cursor-pointer accent-red-500" />
                                  {p.number && <span className="font-mono text-gray-600 w-6">#{p.number}</span>}
                                  <span className="font-medium">{p.name}</span>
                                  {isIrregular && <span className="ml-auto text-[9px] font-bold text-amber-500 border border-amber-700/50 rounded px-1">비정규</span>}
                                </label>
                              )
                            })}
                            {awayRoster.length === 0 && <p className="text-xs text-gray-600 px-2 py-2">선수 없음</p>}
                          </div>
                        </div>
                      </div>

                      {/* 비정규 선수 등록 — 경기 시작 전 */}
                      {irregularRoster.length > 0 && (
                        <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-3 space-y-2">
                          <div className="flex items-center gap-1.5">
                            <UserPlus size={12} className="text-amber-400 shrink-0" />
                            <p className="text-xs font-bold text-amber-400">비정규 선수 등록</p>
                            <span className="text-[10px] text-gray-600">팀 배정 후 선발 체크 가능</span>
                          </div>
                          {/* 선수 선택 전: 칩 목록 */}
                          {!pendingIrregular ? (
                            <div className="flex flex-wrap gap-1.5">
                              {irregularRoster.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => setPendingIrregular(p)}
                                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-gray-800 border border-amber-700/40 text-amber-300 hover:border-amber-500 hover:bg-amber-900/20 cursor-pointer transition-colors"
                                >
                                  {p.number ? `#${p.number} ` : ''}{p.name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            /* 팀 배정 선택 */
                            <div className="space-y-2">
                              <p className="text-xs text-white font-semibold">{pendingIrregular.name} → 어느 팀?</p>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  onClick={() => addIrregularToTeam(pendingIrregular, 'home')}
                                  disabled={addingIrregular}
                                  className="py-2 rounded-lg text-xs font-bold border cursor-pointer transition-colors disabled:opacity-50"
                                  style={{ color: selectedSlot?.home_team?.color ?? '#3b82f6', borderColor: `${selectedSlot?.home_team?.color ?? '#3b82f6'}60`, backgroundColor: `${selectedSlot?.home_team?.color ?? '#3b82f6'}18` }}
                                >
                                  {selectedSlot?.home_team?.name ?? '홈팀'}
                                </button>
                                <button
                                  onClick={() => addIrregularToTeam(pendingIrregular, 'away')}
                                  disabled={addingIrregular}
                                  className="py-2 rounded-lg text-xs font-bold border cursor-pointer transition-colors disabled:opacity-50"
                                  style={{ color: selectedSlot?.away_team?.color ?? '#ef4444', borderColor: `${selectedSlot?.away_team?.color ?? '#ef4444'}60`, backgroundColor: `${selectedSlot?.away_team?.color ?? '#ef4444'}18` }}
                                >
                                  {selectedSlot?.away_team?.name ?? '어웨이팀'}
                                </button>
                              </div>
                              <button onClick={() => setPendingIrregular(null)} className="text-[10px] text-gray-600 hover:text-gray-400 cursor-pointer w-full text-center">취소</button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 경기 시작 버튼 — 선발 선택 바로 아래 */}
                      <Button
                        onClick={startGame}
                        disabled={startingGame || rosterLoading || (homeRoster.length === 0 && awayRoster.length === 0)}
                        className="w-full bg-green-600 hover:bg-green-500 cursor-pointer"
                      >
                        {startingGame
                          ? <><Loader2 size={14} className="mr-1.5 animate-spin" />시작 중...</>
                          : <><Play size={14} className="mr-1.5" />경기 시작</>}
                      </Button>
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

              {/* 교체 모달 */}
              {showSubModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowSubModal(false)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-4 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white">선수 교체</h3>
                      <button onClick={() => setShowSubModal(false)} className="text-gray-500 hover:text-white cursor-pointer transition-colors text-xs">닫기</button>
                    </div>
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
                </div>
              )}

              {/* 박스스코어 모달 */}
              {showBoxscoreModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowBoxscoreModal(false)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl p-4 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white">실시간 박스스코어</h3>
                      <button onClick={() => setShowBoxscoreModal(false)} className="text-gray-500 hover:text-white cursor-pointer transition-colors text-xs">닫기</button>
                    </div>
                    <LeagueStatsPanel
                      leagueId={leagueId}
                      gameId={selectedSlotId}
                      players={allPlayers}
                      refreshKey={statsRefresh}
                      homePlayers={homeRoster}
                      awayPlayers={awayRoster}
                      homeTeam={selectedSlot?.home_team ?? undefined}
                      awayTeam={selectedSlot?.away_team ?? undefined}
                    />
                  </div>
                </div>
              )}

              {/* 플러스원 선수 선택 모달 */}
              {showPlusOneModal && plusOneConflict && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPlusOneModal(false)}>
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                  <div className="relative bg-gray-900 border border-amber-600/50 rounded-2xl p-6 w-full max-w-sm z-10 space-y-4 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <div className="text-center space-y-1.5">
                      <div className="text-2xl">⚡</div>
                      <h3 className="text-white font-black text-base">플러스원 선수 선택</h3>
                      <p className="text-gray-400 text-sm">
                        <span className="text-amber-300 font-bold">{plusOneConflict.teamName}</span>에 +1 선수가 {plusOneConflict.players.length}명입니다.<br/>
                        이 경기에서 +1 혜택을 받을 선수를 선택하세요.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {plusOneConflict.players.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handlePlusOneSelect(p.id)}
                          className="w-full py-3 px-4 rounded-xl bg-amber-900/30 border border-amber-600/50 text-amber-200 font-bold text-sm hover:bg-amber-900/50 hover:border-amber-500 cursor-pointer transition-colors flex items-center justify-between"
                        >
                          <span>{p.number != null ? `#${p.number} ` : ''}{p.name}</span>
                          <span className="text-amber-400 text-xs font-black">+1 선택</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setShowPlusOneModal(false)} className="w-full text-center text-xs text-gray-600 hover:text-gray-400 cursor-pointer py-1">취소</button>
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

      {/* 게임 이벤트 로그 모달 */}
      {showGameLog && selectedSlotId && (
        <GameLogModal
          gameId={selectedSlotId}
          leagueId={leagueId}
          leagueHeaders={leagueHeaders}
          allPlayers={[...homeRoster, ...awayRoster, ...allPlayers.filter(p => !homeRoster.some(r => r.id === p.id) && !awayRoster.some(r => r.id === p.id))]}
          isEditMode={true}
          onClose={() => setShowGameLog(false)}
          onChanged={() => {
            fetchLiveScore()
            setStatsRefresh(k => k + 1)
          }}
          homeTeam={selectedSlot?.home_team ?? undefined}
          awayTeam={selectedSlot?.away_team ?? undefined}
        />
      )}
    </div>
  )
}
