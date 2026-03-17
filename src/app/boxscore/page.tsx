'use client'
import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Tournament, Game, PlayerBoxScore } from '@/types/database'

type SortKey = 'player_number' | 'pts' | 'fg_pct' | 'fg3_pct' | 'ft_pct' | 'oreb' | 'dreb' | 'reb' | 'ast' | 'stl' | 'blk' | 'tov' | 'pf' | 'efg_pct' | 'ts_pct'
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

function Pct({ val }: { val: number }) {
  return <span className={val >= 50 ? 'text-green-400' : val > 0 ? 'text-yellow-400' : 'text-gray-500'}>{val > 0 ? val.toFixed(1) : '-'}</span>
}

export default function BoxScorePage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('game')

  // 경기별
  const [boxScores, setBoxScores] = useState<PlayerBoxScore[]>([])
  const [teamTotals, setTeamTotals] = useState<Partial<PlayerBoxScore>>({})
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [quarterPts, setQuarterPts] = useState<Record<string, Record<number, number>>>({})

  // 대회 전체
  const [seasonScores, setSeasonScores] = useState<SeasonBoxScore[]>([])
  const [seasonTotals, setSeasonTotals] = useState<Partial<PlayerBoxScore>>({})
  const [seasonSortKey, setSeasonSortKey] = useState<SeasonSortKey>('pts')
  const [seasonSortDir, setSeasonSortDir] = useState<'asc' | 'desc'>('desc')
  const [totalGames, setTotalGames] = useState(0)
  const [gameSummaries, setGameSummaries] = useState<GameSummary[]>([])

  useEffect(() => { fetch('/api/tournaments').then(r => r.json()).then(setTournaments) }, [])

  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
    if (viewMode === 'season') {
      fetch(`/api/stats/season?tournamentId=${selectedTId}`).then(r => r.json()).then(d => {
        setSeasonScores(d.players || [])
        setSeasonTotals(d.teamTotals || {})
        setTotalGames(d.total_games ?? 0)
        setGameSummaries(d.game_summaries || [])
      })
    }
  }, [selectedTId, viewMode])

  useEffect(() => {
    if (!selectedGId) return
    const g = games.find(g => g.id === selectedGId) || null
    setSelectedGame(g)
    fetch(`/api/stats/${selectedGId}`).then(r => r.json()).then(d => { setBoxScores(d.boxScores || []); setTeamTotals(d.teamTotals || {}); setQuarterPts(d.quarterPts || {}) })
  }, [selectedGId, games])

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  function handleSeasonSort(key: SeasonSortKey) {
    if (seasonSortKey === key) setSeasonSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSeasonSortKey(key); setSeasonSortDir('desc') }
  }

  const sorted = [...boxScores].sort((a, b) => {
    const av = a[sortKey] as number, bv = b[sortKey] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

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
  const selG = games.find(g => g.id === selectedGId)

  return (
    <div>
      {/* 뷰 모드 토글 + 셀렉터 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 뷰 모드 버튼 */}
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
          onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}
        >
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
            <SelectValue placeholder="대회 선택">{selT ? `${selT.name} (${selT.year})` : undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>

        {viewMode === 'game' && (
          <Select
            key={`g-${games.map(g => g.id).join('')}`}
            value={selectedGId}
            onValueChange={v => setSelectedGId(v ?? '')}
            disabled={!selectedTId}
          >
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
              <SelectValue placeholder="경기 선택">{selG ? `${selG.date} vs ${selG.opponent}` : undefined}</SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              {games.map(g => <SelectItem key={g.id} value={g.id}>{g.date} vs {g.opponent}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* ─── 경기별 뷰 ─── */}
      {viewMode === 'game' && (
        <>
          {selectedGame && (
            <div className="mb-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400 text-sm">{selectedGame.date} · {selectedGame.venue || '-'}</span>
                <div className="text-2xl font-bold">
                  <span className={selectedGame.our_score > selectedGame.opponent_score ? 'text-green-400' : 'text-red-400'}>
                    {selectedGame.our_score}
                  </span>
                  <span className="text-gray-500 mx-3">vs</span>
                  <span className="text-gray-300">{selectedGame.opponent_score}</span>
                  <span className="ml-4 text-gray-400 text-base font-normal">vs {selectedGame.opponent}</span>
                </div>
              </div>
            </div>
          )}

          {boxScores.length === 0 && selectedGId ? (
            <div className="text-center py-16 text-gray-500">기록된 데이터가 없습니다</div>
          ) : sorted.length > 0 && (
            <div className="overflow-x-auto">
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
                        {s.player_name}
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
            </div>
          )}

          {!selectedGId && (
            <div className="text-center py-16 text-gray-500">대회와 경기를 선택하면 박스스코어가 표시됩니다</div>
          )}
        </>
      )}

      {/* ─── 대회 전체 뷰 ─── */}
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
                      <td className="px-2 py-2 text-left font-medium whitespace-nowrap">{s.player_name}</td>
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
    </div>
  )
}
