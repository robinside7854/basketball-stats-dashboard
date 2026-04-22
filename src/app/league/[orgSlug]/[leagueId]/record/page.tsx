'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Lock, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react'
import type { LeagueGame, LeagueTeam } from '@/types/league'

type GameWithTeams = LeagueGame & { home_team?: LeagueTeam; away_team?: LeagueTeam }

type RoundGroup = { round: number; games: GameWithTeams[] }

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
          <p className="text-gray-400 text-sm mt-1">경기 결과 입력은 편집 모드에서만 가능합니다</p>
        </div>
        <button
          onClick={openPinModal}
          className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          PIN 입력
        </button>
      </div>
    )
  }

  return <RecordInner leagueId={leagueId} leagueHeaders={leagueHeaders} />
}

function RecordInner({ leagueId, leagueHeaders }: { leagueId: string; leagueHeaders: Record<string, string> }) {
  const [games, setGames] = useState<GameWithTeams[]>([])
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set([1]))

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/games`)
    if (res.ok) {
      const data: GameWithTeams[] = await res.json()
      setGames(data)
      // init score inputs from existing data
      const init: Record<string, { home: string; away: string }> = {}
      data.forEach(g => {
        init[g.id] = {
          home: g.is_complete ? String(g.home_score) : '',
          away: g.is_complete ? String(g.away_score) : '',
        }
      })
      setScores(init)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [leagueId])

  async function saveGame(game: GameWithTeams) {
    const s = scores[game.id]
    const home = Number(s?.home ?? '')
    const away = Number(s?.away ?? '')
    if (isNaN(home) || isNaN(away) || s?.home === '' || s?.away === '') {
      toast.error('점수를 입력하세요')
      return
    }
    setSaving(game.id)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${game.id}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ home_score: home, away_score: away, is_complete: true }),
    })
    setSaving(null)
    if (res.ok) { toast.success('저장 완료'); load() }
    else toast.error('저장 실패')
  }

  async function resetGame(game: GameWithTeams) {
    if (!confirm('이 경기 결과를 초기화하시겠습니까?')) return
    setSaving(game.id)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${game.id}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ home_score: 0, away_score: 0, is_complete: false }),
    })
    setSaving(null)
    if (res.ok) {
      setScores(prev => ({ ...prev, [game.id]: { home: '', away: '' } }))
      load()
    } else toast.error('초기화 실패')
  }

  function toggleRound(round: number) {
    setOpenRounds(prev => {
      const next = new Set(prev)
      if (next.has(round)) next.delete(round)
      else next.add(round)
      return next
    })
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 size={24} className="animate-spin text-gray-500" />
    </div>
  )

  if (games.length === 0) return (
    <div className="text-center py-12 text-gray-500">
      <p className="text-sm">생성된 일정이 없습니다</p>
      <p className="text-xs mt-1">어드민 설정 페이지에서 일정을 먼저 생성하세요</p>
    </div>
  )

  // round grouping
  const rounds: RoundGroup[] = []
  const roundMap: Record<number, GameWithTeams[]> = {}
  games.forEach(g => {
    if (!roundMap[g.round_num]) roundMap[g.round_num] = []
    roundMap[g.round_num].push(g)
  })
  Object.entries(roundMap).forEach(([r, gs]) => rounds.push({ round: Number(r), games: gs }))
  rounds.sort((a, b) => a.round - b.round)

  const completedCount = games.filter(g => g.is_complete).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">경기 기록</h2>
          <p className="text-gray-500 text-sm">{completedCount}/{games.length}경기 완료</p>
        </div>
      </div>

      <div className="space-y-3">
        {rounds.map(({ round, games: rGames }) => {
          const allComplete = rGames.every(g => g.is_complete)
          const open = openRounds.has(round)
          return (
            <div key={round} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <button
                onClick={() => toggleRound(round)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-800/50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white text-sm">{round}라운드</span>
                  {allComplete && <Check size={14} className="text-green-400" />}
                </div>
                <div className="flex items-center gap-2 text-gray-500">
                  <span className="text-xs">{rGames.filter(g => g.is_complete).length}/{rGames.length}</span>
                  {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
              </button>

              {open && (
                <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                  {rGames.map(game => {
                    const s = scores[game.id] ?? { home: '', away: '' }
                    const isSaving = saving === game.id
                    return (
                      <div key={game.id} className="px-5 py-4 space-y-3">
                        <div className="text-xs text-gray-500">{game.date}</div>
                        <div className="flex items-center gap-3">
                          {/* Home */}
                          <div className="flex-1 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {game.home_team?.color && (
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: game.home_team.color }} />
                              )}
                              <span className="text-sm font-medium text-white">{game.home_team?.name ?? '홈'}</span>
                            </div>
                          </div>

                          {/* Score inputs */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Input
                              type="number"
                              min={0}
                              value={s.home}
                              onChange={e => setScores(prev => ({
                                ...prev,
                                [game.id]: { ...prev[game.id], home: e.target.value }
                              }))}
                              className="w-14 text-center bg-gray-800 border-gray-700 text-white font-mono text-lg"
                              placeholder="0"
                            />
                            <span className="text-gray-600 font-bold">:</span>
                            <Input
                              type="number"
                              min={0}
                              value={s.away}
                              onChange={e => setScores(prev => ({
                                ...prev,
                                [game.id]: { ...prev[game.id], away: e.target.value }
                              }))}
                              className="w-14 text-center bg-gray-800 border-gray-700 text-white font-mono text-lg"
                              placeholder="0"
                            />
                          </div>

                          {/* Away */}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {game.away_team?.color && (
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: game.away_team.color }} />
                              )}
                              <span className="text-sm font-medium text-white">{game.away_team?.name ?? '어웨이'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2 justify-end">
                          {game.is_complete && (
                            <button
                              onClick={() => resetGame(game)}
                              disabled={isSaving}
                              className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              초기화
                            </button>
                          )}
                          <Button
                            onClick={() => saveGame(game)}
                            disabled={isSaving}
                            size="sm"
                            className={`text-xs cursor-pointer ${game.is_complete ? 'bg-green-700 hover:bg-green-600' : 'bg-blue-600 hover:bg-blue-500'}`}
                          >
                            {isSaving
                              ? <Loader2 size={12} className="animate-spin mr-1" />
                              : game.is_complete ? <Check size={12} className="mr-1" /> : null}
                            {game.is_complete ? '수정' : '저장'}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
