'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Crown, Users } from 'lucide-react'
import Link from 'next/link'

type Quarter = {
  id: string
  year: number
  quarter: number
  is_current: boolean
}

type TeamPlayer = {
  id: string
  name: string
  number: number | null
  position: string | null
  is_regular: boolean
  team_id: string
}

type TeamData = {
  id: string
  name: string
  color: string
  players: TeamPlayer[]
  leader_player_id?: string | null
}

export default function LeagueTeamsPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQuarterId, setSelectedQuarterId] = useState<string>('')
  const [teams, setTeams] = useState<TeamData[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingTeams, setLoadingTeams] = useState(false)

  // 분기 목록 로드
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.json())
      .then((qs: Quarter[]) => {
        setQuarters(qs)
        const current = qs.find(q => q.is_current) ?? qs[qs.length - 1]
        if (current) setSelectedQuarterId(current.id)
        else setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [leagueId])

  // 분기별 팀 구성 로드
  useEffect(() => {
    if (!selectedQuarterId) return
    setLoadingTeams(true)

    Promise.all([
      fetch(`/api/leagues/${leagueId}/teams`),
      fetch(`/api/leagues/${leagueId}/quarters/${selectedQuarterId}/players`),
      fetch(`/api/leagues/${leagueId}/quarters/${selectedQuarterId}/leaders`),
    ])
      .then(async ([tRes, pRes, lRes]) => {
        const teamsRaw = tRes.ok ? await tRes.json() : []
        const playersRaw: TeamPlayer[] = pRes.ok ? await pRes.json() : []
        const leadersRaw: { team_id: string; leader_player_id: string | null }[] = lRes.ok ? await lRes.json() : []

        const leaderMap = Object.fromEntries(leadersRaw.map(l => [l.team_id, l.leader_player_id]))

        // 팀별 선수 그룹핑 (정규선수만 포함, team_id 있는 선수만)
        const teamMap: Record<string, TeamPlayer[]> = {}
        for (const p of playersRaw) {
          if (!p.team_id || p.is_regular === false) continue
          if (!teamMap[p.team_id]) teamMap[p.team_id] = []
          teamMap[p.team_id].push(p)
        }

        // 팀 데이터 구성
        const result: TeamData[] = teamsRaw.map((t: { id: string; name: string; color: string }) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          players: (teamMap[t.id] ?? []).sort((a: TeamPlayer, b: TeamPlayer) => a.name.localeCompare(b.name)),
          leader_player_id: leaderMap[t.id] ?? null,
        }))

        // 선수가 있는 팀만 표시 (없는 팀은 뒤로)
        result.sort((a, b) => b.players.length - a.players.length)

        setTeams(result)
        setLoading(false)
        setLoadingTeams(false)
      })
      .catch(() => { setLoading(false); setLoadingTeams(false) })
  }, [leagueId, selectedQuarterId])

  const rosterHref = `/league/${orgSlug}/${leagueId}/roster`

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
  }

  if (quarters.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Users size={32} className="mx-auto mb-3 text-gray-700" />
        <p className="text-sm">등록된 분기가 없습니다</p>
        <p className="text-xs mt-1 text-gray-600">선수단 탭에서 분기를 추가하세요</p>
        <Link href={rosterHref} className="inline-block mt-4 text-xs text-blue-400 hover:underline cursor-pointer">
          → 선수단 탭으로 이동
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 + 분기 필터 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">팀 구성</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            분기별 팀 구성 현황 · 배정 변경은{' '}
            <Link href={rosterHref} className="text-blue-400 hover:underline cursor-pointer">선수단 탭</Link>
            에서
          </p>
        </div>
        <select
          value={selectedQuarterId}
          onChange={e => setSelectedQuarterId(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm cursor-pointer"
        >
          {quarters.map(q => (
            <option key={q.id} value={q.id}>
              {String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' ●' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* 팀 구성 그리드 */}
      {loadingTeams ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {teams.map(team => (
            <div
              key={team.id}
              className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
              style={{ borderTopColor: team.color, borderTopWidth: 3 }}
            >
              {/* 팀 헤더 */}
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                  <span className="font-bold text-white text-sm">{team.name}</span>
                </div>
                <span className="text-xs text-gray-500 font-mono">{team.players.length}명</span>
              </div>

              {/* 선수 목록 */}
              {team.players.length === 0 ? (
                <div className="px-4 pb-4 text-xs text-gray-700 text-center py-4">
                  배정된 선수 없음
                </div>
              ) : (
                <div className="px-3 pb-3 space-y-1">
                  {team.players.map(p => {
                    const isLeader = team.leader_player_id === p.id
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                          isLeader ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-gray-800/60'
                        }`}
                      >
                        <span className="font-mono text-gray-500 text-[11px] w-6 shrink-0 text-right">
                          {p.number ?? '—'}
                        </span>
                        <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                        {p.position && (
                          <span className="text-[10px] text-gray-600 shrink-0">{p.position}</span>
                        )}
                        {isLeader && (
                          <Crown size={12} className="text-yellow-400 shrink-0" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}

          {/* 미배정 선수 표시 (있을 경우) */}
          {(() => {
            // 분기에 배정된 선수 전체 로드는 별도 API — 여기선 unassigned 별도 표시 생략
            return null
          })()}
        </div>
      )}
    </div>
  )
}
