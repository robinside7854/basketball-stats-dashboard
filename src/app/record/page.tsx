'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import EventInputPad from '@/components/record/EventInputPad'
import SubstitutionPanel from '@/components/record/SubstitutionPanel'
import LiveStatsPanel from '@/components/record/LiveStatsPanel'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import type { Tournament, Game, Player, PlayerMinutes } from '@/types/database'

export default function RecordPage() {
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

  const { currentGame, currentQuarter, setCurrentGame, setCurrentQuarter } = useGameStore()
  const { onCourt, setLineup, resetLineup } = useLineupStore()

  useEffect(() => {
    fetch('/api/players').then(r => r.json()).then((data: Player[]) => {
      setAllPlayers(data.filter((p: Player) => p.is_active))
    })
    fetch('/api/tournaments').then(r => r.json()).then((data: Tournament[]) => {
      setTournaments(data)
      if (currentGame) {
        setSelectedTId(currentGame.tournament_id)
        setSelectedGId(currentGame.id)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    // 경기 전환 시 상태 즉시 초기화
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
        // 진행 중: 최신 쿼터 + 중복 제거
        const maxQ = Math.max(...open.map((m: PlayerMinutes) => m.quarter))
        setCurrentQuarter(maxQ)
        const uniqueIds = [...new Set(open.filter((m: PlayerMinutes) => m.quarter === maxQ).map((m: PlayerMinutes) => m.player_id))]
        setLineup(uniqueIds)
        setGameStarted(true)
      } else if (isComplete && data.length > 0) {
        // 완료된 경기: 선발 선택 화면 방지, 마지막 쿼터 복원
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGId, games])

  const fetchMinutes = useCallback(async () => {
    if (!selectedGId) return
    const data = await fetch(`/api/minutes?gameId=${selectedGId}`).then(r => r.json())
    setMinutes(data)
  }, [selectedGId])

  const handleEventSaved = useCallback(() => {
    fetchMinutes()
    setStatsRefresh(k => k + 1)
  }, [fetchMinutes])

  async function startGame() {
    if (!currentGame || starterIds.length !== 5) { toast.error('선발 5명을 선택하세요'); return }
    await Promise.all(starterIds.map(pid =>
      fetch('/api/minutes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: currentGame.id, player_id: pid, quarter: 1, in_time: 0 }) })
    ))
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: currentGame.id, quarter: 1, video_timestamp: 0, type: 'quarter_start', points: 0 }) })
    setLineup(starterIds)
    setGameStarted(true)
    toast.success('Q1 기록 시작!')
    fetchMinutes()
  }

  async function switchToQuarter(newQ: number) {
    if (!currentGame || newQ === currentQuarter) return
    const { getCurrentTimestamp } = useGameStore.getState()
    const ts = getCurrentTimestamp()
    const openIntervals = minutes.filter(m => m.game_id === currentGame.id && m.out_time == null)
    await Promise.all(openIntervals.map(m =>
      fetch('/api/minutes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, out_time: ts }) })
    ))
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: currentGame.id, quarter: currentQuarter, video_timestamp: ts, type: 'quarter_end', points: 0 }) })
    setCurrentQuarter(newQ)
    await Promise.all(onCourt.map(pid =>
      fetch('/api/minutes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: currentGame.id, player_id: pid, quarter: newQ, in_time: 0 }) })
    ))
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: currentGame.id, quarter: newQ, video_timestamp: 0, type: 'quarter_start', points: 0 }) })
    toast.success(`${newQ <= 4 ? `Q${newQ}` : 'OT'} 시작`)
    fetchMinutes()
  }

  async function completeGame() {
    if (!currentGame) return
    if (!confirm('기록을 완료하시겠습니까?')) return
    const { getCurrentTimestamp } = useGameStore.getState()
    const ts = getCurrentTimestamp()
    const open = minutes.filter(m => m.out_time == null)
    await Promise.all(open.map(m =>
      fetch('/api/minutes', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, out_time: ts }) })
    ))
    await fetch(`/api/games/${currentGame.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_complete: true }),
    })
    setGameComplete(true)
    setCurrentGame({ ...currentGame, is_complete: true })
    toast.success('경기 기록이 완료되었습니다')
    setStatsRefresh(k => k + 1)
  }

  async function resetGame() {
    if (!currentGame) return
    if (!confirm('이 경기의 모든 기록(이벤트, 출전시간)을 삭제하고 처음부터 다시 시작하시겠습니까?')) return
    await Promise.all([
      fetch(`/api/events?gameId=${currentGame.id}`, { method: 'DELETE' }),
      fetch(`/api/minutes?gameId=${currentGame.id}`, { method: 'DELETE' }),
      fetch(`/api/games/${currentGame.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_complete: false }) }),
    ])
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
    await fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game_id: currentGame.id, quarter: currentQuarter, video_timestamp: ts, type: 'opp_score', points: pts }) })
    toast(`상대팀 +${pts}점`)
  }

  const toggleStarter = (id: string) => {
    setStarterIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev)
  }

  // allPlayers·tournamentPlayerIds 어느 쪽이 늦게 로드되어도 올바르게 파생
  const activePlayers = useMemo(() => {
    if (tournamentPlayerIds.length > 0) {
      const filtered = allPlayers.filter(p => tournamentPlayerIds.includes(p.id))
      return filtered.length > 0 ? filtered : allPlayers
    }
    return allPlayers
  }, [allPlayers, tournamentPlayerIds])

  const selectedTournament = tournaments.find(t => t.id === selectedTId)
  const selectedGame = games.find(g => g.id === selectedGId)

  return (
    <div className="space-y-3">
      {/* 상단 선택 바 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 flex-shrink-0 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            key={`t-${tournaments.map(t => t.id).join('')}`}
            value={selectedTId}
            onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 w-48 text-sm">
              <SelectValue placeholder="대회 선택">
                {selectedTournament
                  ? `${selectedTournament.name} (${selectedTournament.year})`
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
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
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-8 w-52 text-sm">
              <SelectValue placeholder="경기 선택">
                {selectedGame
                  ? `${selectedGame.is_complete ? '✓ ' : ''}${selectedGame.date} vs ${selectedGame.opponent}`
                  : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              {games.map(g => (
                <SelectItem key={g.id} value={g.id}>
                  {g.is_complete ? '✓ ' : ''}{g.date} vs {g.opponent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {currentGame && (
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              {/* 참석선수 등록 힌트 */}
              {tournamentPlayerIds.length > 0 ? (
                <span className="text-xs text-blue-400">{activePlayers.length}명 등록</span>
              ) : (
                <span className="text-xs text-gray-500">전체 선수 표시 중</span>
              )}
              {/* 쿼터 선택 버튼 */}
              {gameStarted && !gameComplete && (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(q => (
                    <button
                      key={q}
                      onClick={() => switchToQuarter(q)}
                      className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                        currentQuarter === q
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600 hover:text-white'
                      }`}
                    >
                      {q <= 4 ? `${q}Q` : 'OT'}
                    </button>
                  ))}
                  <span className="text-gray-500 text-xs ml-1">코트:{onCourt.length}</span>
                </div>
              )}
              {/* 초기화 버튼 */}
              <Button
                size="sm"
                variant="outline"
                onClick={resetGame}
                className="h-7 text-xs border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-600 px-2"
              >
                초기화
              </Button>
              {gameComplete ? (
                <span className="text-green-400 text-sm font-semibold">✓ 기록 완료</span>
              ) : gameStarted ? (
                <Button
                  size="sm"
                  onClick={completeGame}
                  className="h-7 text-xs bg-green-700 hover:bg-green-600 text-white px-3"
                >
                  기록 완료
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {currentGame ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 좌 2/3: 영상 + 컨트롤 + 실시간 스탯 */}
          <div className="lg:col-span-2 space-y-3">
            <YouTubePlayer
              youtubeUrl={currentGame.youtube_url || ''}
              startOffset={currentGame.youtube_start_offset}
            />

            {gameStarted && !gameComplete && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-2">
                <SubstitutionPanel players={activePlayers} minutes={minutes} onSubstitution={handleEventSaved} />
                <div className="flex items-center gap-1.5 justify-end">
                  <span className="text-xs text-gray-400">상대팀</span>
                  {[2, 3, 1].map(pts => (
                    <button
                      key={pts}
                      onClick={() => recordOppScore(pts)}
                      className="px-2 py-1 bg-red-900 hover:bg-red-800 text-red-300 text-xs rounded font-bold"
                    >
                      +{pts}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameStarted && (
              <LiveStatsPanel gameId={currentGame.id} refreshKey={statsRefresh} />
            )}
          </div>

          {/* 우 1/3: 이벤트 입력 (sticky 고정) */}
          <div className="lg:sticky lg:top-[60px] lg:self-start bg-gray-900 border border-gray-800 rounded-xl p-3 max-h-[calc(100vh-80px)] overflow-y-auto">
            {gameComplete ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                <div className="text-4xl">✅</div>
                <p className="text-green-400 font-semibold">기록 완료된 경기입니다</p>
                <p className="text-gray-500 text-sm">박스스코어 탭에서 최종 스탯을 확인하세요</p>
              </div>
            ) : !gameStarted ? (
              <div>
                <p className="font-semibold mb-2 text-sm">
                  선발 5명 선택 ({starterIds.length}/5)
                </p>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {activePlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => toggleStarter(p.id)}
                      className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        starterIds.includes(p.id)
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <div>{p.number}</div>
                      <div className="font-normal">{p.name}</div>
                    </button>
                  ))}
                </div>
                <Button
                  onClick={startGame}
                  disabled={starterIds.length !== 5}
                  className="w-full bg-blue-500 hover:bg-blue-600 font-bold py-2 text-sm"
                >
                  Q1 기록 시작
                </Button>
              </div>
            ) : (
              <EventInputPad players={activePlayers} onEventSaved={handleEventSaved} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-20 text-gray-500">
          <div className="text-center">
            <p className="text-lg">대회와 경기를 선택하세요</p>
            <p className="text-sm mt-2">대회 관리 탭에서 대회와 경기를 먼저 등록하세요</p>
          </div>
        </div>
      )}
    </div>
  )
}
