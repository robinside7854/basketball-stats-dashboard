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
  birth_date?: string | null
}

function calcAgeNum(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const birth = new Date(dateStr)
  if (isNaN(birth.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const md = now.getMonth() - birth.getMonth()
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age--
  return age
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
  const [irregulars, setIrregulars] = useState<TeamPlayer[]>([])
  const [plusOneAge, setPlusOneAge] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingTeams, setLoadingTeams] = useState(false)

  // 분기 목록 + 리그 설정 로드
  useEffect(() => {
    Promise.all([
      fetch(`/api/leagues/${leagueId}/quarters`),
      fetch(`/api/leagues/${leagueId}`),
    ]).then(async ([qRes, lRes]) => {
      const qs: Quarter[] = qRes.ok ? await qRes.json() : []
      if (lRes.ok) { const ld = await lRes.json(); setPlusOneAge(ld.plus_one_age ?? null) }
      setQuarters(qs)
      const current = qs.find(q => q.is_current) ?? qs[qs.length - 1]
      if (current) setSelectedQuarterId(current.id)
      else setLoading(false)
    }).catch(() => setLoading(false))
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

        // 팀별 선수 그룹핑 (정규선수만)
        const teamMap: Record<string, TeamPlayer[]> = {}
        const irregularList: TeamPlayer[] = []

        for (const p of playersRaw) {
          if (p.is_regular === false) {
            irregularList.push(p)
            continue
          }
          if (!p.team_id) continue
          if (!teamMap[p.team_id]) teamMap[p.team_id] = []
          teamMap[p.team_id].push(p)
        }

        // 팀 데이터 구성 — 리더 최상단, 나머지 이름순
        const result: TeamData[] = teamsRaw.map((t: { id: string; name: string; color: string }) => {
          const leaderId = leaderMap[t.id] ?? null
          const sorted = (teamMap[t.id] ?? []).sort((a: TeamPlayer, b: TeamPlayer) => {
            if (a.id === leaderId) return -1
            if (b.id === leaderId) return 1
            return a.name.localeCompare(b.name)
          })
          return { id: t.id, name: t.name, color: t.color, players: sorted, leader_player_id: leaderId }
        })

        // 선수가 있는 팀 우선
        result.sort((a, b) => b.players.length - a.players.length)

        // 비정규 선수 이름순
        irregularList.sort((a, b) => a.name.localeCompare(b.name))

        setTeams(result)
        setIrregulars(irregularList)
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
                    const plusOne = plusOneAge != null && calcAgeNum(p.birth_date) >= plusOneAge
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl ${
                          isLeader ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-gray-800/60'
                        }`}
                      >
                        <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                        {plusOne && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">+1</span>
                        )}
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

          {/* 비정규 선수 하단 병렬 배치 */}
          {irregulars.length > 0 && (
            <div className="lg:col-span-3 sm:col-span-2 col-span-1">
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-400">비정규 선수</span>
                  <span className="text-xs text-gray-600 font-mono">{irregulars.length}명</span>
                </div>
                <div className="px-3 py-3 flex flex-wrap gap-2">
                  {irregulars.map(p => {
                    const plusOne = plusOneAge != null && calcAgeNum(p.birth_date) >= plusOneAge
                    return (
                      <div key={p.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800/60">
                        <span className="text-sm text-gray-400">{p.name}</span>
                        {plusOne && (
                          <span className="text-[9px] font-black px-1 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">+1</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
