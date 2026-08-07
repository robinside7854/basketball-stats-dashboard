'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { sortJerseyNum } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import EventInputPad from '@/components/record/EventInputPad'
import SubstitutionPanel from '@/components/record/SubstitutionPanel'
import LiveStatsPanel from '@/components/record/LiveStatsPanel'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import type { Tournament, Game, Player, PlayerMinutes } from '@/types/database'
import SubTabNav from '@/components/layout/SubTabNav'
import { gameSubTabs } from '@/components/layout/subTabs'

const SESS_TID = 'bball_record_tid'
const SESS_GID = 'bball_record_gid'
const SESS_YT_TIME = 'bball_record_yt_time'
const SESS_YT_GID  = 'bball_record_yt_gid'

export default function RecordPage() {
  const { isEditMode, openPinModal } = useEditMode()

  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <div className="text-4xl">🔒</div>
        <div className="text-xl font-bold text-[var(--mm-ink)]">편집 모드 전용 페이지</div>
        <p className="text-[var(--mm-muted)] text-sm">경기 기록은 편집 모드에서만 접근할 수 있습니다</p>
        <button
          onClick={openPinModal}
          className="mt-2 px-5 py-2 rounded-lg bg-[var(--mm-yellow)] text-[var(--mm-black)] text-sm font-bold uppercase tracking-[0.08em] transition-colors cursor-pointer"
        >
          편집 모드 전환
        </button>
      </div>
    )
  }

  return <RecordPageInner />
}

function RecordPageInner() {
  const team = useTeam()
  const { teamHeaders } = useEditMode()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [tournamentPlayerIds, setTournamentPlayerIds] = useState<string[]>([])
  const [minutes, setMinutes] = useState<PlayerMinutes[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [gameStarted, setGameStarted] = useState(false)
  const [gameComplete, setGameComplete] = useState(false)
  const [starterIds, setStarterIds] = useState<string[]>([])
  const [statsRefresh, setStatsRefresh] = useState(0)
  const [teamPts, setTeamPts] = useState(0)
  const [mobileTab, setMobileTab] = useState<'record' | 'view'>('record')
  const [tournamentsFetched, setTournamentsFetched] = useState(false)

  const [ytResumeAt, setYtResumeAt] = useState<number | undefined>(undefined)

  // Feature 3: opponent score modal
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [oppScoreInput, setOppScoreInput] = useState('')

  // Feature 2: add player inline
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [newPlayerNum, setNewPlayerNum] = useState('')
  const [newPlayerName, setNewPlayerName] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)

  const { currentGame, currentQuarter, setCurrentGame, setCurrentQuarter, ytPlayer } = useGameStore()
  const { onCourt, setLineup, resetLineup } = useLineupStore()

  // ── YouTube 원격 제어 (리그 모드와 동일) ─────────────────────
  // 유튜브 iframe을 클릭하지 않아도 화면 어디서든 키보드로 재생 제어
  function seekRelative(delta: number) {
    if (!ytPlayer) return
    try {
      ytPlayer.seekTo((ytPlayer.getCurrentTime() ?? 0) + delta, true)
      ytPlayer.unMute()
    } catch {}
  }
  function togglePlay() {
    if (!ytPlayer) return
    try {
      const state = ytPlayer.getPlayerState()
      if (state === 1 /* PLAYING */) ytPlayer.pauseVideo()
      else { ytPlayer.unMute(); ytPlayer.playVideo() }
    } catch {}
  }

  // 키보드 단축키: Space(재생/정지), ←/→(±5s), Shift+←/→(±10s)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (!ytPlayer) return
      if (e.code === 'Space')           { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); seekRelative(e.shiftKey ? -10 : -5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(e.shiftKey ? 10 : 5) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  // Feature 1: restore session immediately on mount (before async fetches)
  useEffect(() => {
    if (currentGame) {
      setSelectedTId(currentGame.tournament_id)
      setSelectedGId(currentGame.id)
    } else {
      const tid = sessionStorage.getItem(SESS_TID)
      const gid = sessionStorage.getItem(SESS_GID)
      if (tid) setSelectedTId(tid)
      if (gid) setSelectedGId(gid)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setTournamentsFetched(false)
    fetch(`/api/players?team=${team}`).then(r => r.json()).then((data: Player[]) => {
      setAllPlayers(data.filter((p: Player) => p.is_active))
    })
    fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(data => {
      setTournaments(data)
      setTournamentsFetched(true)
    })
  }, [team])

  // 팀 전환 시 다른 팀 소속 tournament가 세션에 남아있으면 초기화
  useEffect(() => {
    if (!tournamentsFetched) return
    if (selectedTId && !tournaments.find(t => t.id === selectedTId)) {
      setSelectedTId('')
      setSelectedGId('')
      setGames([])
      sessionStorage.removeItem(SESS_TID)
      sessionStorage.removeItem(SESS_GID)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentsFetched])

  // Feature 1: persist selection
  useEffect(() => { if (selectedTId) sessionStorage.setItem(SESS_TID, selectedTId) }, [selectedTId])
  useEffect(() => { if (selectedGId) sessionStorage.setItem(SESS_GID, selectedGId) }, [selectedGId])

  // Restore saved YT position when game is selected
  useEffect(() => {
    if (!selectedGId) return
    const savedGId = sessionStorage.getItem(SESS_YT_GID)
    const savedTime = sessionStorage.getItem(SESS_YT_TIME)
    if (savedGId === selectedGId && savedTime) {
      setYtResumeAt(parseFloat(savedTime))
    } else {
      setYtResumeAt(undefined)
    }
  }, [selectedGId])

  // Save YT position every 3s during active recording
  useEffect(() => {
    if (!gameStarted || gameComplete || !selectedGId) return
    const interval = setInterval(() => {
      const ts = useGameStore.getState().getCurrentTimestamp()
      if (ts > 0) {
        sessionStorage.setItem(SESS_YT_TIME, String(ts))
        sessionStorage.setItem(SESS_YT_GID, selectedGId)
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [gameStarted, gameComplete, selectedGId])

  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
    fetch(`/api/tournament-players?tournamentId=${selectedTId}`)
      .then(r => r.json())
      .then(data => setTournamentPlayerIds(data.player_ids || []))
  }, [selectedTId])

  useEffect(() => {
    if (!selectedGId || games.length === 0) return
    const game = games.find(g => g.id === selectedGId) || null
    setCurrentGame(game)
    setGameStarted(false)
    setGameComplete(game?.is_complete ?? false)
    setStarterIds([])
    resetLineup()
    setMinutes([])
    fetch(`/api/minutes?gameId=${selectedGId}`).then(r => r.json()).then((data: PlayerMinutes[]) => {
      setMinutes(data)
      const isComplete = game?.is_complete ?? false
      const open = data.filter((m: PlayerMinutes) => m.out_time == null)
      if (open.length > 0) {
        const maxQ = Math.max(...open.map((m: PlayerMinutes) => m.quarter))
        setCurrentQuarter(maxQ)
        const uniqueIds = [...new Set(open.filter((m: PlayerMinutes) => m.quarter === maxQ).map((m: PlayerMinutes) => m.player_id))]
        setLineup(uniqueIds)
        setGameStarted(true)
      } else if (isComplete && data.length > 0) {
        const maxQ = Math.max(...data.map((m: PlayerMinutes) => m.quarter))
        setCurrentQuarter(maxQ)
        const lastIds = [...new Set(data.filter((m: PlayerMinutes) => m.quarter === maxQ).map((m: PlayerMinutes) => m.player_id))]
        setLineup(lastIds)
        setGameStarted(true)
      } else {
        resetLineup()
        setGameStarted(false)
      }
    })
    fetch(`/api/stats/${selectedGId}`).then(r => r.json()).then(d => {
      setTeamPts(d?.teamTotals?.pts ?? 0)
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGId, games])

  const fetchMinutes = useCallback(async () => {
    if (!selectedGId) return
    const data = await fetch(`/api/minutes?gameId=${selectedGId}`).then(r => r.json())
    setMinutes(data)
  }, [selectedGId])

  const handleEventSaved = useCallback(async () => {
    fetchMinutes()
    setStatsRefresh(k => k + 1)
    if (selectedGId) {
      const d = await fetch(`/api/stats/${selectedGId}`).then(r => r.json()).catch(() => null)
      if (d?.teamTotals?.pts != null) setTeamPts(d.teamTotals.pts)
    }
  }, [fetchMinutes, selectedGId])

  async function startGame() {
    if (!currentGame || starterIds.length !== 5) { toast.error('선발 5명을 선택하세요'); return }
    await Promise.all(starterIds.map(pid =>
      fetch('/api/minutes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ game_id: currentGame.id, player_id: pid, quarter: 1, in_time: 0 }) })
    ))
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ game_id: currentGame.id, quarter: 1, video_timestamp: 0, type: 'quarter_start', points: 0 }) })
    setLineup(starterIds)
    setGameStarted(true)
    toast.success('Q1 기록 시작!')
    fetchMinutes()
  }

  async function switchToQuarter(newQ: number) {
    if (!currentGame || newQ === currentQuarter) return
    if (!confirm(`${newQ <= 4 ? `Q${newQ}` : 'OT'}로 전환하시겠습니까? 현재 코트 선수들의 출전 시간이 마감됩니다.`)) return
    const { getCurrentTimestamp } = useGameStore.getState()
    const ts = getCurrentTimestamp()
    const openIntervals = minutes.filter(m => m.game_id === currentGame.id && m.out_time == null)
    await Promise.all(openIntervals.map(m =>
      fetch('/api/minutes', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ id: m.id, out_time: ts }) })
    ))
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ game_id: currentGame.id, quarter: currentQuarter, video_timestamp: ts, type: 'quarter_end', points: 0 }) })
    setCurrentQuarter(newQ)
    await Promise.all(onCourt.map(pid =>
      fetch('/api/minutes', { method: 'POST', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ game_id: currentGame.id, player_id: pid, quarter: newQ, in_time: 0 }) })
    ))
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ game_id: currentGame.id, quarter: newQ, video_timestamp: 0, type: 'quarter_start', points: 0 }) })
    toast.success(`${newQ <= 4 ? `Q${newQ}` : 'OT'} 시작`)
    fetchMinutes()
  }

  // Feature 3: show modal instead of confirm
  function completeGame() {
    if (!currentGame) return
    setOppScoreInput('')
    setShowCompleteModal(true)
  }

  async function confirmComplete() {
    if (!currentGame) return
    const oppScore = parseInt(oppScoreInput, 10)
    if (isNaN(oppScore) || oppScore < 0) { toast.error('상대 점수를 올바르게 입력하세요'); return }
    const { getCurrentTimestamp } = useGameStore.getState()
    const ts = getCurrentTimestamp()
    const open = minutes.filter(m => m.out_time == null)
    await Promise.all(open.map(m =>
      fetch('/api/minutes', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ id: m.id, out_time: ts }) })
    ))
    const res = await fetch(`/api/games/${currentGame.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
      body: JSON.stringify({ is_complete: true, our_score: teamPts, opponent_score: oppScore }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      toast.error(`저장 실패: ${errData.error ?? res.status}`)
      return
    }
    setShowCompleteModal(false)
    setGameComplete(true)
    setGameStarted(true)
    setCurrentGame({ ...currentGame, is_complete: true })
    setGames(prev => prev.map(g => g.id === currentGame.id ? { ...g, is_complete: true, our_score: teamPts, opponent_score: oppScore } : g))
    toast.success(`경기 완료! 파란날개 ${teamPts} : ${oppScore} 상대팀`)
    setStatsRefresh(k => k + 1)
  }

  async function resetGame() {
    if (!currentGame) return
    if (!confirm('이 경기의 모든 기록(이벤트, 출전시간)을 삭제하고 처음부터 다시 시작하시겠습니까?')) return
    await Promise.all([
      fetch(`/api/events?gameId=${currentGame.id}`, { method: 'DELETE', headers: { ...teamHeaders } }),
      fetch(`/api/minutes?gameId=${currentGame.id}`, { method: 'DELETE', headers: { ...teamHeaders } }),
      fetch(`/api/games/${currentGame.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ is_complete: false }) }),
    ])
    sessionStorage.removeItem(SESS_YT_TIME)
    sessionStorage.removeItem(SESS_YT_GID)
    setYtResumeAt(undefined)
    resetLineup()
    setGameStarted(false)
    setGameComplete(false)
    setCurrentQuarter(1)
    setMinutes([])
    setStarterIds([])
    setStatsRefresh(k => k + 1)
    toast.success('초기화 완료. 선발 5명을 다시 선택하세요.')
  }

  async function recordOppScore(pts: number) {
    if (!currentGame) return
    const { getCurrentTimestamp } = useGameStore.getState()
    const ts = getCurrentTimestamp()
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify({ game_id: currentGame.id, quarter: currentQuarter, video_timestamp: ts, type: 'opp_score', points: pts }) })
    toast(`상대팀 +${pts}점`)
  }

  // Feature 2: add player to tournament roster
  async function addPlayerQuick() {
    if (!newPlayerName.trim() || !newPlayerNum.trim() || !selectedTId) return
    setAddingPlayer(true)
    try {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ number: parseInt(newPlayerNum, 10), name: newPlayerName.trim(), team_type: team, is_active: true }),
      })
      if (!res.ok) { toast.error('선수 추가 실패'); return }
      const player: Player = await res.json()
      const newIds = [...tournamentPlayerIds, player.id]
      await fetch('/api/tournament-players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ tournament_id: selectedTId, player_ids: newIds }),
      })
      setAllPlayers(prev => [...prev, player])
      setTournamentPlayerIds(newIds)
      setNewPlayerNum('')
      setNewPlayerName('')
      setShowAddPlayer(false)
      toast.success(`${player.number}번 ${player.name} 추가 완료`)
    } finally {
      setAddingPlayer(false)
    }
  }

  const toggleStarter = (id: string) => {
    setStarterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev)
  }

  const activePlayers = useMemo(() => {
    const base = tournamentPlayerIds.length > 0
      ? (allPlayers.filter(p => tournamentPlayerIds.includes(p.id)).length > 0
          ? allPlayers.filter(p => tournamentPlayerIds.includes(p.id))
          : allPlayers)
      : allPlayers
    return [...base].sort((a, b) => sortJerseyNum(a.number, b.number))
  }, [allPlayers, tournamentPlayerIds])

  const selectedTournament = tournaments.find(t => t.id === selectedTId)
  const selectedGame = games.find(g => g.id === selectedGId)

  const addPlayerForm = (
    <div className="flex gap-2">
      <input
        type="number"
        placeholder="번호"
        value={newPlayerNum}
        onChange={e => setNewPlayerNum(e.target.value)}
        className="w-16 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-2 py-1.5 text-sm text-[var(--mm-ink)] focus:outline-none focus:border-[color:var(--color-hoop-orange-500)]"
      />
      <input
        type="text"
        placeholder="이름"
        value={newPlayerName}
        onChange={e => setNewPlayerName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && addPlayerQuick()}
        className="flex-1 bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg px-2 py-1.5 text-sm text-[var(--mm-ink)] focus:outline-none focus:border-[color:var(--color-hoop-orange-500)]"
      />
      <button
        onClick={addPlayerQuick}
        disabled={addingPlayer || !newPlayerName.trim() || !newPlayerNum.trim()}
        className="px-3 py-1.5 bg-[var(--mm-ink)] text-[var(--mm-panel)] disabled:opacity-40 text-xs font-bold rounded-lg transition-colors cursor-pointer hover:brightness-95"
      >
        {addingPlayer ? '...' : '추가'}
      </button>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* RecordPageInner 는 부모(RecordPage)에서 isEditMode 일 때만 렌더되므로 항상 true */}
      <SubTabNav tabs={gameSubTabs(true)} />

      {/* Feature 3: opponent score modal */}
      {showCompleteModal && (
        <div className="fixed inset-0 z-[200] bg-[var(--mm-ink)]/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowCompleteModal(false) }}>
          <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-2xl p-6 flex flex-col gap-5 shadow-2xl w-full max-w-sm">
            <div className="text-center">
              <div className="text-2xl mb-1">🏁</div>
              <div className="text-lg font-bold text-[var(--mm-ink)]">경기 완료</div>
              <div className="text-[var(--mm-muted)] text-sm mt-1">상대팀 최종 점수를 입력하세요</div>
            </div>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="text-xs text-[var(--mm-ink-soft)] mb-1">파란날개</div>
                <div className="text-4xl font-black text-[var(--mm-yellow-strong)] font-mono">{teamPts}</div>
              </div>
              <div className="text-[var(--mm-muted)] text-2xl font-bold">:</div>
              <div className="text-center">
                <div className="text-xs text-red-400 mb-1">상대팀</div>
                <input
                  type="number"
                  min="0"
                  value={oppScoreInput}
                  onChange={e => setOppScoreInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmComplete()}
                  placeholder="0"
                  autoFocus
                  className="w-20 text-4xl font-black font-mono text-center bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-xl py-1 text-[var(--mm-ink)] focus:outline-none focus:border-[color:var(--color-hoop-orange-500)]"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCompleteModal(false)}
                className="flex-1 min-h-11 py-2.5 rounded-xl border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:bg-[var(--mm-panel-alt)] hover:text-[var(--mm-ink)] text-sm font-medium transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={confirmComplete}
                className="flex-1 min-h-11 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-bold transition-colors cursor-pointer"
              >
                기록 완료
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl px-3 py-2 flex-shrink-0 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            key={`t-${tournaments.map(t => t.id).join('')}`}
            value={selectedTId}
            onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}
          >
            <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-8 w-full sm:w-48 text-sm cursor-pointer">
              <SelectValue placeholder="대회 선택">
                {selectedTournament
                  ? `${selectedTournament.name} (${selectedTournament.year})`
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
              {tournaments.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            key={`g-${games.map(g => g.id).join('')}`}
            value={selectedGId}
            onValueChange={v => setSelectedGId(v ?? '')}
            disabled={!selectedTId}
          >
            <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-8 w-full sm:w-52 text-sm cursor-pointer">
              <SelectValue placeholder="경기 선택">
                {selectedGame
                  ? `${selectedGame.is_complete ? '✓ ' : ''}${selectedGame.date} vs ${selectedGame.opponent}`
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
              {games.map(g => (
                <SelectItem key={g.id} value={g.id}>
                  {g.is_complete ? '✓ ' : ''}{g.date} vs {g.opponent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {currentGame && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {tournamentPlayerIds.length > 0 ? (
                <span className="text-xs text-[var(--mm-yellow-strong)]">{activePlayers.length}명 등록</span>
              ) : (
                <span className="text-xs text-[var(--mm-muted)]">전체 선수 표시 중</span>
              )}
              {gameStarted && !gameComplete && (
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4, 5].map(q => (
                    <button
                      key={q}
                      onClick={() => switchToQuarter(q)}
                      className={`px-2 py-0.5 rounded text-xs font-bold transition-colors cursor-pointer ${
                        currentQuarter === q
                          ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]'
                          : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                      }`}
                    >
                      {q <= 4 ? `${q}Q` : 'OT'}
                    </button>
                  ))}
                  <span className="text-[var(--mm-muted)] text-xs">·</span>
                  <span className="text-xs text-[var(--mm-ink-soft)]">파란날개</span>
                  <span className="text-sm font-black text-[var(--mm-yellow-strong)] font-mono">{teamPts}</span>
                  <span className="text-[var(--mm-muted)] text-xs">코트:{onCourt.length}</span>
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={resetGame}
                className="h-7 min-h-7 text-xs border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-red-400 hover:border-red-600 px-2 cursor-pointer"
              >
                초기화
              </Button>
              {gameComplete ? (
                <span className="text-green-400 text-sm font-semibold">✓ 기록 완료</span>
              ) : (
                <Button
                  size="sm"
                  onClick={completeGame}
                  className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white px-3 cursor-pointer"
                >
                  기록 완료
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {currentGame ? (
        <div className="lg:grid lg:grid-cols-3 lg:gap-4">
          {/* 모바일: display:contents → 영상 sticky의 기준이 그리드 전체가 되어 기록 중에도 항상 보임 */}
          <div className="contents lg:block lg:col-span-2 lg:space-y-3">
            {/* 영상 — 모바일에서 상단 고정 (영상 없으면 모바일에서는 숨김) */}
            <div className={`mb-3 lg:mb-0 lg:static lg:z-auto lg:block ${currentGame.youtube_url ? 'sticky top-[52px] z-30 bg-[var(--mm-ground)]' : 'hidden'}`}>
              <YouTubePlayer
                key={currentGame.id}
                youtubeUrl={currentGame.youtube_url || ''}
                startOffset={currentGame.youtube_start_offset}
                resumeAt={ytResumeAt}
              />
            </div>

            {/* 모바일 탭 — 영상은 항상 표시, 아래 영역만 기록/스탯 전환 */}
            <div className="lg:hidden flex rounded-xl overflow-hidden border border-[var(--mm-rule)] mb-3">
              <button
                onClick={() => setMobileTab('record')}
                className={`flex-1 min-h-11 py-2.5 text-sm font-bold transition-colors cursor-pointer ${mobileTab === 'record' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)]'}`}
              >
                📝 기록
              </button>
              <button
                onClick={() => setMobileTab('view')}
                className={`flex-1 min-h-11 py-2.5 text-sm font-bold border-l border-[var(--mm-rule)] transition-colors cursor-pointer ${mobileTab === 'view' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)]'}`}
              >
                📊 스탯
              </button>
            </div>

            {(gameStarted || gameComplete) && (
              <div className={`mb-3 lg:mb-0 ${mobileTab !== 'view' ? 'hidden lg:block' : ''}`}>
                <LiveStatsPanel gameId={currentGame.id} refreshKey={statsRefresh} />
              </div>
            )}
          </div>

          <div className={`lg:sticky lg:top-[60px] lg:self-start bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-3 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto space-y-3 ${mobileTab !== 'record' ? 'hidden lg:block' : ''}`}>
            {gameComplete ? (
              <div className="flex flex-col items-center justify-center text-center gap-4 py-10">
                <div className="text-5xl">✅</div>
                <div>
                  <p className="text-green-400 font-bold text-lg">기록이 완료된 경기입니다</p>
                  <p className="text-[var(--mm-muted)] text-sm mt-1">박스스코어 탭에서 최종 스탯을 확인하세요</p>
                </div>
                <button
                  onClick={resetGame}
                  className="mt-2 min-h-11 px-4 py-2 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 text-sm font-medium transition-colors cursor-pointer"
                >
                  다시 기록하기
                </button>
              </div>
            ) : !gameStarted ? (
              <div>
                <p className="font-semibold mb-2 text-sm text-[var(--mm-ink)]">
                  선발 5명 선택 ({starterIds.length}/5)
                </p>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {activePlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleStarter(p.id)}
                      className={`min-h-11 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        starterIds.includes(p.id)
                          ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]'
                          : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                      }`}
                    >
                      <div>{p.number}</div>
                      <div className="font-normal">{p.name}</div>
                    </button>
                  ))}
                  {/* Feature 2: add player button in grid */}
                  <button
                    onClick={() => setShowAddPlayer(v => !v)}
                    className="min-h-11 py-1.5 rounded-lg text-xs border border-dashed border-[var(--mm-rule)] text-[var(--mm-muted)] hover:border-[var(--mm-ink-soft)] hover:text-[var(--mm-ink-soft)] transition-colors cursor-pointer"
                  >
                    <div className="text-base leading-none mb-0.5">+</div>
                    <div>선수 추가</div>
                  </button>
                </div>
                {showAddPlayer && (
                  <div className="bg-[var(--mm-panel-alt)] rounded-xl p-3 mb-3 space-y-2">
                    <p className="text-xs text-[var(--mm-ink-soft)] font-medium">대회 로스터에 선수를 추가합니다</p>
                    {addPlayerForm}
                  </div>
                )}
                <Button
                  onClick={startGame}
                  disabled={starterIds.length !== 5}
                  className="w-full min-h-11 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 font-bold py-2 text-sm cursor-pointer"
                >
                  Q1 기록 시작
                </Button>
              </div>
            ) : (
              <>
                <EventInputPad players={activePlayers} onEventSaved={handleEventSaved} />
                <div className="border-t border-[var(--mm-rule)] pt-3 space-y-2">
                  <SubstitutionPanel players={activePlayers} minutes={minutes} onSubstitution={handleEventSaved} />
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-xs text-[var(--mm-ink-soft)]">상대팀</span>
                    {[2, 3, 1].map(pts => (
                      <button
                        key={pts}
                        onClick={() => recordOppScore(pts)}
                        className="min-h-9 px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded font-bold cursor-pointer"
                      >
                        +{pts}
                      </button>
                    ))}
                  </div>
                  {/* Feature 2: add player during recording */}
                  <div className="border-t border-[var(--mm-rule)] pt-2">
                    <button
                      onClick={() => setShowAddPlayer(v => !v)}
                      className="text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink-soft)] transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-xs">{showAddPlayer ? '▲' : '▼'}</span>
                      선수 추가
                    </button>
                    {showAddPlayer && (
                      <div className="mt-2">
                        {addPlayerForm}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-[var(--mm-muted)]">
          <div className="text-center">
            <p className="text-lg">대회와 경기를 선택하세요</p>
            <p className="text-sm mt-2">대회 관리 탭에서 대회와 경기를 먼저 등록하세요</p>
          </div>
        </div>
      )}
    </div>
  )
}
