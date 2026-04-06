'use client'
import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import PlayerDetailModal from '@/components/roster/PlayerDetailModal'
import type { Tournament, PlayerBoxScore } from '@/types/database'

interface SeasonPlayer extends PlayerBoxScore {
  pts_avg: number; reb_avg: number; ast_avg: number; games_played: number
  usg_pct: number
  eff: number
}

type ViewMode = 'avg' | 'vol' | 'per36'

const GAME_MINUTES = 28 // 7분 × 4쿼터

function toPer36(perGameValue: number): number {
  return Math.round((perGameValue / GAME_MINUTES) * 36 * 10) / 10
}

export default function StatsPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTId, setSelectedTId] = useState('all')
  const [players, setPlayers] = useState<SeasonPlayer[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  const [sortKey, setSortKey] = useState<keyof SeasonPlayer>('pts_avg')
  const [playerModal, setPlayerModal] = useState<string | null>(null)

  useEffect(() => { fetch('/api/tournaments').then(r => r.json()).then(setTournaments) }, [])
  useEffect(() => {
    const url = selectedTId === 'all' ? '/api/stats/season' : `/api/stats/season?tournamentId=${selectedTId}`
    fetch(url).then(r => r.json()).then(d => {
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
  }, [selectedTId])

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
      // 비율 지표는 그대로 표시
      if (['fg_pct', 'fg3_pct', 'ft_pct', 'ts_pct'].includes(key as string)) {
        return <td key={key} className={`px-2 py-2 font-medium ${n >= 40 && key === 'fg_pct' ? 'text-green-400' : n >= 33 && key === 'fg3_pct' ? 'text-green-400' : n >= 70 && key === 'ft_pct' ? 'text-green-400' : n > 0 ? 'text-yellow-400' : 'text-gray-600'}`}>
          {n > 0 ? n.toFixed(1) : '-'}
        </td>
      }
      // 평균 기반 환산 (pts_avg, reb_avg, ast_avg)
      if (key === 'pts_avg') return <td key={key} className="px-2 py-2 font-bold text-white">{toPer36(n)}</td>
      if (key === 'reb_avg') return <td key={key} className="px-2 py-2">{toPer36(n)}</td>
      if (key === 'ast_avg') return <td key={key} className="px-2 py-2 text-blue-400">{toPer36(n)}</td>
      // STL/BLK: 누적 ÷ GP × 36/28
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
      {/* 헤더 */}
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

          {/* 뷰 모드 토글 */}
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

      {/* 36분 환산 안내 배너 */}
      {viewMode === 'per36' && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-lg shrink-0">📐</span>
          <div>
            <p className="text-sm text-amber-300 font-medium">NBA 스타일 36분 환산</p>
            <p className="text-xs text-gray-400 mt-0.5">파란날개 기준 28분(7분×4쿼터)을 NBA 기준 36분으로 환산한 예상 수치입니다. FG%·3P%·FT%·TS%는 비율 지표로 환산하지 않습니다.</p>
          </div>
        </div>
      )}

      {/* 리더보드 — 평균/36분 뷰에서만 */}
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

      {/* 통계 테이블 */}
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

      {playerModal && (
        <PlayerDetailModal
          playerId={playerModal}
          onClose={() => setPlayerModal(null)}
        />
      )}
    </div>
  )
}
