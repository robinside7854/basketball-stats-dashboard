'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { sortJerseyNum } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PlayerDetailModal = dynamic(() => import('@/components/roster/PlayerDetailModal'), { ssr: false })
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
  return <span className={val >= 50 ? 'text-green-400' : val > 0 ? 'text-[var(--mm-yellow-strong)]' : 'text-[var(--mm-muted)]'}>{val > 0 ? val.toFixed(1) : '-'}</span>
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
  const [sortKey, setSortKey] = useState<SortKey>('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [quarterPts, setQuarterPts] = useState<Record<string, Record<number, number>>>({})

  const [playerModal, setPlayerModal] = useState<string | null>(null)

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
    if (sortKey === 'player_number') {
      const r = sortJerseyNum(a.player_number, b.player_number)
      return sortDir === 'desc' ? -r : r
    }
    const av = a[sortKey] as number, bv = b[sortKey] as number
    return sortDir === 'desc' ? bv - av : av - bv
  })

  const seasonSorted = [...seasonScores].sort((a, b) => {
    if (seasonSortKey === 'player_number') {
      const r = sortJerseyNum(a.player_number, b.player_number)
      return seasonSortDir === 'desc' ? -r : r
    }
    const av = a[seasonSortKey as keyof SeasonBoxScore] as number
    const bv = b[seasonSortKey as keyof SeasonBoxScore] as number
    return seasonSortDir === 'desc' ? bv - av : av - bv
  })

  function SortTh({ label, k, className }: { label: string; k?: SortKey; className?: string }) {
    if (!k) return <th className={`px-2 py-2 border-b border-[var(--mm-rule)] font-medium whitespace-nowrap ${className ?? ''}`}>{label}</th>
    const active = sortKey === k
    return (
      <th
        className={`px-2 py-2 border-b border-[var(--mm-rule)] font-medium whitespace-nowrap cursor-pointer select-none hover:text-[var(--mm-ink)] transition-colors ${active ? 'text-[var(--mm-yellow-strong)]' : ''} ${className ?? ''}`}
        onClick={() => handleSort(k)}
      >
        {label}{active ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  function SeasonSortTh({ label, k, className }: { label: string; k?: SeasonSortKey; className?: string }) {
    if (!k) return <th className={`px-2 py-2 border-b border-[var(--mm-rule)] font-medium whitespace-nowrap ${className ?? ''}`}>{label}</th>
    const active = seasonSortKey === k
    return (
      <th
        className={`px-2 py-2 border-b border-[var(--mm-rule)] font-medium whitespace-nowrap cursor-pointer select-none hover:text-[var(--mm-ink)] transition-colors ${active ? 'text-[var(--mm-yellow-strong)]' : ''} ${className ?? ''}`}
        onClick={() => handleSeasonSort(k)}
      >
        {label}{active ? (seasonSortDir === 'desc' ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  const selT = tournaments.find(t => t.id === selectedTId)

  return (
    <div>
      {/* 뷰 모드 토글 + 셀렉터 */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* 뷰 모드 버튼 */}
        <div className="flex rounded-lg overflow-hidden border border-[var(--mm-rule)]">
          <button
            onClick={() => setViewMode('game')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${viewMode === 'game' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
          >
            경기별
          </button>
          <button
            onClick={() => setViewMode('season')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer ${viewMode === 'season' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
          >
            대회 전체
          </button>
        </div>

        <Select
          key={`t-${tournaments.map(t => t.id).join('')}`}
          value={selectedTId}
          onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}
        >
          <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-52">
            <SelectValue placeholder="대회 선택">{selT ? `${selT.name} (${selT.year})` : undefined}</SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ─── 경기 카드 그리드 (경기별 모드) ─── */}
      {viewMode === 'game' && selectedTId && games.length > 0 && (() => {
        const ROUND_ORDER: Record<string, number> = { '결승': 0, '4강': 1, '8강': 2, '16강': 3, '조별예선': 4 }
        const knockout = ['결승', '4강', '8강', '16강']
        const groupRounds = [...new Set(games.map(g => g.round ?? '친선'))]
          .sort((a, b) => (ROUND_ORDER[a] ?? 5) - (ROUND_ORDER[b] ?? 5))

        function GameCardWithScore({ g }: { g: Game }) {
          const isWin = g.our_score > g.opponent_score
          const isDraw = g.our_score === g.opponent_score
          const isSelected = selectedGId === g.id

          return (
            <div>
              <button
                onClick={() => setSelectedGId(isSelected ? '' : g.id)}
                className={`flex items-center gap-4 px-5 py-3 rounded-xl border text-left w-full transition-all cursor-pointer
                  ${isSelected
                    ? 'bg-[var(--mm-yellow-soft)] border-[color:var(--mm-yellow)] shadow-lg rounded-b-none border-b-0'
                    : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] hover:border-[color:var(--mm-yellow)]/60'
                  }`}
              >
                <span className={`text-sm font-bold px-2 py-1 rounded-lg shrink-0 min-w-[2.5rem] text-center
                  ${isWin ? 'bg-[rgba(16,185,129,0.12)] text-[var(--mm-positive)]' : isDraw ? 'bg-[rgba(148,163,184,0.15)] text-[var(--mm-neutral-strong)]' : 'bg-[rgba(220,38,38,0.12)] text-[var(--mm-negative)]'}`}>
                  {isWin ? '승' : isDraw ? '무' : '패'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[var(--mm-muted)] mb-0.5">{g.date}</div>
                  <div className="text-base font-semibold text-[var(--mm-ink)] truncate">
                    vs <span className="text-[var(--mm-ink)]">{g.opponent}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black">
                      <span className={isWin ? 'text-[var(--mm-positive)]' : isDraw ? 'text-[var(--mm-neutral-strong)]' : 'text-[var(--mm-negative)]'}>{g.our_score}</span>
                      <span className="text-[var(--mm-muted)] mx-1.5 font-normal text-base">-</span>
                      <span className="text-[var(--mm-muted)]">{g.opponent_score}</span>
                    </div>
                  </div>
                  <span className={`text-[var(--mm-muted)] text-xs transition-transform ${isSelected ? 'rotate-180' : ''}`}>▼</span>
                </div>
              </button>

              {/* 인라인 박스스코어 */}
              {isSelected && (
                <div className="border border-[color:var(--mm-yellow)] border-t-0 rounded-b-xl bg-[var(--mm-ground)] p-3">
                  {boxScores.length === 0 ? (
                    <div className="text-center py-8 text-[var(--mm-muted)] text-sm">기록된 데이터가 없습니다</div>
                  ) : (
                    <>
                      {/* 모바일 카드뷰 */}
                      <div className="md:hidden space-y-2">
                        {sorted.map(s => (
                          <button key={s.player_id} onClick={() => setPlayerModal(s.player_id)}
                            className="w-full text-left bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl px-3 py-2.5 hover:bg-[var(--mm-panel-alt)] transition-colors active:bg-[var(--mm-panel-alt)]/80 cursor-pointer">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[var(--mm-ink)] font-bold font-mono text-xs w-6 shrink-0">{s.player_number}</span>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-[var(--mm-ink)] text-sm truncate">
                                  {s.player_name}
                                  {s.double_double && !s.triple_double && <span className="ml-1 text-xs bg-[var(--mm-yellow)] text-[var(--mm-black)] px-1 rounded">DD</span>}
                                  {s.triple_double && <span className="ml-1 text-xs bg-[var(--mm-ink)] text-[var(--mm-panel)] px-1 rounded">TD</span>}
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="text-2xl font-black text-[var(--mm-yellow-strong)] leading-none">{s.pts}</div>
                                <div className="text-xs text-[var(--mm-muted)] font-bold mt-0.5">PTS</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-[var(--mm-rule)]/60">
                              <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">REB</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.reb}</div></div>
                              <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">AST</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.ast}</div></div>
                              <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">FG%</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.fg_pct > 0 ? `${s.fg_pct.toFixed(0)}%` : '-'}</div></div>
                              <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">3P%</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.fg3_pct > 0 ? `${s.fg3_pct.toFixed(0)}%` : '-'}</div></div>
                            </div>
                          </button>
                        ))}
                      </div>

                      {/* 데스크탑 테이블 */}
                      <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm text-center border-collapse">
                        <thead>
                          <tr className="bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]">
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
                            <tr key={s.player_id} className="border-b border-[var(--mm-rule)] hover:bg-[var(--mm-panel-alt)] transition-colors">
                              <td className="px-2 py-2 font-bold text-[var(--mm-ink)] text-left">{s.player_number}</td>
                              <td className="px-2 py-2 text-left font-medium whitespace-nowrap">
                                <button onClick={() => setPlayerModal(s.player_id)} className="hover:text-[var(--mm-yellow-strong)] hover:underline underline-offset-2 transition-colors cursor-pointer">
                                  {s.player_name}
                                </button>
                                {s.double_double && <span className="ml-1 text-xs bg-[var(--mm-yellow)] text-[var(--mm-black)] px-1 rounded">DD</span>}
                                {s.triple_double && <span className="ml-1 text-xs bg-[var(--mm-ink)] text-[var(--mm-panel)] px-1 rounded">TD</span>}
                              </td>
                              <td className={`px-2 py-2 font-bold ${sortKey === 'pts' ? 'text-[var(--mm-yellow-strong)]' : 'text-[var(--mm-ink)]'}`}>{s.pts}</td>
                              <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{quarterPts[s.player_id]?.[1] || '-'}</td>
                              <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{quarterPts[s.player_id]?.[2] || '-'}</td>
                              <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{quarterPts[s.player_id]?.[3] || '-'}</td>
                              <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{quarterPts[s.player_id]?.[4] || '-'}</td>
                              <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{quarterPts[s.player_id]?.[5] || '-'}</td>
                              <td className="px-2 py-2 text-[var(--mm-ink)]">{s.fgm}-{s.fga}</td>
                              <td className="px-2 py-2"><Pct val={s.fg_pct} /></td>
                              <td className="px-2 py-2 text-[var(--mm-ink)]">{s.fg3m}-{s.fg3a}</td>
                              <td className="px-2 py-2"><Pct val={s.fg3_pct} /></td>
                              <td className="px-2 py-2 text-[var(--mm-ink)]">{s.ftm}-{s.fta}</td>
                              <td className="px-2 py-2"><Pct val={s.ft_pct} /></td>
                              <td className="px-2 py-2">{s.oreb}</td>
                              <td className="px-2 py-2">{s.dreb}</td>
                              <td className={`px-2 py-2 font-medium ${sortKey === 'reb' ? 'text-[var(--mm-yellow-strong)]' : ''}`}>{s.reb}</td>
                              <td className={`px-2 py-2 font-medium ${sortKey === 'ast' ? 'text-[var(--mm-yellow-strong)]' : 'text-[var(--mm-ink)]'}`}>{s.ast}</td>
                              <td className={`px-2 py-2 ${sortKey === 'stl' ? 'text-[var(--mm-yellow-strong)]' : 'text-green-400'}`}>{s.stl}</td>
                              <td className={`px-2 py-2 ${sortKey === 'blk' ? 'text-[var(--mm-yellow-strong)]' : 'text-indigo-400'}`}>{s.blk}</td>
                              <td className={`px-2 py-2 ${sortKey === 'tov' ? 'text-[var(--mm-yellow-strong)]' : 'text-red-400'}`}>{s.tov}</td>
                              <td className="px-2 py-2 text-[var(--mm-yellow-strong)]">{s.pf}</td>
                              <td className="px-2 py-2"><Pct val={s.efg_pct} /></td>
                              <td className="px-2 py-2"><Pct val={s.ts_pct} /></td>
                            </tr>
                          ))}
                          <tr className="bg-[var(--mm-panel-alt)] font-bold border-t-2 border-[var(--mm-ink)]">
                            <td colSpan={2} className="px-2 py-2 text-left text-[var(--mm-ink)]">팀 합계</td>
                            <td className="px-2 py-2 text-[var(--mm-ink)]">{teamTotals.pts ?? 0}</td>
                            {[1,2,3,4,5].map(q => {
                              const qTotal = Object.values(quarterPts).reduce((sum, pMap) => sum + (pMap[q] || 0), 0)
                              return <td key={q} className="px-2 py-2 text-[var(--mm-ink)] text-xs">{qTotal || '-'}</td>
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
                            <td className="px-2 py-2 text-[var(--mm-ink)]">{teamTotals.ast ?? 0}</td>
                            <td className="px-2 py-2 text-green-400">{teamTotals.stl ?? 0}</td>
                            <td className="px-2 py-2 text-indigo-400">{teamTotals.blk ?? 0}</td>
                            <td className="px-2 py-2 text-red-400">{teamTotals.tov ?? 0}</td>
                            <td className="px-2 py-2 text-[var(--mm-yellow-strong)]">{teamTotals.pf ?? 0}</td>
                            <td colSpan={2} />
                          </tr>
                        </tbody>
                      </table>
                      </div>
                      <p className="hidden md:block text-xs text-[var(--mm-muted)] mt-2">헤더 클릭 시 해당 스탯 기준 정렬 (↓ 내림차순 / ↑ 오름차순)</p>
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
                      ${round === '결승' ? 'text-[var(--mm-yellow-strong)] border-[color:var(--mm-yellow)] bg-[var(--mm-yellow-soft)]' :
                        isKnockout ? 'text-[var(--mm-ink)] border-[var(--mm-rule)] bg-[var(--mm-panel-alt)]' :
                        'text-[var(--mm-muted)] border-[var(--mm-rule)] bg-[var(--mm-panel)]'}`}>
                      {round}
                    </span>
                    <div className="h-px flex-1 bg-[var(--mm-rule)]" />
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
        <div className="text-center py-16 text-[var(--mm-muted)]">대회를 선택하면 경기 목록이 표시됩니다</div>
      )}

      {/* ─── 대회 전체 뷰 ─── */}
      {viewMode === 'season' && (
        <>
          {!selectedTId && (
            <div className="text-center py-16 text-[var(--mm-muted)]">대회를 선택하면 전체 누적 스탯이 표시됩니다</div>
          )}

          {selectedTId && seasonScores.length === 0 && (
            <div className="text-center py-16 text-[var(--mm-muted)]">기록된 데이터가 없습니다</div>
          )}

          {gameSummaries.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-[var(--mm-muted)] mb-2 font-semibold uppercase tracking-wide">상대별 팀 스탯</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center border-collapse">
                  <thead>
                    <tr className="bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]">
                      <th className="px-2 py-1.5 text-left border-b border-[var(--mm-rule)]">날짜</th>
                      <th className="px-2 py-1.5 text-left border-b border-[var(--mm-rule)]">상대</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">결과</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)] text-[var(--mm-yellow-strong)]">PTS</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">Q1</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">Q2</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">Q3</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">Q4</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">OT</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">FG</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">FG%</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">3P</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">3P%</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">FT</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">FT%</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">OR</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">DR</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)]">REB</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)] text-[var(--mm-ink)]">AST</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)] text-green-400">STL</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)] text-indigo-400">BLK</th>
                      <th className="px-2 py-1.5 border-b border-[var(--mm-rule)] text-red-400">TOV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameSummaries.map(g => {
                      const won = g.our_score > g.opponent_score
                      const fgPct = (g.totals.fga ?? 0) > 0 ? Math.round(((g.totals.fgm ?? 0) / g.totals.fga!) * 1000) / 10 : 0
                      const fg3Pct = (g.totals.fg3a ?? 0) > 0 ? Math.round(((g.totals.fg3m ?? 0) / g.totals.fg3a!) * 1000) / 10 : 0
                      return (
                        <tr key={g.game_id} className="border-b border-[var(--mm-rule)] hover:bg-[var(--mm-panel-alt)]">
                          <td className="px-2 py-1.5 text-left text-[var(--mm-muted)]">{g.date}</td>
                          <td className="px-2 py-1.5 text-left font-medium whitespace-nowrap">
                            {g.round && <span className="text-[var(--mm-muted)] mr-1">[{g.round}]</span>}
                            {g.opponent}
                          </td>
                          <td className="px-2 py-1.5 font-bold">
                            <span className={won ? 'text-[var(--mm-positive)]' : 'text-[var(--mm-negative)]'}>{won ? 'W' : 'L'}</span>
                            <span className="text-[var(--mm-muted)] ml-1">{g.our_score}-{g.opponent_score}</span>
                          </td>
                          <td className="px-2 py-1.5 font-bold text-[var(--mm-yellow-strong)]">{g.totals.pts ?? 0}</td>
                          {[1,2,3,4,5].map(q => (
                            <td key={q} className="px-2 py-1.5 text-[var(--mm-muted)]">{g.team_quarter_pts[q] || '-'}</td>
                          ))}
                          <td className="px-2 py-1.5 text-[var(--mm-ink)]">{g.totals.fgm ?? 0}-{g.totals.fga ?? 0}</td>
                          <td className="px-2 py-1.5"><Pct val={fgPct} /></td>
                          <td className="px-2 py-1.5 text-[var(--mm-ink)]">{g.totals.fg3m ?? 0}-{g.totals.fg3a ?? 0}</td>
                          <td className="px-2 py-1.5"><Pct val={fg3Pct} /></td>
                          <td className="px-2 py-1.5 text-[var(--mm-ink)]">{g.totals.ftm ?? 0}-{g.totals.fta ?? 0}</td>
                          <td className="px-2 py-1.5"><Pct val={(g.totals.fta ?? 0) > 0 ? Math.round(((g.totals.ftm ?? 0) / g.totals.fta!) * 1000) / 10 : 0} /></td>
                          <td className="px-2 py-1.5">{g.totals.oreb ?? 0}</td>
                          <td className="px-2 py-1.5">{g.totals.dreb ?? 0}</td>
                          <td className="px-2 py-1.5">{g.totals.reb ?? 0}</td>
                          <td className="px-2 py-1.5 text-[var(--mm-ink)]">{g.totals.ast ?? 0}</td>
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
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm text-[var(--mm-muted)]">총 <span className="text-[var(--mm-ink)] font-bold">{totalGames}</span>경기 · 평균은 실제 출전 경기 기준</span>
              </div>
              {/* 모바일 카드뷰 */}
              <div className="md:hidden space-y-2">
                {seasonSorted.map(s => (
                  <button key={s.player_id} onClick={() => setPlayerModal(s.player_id)}
                    className="w-full text-left bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl px-3 py-2.5 hover:bg-[var(--mm-panel-alt)] transition-colors active:bg-[var(--mm-panel-alt)]/80 cursor-pointer">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[var(--mm-ink)] font-bold font-mono text-xs w-6 shrink-0">{s.player_number}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[var(--mm-ink)] text-sm truncate">{s.player_name}</div>
                        <div className="text-[var(--mm-muted)] text-xs">GP {s.games_played}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-2xl font-black text-[var(--mm-yellow-strong)] leading-none">{s.pts_avg}</div>
                        <div className="text-xs text-[var(--mm-muted)] font-bold mt-0.5">PPG</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-[var(--mm-rule)]/60">
                      <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">RPG</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.reb_avg}</div></div>
                      <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">APG</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.ast_avg}</div></div>
                      <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">FG%</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.fg_pct > 0 ? `${s.fg_pct.toFixed(0)}%` : '-'}</div></div>
                      <div className="text-center"><div className="text-xs text-[var(--mm-muted)]">3P%</div><div className="text-xs font-bold text-[var(--mm-ink)]">{s.fg3_pct > 0 ? `${s.fg3_pct.toFixed(0)}%` : '-'}</div></div>
                    </div>
                  </button>
                ))}
              </div>
              {/* 데스크탑 테이블 */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm text-center border-collapse">
                <thead>
                  <tr className="bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]">
                    <SeasonSortTh label="#"    k="player_number" className="text-left" />
                    <SeasonSortTh label="이름"                   className="text-left" />
                    <th className="px-2 py-2 border-b border-[var(--mm-rule)] font-medium whitespace-nowrap text-[var(--mm-muted)]">GP</th>
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
                    <tr key={s.player_id} className="border-b border-[var(--mm-rule)] hover:bg-[var(--mm-panel-alt)] transition-colors">
                      <td className="px-2 py-2 font-bold text-[var(--mm-ink)] text-left">{s.player_number}</td>
                      <td className="px-2 py-2 text-left font-medium whitespace-nowrap">
                        <button onClick={() => setPlayerModal(s.player_id)} className="hover:text-[var(--mm-yellow-strong)] hover:underline underline-offset-2 transition-colors cursor-pointer">
                          {s.player_name}
                        </button>
                      </td>
                      <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{s.games_played}</td>
                      <td className={`px-2 py-2 font-bold ${seasonSortKey === 'pts' ? 'text-[var(--mm-yellow-strong)]' : 'text-[var(--mm-ink)]'}`}>{s.pts}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'pts_avg' ? 'text-[var(--mm-yellow-strong)] font-bold' : 'text-[var(--mm-ink)]'}`}>{s.pts_avg}</td>
                      <td className="px-2 py-2 text-[var(--mm-ink)]">{s.fgm}-{s.fga}</td>
                      <td className="px-2 py-2"><Pct val={s.fg_pct} /></td>
                      <td className="px-2 py-2 text-[var(--mm-ink)]">{s.fg3m}-{s.fg3a}</td>
                      <td className="px-2 py-2"><Pct val={s.fg3_pct} /></td>
                      <td className="px-2 py-2 text-[var(--mm-ink)]">{s.ftm}-{s.fta}</td>
                      <td className="px-2 py-2"><Pct val={s.ft_pct} /></td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'oreb' ? 'text-[var(--mm-yellow-strong)]' : ''}`}>{s.oreb}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'dreb' ? 'text-[var(--mm-yellow-strong)]' : ''}`}>{s.dreb}</td>
                      <td className={`px-2 py-2 font-medium ${seasonSortKey === 'reb' ? 'text-[var(--mm-yellow-strong)]' : ''}`}>{s.reb}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'reb_avg' ? 'text-[var(--mm-yellow-strong)] font-bold' : 'text-[var(--mm-ink)]'}`}>{s.reb_avg}</td>
                      <td className={`px-2 py-2 font-medium ${seasonSortKey === 'ast' ? 'text-[var(--mm-yellow-strong)]' : 'text-[var(--mm-ink)]'}`}>{s.ast}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'ast_avg' ? 'text-[var(--mm-yellow-strong)] font-bold' : 'text-[var(--mm-ink)]'}`}>{s.ast_avg}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'stl' ? 'text-[var(--mm-yellow-strong)]' : 'text-green-400'}`}>{s.stl}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'blk' ? 'text-[var(--mm-yellow-strong)]' : 'text-indigo-400'}`}>{s.blk}</td>
                      <td className={`px-2 py-2 ${seasonSortKey === 'tov' ? 'text-[var(--mm-yellow-strong)]' : 'text-red-400'}`}>{s.tov}</td>
                      <td className="px-2 py-2 text-[var(--mm-yellow-strong)]">{s.pf}</td>
                      <td className="px-2 py-2"><Pct val={s.efg_pct} /></td>
                      <td className="px-2 py-2"><Pct val={s.ts_pct} /></td>
                    </tr>
                  ))}
                  <tr className="bg-[var(--mm-panel-alt)] font-bold border-t-2 border-[var(--mm-ink)]">
                    <td colSpan={2} className="px-2 py-2 text-left text-[var(--mm-ink)]">팀 합계</td>
                    <td className="px-2 py-2 text-[var(--mm-muted)] text-xs">{totalGames}</td>
                    <td className="px-2 py-2 text-[var(--mm-ink)]">{seasonTotals.pts ?? 0}</td>
                    <td className="px-2 py-2 text-[var(--mm-muted)]">{totalGames > 0 ? Math.round(((seasonTotals.pts ?? 0) / totalGames) * 10) / 10 : '-'}</td>
                    <td className="px-2 py-2">{seasonTotals.fgm ?? 0}-{seasonTotals.fga ?? 0}</td>
                    <td className="px-2 py-2"><Pct val={seasonTotals.fga ? Math.round((seasonTotals.fgm! / seasonTotals.fga!) * 1000) / 10 : 0} /></td>
                    <td className="px-2 py-2">{seasonTotals.fg3m ?? 0}-{seasonTotals.fg3a ?? 0}</td>
                    <td className="px-2 py-2"><Pct val={seasonTotals.fg3a ? Math.round((seasonTotals.fg3m! / seasonTotals.fg3a!) * 1000) / 10 : 0} /></td>
                    <td className="px-2 py-2">{seasonTotals.ftm ?? 0}-{seasonTotals.fta ?? 0}</td>
                    <td className="px-2 py-2"><Pct val={seasonTotals.fta ? Math.round((seasonTotals.ftm! / seasonTotals.fta!) * 1000) / 10 : 0} /></td>
                    <td className="px-2 py-2">{seasonTotals.oreb ?? 0}</td>
                    <td className="px-2 py-2">{seasonTotals.dreb ?? 0}</td>
                    <td className="px-2 py-2">{seasonTotals.reb ?? 0}</td>
                    <td className="px-2 py-2 text-[var(--mm-muted)]">{totalGames > 0 ? Math.round(((seasonTotals.reb ?? 0) / totalGames) * 10) / 10 : '-'}</td>
                    <td className="px-2 py-2 text-[var(--mm-ink)]">{seasonTotals.ast ?? 0}</td>
                    <td className="px-2 py-2 text-[var(--mm-ink)]">{totalGames > 0 ? Math.round(((seasonTotals.ast ?? 0) / totalGames) * 10) / 10 : '-'}</td>
                    <td className="px-2 py-2 text-green-400">{seasonTotals.stl ?? 0}</td>
                    <td className="px-2 py-2 text-indigo-400">{seasonTotals.blk ?? 0}</td>
                    <td className="px-2 py-2 text-red-400">{seasonTotals.tov ?? 0}</td>
                    <td className="px-2 py-2 text-[var(--mm-yellow-strong)]">{seasonTotals.pf ?? 0}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
              </div>
              <p className="hidden md:block text-xs text-[var(--mm-muted)] mt-2">헤더 클릭 시 해당 스탯 기준 정렬 · 평균P/R/A = 경기당 평균</p>
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
