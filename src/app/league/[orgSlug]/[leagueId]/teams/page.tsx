'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Crown, ChevronUp, ChevronDown, ChevronsUpDown, X } from 'lucide-react'
import Link from 'next/link'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }
type Team = { id: string; name: string; color: string }
type Game = {
  id: string
  home_team_id: string | null
  away_team_id: string | null
  home_score: number
  away_score: number
  is_complete: boolean
  home_team?: { id: string; name: string; color: string } | null
  away_team?: { id: string; name: string; color: string } | null
}
type PlayerStat = {
  player_id: string; name: string; number: number | null; position: string | null
  gp: number; pts: number; ppg: number; reb: number; rpg: number; ast: number; apg: number
  stl: number; spg: number; blk: number; bpg: number; tov: number; topg: number; pf: number
  fgm: number; fga: number; fg_pct: number; fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number; efg_pct: number
}
type QuarterPlayer = {
  id: string; name: string; number: number | null; position: string | null
  is_regular: boolean; team_id: string | null; plus_one: boolean
}
type Leader = { team_id: string; leader_player_id: string | null }

type SortKey = 'gp'|'ppg'|'rpg'|'apg'|'spg'|'bpg'|'topg'|'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'|'pts'|'reb'|'ast'|'stl'|'blk'|'tov'|'pf'|'fgm'|'fg3m'|'ftm'

const STAT_HEADERS: { key: SortKey; label: string; tooltip?: string }[] = [
  { key: 'gp',      label: 'GP'   },
  { key: 'ppg',     label: 'PPG'  },
  { key: 'rpg',     label: 'RPG'  },
  { key: 'apg',     label: 'APG'  },
  { key: 'spg',     label: 'STL'  },
  { key: 'bpg',     label: 'BLK'  },
  { key: 'topg',    label: 'TOV'  },
  { key: 'fg_pct',  label: 'FG%'  },
  { key: 'fg3_pct', label: '3P%'  },
  { key: 'ft_pct',  label: 'FT%'  },
  { key: 'efg_pct', label: 'eFG%' },
  { key: 'pts',     label: 'PTS'  },
  { key: 'reb',     label: 'REB'  },
  { key: 'ast',     label: 'AST'  },
  { key: 'stl',     label: 'STL↑' },
  { key: 'blk',     label: 'BLK↑' },
  { key: 'fgm',     label: 'FGM'  },
  { key: 'fg3m',    label: '3PM'  },
  { key: 'ftm',     label: 'FTM'  },
  { key: 'pf',      label: 'PF'   },
]

function SortIcon({ active, dir }: { active: boolean; dir: 'asc'|'desc' }) {
  if (!active) return <ChevronsUpDown size={9} className="inline ml-0.5 opacity-30" />
  return dir === 'desc'
    ? <ChevronDown size={9} className="inline ml-0.5 text-blue-400" />
    : <ChevronUp   size={9} className="inline ml-0.5 text-blue-400" />
}

function StatsTable({
  players, leagueId, leaderId, color,
}: { players: PlayerStat[]; leagueId: string; leaderId?: string | null; color?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>('ppg')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [quickView, setQuickView] = useState<{ id: string; name: string } | null>(null)

  const sorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number)
      return sortDir === 'desc' ? -diff : diff
    })
  }, [players, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  if (players.length === 0) {
    return <p className="text-xs text-gray-500 py-4 text-center">기록된 스탯이 없습니다</p>
  }

  function valOf(p: PlayerStat, key: SortKey): string {
    if (key === 'gp' || key === 'pts' || key === 'reb' || key === 'ast' ||
        key === 'stl' || key === 'blk' || key === 'tov' || key === 'pf' ||
        key === 'fgm' || key === 'fg3m' || key === 'ftm') {
      return String(p[key as keyof PlayerStat] ?? 0)
    }
    if (key === 'fg_pct')  return p.fga  > 0 ? `${p.fg_pct.toFixed(1)}%`  : '—'
    if (key === 'fg3_pct') return p.fg3a > 0 ? `${p.fg3_pct.toFixed(1)}%` : '—'
    if (key === 'ft_pct')  return p.fta  > 0 ? `${p.ft_pct.toFixed(1)}%`  : '—'
    if (key === 'efg_pct') return p.fga  > 0 ? `${p.efg_pct.toFixed(1)}%` : '—'
    return (p[key as keyof PlayerStat] as number).toFixed(1)
  }

  return (
    <>
    {/* 모바일 정렬 칩 + 카드뷰 (md 미만) */}
    <div className="md:hidden">
      <div className="px-1 pb-2 overflow-x-auto">
        <div className="flex gap-1.5 whitespace-nowrap">
          {STAT_HEADERS.map(({ key, label }) => (
            <button key={key} onClick={() => handleSort(key)}
              className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                sortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}>
              {label}
              {sortKey === key && (sortDir === 'desc' ? ' ↓' : ' ↑')}
            </button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-gray-800/60 rounded-xl overflow-hidden bg-gray-900/40">
        {sorted.map((p, i) => {
          const isLeader = leaderId && p.player_id === leaderId
          const sortLabel = STAT_HEADERS.find(h => h.key === sortKey)?.label ?? ''
          const baseSubKeys: SortKey[] = ['gp', 'ppg', 'rpg', 'apg']
          const subKeys = baseSubKeys.filter(k => k !== sortKey).slice(0, 4)
          const filledSubs = subKeys.length < 4
            ? [...subKeys, ...(['spg','fg_pct'] as SortKey[]).filter(k => k !== sortKey && !subKeys.includes(k))].slice(0, 4)
            : subKeys
          return (
            <button key={p.player_id} onClick={() => setQuickView({ id: p.player_id, name: p.name })}
              className="w-full text-left px-3 py-2.5 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-black text-gray-500 font-mono w-5 shrink-0">{i + 1}</span>
                {isLeader && <Crown size={11} className="text-yellow-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm truncate">
                    {p.name}
                    {p.number != null && <span className="text-gray-600 font-mono ml-1 text-xs">#{p.number}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-black leading-none" style={{ color: color ?? '#facc15' }}>{valOf(p, sortKey)}</div>
                  <div className="text-[11px] text-gray-500 font-bold mt-0.5">{sortLabel}</div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-gray-800/60">
                {filledSubs.map(k => {
                  const lbl = STAT_HEADERS.find(h => h.key === k)?.label ?? k
                  return (
                    <div key={k} className="text-center">
                      <div className="text-[11px] text-gray-500">{lbl}</div>
                      <div className="text-xs font-bold text-gray-200">{valOf(p, k)}</div>
                    </div>
                  )
                })}
              </div>
            </button>
          )
        })}
      </div>
    </div>

    {/* 데스크탑 테이블 (md 이상) */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 pr-3 text-xs text-gray-600 font-bold sticky left-0 bg-gray-900 min-w-[90px]">선수</th>
            {STAT_HEADERS.map(({ key, label }) => (
              <th key={key} onClick={() => handleSort(key)}
                className={`py-2 px-1.5 text-xs font-bold cursor-pointer select-none text-right ${sortKey === key ? 'text-blue-400' : 'text-gray-600'} hover:text-gray-300 transition-colors`}>
                {label}<SortIcon active={sortKey === key} dir={sortDir} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/40">
          {sorted.map(p => {
            const isLeader = leaderId && p.player_id === leaderId
            return (
              <tr key={p.player_id} className="hover:bg-gray-800/30 transition-colors">
                <td className="py-2 pr-3 sticky left-0 bg-gray-900 group-hover:bg-gray-800/30">
                  <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                    className="flex items-center gap-1.5 hover:text-blue-300 cursor-pointer transition-colors text-left">
                    {isLeader && <Crown size={10} className="text-yellow-400 shrink-0" />}
                    <span className="text-white font-medium">
                      {p.number != null && <span className="text-gray-600 font-mono mr-1 text-xs">#{p.number}</span>}
                      {p.name}
                    </span>
                  </button>
                </td>
                <td className="py-2 px-1.5 text-right text-gray-400">{p.gp}</td>
                <td className="py-2 px-1.5 text-right font-bold text-white" style={color ? { color } : undefined}>{p.ppg.toFixed(1)}</td>
                <td className="py-2 px-1.5 text-right text-gray-300">{p.rpg.toFixed(1)}</td>
                <td className="py-2 px-1.5 text-right text-gray-300">{p.apg.toFixed(1)}</td>
                <td className="py-2 px-1.5 text-right text-purple-400">{p.spg.toFixed(1)}</td>
                <td className="py-2 px-1.5 text-right text-indigo-400">{p.bpg.toFixed(1)}</td>
                <td className="py-2 px-1.5 text-right text-red-400">{p.topg.toFixed(1)}</td>
                <td className="py-2 px-1.5 text-right text-gray-400">{p.fga > 0 ? `${p.fg_pct.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-1.5 text-right text-yellow-600">{p.fg3a > 0 ? `${p.fg3_pct.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-1.5 text-right text-cyan-600">{p.fta > 0 ? `${p.ft_pct.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-1.5 text-right text-teal-500">{p.fga > 0 ? `${p.efg_pct.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-1.5 text-right text-white font-bold">{p.pts}</td>
                <td className="py-2 px-1.5 text-right text-gray-300">{p.reb}</td>
                <td className="py-2 px-1.5 text-right text-gray-300">{p.ast}</td>
                <td className="py-2 px-1.5 text-right text-purple-400">{p.stl}</td>
                <td className="py-2 px-1.5 text-right text-indigo-400">{p.blk}</td>
                <td className="py-2 px-1.5 text-right text-gray-500">{p.fgm}/{p.fga}</td>
                <td className="py-2 px-1.5 text-right text-gray-500">{p.fg3m}/{p.fg3a}</td>
                <td className="py-2 px-1.5 text-right text-gray-500">{p.ftm}/{p.fta}</td>
                <td className="py-2 px-1.5 text-right text-orange-600">{p.pf}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    {quickView && (
      <PlayerQuickViewModal
        leagueId={leagueId}
        playerId={quickView.id}
        playerName={quickView.name}
        onClose={() => setQuickView(null)}
      />
    )}
    </>
  )
}

// ── TeamDetailPanel ────────────────────────────────────────────────────────
type StandingEntry = { teamId: string; w: number; l: number; gf: number; ga: number }

function TeamDetailPanel({
  teamId, team, standing, h2h, players, allTeams, leagueId, games,
}: {
  teamId: string
  team: Team
  standing: StandingEntry
  h2h: Record<string, { w: number; l: number }>
  players: PlayerStat[]
  allTeams: Team[]
  leagueId: string
  games: Game[]
}) {
  const [quickView, setQuickView] = useState<{ id: string; name: string } | null>(null)

  const teamGames = useMemo(() => {
    return games.filter(g =>
      (g.home_team_id === teamId || g.away_team_id === teamId) && g.is_complete
    )
  }, [games, teamId])

  const gp = teamGames.length || (standing.w + standing.l) || 1

  const computed = useMemo(() => {
    if (players.length === 0) return null

    const totPts    = players.reduce((s, p) => s + p.pts, 0)
    const totFgm    = players.reduce((s, p) => s + p.fgm, 0)
    const totFga    = players.reduce((s, p) => s + p.fga, 0)
    const totFg3m   = players.reduce((s, p) => s + p.fg3m, 0)
    const totFg3a   = players.reduce((s, p) => s + p.fg3a, 0)
    const totFtm    = players.reduce((s, p) => s + p.ftm, 0)
    const totFta    = players.reduce((s, p) => s + p.fta, 0)
    const totStl    = players.reduce((s, p) => s + p.stl, 0)
    const totBlk    = players.reduce((s, p) => s + p.blk, 0)

    const ppg    = totPts / gp
    const fgPct  = totFga  > 0 ? totFgm / totFga * 100 : 0
    const efgPct = totFga  > 0 ? (totFgm + 0.5 * totFg3m) / totFga * 100 : 0
    const defPg  = (totStl + totBlk) / gp
    const ftPct  = totFta  > 0 ? totFtm / totFta * 100 : 0
    const threePct = totFga > 0 ? totFg3a / totFga * 100 : 0

    // Top performers
    const byPpg   = [...players].sort((a, b) => b.ppg   - a.ppg)[0]
    const byRpg   = [...players].sort((a, b) => b.rpg   - a.rpg)[0]
    const byApg   = [...players].sort((a, b) => b.apg   - a.apg)[0]
    const byDef   = [...players].sort((a, b) => (b.spg + b.bpg) - (a.spg + a.bpg))[0]
    const byEfg   = [...players].filter(p => p.fga > 0).sort((a, b) => b.efg_pct - a.efg_pct)[0]

    // Fun: ace dependency
    const topScorer = byPpg
    const acePct = totPts > 0 && topScorer ? topScorer.pts / totPts * 100 : 0

    return { ppg, fgPct, efgPct, defPg, ftPct, threePct, acePct, byPpg, byRpg, byApg, byDef, byEfg }
  }, [players, gp])

  const played = standing.w + standing.l
  const winPct = played > 0 ? (standing.w / played * 100).toFixed(1) : '—'

  // standings.gf/ga가 가장 신뢰성 있는 소스 (games 루프와 동일 기준)
  const avgPf = played > 0 ? standing.gf / played : 0
  const avgPa = played > 0 ? standing.ga / played : 0
  const ptsDiff = standing.gf - standing.ga

  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mt-3"
      style={{ borderTopColor: team.color, borderTopWidth: 3 }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
          <span className="font-black text-white text-lg">{team.name}</span>
          <span className="text-sm text-gray-500 font-semibold">{standing.w}승 {standing.l}패</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-4 text-sm">
            <span className="text-gray-400">승률 <span className="font-black text-white">{winPct}{played > 0 ? '%' : ''}</span></span>
            {avgPf > 0 && <span className="text-gray-400">평균득점 <span className="font-black text-green-400">{avgPf.toFixed(1)}</span></span>}
            {avgPa > 0 && <span className="text-gray-400">평균실점 <span className="font-black text-red-400">{avgPa.toFixed(1)}</span></span>}
          </div>
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* 모바일 요약 바 */}
        <div className="sm:hidden flex flex-wrap gap-3 text-sm">
          <span className="text-gray-400">승률 <span className="font-black text-white">{winPct}{played > 0 ? '%' : ''}</span></span>
          {avgPf > 0 && <span className="text-gray-400">평균득점 <span className="font-black text-green-400">{avgPf.toFixed(1)}</span></span>}
          {avgPa > 0 && <span className="text-gray-400">평균실점 <span className="font-black text-red-400">{avgPa.toFixed(1)}</span></span>}
        </div>

        {players.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">팀 없음 — 스탯이 없습니다</p>
        ) : (
          <>
            {/* B. 팀 스탯 Grid */}
            {computed && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">팀 스탯</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {[
                    { label: '팀 PPG', value: computed.ppg.toFixed(1), sub: '평균 득점', color: team.color },
                    { label: '평균 실점', value: avgPa.toFixed(1), sub: '경기당 허용', color: '#f87171' },
                    { label: '득실차', value: (ptsDiff >= 0 ? '+' : '') + ptsDiff.toFixed(0), sub: `총 ${ptsDiff >= 0 ? '양수' : '음수'}`, color: ptsDiff >= 0 ? '#4ade80' : '#f87171' },
                    { label: '팀 FG%', value: `${computed.fgPct.toFixed(1)}%`, sub: '야투율', color: '#34d399' },
                    { label: '팀 eFG%', value: `${computed.efgPct.toFixed(1)}%`, sub: '유효 야투율', color: '#2dd4bf' },
                    { label: 'STL+BLK/G', value: computed.defPg.toFixed(1), sub: '수비 이벤트', color: '#a78bfa' },
                  ].map(card => (
                    <div key={card.label} className="bg-gray-800/60 rounded-xl p-3 text-center border border-gray-700/40">
                      <div className="text-2xl font-black leading-none" style={{ color: card.color }}>{card.value}</div>
                      <div className="text-[11px] font-bold text-white mt-1">{card.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{card.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. Top Performers */}
            {computed && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">팀 내 1위</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {[
                    { label: '득점왕', player: computed.byPpg, val: computed.byPpg ? `${computed.byPpg.ppg.toFixed(1)} PPG` : null },
                    { label: '리바운드', player: computed.byRpg, val: computed.byRpg ? `${computed.byRpg.rpg.toFixed(1)} RPG` : null },
                    { label: '어시스트', player: computed.byApg, val: computed.byApg ? `${computed.byApg.apg.toFixed(1)} APG` : null },
                    { label: '수비왕', player: computed.byDef, val: computed.byDef ? `${(computed.byDef.spg + computed.byDef.bpg).toFixed(1)} SPG+BPG` : null },
                    { label: '효율왕', player: computed.byEfg, val: computed.byEfg ? `${computed.byEfg.efg_pct.toFixed(1)}% eFG` : null },
                  ].filter(item => item.player && item.val).map(item => (
                    <button
                      key={item.label}
                      onClick={() => item.player && setQuickView({ id: item.player.player_id, name: item.player.name })}
                      className="shrink-0 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3.5 py-2.5 text-left transition-colors cursor-pointer"
                    >
                      <div className="text-[10px] text-gray-500 font-bold mb-0.5">{item.label}</div>
                      <div className="text-sm font-bold text-white whitespace-nowrap">{item.player?.name}</div>
                      <div className="text-[11px] font-semibold whitespace-nowrap" style={{ color: team.color }}>{item.val}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* D. 재미있는 팀 통계 */}
            {computed && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">팀 특성</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    {
                      title: '에이스 의존도',
                      value: `${computed.acePct.toFixed(0)}%`,
                      desc: `에이스 비중 ${computed.acePct.toFixed(0)}%`,
                      colorClass: computed.acePct > 40 ? 'text-red-400' : computed.acePct > 30 ? 'text-yellow-400' : 'text-green-400',
                    },
                    {
                      title: '외곽 스타일',
                      value: `${computed.threePct.toFixed(0)}%`,
                      desc: `3점 시도 비율`,
                      colorClass: computed.threePct > 35 ? 'text-yellow-400' : 'text-blue-400',
                    },
                    {
                      title: '수비 강도',
                      value: computed.defPg.toFixed(1),
                      desc: `게임당 수비 이벤트`,
                      colorClass: computed.defPg > 5 ? 'text-green-400' : computed.defPg > 3 ? 'text-yellow-400' : 'text-gray-400',
                    },
                    {
                      title: '자유투 성공률',
                      value: `${computed.ftPct.toFixed(1)}%`,
                      desc: `팀 클러치 지표`,
                      colorClass: computed.ftPct > 75 ? 'text-green-400' : computed.ftPct > 60 ? 'text-yellow-400' : 'text-red-400',
                    },
                  ].map(tile => (
                    <div key={tile.title} className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/30">
                      <div className={`text-xl font-black leading-none ${tile.colorClass}`}>{tile.value}</div>
                      <div className="text-[11px] font-bold text-white mt-1">{tile.title}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{tile.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* E. Player Stats Table */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">선수 스탯</p>
              <StatsTable players={players} leagueId={leagueId} color={team.color} />
            </div>
          </>
        )}
      </div>

      {quickView && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickView.id}
          playerName={quickView.name}
          onClose={() => setQuickView(null)}
        />
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function LeagueTeamsPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQId, setSelectedQId] = useState<string | 'all'>('all')
  const [teams, setTeams] = useState<Team[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [allStats, setAllStats] = useState<PlayerStat[]>([])
  const [qPlayers, setQPlayers] = useState<QuarterPlayer[]>([])
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)

  // 분기 + 팀 초기 로드
  useEffect(() => {
    Promise.all([
      fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json()),
      fetch(`/api/leagues/${leagueId}/teams`).then(r => r.json()),
    ]).then(([qs, ts]) => {
      setQuarters(qs ?? [])
      setTeams(ts ?? [])
      const cur = (qs ?? []).find((q: Quarter) => q.is_current) ?? (qs ?? []).at(-1)
      // Default: current quarter if exists, otherwise 'all'
      if (cur) setSelectedQId(cur.id)
      else { setSelectedQId('all'); setLoading(false) }
    }).catch(() => setLoading(false))
  }, [leagueId])

  // 분기별 데이터 로드
  useEffect(() => {
    if (!selectedQId) return
    setDataLoading(true)

    if (selectedQId === 'all') {
      // 전체 모드: no quarterId param, merge all qPlayers
      Promise.all([
        fetch(`/api/leagues/${leagueId}/games?complete=true`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/stats`).then(r => r.json()),
      ]).then(async ([gs, st]) => {
        setGames(gs ?? [])
        setAllStats(st.players ?? [])
        setLeaders([]) // no leaders in all mode

        // Merge qPlayers from all quarters
        if (quarters.length > 0) {
          const allQPlayerResults = await Promise.all(
            quarters.map(q =>
              fetch(`/api/leagues/${leagueId}/quarters/${q.id}/players`).then(r => r.json())
            )
          )
          const playerTeamMap: Record<string, QuarterPlayer> = {}
          for (const qResult of allQPlayerResults) {
            for (const p of (qResult ?? []) as QuarterPlayer[]) {
              if (!playerTeamMap[p.id] || (p.is_regular && p.team_id)) {
                playerTeamMap[p.id] = p
              }
            }
          }
          setQPlayers(Object.values(playerTeamMap))
        } else {
          setQPlayers([])
        }

        setLoading(false)
        setDataLoading(false)
      }).catch(() => { setLoading(false); setDataLoading(false) })
    } else {
      Promise.all([
        fetch(`/api/leagues/${leagueId}/games?quarterId=${selectedQId}&complete=true`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/stats?quarterId=${selectedQId}`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/quarters/${selectedQId}/players`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/quarters/${selectedQId}/leaders`).then(r => r.json()),
      ]).then(([gs, st, qp, ld]) => {
        setGames(gs ?? [])
        setAllStats(st.players ?? [])
        setQPlayers(qp ?? [])
        setLeaders(ld ?? [])
        setLoading(false)
        setDataLoading(false)
      }).catch(() => { setLoading(false); setDataLoading(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, selectedQId])

  // ── 데이터 가공 ───────────────────────────────────────────
  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const leaderMap = useMemo(() => Object.fromEntries(leaders.map(l => [l.team_id, l.leader_player_id])), [leaders])

  const regularTeamMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of qPlayers) { if (p.is_regular && p.team_id) m[p.id] = p.team_id }
    return m
  }, [qPlayers])

  const irregularIds = useMemo(() => {
    const reg = new Set(Object.keys(regularTeamMap))
    return new Set(qPlayers.filter(p => !p.is_regular).map(p => p.id).filter(id => !reg.has(id)))
  }, [qPlayers, regularTeamMap])

  const standings = useMemo(() => {
    const st: Record<string, { w: number; l: number; gf: number; ga: number; teamId: string }> = {}
    for (const t of teams) st[t.id] = { w: 0, l: 0, gf: 0, ga: 0, teamId: t.id }
    for (const g of games) {
      if (!g.home_team_id || !g.away_team_id) continue
      const h = st[g.home_team_id]; const a = st[g.away_team_id]
      if (!h || !a) continue
      h.gf += g.home_score; h.ga += g.away_score
      a.gf += g.away_score; a.ga += g.home_score
      if (g.home_score > g.away_score) { h.w++; a.l++ }
      else if (g.home_score < g.away_score) { a.w++; h.l++ }
    }
    return Object.values(st)
      .sort((a, b) => {
        const aPts = a.w * 3; const bPts = b.w * 3
        if (bPts !== aPts) return bPts - aPts
        return (b.gf - b.ga) - (a.gf - a.ga)
      })
  }, [teams, games])

  const h2h = useMemo(() => {
    const m: Record<string, Record<string, { w: number; l: number }>> = {}
    for (const t of teams) { m[t.id] = {}; for (const t2 of teams) if (t.id !== t2.id) m[t.id][t2.id] = { w: 0, l: 0 } }
    for (const g of games) {
      const h = g.home_team_id; const a = g.away_team_id
      if (!h || !a || !m[h] || !m[a]) continue
      if (g.home_score > g.away_score) { m[h][a].w++; m[a][h].l++ }
      else if (g.home_score < g.away_score) { m[a][h].w++; m[h][a].l++ }
    }
    return m
  }, [teams, games])

  const teamStats = useMemo(() => {
    const m: Record<string, PlayerStat[]> = {}
    for (const t of teams) m[t.id] = []
    for (const s of allStats) {
      const tid = regularTeamMap[s.player_id]
      if (tid && m[tid]) m[tid].push(s)
    }
    return m
  }, [allStats, teams, regularTeamMap])

  const irregularStats = useMemo(() => allStats.filter(s => irregularIds.has(s.player_id)), [allStats, irregularIds])

  const rosterHref = `/league/${orgSlug}/${leagueId}/roster`

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-500" /></div>

  if (quarters.length === 0) return (
    <div className="text-center py-16 text-gray-500">
      <p className="text-sm">등록된 분기가 없습니다</p>
      <Link href={rosterHref} className="inline-block mt-3 text-xs text-blue-400 hover:underline">→ 선수단 탭으로 이동</Link>
    </div>
  )

  const totalPlayed = standings.reduce((s, t) => s + t.w + t.l, 0) / 2

  return (
    <div className="space-y-6">
      {/* ── 분기 버튼 탭 ── */}
      <div>
        <h2 className="text-xl font-bold text-white mb-3">팀 구성</h2>
        <div className="flex flex-wrap gap-2">
          {/* 전체 버튼 */}
          <button
            onClick={() => setSelectedQId('all')}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
              selectedQId === 'all'
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            전체
          </button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQId(q.id)}
              className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                selectedQId === q.id
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}>
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            </button>
          ))}
        </div>
      </div>

      {dataLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
      ) : (
        <>
        {/* ── 섹션 1: 팀별 전적 + 상대 전적 ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">팀 전적</h3>

          {/* 팀 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {standings.map((s, idx) => {
              const t = teamMap[s.teamId]
              if (!t) return null
              const played = s.w + s.l
              const winPct = played > 0 ? (s.w / played * 100).toFixed(1) : '—'
              const isSelected = selectedTeamId === t.id
              return (
                <div
                  key={t.id}
                  className={`bg-gray-900 border rounded-2xl overflow-hidden transition-all ${
                    isSelected ? 'border-gray-600 ring-1' : 'border-gray-800'
                  }`}
                  style={{
                    borderTopColor: t.color,
                    borderTopWidth: 3,
                    ...(isSelected ? { ringColor: t.color } : {}),
                  }}
                >
                  {/* 팀 헤더 — 클릭하면 상세 패널 토글 */}
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedTeamId(prev => prev === t.id ? null : t.id)}
                    aria-expanded={isSelected}
                    aria-label={`${t.name} 상세 정보 ${isSelected ? '닫기' : '열기'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-gray-500 font-mono w-8">{idx + 1}</span>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-black text-white text-base">{t.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black" style={{ color: t.color }}>{winPct}{played > 0 ? '%' : ''}</p>
                      <p className="text-xs text-gray-600">{s.w}승 {s.l}패 · {played}경기</p>
                    </div>
                  </button>
                  {/* 상대 전적 */}
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-2">상대 전적</p>
                    {teams.filter(op => op.id !== t.id).map(op => {
                      const rec = h2h[t.id]?.[op.id] ?? { w: 0, l: 0 }
                      const total = rec.w + rec.l
                      return (
                        <div key={op.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: op.color }} />
                            <span className="text-xs text-gray-400">vs {op.name}</span>
                          </div>
                          {total === 0 ? (
                            <span className="text-xs text-gray-500">기록 없음</span>
                          ) : (
                            <span className={`text-xs font-black ${rec.w > rec.l ? 'text-green-400' : rec.w < rec.l ? 'text-red-400' : 'text-gray-400'}`}>
                              {rec.w}승 {rec.l}패
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {totalPlayed === 0 && <p className="text-xs text-gray-500 py-1">완료된 경기 없음</p>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 선택된 팀 상세 패널 (그리드 아래에 full-width) */}
          {selectedTeamId && teamMap[selectedTeamId] && (() => {
            const selStanding = standings.find(s => s.teamId === selectedTeamId)
            if (!selStanding) return null
            return (
              <div className="relative">
                <button
                  className="absolute top-4 right-4 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  onClick={() => setSelectedTeamId(null)}
                  aria-label="패널 닫기"
                >
                  <X size={14} />
                </button>
                <TeamDetailPanel
                  teamId={selectedTeamId}
                  team={teamMap[selectedTeamId]}
                  standing={selStanding}
                  h2h={h2h[selectedTeamId] ?? {}}
                  players={teamStats[selectedTeamId] ?? []}
                  allTeams={teams}
                  leagueId={leagueId}
                  games={games}
                />
              </div>
            )
          })()}
        </div>

        {/* ── 섹션 2: 팀별 선수 스탯 ── */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">팀별 선수 스탯</h3>
          {standings.map(s => {
            const t = teamMap[s.teamId]
            if (!t) return null
            const players = teamStats[t.id] ?? []
            const leaderId = leaderMap[t.id] ?? null
            return (
              <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
                style={{ borderTopColor: t.color, borderTopWidth: 3 }}>
                <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-800/60">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="font-bold text-white">{t.name}</span>
                  <span className="text-xs text-gray-600 ml-auto">{players.length}명</span>
                </div>
                <div className="px-4 py-3">
                  <StatsTable players={players} leagueId={leagueId} leaderId={leaderId} color={t.color} />
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 섹션 3: 비정규 선수 스탯 ── */}
        {irregularStats.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">비정규 선수</h3>
            <p className="text-[11px] text-gray-600">팀 배정 없이 게임에 참가한 선수</p>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-400">비정규 참가자</span>
                <span className="text-xs text-gray-600">{irregularStats.length}명</span>
              </div>
              <div className="px-4 py-3">
                <StatsTable players={irregularStats} leagueId={leagueId} />
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
