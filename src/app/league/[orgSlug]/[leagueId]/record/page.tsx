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
  CheckCircle2, Circle, Youtube, RefreshCw,
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
  home_team?: { id: string; name: string; color: string } | null
  away_team?: { id: string; name: string; color: string } | null
}
type MinRow = { id: string; league_player_id: string; league_game_id: string; out_time: number | null }

const QUARTERS = [1, 2, 3, 4]

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
  const { currentQuarter, setCurrentQuarter, setCurrentGame } = useGameStore()
  const { setLineup, resetLineup } = useLineupStore()

  const [scheduleDates, setScheduleDates] = useState<ScheduleDate[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<GameSlot[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [leagueYtChannel, setLeagueYtChannel] = useState<string | null>(null)
  const [dateStats, setDateStats] = useState<Record<string, { total: number; yt: number }>>({})
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [loadingDates, setLoadingDates] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [initializingSlots, setInitializingSlots] = useState(false)
  const [ytSyncing, setYtSyncing] = useState(false)
  const [minutes, setMinutes] = useState<MinRow[]>([])
  const [statsRefresh, setStatsRefresh] = useState(0)
  const [mobileTab, setMobileTab] = useState<'record' | 'stats'>('record')

  // 팀 선택 (슬랏별)
  const [pendingHome, setPendingHome] = useState('')
  const [pendingAway, setPendingAway] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)

  // 경기 진행
  const [gameStarted, setGameStarted] = useState(false)
  const [starterIds, setStarterIds] = useState<string[]>([])
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [oppScore, setOppScore] = useState('')

  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null

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
      }
      if (gRes.ok) buildDateStats(await gRes.json())
      setLoadingDates(false)
    }
    init()
  }, [leagueId])

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
    setCurrentQuarter(1)
    resetLineup()
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
        // dateStats 갱신
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

  async function startGame() {
    if (starterIds.length === 0) { toast.error('선발 선수를 1명 이상 선택하세요'); return }
    await Promise.all(starterIds.map(pid =>
      fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: pid, quarter: currentQuarter, in_time: 0 }),
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
    refreshSlots()
  }

  async function completeGame() {
    const opp = Number(oppScore)
    if (isNaN(opp) || oppScore === '') { toast.error('상대 점수를 입력하세요'); return }
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_complete: true, away_score: opp }),
    })
    setShowComplete(false)
    toast.success('경기 완료 처리됨')
    refreshSlots()
  }

  function handleEventSaved() {
    setStatsRefresh(k => k + 1)
    if (selectedSlotId) {
      fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
        .then(r => r.json()).then(setMinutes)
    }
  }

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
        <h2 className="text-xl font-bold text-white">경기 기록</h2>
        <p className="text-gray-400 text-sm">기록할 날짜를 선택하세요</p>
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

      {/* 슬랏 그리드 */}
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {slots.map(slot => {
          const isSelected = slot.id === selectedSlotId
          const hasTeams = slot.home_team_id && slot.away_team_id
          const hasYT = !!slot.youtube_url
          return (
            <button
              key={slot.id}
              onClick={() => selectSlot(slot)}
              className={`relative flex flex-col items-center justify-center py-3 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : slot.is_complete
                  ? 'bg-green-900/30 border-green-700/50 text-green-400'
                  : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="text-base">{slot.slot_num}</span>
              <div className="flex items-center gap-0.5 mt-1">
                {hasYT && <Youtube size={9} className="text-red-400" />}
                {slot.is_complete
                  ? <CheckCircle2 size={9} className="text-green-400" />
                  : slot.is_started
                  ? <Circle size={9} className="text-yellow-400" />
                  : hasTeams
                  ? <Circle size={9} className="text-gray-500" />
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
        <div className="space-y-4 border-t border-gray-800 pt-4">
          {/* 팀 선택 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">경기 {selectedSlot.slot_num} — 팀 설정</h3>
            <div className="flex items-center gap-3">
              <select
                value={pendingHome}
                onChange={e => setPendingHome(e.target.value)}
                disabled={gameStarted}
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
              >
                <option value="">홈 팀 선택</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <span className="text-gray-500 font-bold text-sm shrink-0">vs</span>
              <select
                value={pendingAway}
                onChange={e => setPendingAway(e.target.value)}
                disabled={gameStarted}
                className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer disabled:opacity-50"
              >
                <option value="">어웨이 팀 선택</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {!gameStarted && (
                <Button onClick={saveTeams} disabled={savingTeam} size="sm" className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0">
                  {savingTeam ? <Loader2 size={12} className="animate-spin" /> : '저장'}
                </Button>
              )}
            </div>
          </div>

          {/* YouTube 플레이어 — 팀 설정 여부와 무관하게 URL이 있으면 표시 */}
          {selectedSlot.youtube_url && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <YouTubePlayer
                youtubeUrl={selectedSlot.youtube_url}
                startOffset={selectedSlot.youtube_start_offset ?? 0}
              />
            </div>
          )}

          {/* 팀이 지정된 경우에만 기록 UI 표시 */}
          {selectedSlot.home_team_id && selectedSlot.away_team_id ? (
            <>
              {/* 경기 제어 */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 space-y-3">
                  {/* 쿼터 */}
                  <div className="flex gap-1.5">
                    {QUARTERS.map(q => (
                      <button
                        key={q}
                        onClick={() => setCurrentQuarter(q)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${currentQuarter === q ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                      >Q{q}</button>
                    ))}
                    <button
                      onClick={() => setCurrentQuarter(5)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${currentQuarter === 5 ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >OT</button>
                  </div>

                  {/* 게임 시작/종료 */}
                  {!gameStarted ? (
                    <Button
                      onClick={() => setShowStarterPicker(true)}
                      className="w-full bg-green-600 hover:bg-green-500 cursor-pointer"
                      size="sm"
                    >
                      <Play size={13} className="mr-1" />선발 선택 후 시작
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <div className="flex-1 py-1.5 rounded-lg bg-green-900/30 border border-green-800/50 text-green-400 text-xs text-center font-medium">
                        경기 진행 중
                      </div>
                      <button
                        onClick={() => setShowComplete(true)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400 hover:text-red-400 text-xs cursor-pointer transition-colors"
                      >
                        <Square size={11} />종료
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 선발 선택 모달 */}
              {showStarterPicker && (
                <div className="bg-gray-900 border border-blue-500/40 rounded-xl p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-white">선발 선수 선택</h3>
                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                    {allPlayers.map(p => {
                      const on = starterIds.includes(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => setStarterIds(ids => on ? ids.filter(x => x !== p.id) : [...ids, p.id])}
                          className={`px-3 py-2 rounded-lg text-xs text-left border transition-colors cursor-pointer ${on ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                        >
                          {p.number ? `#${p.number} ` : ''}{p.name}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={startGame} disabled={starterIds.length === 0} className="flex-1 bg-green-600 hover:bg-green-500 cursor-pointer" size="sm">
                      <Play size={12} className="mr-1" />시작 ({starterIds.length}명)
                    </Button>
                    <Button onClick={() => setShowStarterPicker(false)} variant="outline" size="sm" className="border-gray-700 text-gray-400 cursor-pointer">취소</Button>
                  </div>
                </div>
              )}

              {/* 모바일 탭 */}
              <div className="flex gap-1 lg:hidden">
                {(['record', 'stats'] as const).map(tab => (
                  <button key={tab} onClick={() => setMobileTab(tab)}
                    className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${mobileTab === tab ? 'bg-gray-700 text-white' : 'bg-gray-900 text-gray-500'}`}>
                    {tab === 'record' ? '기록' : '통계'}
                  </button>
                ))}
              </div>

              {/* 기록 + 통계 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={mobileTab === 'record' ? '' : 'hidden lg:block'}>
                  {gameStarted && (
                    <>
                      <LeagueEventInputPad
                        leagueId={leagueId}
                        gameId={selectedSlotId}
                        leagueHeaders={leagueHeaders}
                        players={allPlayers}
                        onEventSaved={handleEventSaved}
                      />
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
                  )}
                </div>
                <div className={mobileTab === 'stats' ? '' : 'hidden lg:block'}>
                  <LeagueStatsPanel leagueId={leagueId} gameId={selectedSlotId} players={allPlayers} refreshKey={statsRefresh} />
                </div>
              </div>

              {/* 경기 종료 모달 */}
              {showComplete && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-xs space-y-4">
                    <h3 className="text-white font-bold">경기 종료</h3>
                    <div>
                      <label className="text-xs text-gray-400">상대 팀 최종 점수</label>
                      <input
                        type="number"
                        value={oppScore}
                        onChange={e => setOppScore(e.target.value)}
                        className="w-full mt-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-xl font-bold text-center"
                        placeholder="0"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={completeGame} className="flex-1 bg-blue-600 hover:bg-blue-500 cursor-pointer" size="sm">완료 처리</Button>
                      <Button onClick={() => setShowComplete(false)} variant="outline" size="sm" className="border-gray-700 text-gray-400 cursor-pointer">취소</Button>
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
    </div>
  )
}
