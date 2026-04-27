'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Crown, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
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
    return <p className="text-xs text-gray-700 py-4 text-center">기록된 스탯이 없습니다</p>
  }

  return (
    <>
    <div className="overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 pr-3 text-[10px] text-gray-600 font-bold sticky left-0 bg-gray-900 min-w-[90px]">선수</th>
            {STAT_HEADERS.map(({ key, label }) => (
              <th key={key} onClick={() => handleSort(key)}
                className={`py-2 px-1.5 text-[10px] font-bold cursor-pointer select-none text-right ${sortKey === key ? 'text-blue-400' : 'text-gray-600'} hover:text-gray-300 transition-colors`}>
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
                      {p.number != null && <span className="text-gray-600 font-mono mr-1 text-[10px]">#{p.number}</span>}
                      {p.name}
                    </span>
                  </button>
                </td>
                <td className="py-2 px-1.5 text-right text-gray-400">{p.gp}</td>
                <td className="py-2 px-1.5 text-right font-bold" style={{ color: color ?? 'white' }}>{p.ppg.toFixed(1)}</td>
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

export default function LeagueTeamsPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQId, setSelectedQId] = useState<string>('')
  const [teams, setTeams] = useState<Team[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [allStats, setAllStats] = useState<PlayerStat[]>([])
  const [qPlayers, setQPlayers] = useState<QuarterPlayer[]>([])
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)

  // 분기 + 팀 초기 로드
  useEffect(() => {
    Promise.all([
      fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json()),
      fetch(`/api/leagues/${leagueId}/teams`).then(r => r.json()),
    ]).then(([qs, ts]) => {
      setQuarters(qs ?? [])
      setTeams(ts ?? [])
      const cur = (qs ?? []).find((q: Quarter) => q.is_current) ?? (qs ?? []).at(-1)
      if (cur) setSelectedQId(cur.id)
      else setLoading(false)
    }).catch(() => setLoading(false))
  }, [leagueId])

  // 분기별 데이터 로드
  useEffect(() => {
    if (!selectedQId) return
    setDataLoading(true)
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
  }, [leagueId, selectedQId])

  // ── 데이터 가공 ───────────────────────────────────────────
  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const leaderMap = useMemo(() => Object.fromEntries(leaders.map(l => [l.team_id, l.leader_player_id])), [leaders])

  // 정규/비정규 선수 구분
  const regularTeamMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of qPlayers) { if (p.is_regular && p.team_id) m[p.id] = p.team_id }
    return m
  }, [qPlayers])

  const irregularIds = useMemo(() => {
    const reg = new Set(Object.keys(regularTeamMap))
    return new Set(qPlayers.filter(p => !p.is_regular).map(p => p.id).filter(id => !reg.has(id)))
  }, [qPlayers, regularTeamMap])

  // 팀별 전적 계산
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

  // 상대 전적 (H2H)
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

  // 팀별 선수 스탯
  const teamStats = useMemo(() => {
    const m: Record<string, PlayerStat[]> = {}
    for (const t of teams) m[t.id] = []
    for (const s of allStats) {
      const tid = regularTeamMap[s.player_id]
      if (tid && m[tid]) m[tid].push(s)
    }
    return m
  }, [allStats, teams, regularTeamMap])

  // 비정규 선수 스탯
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {standings.map((s, idx) => {
              const t = teamMap[s.teamId]
              if (!t) return null
              const played = s.w + s.l
              const winPct = played > 0 ? (s.w / played * 100).toFixed(1) : '—'
              return (
                <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
                  style={{ borderTopColor: t.color, borderTopWidth: 3 }}>
                  {/* 팀 헤더 */}
                  <div className="px-4 py-3 flex items-center justify-between border-b border-gray-800/60">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-gray-500 font-mono w-8">{idx + 1}</span>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-black text-white text-base">{t.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black" style={{ color: t.color }}>{winPct}{played > 0 ? '%' : ''}</p>
                      <p className="text-xs text-gray-600">{s.w}승 {s.l}패 · {played}경기</p>
                    </div>
                  </div>
                  {/* 상대 전적 */}
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-[10px] text-gray-700 uppercase font-bold mb-2">상대 전적</p>
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
                            <span className="text-xs text-gray-700">기록 없음</span>
                          ) : (
                            <span className={`text-xs font-black ${rec.w > rec.l ? 'text-green-400' : rec.w < rec.l ? 'text-red-400' : 'text-gray-400'}`}>
                              {rec.w}승 {rec.l}패
                            </span>
                          )}
                        </div>
                      )
                    })}
                    {totalPlayed === 0 && <p className="text-xs text-gray-700 py-1">완료된 경기 없음</p>}
                  </div>
                </div>
              )
            })}
          </div>
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
