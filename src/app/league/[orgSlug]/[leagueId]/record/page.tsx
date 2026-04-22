'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Lock, Loader2, Play, Square } from 'lucide-react'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LeagueEventInputPad from '@/components/league/LeagueEventInputPad'
import LeagueSubstitutionPanel from '@/components/league/LeagueSubstitutionPanel'
import LeagueStatsPanel from '@/components/league/LeagueStatsPanel'
import type { LeaguePlayer, LeagueTeamWithPlayers } from '@/types/league'

type GameRow = {
  id: string; round_num: number; date: string; is_complete: boolean; is_started: boolean
  home_score: number; away_score: number
  youtube_url?: string | null; youtube_start_offset?: number
  home_team?: { id: string; name: string; color: string }
  away_team?: { id: string; name: string; color: string }
}

type MinRow = { id: string; league_player_id: string; league_game_id: string; out_time: number | null }

const QUARTERS = [1, 2, 3, 4]

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

function RecordInner({ leagueId, leagueHeaders }: { leagueId: string; leagueHeaders: Record<string, string> }) {
  const { currentQuarter, setCurrentQuarter, setCurrentGame } = useGameStore()
  const { setLineup, resetLineup } = useLineupStore()

  const [games, setGames] = useState<GameRow[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [minutes, setMinutes] = useState<MinRow[]>([])
  const [selectedGameId, setSelectedGameId] = useState('')
  const [statsRefresh, setStatsRefresh] = useState(0)
  const [mobileTab, setMobileTab] = useState<'record' | 'view'>('record')
  const [ytInput, setYtInput] = useState('')
  const [savingYt, setSavingYt] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [starterIds, setStarterIds] = useState<string[]>([])
  const [showStarterPicker, setShowStarterPicker] = useState(false)
  const [oppScore, setOppScore] = useState('')
  const [showComplete, setShowComplete] = useState(false)
  const [loadingGames, setLoadingGames] = useState(true)

  const selectedGame = games.find(g => g.id === selectedGameId)

  // load games + players
  async function loadGames() {
    setLoadingGames(true)
    const [gRes, pRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/games`),
      fetch(`/api/leagues/${leagueId}/players`),
    ])
    const [gData, pData] = await Promise.all([gRes.json(), pRes.json()])
    setGames(gData ?? [])
    setAllPlayers(pData ?? [])
    setLoadingGames(false)
  }

  async function loadMinutes(gameId: string) {
    const res = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${gameId}`)
    if (res.ok) setMinutes(await res.json())
  }

  useEffect(() => { loadGames() }, [leagueId])

  // on game select
  useEffect(() => {
    if (!selectedGameId) return
    const g = games.find(x => x.id === selectedGameId)
    if (!g) return
    setYtInput(g.youtube_url ?? '')
    setGameStarted(g.is_started ?? false)
    resetLineup()
    // fake game object for gameStore (just needs .id)
    setCurrentGame({ id: selectedGameId } as never)
    setCurrentQuarter(1)
    loadMinutes(selectedGameId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId])

  async function saveYouTubeUrl() {
    if (!selectedGameId) return
    setSavingYt(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedGameId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ youtube_url: ytInput.trim() || null }),
    })
    setSavingYt(false)
    if (res.ok) { toast.success('YouTube URL 저장 완료'); loadGames() }
    else toast.error('저장 실패')
  }

  function handleEventSaved() {
    setStatsRefresh(k => k + 1)
    if (selectedGameId) loadMinutes(selectedGameId)
  }

  // 선발 선택 후 게임 시작
  async function startGame() {
    if (starterIds.length === 0) { toast.error('선발 선수를 1명 이상 선택하세요'); return }
    // start each starter minute interval
    await Promise.all(starterIds.map(pid =>
      fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedGameId, league_player_id: pid, quarter: currentQuarter, in_time: 0 }),
      })
    ))
    setLineup(starterIds)
    setGameStarted(true)
    setShowStarterPicker(false)
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedGameId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_started: true }),
    })
    loadGames()
  }

  async function endGame() {
    setShowComplete(true)
  }

  async function completeGame() {
    const opp = Number(oppScore)
    if (isNaN(opp) || oppScore === '') { toast.error('상대 팀 점수를 입력하세요'); return }
    const myScore = statsRefresh // placeholder — use actual pts from stats
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedGameId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_complete: true, away_score: opp }),
    })
    setShowComplete(false)
    toast.success('경기 완료 처리됨')
    loadGames()
  }

  const homeTeamPlayers = (() => {
    if (!selectedGame?.home_team) return allPlayers
    return allPlayers // for now show all — can filter by team assignment later
  })()

  if (loadingGames) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-500" /></div>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">경기 기록</h2>
        {selectedGame && gameStarted && (
          <button
            onClick={endGame}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-700 text-red-400 hover:bg-red-900/50 cursor-pointer transition-colors"
          >
            <Square size={12} />경기 종료
          </button>
        )}
      </div>

      {/* 경기 선택 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <label className="text-xs text-gray-400 font-medium">경기 선택</label>
        <select
          value={selectedGameId}
          onChange={e => setSelectedGameId(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
        >
          <option value="">-- 경기를 선택하세요 --</option>
          {games.map(g => (
            <option key={g.id} value={g.id}>
              {g.round_num}R · {g.date} · {g.home_team?.name ?? '?'} vs {g.away_team?.name ?? '?'}
              {g.is_complete ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedGame && (
        <>
          {/* YouTube URL */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-xs text-gray-400 font-medium mb-2">YouTube 영상</p>
            <div className="flex gap-2">
              <Input
                value={ytInput}
                onChange={e => setYtInput(e.target.value)}
                placeholder="https://youtu.be/..."
                className="bg-gray-800 border-gray-700 text-white text-sm flex-1"
              />
              <Button onClick={saveYouTubeUrl} disabled={savingYt} size="sm" className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0">
                {savingYt ? <Loader2 size={13} className="animate-spin" /> : '저장'}
              </Button>
            </div>
          </div>

          {/* YouTube player */}
          {selectedGame.youtube_url && (
            <YouTubePlayer
              youtubeUrl={selectedGame.youtube_url}
              startOffset={selectedGame.youtube_start_offset ?? 0}
            />
          )}

          {/* 쿼터 선택 */}
          <div className="flex gap-2">
            {QUARTERS.map(q => (
              <button
                key={q}
                onClick={() => setCurrentQuarter(q)}
                className={`flex-1 py-2 rounded-xl text-sm font-bold border cursor-pointer transition-colors ${
                  currentQuarter === q ? 'border-blue-500 bg-blue-600/20 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                }`}
              >
                Q{q}
              </button>
            ))}
            <button
              onClick={() => setCurrentQuarter(5)}
              className={`px-3 py-2 rounded-xl text-sm font-bold border cursor-pointer transition-colors ${
                currentQuarter === 5 ? 'border-orange-500 bg-orange-600/20 text-orange-300' : 'border-gray-700 bg-gray-800 text-gray-500 hover:border-gray-500'
              }`}
            >OT</button>
          </div>

          {/* 경기 시작 전 */}
          {!gameStarted && !showStarterPicker && (
            <div className="text-center py-6">
              <p className="text-gray-400 text-sm mb-3">선발 선수를 구성하고 경기를 시작하세요</p>
              <Button onClick={() => setShowStarterPicker(true)} className="bg-green-600 hover:bg-green-500 cursor-pointer">
                <Play size={14} className="mr-1.5" />경기 시작
              </Button>
            </div>
          )}

          {/* 선발 선택 */}
          {showStarterPicker && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-white">선발 선수 선택</p>
              <div className="grid grid-cols-4 gap-1.5">
                {allPlayers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setStarterIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                    className={`py-2 px-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                      starterIds.includes(p.id) ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <div className="font-mono text-[10px] text-gray-400">{p.number ?? '—'}</div>
                    <div className="truncate">{p.name}</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={startGame} className="bg-green-600 hover:bg-green-500 cursor-pointer flex-1">
                  경기 시작 ({starterIds.length}명)
                </Button>
                <Button onClick={() => setShowStarterPicker(false)} variant="outline" className="border-gray-700 text-gray-300 cursor-pointer">
                  취소
                </Button>
              </div>
            </div>
          )}

          {/* 경기 진행 중 */}
          {gameStarted && (
            <>
              {/* 모바일 탭 */}
              <div className="flex gap-1 md:hidden">
                {(['record', 'view'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setMobileTab(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                      mobileTab === t ? 'bg-gray-700 text-white' : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {t === 'record' ? '기록' : '통계'}
                  </button>
                ))}
              </div>

              <div className="md:grid md:grid-cols-2 md:gap-4 space-y-4 md:space-y-0">
                {/* 기록 패드 */}
                <div className={mobileTab === 'record' ? 'block' : 'hidden md:block'}>
                  <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-5">
                    <LeagueEventInputPad
                      leagueId={leagueId}
                      gameId={selectedGameId}
                      players={allPlayers}
                      leagueHeaders={leagueHeaders}
                      onEventSaved={handleEventSaved}
                    />
                    <div className="border-t border-gray-800 pt-4">
                      <LeagueSubstitutionPanel
                        leagueId={leagueId}
                        gameId={selectedGameId}
                        players={allPlayers}
                        minutes={minutes}
                        leagueHeaders={leagueHeaders}
                        onSubstitution={handleEventSaved}
                      />
                    </div>
                  </div>
                </div>

                {/* 실시간 스탯 */}
                <div className={mobileTab === 'view' ? 'block' : 'hidden md:block'}>
                  <LeagueStatsPanel
                    leagueId={leagueId}
                    gameId={selectedGameId}
                    players={allPlayers}
                    refreshKey={statsRefresh}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 경기 종료 모달 */}
      {showComplete && (
        <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-white text-lg">경기 종료</h3>
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400">상대 팀 최종 점수</label>
              <Input
                type="number"
                value={oppScore}
                onChange={e => setOppScore(e.target.value)}
                placeholder="0"
                className="bg-gray-800 border-gray-700 text-white text-center text-xl font-mono"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={completeGame} className="flex-1 bg-blue-600 hover:bg-blue-500 cursor-pointer">확인</Button>
              <Button onClick={() => setShowComplete(false)} variant="outline" className="border-gray-700 text-gray-300 cursor-pointer">취소</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
