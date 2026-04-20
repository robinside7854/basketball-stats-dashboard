'use client'
import { useEffect, useState } from 'react'
import { useTeam } from '@/contexts/TeamContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PlayerDetailModal from '@/components/roster/PlayerDetailModal'
import type { Tournament, PlayerBoxScore } from '@/types/database'
import SubTabNav from '@/components/layout/SubTabNav'

const STATS_SUB_TABS = [
  { path: '/stats',    label: '시즌 통계' },
  { path: '/opponent', label: '상대 분석' },
]

interface AssistPlayer { id: string; name: string; number: number }
interface ScorerStat {
  playerId: string; playerName: string; playerNumber: number
  totalFgm: number; assistedFgm: number; assistedPts: number; unassistedPts: number
  assistedRatio: number; byType: Record<string, number>; unassistedByType: Record<string, number>
}
interface AssistData {
  players: AssistPlayer[]
  matrix: Record<string, Record<string, number>>
  topPairs: { assister: AssistPlayer; scorer: AssistPlayer; count: number }[]
  scorerStats: ScorerStat[]
  shotTypeBreakdown: Record<string, number>
  shotLabels: Record<string, string>
}

interface SeasonPlayer extends PlayerBoxScore {
  pts_avg: number; reb_avg: number; ast_avg: number; games_played: number
  usg_pct: number
  eff: number
}

type ViewMode = 'avg' | 'vol' | 'per36'

const GAME_MINUTES = 28

function toPer36(perGameValue: number): number {
  return Math.round((perGameValue / GAME_MINUTES) * 36 * 10) / 10
}

export default function StatsPage() {
  const team = useTeam()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTId, setSelectedTId] = useState('all')
  const [players, setPlayers] = useState<SeasonPlayer[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  const [sortKey, setSortKey] = useState<keyof SeasonPlayer>('pts_avg')
  const [playerModal, setPlayerModal] = useState<string | null>(null)
  const [assistData, setAssistData] = useState<AssistData | null>(null)
  const [selectedAssistPlayer, setSelectedAssistPlayer] = useState<{ playerId: string; name: string; mode: 'assisted' | 'unassisted' } | null>(null)

  useEffect(() => { fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(setTournaments) }, [team])
  useEffect(() => {
    const tParam = selectedTId !== 'all' ? `&tournamentId=${selectedTId}` : ''
    fetch(`/api/stats/assists?team=${team}${tParam}`).then(r => r.json()).then(setAssistData)
    setSelectedAssistPlayer(null)
  }, [selectedTId, team])

  useEffect(() => {
    const tParam = selectedTId !== 'all' ? `&tournamentId=${selectedTId}` : ''
    fetch(`/api/stats/season?team=${team}${tParam}`).then(r => r.json()).then(d => {
      const raw = d.players || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withEff = raw.map((p: any) => {
        const gp = p.games_played || 1
        const positive = p.pts_avg + p.reb_avg + p.ast_avg + (p.stl ?? 0) / gp + (p.blk ?? 0) / gp
        const negative = ((p.fga ?? 0) - (p.fgm ?? 0)) / gp + ((p.fta ?? 0) - (p.ftm ?? 0)) / gp + (p.tov ?? 0) / gp
        return { ...p, eff: Math.round((positive - negative) * 10) / 10 }
      })
      setPlayers(withEff)
    })
  }, [selectedTId, team])

  function switchMode(mode: ViewMode) {
    setViewMode(mode)
    setSortKey(mode === 'avg' || mode === 'per36' ? 'pts_avg' : 'pts')
  }

  const sorted = [...players].sort((a, b) => (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0))

  const leaders = [
    { label: '득점왕', key: 'pts_avg', unit: 'PPG', icon: '🏀' },
    { label: '리바운드왕', key: 'reb_avg', unit: 'RPG', icon: '💪' },
    { label: '어시스트왕', key: 'ast_avg', unit: 'APG', icon: '🤝' },
    { label: 'FG%', key: 'fg_pct', unit: '%', icon: '🎯' },
    { label: '3P%', key: 'fg3_pct', unit: '%', icon: '3️⃣' },
    { label: 'TS%', key: 'ts_pct', unit: '%', icon: '📊' },
  ] as const

  const avgCols: { key: keyof SeasonPlayer; label: string }[] = [
    { key: 'player_number', label: '#' },
    { key: 'player_name', label: '이름' },
    { key: 'games_played', label: 'GP' },
    { key: 'pts_avg', label: 'PPG' },
    { key: 'reb_avg', label: 'RPG' },
    { key: 'ast_avg', label: 'APG' },
    { key: 'usg_pct', label: 'USG%' },
    { key: 'fg_pct', label: 'FG%' },
    { key: 'fg3_pct', label: '3P%' },
    { key: 'ft_pct', label: 'FT%' },
    { key: 'efg_pct', label: 'eFG%' },
    { key: 'ts_pct', label: 'TS%' },
    { key: 'ast_tov', label: 'A/T' },
    { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' },
    { key: 'eff', label: 'EFF' },
  ]

  const per36Cols: { key: keyof SeasonPlayer; label: string }[] = [
    { key: 'player_number', label: '#' },
    { key: 'player_name', label: '이름' },
    { key: 'games_played', label: 'GP' },
    { key: 'pts_avg', label: 'P/36' },
    { key: 'reb_avg', label: 'R/36' },
    { key: 'ast_avg', label: 'A/36' },
    { key: 'fg_pct', label: 'FG%' },
    { key: 'fg3_pct', label: '3P%' },
    { key: 'ft_pct', label: 'FT%' },
    { key: 'ts_pct', label: 'TS%' },
    { key: 'stl', label: 'S/36' },
    { key: 'blk', label: 'B/36' },
  ]

  const volCols: { key: keyof SeasonPlayer; label: string }[] = [
    { key: 'player_number', label: '#' },
    { key: 'player_name', label: '이름' },
    { key: 'games_played', label: 'GP' },
    { key: 'pts', label: 'PTS' },
    { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' },
    { key: 'tov', label: 'TOV' },
    { key: 'fgm', label: 'FGM' },
    { key: 'fga', label: 'FGA' },
    { key: 'fg3m', label: '3PM' },
    { key: 'fg3a', label: '3PA' },
    { key: 'ftm', label: 'FTM' },
    { key: 'fta', label: 'FTA' },
    { key: 'oreb', label: 'OR' },
    { key: 'dreb', label: 'DR' },
  ]

  const cols = viewMode === 'avg' ? avgCols : viewMode === 'per36' ? per36Cols : volCols

  function NameCell({ s }: { s: SeasonPlayer }) {
    return (
      <td className="px-2 py-2 text-left whitespace-nowrap">
        <button
          onClick={() => setPlayerModal(s.player_id)}
          className="font-medium hover:text-blue-400 hover:underline underline-offset-2 transition-colors cursor-pointer"
        >
          {s.player_name}
        </button>
      </td>
    )
  }

  function renderCell(s: SeasonPlayer, key: keyof SeasonPlayer) {
    const v = s[key]
    if (key === 'player_number') return <td key={key} className="px-2 py-2 font-bold text-blue-400">{v as number}</td>
    if (key === 'player_name') return <NameCell key={key} s={s} />
    if (key === 'games_played') return <td key={key} className="px-2 py-2 text-gray-400">{v as number}</td>

    const n = Number(v) || 0
    const gp = s.games_played || 1

    if (viewMode === 'per36') {
      if (['fg_pct', 'fg3_pct', 'ft_pct', 'ts_pct'].includes(key as string)) {
        return <td key={key} className={`px-2 py-2 font-medium ${n >= 40 && key === 'fg_pct' ? 'text-green-400' : n >= 33 && key === 'fg3_pct' ? 'text-green-400' : n >= 70 && key === 'ft_pct' ? 'text-green-400' : n > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
          {n > 0 ? n.toFixed(1) : '-'}
        </td>
      }
      if (key === 'pts_avg') return <td key={key} className="px-2 py-2 font-bold text-white">{toPer36(n)}</td>
      if (key === 'reb_avg') return <td key={key} className="px-2 py-2">{toPer36(n)}</td>
      if (key === 'ast_avg') return <td key={key} className="px-2 py-2 text-blue-400">{toPer36(n)}</td>
      if (key === 'stl') return <td key={key} className="px-2 py-2 text-green-400">{toPer36(n / gp)}</td>
      if (key === 'blk') return <td key={key} className="px-2 py-2 text-indigo-400">{toPer36(n / gp)}</td>
      return <td key={key} className="px-2 py-2">{n > 0 ? n.toFixed(1) : '-'}</td>
    }

    if (viewMode === 'avg') {
      if (key === 'pts_avg') return <td key={key} className="px-2 py-2 font-bold text-white">{n.toFixed(1)}</td>
      if (key === 'reb_avg') return <td key={key} className="px-2 py-2">{n.toFixed(1)}</td>
      if (key === 'ast_avg') return <td key={key} className="px-2 py-2 text-blue-400">{n.toFixed(1)}</td>
      if (key === 'usg_pct') return <td key={key} className="px-2 py-2 text-purple-400">{n > 0 ? n.toFixed(1) : '-'}</td>
      if (key === 'stl') return <td key={key} className="px-2 py-2 text-green-400">{n}</td>
      if (key === 'blk') return <td key={key} className="px-2 py-2 text-indigo-400">{n}</td>
      if (key === 'fg_pct')  return <td key={key} className={`px-2 py-2 font-medium ${n >= 40 ? 'text-green-400' : n > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>{n > 0 ? n.toFixed(1) : '-'}</td>
      if (key === 'fg3_pct') return <td key={key} className={`px-2 py-2 font-medium ${n >= 33 ? 'text-green-400' : n > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>{n > 0 ? n.toFixed(1) : '-'}</td>
      if (key === 'ft_pct')  return <td key={key} className={`px-2 py-2 font-medium ${n >= 70 ? 'text-green-400' : n > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>{n > 0 ? n.toFixed(1) : '-'}</td>
      if (key === 'eff') return <td key={key} className={`px-2 py-2 font-bold ${n >= 10 ? 'text-blue-400' : n >= 0 ? 'text-gray-300' : 'text-red-400'}`}>{n.toFixed(1)}</td>
      if (['efg_pct','ts_pct','ast_tov'].includes(key as string))
        return <td key={key} className="px-2 py-2">{n > 0 ? n.toFixed(1) : '-'}</td>
    } else {
      if (key === 'pts') return <td key={key} className="px-2 py-2 font-bold text-white">{n}</td>
      if (key === 'reb') return <td key={key} className="px-2 py-2">{n}</td>
      if (key === 'ast') return <td key={key} className="px-2 py-2 text-blue-400">{n}</td>
      if (key === 'stl') return <td key={key} className="px-2 py-2 text-green-400">{n}</td>
      if (key === 'blk') return <td key={key} className="px-2 py-2 text-indigo-400">{n}</td>
      if (key === 'tov') return <td key={key} className="px-2 py-2 text-red-400">{n}</td>
    }
    return <td key={key} className="px-2 py-2">{n}</td>
  }

  return (
    <div className="space-y-8">
      <SubTabNav tabs={STATS_SUB_TABS} />

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="text-2xl font-bold shrink-0">시즌 통계</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedTId} onValueChange={v => setSelectedTId(v ?? '')}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              <SelectItem value="all">전체 경기</SelectItem>
              {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            <button
              onClick={() => switchMode('avg')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${viewMode === 'avg' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              경기당 평균
            </button>
            <button
              onClick={() => switchMode('per36')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors border-l border-gray-700 ${viewMode === 'per36' ? 'bg-amber-500 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              36분 환산
            </button>
            <button
              onClick={() => switchMode('vol')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors border-l border-gray-700 ${viewMode === 'vol' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
            >
              누적 볼륨
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'per36' && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-lg shrink-0">📐</span>
          <div>
            <p className="text-sm text-amber-300 font-medium">NBA 스타일 36분 환산</p>
            <p className="text-xs text-gray-400 mt-0.5">파란날개 기준 28분(7분×4쿼터)을 NBA 기준 36분으로 환산한 예상 수치입니다. FG%·3P%·FT%·TS%는 비율 지표로 환산하지 않습니다.</p>
          </div>
        </div>
      )}

      {players.length > 0 && viewMode !== 'vol' && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-300">부문별 리더</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {leaders.map(({ label, key, unit, icon }) => {
              const leader = [...players].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))[0]
              if (!leader) return null
              const displayVal = viewMode === 'per36' && ['pts_avg', 'reb_avg', 'ast_avg'].includes(key)
                ? toPer36(Number(leader[key]))
                : Number(leader[key]).toFixed(1)
              const displayUnit = viewMode === 'per36' && ['pts_avg', 'reb_avg', 'ast_avg'].includes(key)
                ? unit.replace('PG', '/36')
                : unit
              return (
                <div key={key} className="bg-gray-900 border border-gray-700/70 rounded-xl p-4 text-center hover:border-blue-500/60 transition-colors cursor-pointer">
                  <div className="text-2xl mb-1">{icon}</div>
                  <div className="text-xs text-gray-400 mb-1">{label}</div>
                  <button
                    onClick={() => setPlayerModal(leader.player_id)}
                    className="font-bold text-blue-400 hover:text-blue-300 hover:underline underline-offset-2 transition-colors cursor-pointer block w-full"
                  >
                    {leader.player_name}
                  </button>
                  <div className="text-xl font-black font-mono text-white mt-1">{displayVal}<span className="text-xs font-sans font-normal text-gray-400 ml-1">{displayUnit}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-gray-300">
            선수별 통계
            <span className="ml-2 text-sm font-normal text-gray-500">
              {viewMode === 'avg' ? '경기당 평균' : viewMode === 'per36' ? '36분 환산' : '시즌 누적'}
            </span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr className="bg-gray-800 text-gray-400">
                  {cols.map(col => (
                    <th
                      key={col.key as string}
                      onClick={() => setSortKey(col.key)}
                      className={`px-2 py-2 border-b border-gray-700 font-medium cursor-pointer hover:text-white whitespace-nowrap transition-colors
                        ${col.key === 'player_name' ? 'text-left' : ''}
                        ${sortKey === col.key ? 'text-blue-400' : ''}`}
                    >
                      {col.label}{sortKey === col.key ? ' ↓' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.player_id} className="border-b border-gray-800 hover:bg-gray-900">
                    {cols.map(col => renderCell(s, col.key))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            <p className="text-xs text-gray-500">* 컬럼 클릭 시 정렬 변경 / 이름 클릭 시 선수 상세</p>
            {viewMode === 'avg' && <p className="text-xs text-gray-500">* USG%: 팀 전체 공격 점유 중 해당 선수 비율 / EFF: (PTS+REB+AST+STL+BLK)-(빗나간FG+빗나간FT+TOV) 경기당</p>}
            {viewMode === 'per36' && <p className="text-xs text-gray-500">* 28분 기준 → 36분 환산 (× 1.286)</p>}
          </div>
        </div>
      )}

      {players.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <p>경기 기록 데이터가 없습니다</p>
          <p className="text-sm mt-2">경기 기록 탭에서 스탯을 입력하면 자동으로 집계됩니다</p>
        </div>
      )}

      {/* 어시스트 네트워크 */}
      {assistData && assistData.topPairs.length > 0 && (() => {
        const { players: aPlayers, matrix, topPairs, scorerStats, shotTypeBreakdown, shotLabels } = assistData
        const maxCount = Math.max(...topPairs.map(p => p.count), 1)
        const MEDAL: Record<number, string> = { 0: '🥇', 1: '🥈', 2: '🥉' }
        const SHOT_COLORS: Record<string, string> = {
          shot_3p: '#3b82f6', shot_layup: '#f97316', shot_2p_mid: '#eab308', shot_post: '#ef4444',
        }

        function cellBg(count: number) {
          if (!count) return ''
          const ratio = count / maxCount
          if (ratio >= 0.8) return 'bg-blue-500 text-white font-bold'
          if (ratio >= 0.5) return 'bg-blue-700/70 text-blue-200 font-semibold'
          if (ratio >= 0.25) return 'bg-blue-900/60 text-blue-300'
          return 'bg-gray-800/60 text-gray-400'
        }

        const totalAssisted = Object.values(shotTypeBreakdown).reduce((s, v) => s + v, 0)

        return (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-300">어시스트 네트워크</h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-3">↓ 어시스트 제공 → 득점 선수</p>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr>
                        <th className="w-16 py-1.5 text-gray-600 text-left pr-2">A↓ / S→</th>
                        {aPlayers.map(p => (
                          <th key={p.id} className="py-1.5 px-1 text-gray-400 font-medium min-w-[36px]">
                            <div className="text-center">
                              <div className="text-blue-400 font-bold">{p.number}</div>
                              <div className="text-gray-500 text-[10px] truncate max-w-[36px]">{p.name.slice(0, 3)}</div>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {aPlayers.map(assister => (
                        <tr key={assister.id} className="border-t border-gray-800/50">
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                            <span className="text-blue-400 font-bold">{assister.number}</span>
                            <span className="text-gray-400 ml-1">{assister.name.slice(0, 3)}</span>
                          </td>
                          {aPlayers.map(scorer => {
                            const count = matrix[assister.id]?.[scorer.id] ?? 0
                            return (
                              <td key={scorer.id} className="py-1.5 px-1 text-center">
                                {assister.id === scorer.id ? (
                                  <span className="text-gray-800">—</span>
                                ) : count > 0 ? (
                                  <span className={`inline-block min-w-[28px] py-0.5 rounded text-center text-xs ${cellBg(count)}`}>
                                    {count}
                                  </span>
                                ) : (
                                  <span className="text-gray-800">·</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-gray-800">
                  <span className="text-xs text-gray-600">연결 강도</span>
                  {[['낮음', 'bg-gray-800/60'], ['중간', 'bg-blue-900/60'], ['높음', 'bg-blue-700/70'], ['최다', 'bg-blue-500']].map(([label, cls]) => (
                    <div key={label} className="flex items-center gap-1">
                      <span className={`w-4 h-4 rounded ${cls} inline-block`} />
                      <span className="text-xs text-gray-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-3">최다 어시스트 연결</p>
                <div className="space-y-2">
                  {topPairs.map((pair, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-800/50 rounded-lg px-3 py-2.5">
                      <span className="text-lg shrink-0">{MEDAL[i] ?? '🏅'}</span>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <div className="text-center shrink-0">
                          <div className="text-blue-400 font-black text-sm">#{pair.assister.number}</div>
                          <div className="text-white text-xs font-medium">{pair.assister.name}</div>
                        </div>
                        <div className="flex-1 flex items-center justify-center gap-1 min-w-0">
                          <div className="h-px flex-1 bg-gradient-to-r from-blue-500 to-transparent" />
                          <span className="text-xs text-gray-500">→</span>
                          <div className="h-px flex-1 bg-gradient-to-l from-green-500 to-transparent" />
                        </div>
                        <div className="text-center shrink-0">
                          <div className="text-green-400 font-black text-sm">#{pair.scorer.number}</div>
                          <div className="text-white text-xs font-medium">{pair.scorer.name}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xl font-black font-mono text-amber-400">{pair.count}</div>
                        <div className="text-xs text-gray-500">회</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-3">
                  선수별 어시스트 득점 현황
                  <span className="ml-2 text-gray-600">득점 숫자 클릭 → 우측 공격 스타일 확인</span>
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="py-1.5 text-left font-normal pr-3">선수</th>
                        <th className="py-1.5 text-center font-normal px-2 whitespace-nowrap">어시스트 득점</th>
                        <th className="py-1.5 text-center font-normal px-2 whitespace-nowrap">단독 득점</th>
                        <th className="py-1.5 font-normal px-2 whitespace-nowrap">어시스트 비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scorerStats.filter(s => s.totalFgm > 0).map(s => {
                        const totalPts = s.assistedPts + s.unassistedPts
                        const assistedPtsPct = totalPts > 0 ? Math.round((s.assistedPts / totalPts) * 100) : 0
                        const isSelA = selectedAssistPlayer?.playerId === s.playerId && selectedAssistPlayer.mode === 'assisted'
                        const isSelU = selectedAssistPlayer?.playerId === s.playerId && selectedAssistPlayer.mode === 'unassisted'
                        return (
                          <tr key={s.playerId} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              <span className="text-blue-400 font-bold">#{s.playerNumber}</span>
                              <span className="text-white ml-1.5">{s.playerName}</span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => setSelectedAssistPlayer(
                                  isSelA ? null : { playerId: s.playerId, name: s.playerName, mode: 'assisted' }
                                )}
                                disabled={s.assistedFgm === 0}
                                className={`font-bold px-1.5 py-0.5 rounded transition-colors disabled:cursor-default
                                  ${isSelA
                                    ? 'bg-green-500 text-white ring-2 ring-green-400'
                                    : s.assistedFgm > 0
                                      ? 'text-green-400 hover:bg-green-900/40 cursor-pointer'
                                      : 'text-gray-600'}`}
                              >
                                {s.assistedPts}
                              </button>
                              <span className="text-gray-600 ml-1 text-[10px]">({s.assistedFgm}개)</span>
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                onClick={() => setSelectedAssistPlayer(
                                  isSelU ? null : { playerId: s.playerId, name: s.playerName, mode: 'unassisted' }
                                )}
                                disabled={s.totalFgm - s.assistedFgm === 0}
                                className={`font-bold px-1.5 py-0.5 rounded transition-colors disabled:cursor-default
                                  ${isSelU
                                    ? 'bg-gray-400 text-black ring-2 ring-gray-300'
                                    : s.totalFgm - s.assistedFgm > 0
                                      ? 'text-gray-300 hover:bg-gray-700/60 cursor-pointer'
                                      : 'text-gray-700'}`}
                              >
                                {s.unassistedPts}
                              </button>
                              <span className="text-gray-600 ml-1 text-[10px]">({s.totalFgm - s.assistedFgm}개)</span>
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden min-w-[60px]">
                                  <div
                                    className="h-2 rounded-full bg-green-500 transition-all"
                                    style={{ width: `${assistedPtsPct}%` }}
                                  />
                                </div>
                                <span className={`font-bold w-8 text-right ${assistedPtsPct >= 50 ? 'text-green-400' : 'text-gray-400'}`}>
                                  {assistedPtsPct}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-gray-700 mt-2">* 어시스트 비중 = 어시스트 득점 / (어시스트+단독) 총득점. 자유투 제외.</p>
              </div>

              {(() => {
                let breakdown: Record<string, number>
                let totalCount: number
                let title: string
                let subtitle: string

                if (selectedAssistPlayer) {
                  const stat = scorerStats.find(s => s.playerId === selectedAssistPlayer.playerId)
                  breakdown = selectedAssistPlayer.mode === 'assisted'
                    ? (stat?.byType ?? {})
                    : (stat?.unassistedByType ?? {})
                  totalCount = Object.values(breakdown).reduce((s, v) => s + v, 0)
                  title = `${selectedAssistPlayer.name} · ${selectedAssistPlayer.mode === 'assisted' ? '어시스트 득점' : '단독 득점'}`
                  subtitle = selectedAssistPlayer.mode === 'assisted' ? '어시스트 받은 슛 유형' : '단독으로 넣은 슛 유형'
                } else {
                  breakdown = shotTypeBreakdown
                  totalCount = totalAssisted
                  title = '팀 전체 · 어시스트 슛 유형'
                  subtitle = '선수 득점 숫자 클릭 시 개인 현황'
                }

                return (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <p className="text-xs font-semibold text-white">{title}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>
                      </div>
                      {selectedAssistPlayer && (
                        <button
                          onClick={() => setSelectedAssistPlayer(null)}
                          className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-800 transition-colors shrink-0"
                        >
                          전체 보기
                        </button>
                      )}
                    </div>
                    {totalCount > 0 ? (
                      <div className="space-y-3 mt-3">
                        <div className="flex h-4 rounded-lg overflow-hidden gap-px">
                          {Object.entries(breakdown)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count]) => (
                              <div
                                key={type}
                                style={{ width: `${(count / totalCount) * 100}%`, backgroundColor: SHOT_COLORS[type] ?? '#6b7280' }}
                                title={`${shotLabels[type] ?? type} ${count}회`}
                              />
                            ))}
                        </div>
                        <div className="space-y-2.5">
                          {Object.entries(breakdown)
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count]) => {
                              const pct = Math.round((count / totalCount) * 100)
                              const color = SHOT_COLORS[type] ?? '#6b7280'
                              return (
                                <div key={type}>
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: color }} />
                                      <span className="text-gray-300">{shotLabels[type] ?? type}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-gray-500">{count}회</span>
                                      <span className="font-bold w-8 text-right" style={{ color }}>{pct}%</span>
                                    </div>
                                  </div>
                                  <div className="bg-gray-800 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                        <p className="text-[10px] text-gray-700">총 {totalCount}회</p>
                      </div>
                    ) : (
                      <p className="text-gray-600 text-xs mt-3">데이터 없음</p>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        )
      })()}

      {playerModal && (
        <PlayerDetailModal
          playerId={playerModal}
          onClose={() => setPlayerModal(null)}
        />
      )}
    </div>
  )
}
