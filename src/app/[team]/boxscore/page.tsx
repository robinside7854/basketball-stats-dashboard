'use client'
import { useEffect, useState } from 'react'
import { useTeam } from '@/contexts/TeamContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PlayerDetailModal from '@/components/roster/PlayerDetailModal'
import type { Tournament, Game, PlayerBoxScore } from '@/types/database'

type SortKey = 'player_number' | 'pts' | 'fg_pct' | 'fg3_pct' | 'ft_pct' | 'oreb' | 'dreb' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'efg_pct' | 'ts_pct'

type AwardEntry = { player_id: string; player_name: string; reason: string }
type MvpResult = {
  mvp: AwardEntry
  x_factor: AwardEntry | null
}
type SeasonSortKey = SortKey | 'pts_avg' | 'reb_avg' | 'ast_avg'
type ViewMode = 'game' | 'season'

type SeasonBoxScore = PlayerBoxScore & { pts_avg: number; reb_avg: number; ast_avg: number; games_played: number }

type GameSummary = {
  game_id: string
  date: string
  opponent: string
  our_score: number
  opponent_score: number
  round: string | null
  totals: Partial<PlayerBoxScore>
  team_quarter_pts: Record<number, number>
}

type GameBoxData = {
  boxScores: PlayerBoxScore[]
  teamTotals: Partial<PlayerBoxScore>
  quarterPts: Record<string, Record<number, number>>
}

function Pct({ val }: { val: number }) {
  return <span className={val >= 50 ? 'text-green-400' : val > 0 ? 'text-yellow-400' : 'text-gray-500'}>{val > 0 ? val.toFixed(1) : '-'}</span>
}

export default function BoxScorePage() {
  const team = useTeam()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('game')

  // 멀티 오픈: 여러 경기 동시 펼침
  const [expandedGIds, setExpandedGIds] = useState<Set<string>>(new Set())
  const [gameData, setGameData] = useState<Record<string, GameBoxData | 'loading'>>({})

  const [sortKey, setSortKey] = useState<SortKey>('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [playerModal, setPlayerModal] = useState<string | null>(null)
  const [mvpResults, setMvpResults] = useState<Record<string, MvpResult | 'loading' | 'error'>>({})

  // 전체 AI 생성 상태
  const [generatingAll, setGeneratingAll] = useState(false)
  const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null)

  async function toggleExpand(gameId: string) {
    // 이미 펼쳐진 경기는 닫기
    if (expandedGIds.has(gameId)) {
      setExpandedGIds(prev => { const n = new Set(prev); n.delete(gameId); return n })
      return
    }
    // 새로 펼치기
    setExpandedGIds(prev => new Set([...prev, gameId]))

    // 박스스코어 데이터 로드 (처음 펼칠 때만)
    if (!gameData[gameId]) {
      setGameData(prev => ({ ...prev, [gameId]: 'loading' }))
      try {
        const d = await fetch(`/api/stats/${gameId}`).then(r => r.json())
        setGameData(prev => ({
          ...prev,
          [gameId]: {
            boxScores: d.boxScores || [],
            teamTotals: d.teamTotals || {},
            quarterPts: d.quarterPts || {},
          },
        }))
      } catch {
        setGameData(prev => ({ ...prev, [gameId]: { boxScores: [], teamTotals: {}, quarterPts: {} } }))
      }
    }

    // 저장된 MVP 자동 로드 (캐시만, AI 실행 안 함)
    if (!mvpResults[gameId]) {
      fetch(`/api/ai/mvp?gameId=${gameId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setMvpResults(prev => ({ ...prev, [gameId]: data })) })
        .catch(() => {})
    }
  }

  async function fetchMvp(gameId: string) {
    setMvpResults(prev => ({ ...prev, [gameId]: 'loading' }))
    try {
      const res = await fetch(`/api/ai/mvp?gameId=${gameId}`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? '오류 발생')
      }
      const data: MvpResult = await res.json()
      setMvpResults(prev => ({ ...prev, [gameId]: data }))
    } catch (err) {
      console.error(err)
      setMvpResults(prev => ({ ...prev, [gameId]: 'error' }))
    }
  }

  async function resetMvp(gameId: string) {
    await fetch(`/api/ai/mvp?gameId=${gameId}`, { method: 'DELETE' })
    setMvpResults(prev => { const n = { ...prev }; delete n[gameId]; return n })
  }

  async function generateAllMvp() {
    const pendingGames = games.filter(g => !mvpResults[g.id] || mvpResults[g.id] === 'error')
    if (pendingGames.length === 0) return
    setGeneratingAll(true)
    setGenProgress({ current: 0, total: pendingGames.length })
    for (let i = 0; i < pendingGames.length; i++) {
      setGenProgress({ current: i + 1, total: pendingGames.length })
      await fetchMvp(pendingGames[i].id)
    }
    setGeneratingAll(false)
    setGenProgress(null)
  }

  const [seasonScores, setSeasonScores] = useState<SeasonBoxScore[]>([])
  const [seasonTotals, setSeasonTotals] = useState<Partial<PlayerBoxScore>>({})
  const [seasonSortKey, setSeasonSortKey] = useState<SeasonSortKey>('pts')
  const [seasonSortDir, setSeasonSortDir] = useState<'asc' | 'desc'>('desc')
  const [totalGames, setTotalGames] = useState(0)
  const [gameSummaries, setGameSummaries] = useState<GameSummary[]>([])

  useEffect(() => { fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(setTournaments) }, [team])

  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
    if (viewMode === 'season') {
      fetch(`/api/stats/season?tournamentId=${selectedTId}&team=${team}`).then(r => r.json()).then(d => {
        setSeasonScores(d.players || [])
        setSeasonTotals(d.teamTotals || {})
        setTotalGames(d.total_games ?? 0)
        setGameSummaries(d.game_summaries || [])
      })
    }
  }, [selectedTId, viewMode, team])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleSeasonSort(key: SeasonSortKey) {
    if (seasonSortKey === key) setSeasonSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSeasonSortKey(key); setSeasonSortDir('desc') }
  }

  const seasonSorted = [...seasonScores].sort((a, b) => {
    const av = a[seasonSortKey as keyof SeasonBoxScore] as number
    const bv = b[seasonSortKey as keyof SeasonBoxScore] as number
    return seasonSortDir === 'desc' ? bv - av : av - bv
  })

  function SortTh({ label, k, className }: { label: string; k?: SortKey; className?: string }) {
    if (!k) return <th className={`px-2 py-2 border-b border-gray-700 font-medium whitespace-nowrap ${className ?? ''}`}>{label}</th>
    const active = sortKey === k
    return (
      <th
        className={`px-2 py-2 border-b border-gray-700 font-medium whitespace-nowrap cursor-pointer select-none hover:text-white transition-colors ${active ? 'text-blue-400' : ''} ${className ?? ''}`}
        onClick={() => handleSort(k)}
      >
        {label}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  function SeasonSortTh({ label, k, className }: { label: string; k?: SeasonSortKey; className?: string }) {
    if (!k) return <th className={`px-2 py-2 border-b border-gray-700 font-medium whitespace-nowrap ${className ?? ''}`}>{label}</th>
    const active = seasonSortKey === k
    return (
      <th
        className={`px-2 py-2 border-b border-gray-700 font-medium whitespace-nowrap cursor-pointer select-none hover:text-white transition-colors ${active ? 'text-blue-400' : ''} ${className ?? ''}`}
        onClick={() => handleSeasonSort(k)}
      >
        {label}{active ? (seasonSortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  const selT = tournaments.find(t => t.id === selectedTId)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex rounded-lg overflow-hidden border border-gray-700">
          <button
            onClick={() => setViewMode('game')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'game' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            경기별
          </button>
          <button
            onClick={() => setViewMode('season')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${viewMode === 'season' ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
          >
            대회 전체
          </button>
        </div>

        <Select
          key={`t-${tournaments.map(t => t.id).join('')}`}
          value={selectedTId}
          onValueChange={v => {
            setSelectedTId(v ?? '')
            setExpandedGIds(new Set())
            setGameData({})
            setMvpResults({})
          }}
        >
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
            <SelectValue placeholder="대회 선택">{selT ? `${selT.name} (${selT.year})` : undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>

        {/* 전체 AI 생성 버튼 */}
        {viewMode === 'game' && selectedTId && games.length > 0 && (
          <button
            onClick={generateAllMvp}
            disabled={generatingAll}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all
              ${generatingAll
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-yellow-600/20 to-purple-600/20 border-yellow-700/40 text-yellow-300 hover:from-yellow-600/40 hover:to-purple-600/40 cursor-pointer'
              }`}
          >
            {generatingAll ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                {genProgress ? `${genProgress.current}/${genProgress.total} 생성 중...` : '준비 중...'}
              </>
            ) : (
              <>
                <span>✦</span> 전체 AI 선정
              </>
            )}
          </button>
        )}
      </div>

      {viewMode === 'game' && selectedTId && games.length > 0 && (() => {
        const ROUND_ORDER: Record<string, number> = { '결승': 0, '4강': 1, '8강': 2, '16강': 3, '조별예선': 4 }
        const knockout = ['결승', '4강', '8강', '16강']
        const groupRounds = [...new Set(games.map(g => g.round ?? '친선'))]
          .sort((a, b) => (ROUND_ORDER[a] ?? 5) - (ROUND_ORDER[b] ?? 5))

        function GameCardWithScore({ g }: { g: Game }) {
          const isWin = g.our_score > g.opponent_score
          const isDraw = g.our_score === g.opponent_score
          const isExpanded = expandedGIds.has(g.id)
          const gData = gameData[g.id]
          const isLoading = gData === 'loading'
          const boxScores = (!isLoading && gData) ? gData.boxScores : []
          const teamTotals = (!isLoading && gData) ? gData.teamTotals : {}
          const quarterPts = (!isLoading && gData) ? gData.quarterPts : {}

          const sorted = [...boxScores].sort((a, b) => {
            const av = a[sortKey] as number, bv = b[sortKey] as number
            return sortDir === 'desc' ? bv - av : av - bv
          })

          return (
            <div>
              <button
                onClick={() => toggleExpand(g.id)}
                className={`flex items-center gap-4 px-5 py-3 rounded-xl border text-left w-full transition-all
                  ${isExpanded
                    ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-900/20 rounded-b-none border-b-0'
                    : 'bg-gray-900 border-gray-800 hover:border-gray-600'
                  }`}
              >
                <span className={`text-sm font-bold px-2 py-1 rounded-lg shrink-0 min-w-[2.5rem] text-center
                  ${isWin ? 'bg-green-900/60 text-green-400' : isDraw ? 'bg-gray-700 text-gray-400' : 'bg-red-900/60 text-red-400'}`}>
                  {isWin ? '승' : isDraw ? '무' : '패'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-gray-500 mb-0.5">{g.date}</div>
                  <div className="text-base font-semibold text-white truncate">
                    vs <span className="text-gray-200">{g.opponent}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* MVP 수상 배지 표시 */}
                  {mvpResults[g.id] && mvpResults[g.id] !== 'loading' && mvpResults[g.id] !== 'error' && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-yellow-500">🏅</span>
                      <span className="text-xs text-purple-400">⚡</span>
                    </div>
                  )}
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black">
                      <span className={isWin ? 'text-green-400' : isDraw ? 'text-gray-300' : 'text-red-400'}>{g.our_score}</span>
                      <span className="text-gray-700 mx-1.5 font-normal text-base">-</span>
                      <span className="text-gray-400">{g.opponent_score}</span>
                    </div>
                  </div>
                  <span className={`text-gray-500 text-xs transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </button>

              {isExpanded && (
                <div className="border border-blue-500 border-t-0 rounded-b-xl bg-gray-950 p-3 overflow-x-auto">
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
                      <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      로딩 중...
                    </div>
                  ) : boxScores.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">기록된 데이터가 없습니다</div>
                  ) : (
                    <>
                      <table className="w-full text-sm text-center border-collapse">
                        <thead>
                          <tr className="bg-gray-800 text-gray-400">
                            <SortTh label="#"    k="player_number" className="text-left" />
                            <SortTh label="이름"                   className="text-left" />
                            <SortTh label="PTS"  k="pts" />
                            <SortTh label="Q1" />
                            <SortTh label="Q2" />
                            <SortTh label="Q3" />
                            <SortTh label="Q4" />
                            <SortTh label="OT" />
                            <SortTh label="FG" />
                            <SortTh label="FG%"  k="fg_pct" />
                            <SortTh label="3P" />
                            <SortTh label="3P%"  k="fg3_pct" />
                            <SortTh label="FT" />
                            <SortTh label="FT%"  k="ft_pct" />
                            <SortTh label="OR"   k="oreb" />
                            <SortTh label="DR"   k="dreb" />
                            <SortTh label="REB"  k="reb" />
                            <SortTh label="AST"  k="ast" />
                            <SortTh label="STL"  k="stl" />
                            <SortTh label="BLK"  k="blk" />
                            <SortTh label="TOV"  k="tov" />
                            <SortTh label="PF"   k="pf" />
                            <SortTh label="eFG%" k="efg_pct" />
                            <SortTh label="TS%"  k="ts_pct" />
                          </tr>
                        </thead>
                        <tbody>
                          {sorted.map(s => (
                            <tr key={s.player_id} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                              <td className="px-2 py-2 font-bold text-blue-400 text-left">{s.player_number}</td>
                              <td className="px-2 py-2 text-left font-medium whitespace-nowrap">
                                <button onClick={() => setPlayerModal(s.player_id)} className="hover:text-blue-400 hover:underline underline-offset-2 transition-colors cursor-pointer">
                                  {s.player_name}
                                </button>
                                {s.double_double && <span className="ml-1 text-xs bg-yellow-600 px-1 rounded">DD</span>}
                                {s.triple_double && <span className="ml-1 text-xs bg-blue-600 px-1 rounded">TD</span>}
                              </td>
                              <td className={`px-2 py-2 font-bold ${sortKey === 'pts' ? 'text-blue-300' : 'text-white'}`}>{s.pts}</td>
                              <td className="px-2 py-2 text-gray-400 text-xs">{quarterPts[s.player_id]?.[1] || '-'}</td>
                              <td className="px-2 py-2 text-gray-400 text-xs">{quarterPts[s.player_id]?.[2] || '-'}</td>
                              <td className="px-2 py-2 text-gray-400 text-xs">{quarterPts[s.player_id]?.[3] || '-'}</td>
                              <td className="px-2 py-2 text-gray-400 text-xs">{quarterPts[s.player_id]?.[4] || '-'}</td>
                              <td className="px-2 py-2 text-gray-400 text-xs">{quarterPts[s.player_id]?.[5] || '-'}</td>
                              <td className="px-2 py-2 text-gray-300">{s.fgm}-{s.fga}</td>
                              <td className="px-2 py-2"><Pct val={s.fg_pct} /></td>
                              <td className="px-2 py-2 text-gray-300">{s.fg3m}-{s.fg3a}</td>
                              <td className="px-2 py-2"><Pct val={s.fg3_pct} /></td>
                              <td className="px-2 py-2 text-gray-300">{s.ftm}-{s.fta}</td>
                              <td className="px-2 py-2"><Pct val={s.ft_pct} /></td>
                              <td className="px-2 py-2">{s.oreb}</td>
                              <td className="px-2 py-2">{s.dreb}</td>
                              <td className={`px-2 py-2 font-medium ${sortKey === 'reb' ? 'text-blue-300' : ''}`}>{s.reb}</td>
                              <td className={`px-2 py-2 font-medium ${sortKey === 'ast' ? 'text-blue-300' : 'text-blue-400'}`}>{s.ast}</td>
                              <td className={`px-2 py-2 ${sortKey === 'stl' ? 'text-blue-300' : 'text-green-400'}`}>{s.stl}</td>
                              <td className={`px-2 py-2 ${sortKey === 'blk' ? 'text-blue-300' : 'text-indigo-400'}`}>{s.blk}</td>
                              <td className={`px-2 py-2 ${sortKey === 'tov' ? 'text-blue-300' : 'text-red-400'}`}>{s.tov}</td>
                              <td className="px-2 py-2 text-yellow-600">{s.pf}</td>
                              <td className="px-2 py-2"><Pct val={s.efg_pct} /></td>
                              <td className="px-2 py-2"><Pct val={s.ts_pct} /></td>
                            </tr>
                          ))}
                          <tr className="bg-gray-800 font-bold border-t-2 border-blue-500">
                            <td colSpan={2} className="px-2 py-2 text-left text-blue-400">팀 합계</td>
                            <td className="px-2 py-2 text-white">{teamTotals.pts ?? 0}</td>
                            {[1,2,3,4,5].map(q => {
                              const qTotal = Object.values(quarterPts).reduce((sum, pMap) => sum + (pMap[q] || 0), 0)
                              return <td key={q} className="px-2 py-2 text-gray-300 text-xs">{qTotal || '-'}</td>
                            })}
                            <td className="px-2 py-2">{teamTotals.fgm ?? 0}-{teamTotals.fga ?? 0}</td>
                            <td className="px-2 py-2"><Pct val={teamTotals.fga ? Math.round((teamTotals.fgm! / teamTotals.fga!) * 1000) / 10 : 0} /></td>
                            <td className="px-2 py-2">{teamTotals.fg3m ?? 0}-{teamTotals.fg3a ?? 0}</td>
                            <td className="px-2 py-2"><Pct val={teamTotals.fg3a ? Math.round((teamTotals.fg3m! / teamTotals.fg3a!) * 1000) / 10 : 0} /></td>
                            <td className="px-2 py-2">{teamTotals.ftm ?? 0}-{teamTotals.fta ?? 0}</td>
                            <td className="px-2 py-2"><Pct val={teamTotals.fta ? Math.round((teamTotals.ftm! / teamTotals.fta!) * 1000) / 10 : 0} /></td>
                            <td className="px-2 py-2">{teamTotals.oreb ?? 0}</td>
                            <td className="px-2 py-2">{teamTotals.dreb ?? 0}</td>
                            <td className="px-2 py-2">{teamTotals.reb ?? 0}</td>
                            <td className="px-2 py-2 text-blue-400">{teamTotals.ast ?? 0}</td>
                            <td className="px-2 py-2 text-green-400">{teamTotals.stl ?? 0}</td>
                            <td className="px-2 py-2 text-indigo-400">{teamTotals.blk ?? 0}</td>
                            <td className="px-2 py-2 text-red-400">{teamTotals.tov ?? 0}</td>
                            <td className="px-2 py-2 text-yellow-600">{teamTotals.pf ?? 0}</td>
                            <td colSpan={2} />
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-xs text-gray-600 mt-2">헤더 클릭 시 해당 스탯 기준 정렬 (↓ 내림차순 / ↑ 오름차순)</p>

                      {/* ── AI MVP + X-FACTOR 선정 ── */}
                      <div className="mt-4 pt-3 border-t border-gray-800">
                        {!mvpResults[g.id] ? (
                          <button
                            onClick={() => fetchMvp(g.id)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-yellow-600/30 to-purple-600/30 border border-yellow-700/40 text-yellow-300 text-sm font-medium hover:from-yellow-600/50 hover:to-purple-600/50 transition-all cursor-pointer"
                          >
                            <span>✦</span> AI MVP + X-FACTOR 선정
                          </button>
                        ) : mvpResults[g.id] === 'loading' ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
                            <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            AI 분석 중...
                          </div>
                        ) : mvpResults[g.id] === 'error' ? (
                          <div className="flex items-center gap-3">
                            <p className="text-sm text-red-400">분석 실패</p>
                            <button onClick={() => fetchMvp(g.id)} className="text-xs text-gray-400 hover:text-white underline cursor-pointer">재시도</button>
                          </div>
                        ) : (() => {
                          const result = mvpResults[g.id] as MvpResult
                          return (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">AI 경기 시상</p>
                                <button
                                  onClick={() => resetMvp(g.id)}
                                  className="text-xs text-gray-600 hover:text-orange-400 transition-colors cursor-pointer"
                                  title="재선정 (기존 기록 삭제 후 다시 분석)"
                                >
                                  ↺ 재선정
                                </button>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* MVP 카드 */}
                                <div className="rounded-xl bg-yellow-900/20 border border-yellow-600/40 p-3.5">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-base">🏅</span>
                                    <span className="text-xs font-bold text-yellow-400 uppercase tracking-widest">MVP</span>
                                  </div>
                                  <p className="text-base font-bold text-white mb-1.5">{result.mvp.player_name}</p>
                                  <p className="text-xs text-yellow-200/70 leading-relaxed">{result.mvp.reason}</p>
                                </div>
                                {/* X-FACTOR 카드 */}
                                {result.x_factor ? (
                                  <div className="rounded-xl bg-purple-900/20 border border-purple-600/40 p-3.5">
                                    <div className="flex items-center gap-2 mb-2">
                                      <span className="text-base">⚡</span>
                                      <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">X-FACTOR</span>
                                    </div>
                                    <p className="text-base font-bold text-white mb-1.5">{result.x_factor.player_name}</p>
                                    <p className="text-xs text-purple-200/70 leading-relaxed">{result.x_factor.reason}</p>
                                  </div>
                                ) : (
                                  <div className="rounded-xl bg-gray-800/40 border border-gray-700/40 p-3.5 flex items-center justify-center">
                                    <p className="text-xs text-gray-600">X-FACTOR 해당 없음</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        }

        return (
          <div className="mb-6 space-y-6">
            {groupRounds.map(round => {
              const roundGames = games.filter(g => (g.round ?? '친선') === round)
              const isKnockout = knockout.includes(round)
              return (
                <div key={round}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full border
                      ${round === '결승' ? 'text-yellow-400 border-yellow-600 bg-yellow-900/20' :
                        isKnockout ? 'text-blue-400 border-blue-700 bg-blue-900/20' :
                        'text-gray-400 border-gray-700 bg-gray-900'}`}>
                      {round}
                    </span>
                    <div className="h-px flex-1 bg-gray-800" />
                  </div>
                  <div className="space-y-2">
                    {roundGames.map(g => <GameCardWithScore key={g.id} g={g} />)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {viewMode === 'game' && !selectedTId && (
        <div className="text-center py-16 text-gray-500">대회를 선택하면 경기 목록이 표시됩니다</div>
      )}

      {viewMode === 'season' && (
        <>
          {!selectedTId && (
            <div className="text-center py-16 text-gray-500">대회를 선택하면 전체 누적 스탯이 표시됩니다</div>
          )}

          {selectedTId && seasonScores.length === 0 && (
            <div className="text-center py-16 text-gray-500">기록된 데이터가 없습니다</div>
          )}

          {gameSummaries.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">상대별 팀 스탯</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-gray-800 text-gray-500">
                      <th className="px-2 py-1.5 text-left border-b border-gray-700">날짜</th>
                      <th className="px-2 py-1.5 text-left border-b border-gray-700">상대</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">결과</th>
                      <th className="px-2 py-1.5 border-b border-gray-700 text-yellow-400">PTS</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">Q1</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">Q2</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">Q3</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">Q4</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">OT</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">FG</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">FG%</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">3P</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">3P%</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">FT</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">FT%</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">OR</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">DR</th>
                      <th className="px-2 py-1.5 border-b border-gray-700">REB</th>
                      <th className="px-2 py-1.5 border-b border-gray-700 text-blue-400">AST</th>
                      <th className="px-2 py-1.5 border-b border-gray-700 text-green-400">STL</th>
                      <th className="px-2 py-1.5 border-b border-gray-700 text-indigo-400">BLK</th>
                      <th className="px-2 py-1.5 border-b border-gray-700 text-red-400">TOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameSummaries.map(g => {
                      const won = g.our_score > g.opponent_score
                      const fgPct = (g.totals.fga ?? 0) > 0 ? Math.round(((g.totals.fgm ?? 0) / g.totals.fga!) * 1000) / 10 : 0
                      const fg3Pct = (g.totals.fg3a ?? 0) > 0 ? Math.round(((g.totals.fg3m ?? 0) / g.totals.fg3a!) * 1000) / 10 : 0
                      return (
                        <tr key={g.game_id} className="border-b border-gray-800 hover:bg-gray-900">
                          <td className="px-2 py-1.5 text-left text-gray-400">{g.date}</td>
                          <td className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {g.round && <span className="text-gray-500 mr-1">[{g.round}]</span>}
                            {g.opponent}
                          </td>
                          <td className="px-2 py-1.5 font-bold">
                            <span className={won ? 'text-green-400' : 'text-red-400'}>{won ? 'W' : 'L'}</span>
                            <span className="text-gray-400 ml-1">{g.our_score}-{g.opponent_score}</span>
                          </td>
                          <td className="px-2 py-1.5 font-bold text-yellow-400">{g.totals.pts ?? 0}</td>
                          {[1,2,3,4,5].map(q => (
                            <td key={q} className="px-2 py-1.5 text-gray-400">{g.team_quarter_pts[q] || '-'}</td>
                          ))}
                          <td className="px-2 py-1.5 text-gray-300">{g.totals.fgm ?? 0}-{g.totals.fga ?? 0}</td>
                          <td className="px-2 py-1.5"><Pct val={fgPct} /></td>
                          <td className="px-2 py-1.5 text-gray-300">{g.totals.fg3m ?? 0}-{g.totals.fg3a ?? 0}</td>
                          <td className="px-2 py-1.5"><Pct val={fg3Pct} /></td>
                          <td className="px-2 py-1.5 text-gray-300">{g.totals.ftm ?? 0}-{g.totals.fta ?? 0}</td>
                          <td className="px-2 py-1.5"><Pct val={(g.totals.fta ?? 0) > 0 ? Math.round(((g.totals.ftm ?? 0) / g.totals.fta!) * 1000) / 10 : 0} /></td>
                          <td className="px-2 py-1.5">{g.totals.oreb ?? 0}</td>
                          <td className="px-2 py-1.5">{g.totals.dreb ?? 0}</td>
                          <td className="px-2 py-1.5">{g.totals.reb ?? 0}</td>
                          <td className="px-2 py-1.5 text-blue-400">{g.totals.ast ?? 0}</td>
                          <td className="px-2 py-1.5 text-green-400">{g.totals.stl ?? 0}</td>
                          <td className="px-2 py-1.5 text-indigo-400">{g.totals.blk ?? 0}</td>
                          <td className="px-2 py-1.5 text-red-400">{g.totals.tov ?? 0}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {seasonSorted.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-gray-400">총 <span className="text-blue-400 font-bold">{totalGames}</span>경기 · 평균은 실제 출전 경기 기준</span>
              </div>
              <table className="w-full text-sm text-center border-collapse">
                <thead>
                  <tr className="bg-gray-800 text-gray-400">
                    <SeasonSortTh label="#"    k="player_number" className="text-left" />
                    <SeasonSortTh label="이름"                   className="text-left" />
                    <th className="px-2 py-2 border-b border-gray-700 font-medium whitespace-nowrap text-gray-500">GP</th>
                    <SeasonSortTh label="PTS"  k="pts" />
                    <SeasonSortTh label="평균P" k="pts_avg" />
                    <SeasonSortTh label="FG" />
                    <SeasonSortTh label="FG%"  k="fg_pct" />
                    <SeasonSortTh label="3P" />
                    <SeasonSortTh label="3P%"  k="fg3_pct" />
                    <SeasonSortTh label="FT" />
                    <SeasonSortTh label="FT%"  k="ft_pct" />
                    <SeasonSortTh label="OR"   k="oreb" />
                    <SeasonSortTh label="DR"   k="dreb" />
                    <SeasonSortTh label="REB"  k="reb" />
                    <SeasonSortTh label="평균R" k="reb_avg" />
                    <SeasonSortTh label="AST"  k="ast" />
                    <SeasonSortTh label="평균A" k="ast_avg" />
                    <SeasonSortTh label="STL"  k="stl" />
                    <SeasonSortTh label="BLK"  k="blk" />
                    <SeasonSortTh label="TOV"  k="tov" />
                    <SeasonSortTh label="PF"   k="pf" />
                    <SeasonSortTh label="eFG%" k="efg_pct" />
                    <SeasonSortTh label="TS%"  k="ts_pct" />
                  </tr>
                </thead>
                <tbody>
                  {seasonSorted.map(s => (
                    <tr key={s.player_id} className="border-b border-gray-800 hover:bg-gray-900 transition-colors">
                      <td className="px-2 py-2 font-bold text-blue-400 text-left">{s.player_number}</td>
                      <td className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        <button onClick={() => setPlayerModal(s.player_id)} className="hover:text-blue-400 hover:underline underline-offset-2 transition-colors cursor-pointer">
                          {s.player_name}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-gray-500 text-xs">{s.games_played}</td>
                      <td className={`px-2 py-2 font-bold ${seasonSortKey === 'pts' ? 'text-blue-300' : 'text-white'}`}>{s.pts}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'pts_avg' ? 'text-blue-300 font-bold' : 'text-gray-300'}`}>{s.pts_avg}</td>
                      <td className="px-2 py-2 text-gray-300">{s.fgm}-{s.fga}</td>
                      <td className="px-2 py-2"><Pct val={s.fg_pct} /></td>
                      <td className="px-2 py-2 text-gray-300">{s.fg3m}-{s.fg3a}</td>
                      <td className="px-2 py-2"><Pct val={s.fg3_pct} /></td>
                      <td className="px-2 py-2 text-gray-300">{s.ftm}-{s.fta}</td>
                      <td className="px-2 py-2"><Pct val={s.ft_pct} /></td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'oreb' ? 'text-blue-300' : ''}`}>{s.oreb}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'dreb' ? 'text-blue-300' : ''}`}>{s.dreb}</td>
                      <td className={`px-2 py-2 font-medium ${seasonSortKey === 'reb' ? 'text-blue-300' : ''}`}>{s.reb}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'reb_avg' ? 'text-blue-300 font-bold' : 'text-gray-300'}`}>{s.reb_avg}</td>
                      <td className={`px-2 py-2 font-medium ${seasonSortKey === 'ast' ? 'text-blue-300' : 'text-blue-400'}`}>{s.ast}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'ast_avg' ? 'text-blue-300 font-bold' : 'text-blue-300'}`}>{s.ast_avg}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'stl' ? 'text-blue-300' : 'text-green-400'}`}>{s.stl}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'blk' ? 'text-blue-300' : 'text-indigo-400'}`}>{s.blk}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'tov' ? 'text-blue-300' : 'text-red-400'}`}>{s.tov}</td>
                      <td className="px-2 py-2 text-yellow-600">{s.pf}</td>
                      <td className="px-2 py-2"><Pct val={s.efg_pct} /></td>
                      <td className="px-2 py-2"><Pct val={s.ts_pct} /></td>
                    </tr>
                  ))}
                  <tr className="bg-gray-800 font-bold border-t-2 border-blue-500">
                    <td colSpan={2} className="px-2 py-2 text-left text-blue-400">팀 합계</td>
                    <td className="px-2 py-2 text-gray-500 text-xs">{totalGames}</td>
                    <td className="px-2 py-2 text-white">{seasonTotals.pts ?? 0}</td>
                    <td className="px-2 py-2 text-gray-400">{totalGames > 0 ? Math.round(((seasonTotals.pts ?? 0) / totalGames) * 10) / 10 : '-'}</td>
                    <td className="px-2 py-2">{seasonTotals.fgm ?? 0}-{seasonTotals.fga ?? 0}</td>
                    <td className="px-2 py-2"><Pct val={seasonTotals.fga ? Math.round((seasonTotals.fgm! / seasonTotals.fga!) * 1000) / 10 : 0} /></td>
                    <td className="px-2 py-2">{seasonTotals.fg3m ?? 0}-{seasonTotals.fg3a ?? 0}</td>
                    <td className="px-2 py-2"><Pct val={seasonTotals.fg3a ? Math.round((seasonTotals.fg3m! / seasonTotals.fg3a!) * 1000) / 10 : 0} /></td>
                    <td className="px-2 py-2">{seasonTotals.ftm ?? 0}-{seasonTotals.fta ?? 0}</td>
                    <td className="px-2 py-2"><Pct val={seasonTotals.fta ? Math.round((seasonTotals.ftm! / seasonTotals.fta!) * 1000) / 10 : 0} /></td>
                    <td className="px-2 py-2">{seasonTotals.oreb ?? 0}</td>
                    <td className="px-2 py-2">{seasonTotals.dreb ?? 0}</td>
                    <td className="px-2 py-2">{seasonTotals.reb ?? 0}</td>
                    <td className="px-2 py-2 text-gray-400">{totalGames > 0 ? Math.round(((seasonTotals.reb ?? 0) / totalGames) * 10) / 10 : '-'}</td>
                    <td className="px-2 py-2 text-blue-400">{seasonTotals.ast ?? 0}</td>
                    <td className="px-2 py-2 text-blue-300">{totalGames > 0 ? Math.round(((seasonTotals.ast ?? 0) / totalGames) * 10) / 10 : '-'}</td>
                    <td className="px-2 py-2 text-green-400">{seasonTotals.stl ?? 0}</td>
                    <td className="px-2 py-2 text-indigo-400">{seasonTotals.blk ?? 0}</td>
                    <td className="px-2 py-2 text-red-400">{seasonTotals.tov ?? 0}</td>
                    <td className="px-2 py-2 text-yellow-600">{seasonTotals.pf ?? 0}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
              <p className="text-xs text-gray-600 mt-2">헤더 클릭 시 해당 스탯 기준 정렬 · 평균P/R/A = 경기당 평균</p>
            </div>
          )}
        </>
      )}

      {playerModal && (
        <PlayerDetailModal
          playerId={playerModal}
          onClose={() => setPlayerModal(null)}
        />
      )}
    </div>
  )
}
