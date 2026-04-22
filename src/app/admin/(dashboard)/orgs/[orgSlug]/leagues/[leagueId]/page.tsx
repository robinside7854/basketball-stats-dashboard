'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Loader2, Calendar, Users, Trophy, ClipboardList } from 'lucide-react'
import Link from 'next/link'
import type { League, LeagueTeamWithPlayers, LeagueGame } from '@/types/league'

// ─── 타입 ─────────────────────────────────────────────
interface Player {
  id: string
  name: string
  number: string
  position: string | null
  team_type: string
}

// ─── 탭 컴포넌트 ──────────────────────────────────────
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer ${
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  )
}

// ─── 팀 구성 탭 ───────────────────────────────────────
function TeamsTab({ leagueId, teams, onRefresh }: { leagueId: string; teams: LeagueTeamWithPlayers[]; onRefresh: () => void }) {
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [loading, setLoading] = useState(false)

  async function addTeam() {
    if (!newName.trim()) { toast.error('팀 이름을 입력하세요'); return }
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, color: newColor }),
    })
    setLoading(false)
    if (res.ok) { toast.success('팀 추가 완료'); setNewName(''); onRefresh() }
    else { const d = await res.json(); toast.error(d.error ?? '추가 실패') }
  }

  async function deleteTeam(teamId: string, teamName: string) {
    if (!confirm(`"${teamName}" 팀을 삭제하면 배정된 선수와 경기 기록도 모두 삭제됩니다. 계속하시겠습니까?`)) return
    const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('팀 삭제 완료'); onRefresh() }
    else { toast.error('삭제 실패') }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">팀 추가</h3>
        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="팀 이름"
            className="bg-gray-800 border-gray-700 text-white flex-1"
            onKeyDown={e => e.key === 'Enter' && addTeam()}
          />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400">색상</label>
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <Button onClick={addTeam} disabled={loading} className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-sm">팀을 추가해주세요</div>
      ) : (
        <div className="space-y-2">
          {teams.map(team => (
            <div key={team.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                <div>
                  <p className="font-medium text-white">{team.name}</p>
                  <p className="text-xs text-gray-500">{team.players.length}명 배정</p>
                </div>
              </div>
              <button
                onClick={() => deleteTeam(team.id, team.name)}
                className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 선수 배정 탭 ─────────────────────────────────────
function PlayersTab({
  leagueId,
  orgSlug,
  teams,
  onRefresh,
}: {
  leagueId: string
  orgSlug: string
  teams: LeagueTeamWithPlayers[]
  onRefresh: () => void
}) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [assigning, setAssigning] = useState<string | null>(null)

  const assignedPlayerIds = new Set(teams.flatMap(t => t.players.map(p => p.league_player_id)))

  useEffect(() => {
    async function load() {
      setLoadingPlayers(true)
      const res = await fetch(`/api/admin/orgs/${orgSlug}/players`)
      if (res.ok) {
        const data = await res.json()
        setAllPlayers(data)
      }
      setLoadingPlayers(false)
    }
    load()
  }, [orgSlug])

  const unassigned = allPlayers.filter(p => !assignedPlayerIds.has(p.id))

  async function assignPlayer(playerId: string, teamId: string) {
    setAssigning(playerId)
    const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_id: playerId }),
    })
    setAssigning(null)
    if (res.ok) { onRefresh() }
    else { const d = await res.json(); toast.error(d.error ?? '배정 실패') }
  }

  async function unassignPlayer(playerId: string, teamId: string) {
    const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}/players?player_id=${playerId}`, {
      method: 'DELETE',
    })
    if (res.ok) { onRefresh() }
    else { toast.error('해제 실패') }
  }

  if (teams.length === 0) {
    return <div className="text-center py-10 text-gray-500 text-sm">먼저 팀을 생성해주세요</div>
  }

  return (
    <div className="space-y-6">
      {/* 미배정 선수 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">미배정 선수 ({unassigned.length}명)</h3>
        {loadingPlayers ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
        ) : unassigned.length === 0 ? (
          <p className="text-xs text-gray-500 py-4 text-center">모든 선수가 배정되었습니다</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {unassigned.map(player => (
              <div key={player.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-500 w-7 text-right">{player.number}</span>
                  <span className="text-sm text-white">{player.name}</span>
                  {player.position && <span className="text-xs text-gray-500">{player.position}</span>}
                </div>
                <select
                  disabled={assigning === player.id}
                  onChange={e => { if (e.target.value) assignPlayer(player.id, e.target.value) }}
                  value=""
                  className="text-xs bg-gray-700 border border-gray-600 text-gray-300 rounded px-2 py-1 cursor-pointer"
                >
                  <option value="" disabled>팀 배정</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 팀별 배정 현황 */}
      <div className="space-y-3">
        {teams.map(team => (
          <div key={team.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
              <h3 className="font-semibold text-white text-sm">{team.name} ({team.players.length}명)</h3>
            </div>
            {team.players.length === 0 ? (
              <p className="text-xs text-gray-500">배정된 선수 없음</p>
            ) : (
              <div className="space-y-1">
                {team.players.map(p => (
                  <div key={p.league_player_id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-500 w-7 text-right">{p.player_number}</span>
                      <span className="text-sm text-white">{p.player_name}</span>
                    </div>
                    <button
                      onClick={() => unassignPlayer(p.league_player_id, team.id)}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors cursor-pointer px-2 py-0.5"
                    >
                      해제
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── 일정 탭 ──────────────────────────────────────────
function ScheduleTab({ leagueId, teams }: { leagueId: string; teams: LeagueTeamWithPlayers[] }) {
  const [games, setGames] = useState<LeagueGame[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const loadGames = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/games`)
    if (res.ok) setGames(await res.json())
    setLoading(false)
  }, [leagueId])

  useEffect(() => { loadGames() }, [loadGames])

  async function generateSchedule() {
    if (!confirm('기존 일정이 모두 삭제되고 새로 생성됩니다. 계속하시겠습니까?')) return
    setGenerating(true)
    const res = await fetch(`/api/leagues/${leagueId}/schedule`, { method: 'POST' })
    setGenerating(false)
    if (res.ok) { toast.success('일정 생성 완료'); loadGames() }
    else { const d = await res.json(); toast.error(d.error ?? '생성 실패') }
  }

  const rounds = Array.from(new Set(games.map(g => g.round_num))).sort((a, b) => a - b)

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={generateSchedule}
          disabled={generating || teams.length < 2}
          className="bg-blue-600 hover:bg-blue-500 cursor-pointer"
        >
          {generating ? <Loader2 size={14} className="animate-spin mr-2" /> : <Calendar size={14} className="mr-2" />}
          일정 자동 생성
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
      ) : games.length === 0 ? (
        <div className="text-center py-10 text-gray-500 text-sm">일정이 없습니다. 자동 생성 버튼을 눌러주세요</div>
      ) : (
        <div className="space-y-4">
          {rounds.map(r => {
            const roundGames = games.filter(g => g.round_num === r)
            const date = roundGames[0]?.date ?? ''
            return (
              <div key={r}>
                <p className="text-xs font-semibold text-gray-400 mb-2">R{r} · {date}</p>
                <div className="space-y-1.5">
                  {roundGames.map(g => {
                    const home = (g.home_team ?? (g.home_team_id ? teamMap[g.home_team_id] : null))
                    const away = (g.away_team ?? (g.away_team_id ? teamMap[g.away_team_id] : null))
                    return (
                      <div key={g.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {home && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: home.color }} />}
                          <span className="text-white">{home?.name ?? g.home_team_id}</span>
                        </div>
                        <span className="text-gray-500 text-xs">VS</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white">{away?.name ?? g.away_team_id}</span>
                          {away && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: away.color }} />}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 결과 입력 탭 ─────────────────────────────────────
function ResultsTab({ leagueId, teams }: { leagueId: string; teams: LeagueTeamWithPlayers[] }) {
  const [games, setGames] = useState<LeagueGame[]>([])
  const [loading, setLoading] = useState(true)
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  const loadGames = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/games`)
    if (res.ok) {
      const data: LeagueGame[] = await res.json()
      setGames(data)
      const initial: Record<string, { home: string; away: string }> = {}
      for (const g of data) {
        initial[g.id] = { home: String(g.home_score), away: String(g.away_score) }
      }
      setScores(initial)
    }
    setLoading(false)
  }, [leagueId])

  useEffect(() => { loadGames() }, [loadGames])

  async function saveResult(gameId: string, isComplete: boolean) {
    const s = scores[gameId]
    if (!s) return
    setSaving(gameId)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        home_score: Number(s.home),
        away_score: Number(s.away),
        is_complete: isComplete,
      }),
    })
    setSaving(null)
    if (res.ok) { toast.success('저장 완료'); loadGames() }
    else { toast.error('저장 실패') }
  }

  const incomplete = games.filter(g => !g.is_complete)
  const complete = games.filter(g => g.is_complete)

  function GameRow({ game }: { game: LeagueGame }) {
    const home = game.home_team ?? (game.home_team_id ? teamMap[game.home_team_id] : null)
    const away = game.away_team ?? (game.away_team_id ? teamMap[game.away_team_id] : null)
    const s = scores[game.id] ?? { home: '0', away: '0' }
    const isSaving = saving === game.id
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>R{game.round_num} · {game.date}</span>
          {game.is_complete && <span className="text-green-400">완료</span>}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 justify-end">
            {home && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: home.color }} />}
            <span className="text-sm text-white">{home?.name ?? '?'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={0}
              value={s.home}
              onChange={e => setScores(prev => ({ ...prev, [game.id]: { ...prev[game.id], home: e.target.value } }))}
              className="w-14 bg-gray-800 border-gray-700 text-white text-center font-mono"
            />
            <span className="text-gray-500">-</span>
            <Input
              type="number"
              min={0}
              value={s.away}
              onChange={e => setScores(prev => ({ ...prev, [game.id]: { ...prev[game.id], away: e.target.value } }))}
              className="w-14 bg-gray-800 border-gray-700 text-white text-center font-mono"
            />
          </div>
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-white">{away?.name ?? '?'}</span>
            {away && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: away.color }} />}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={() => saveResult(game.id, false)}
            className="text-xs border-gray-700 text-gray-400 hover:text-white cursor-pointer"
          >
            저장
          </Button>
          {!game.is_complete && (
            <Button
              size="sm"
              disabled={isSaving}
              onClick={() => saveResult(game.id, true)}
              className="text-xs bg-green-700 hover:bg-green-600 cursor-pointer"
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : '완료 처리'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
  if (games.length === 0) return <div className="text-center py-10 text-gray-500 text-sm">먼저 일정을 생성해주세요</div>

  return (
    <div className="space-y-6">
      {incomplete.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400">미완료 경기 ({incomplete.length})</h3>
          {incomplete.map(g => <GameRow key={g.id} game={g} />)}
        </div>
      )}
      {complete.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-400">완료된 경기 ({complete.length})</h3>
          {complete.map(g => <GameRow key={g.id} game={g} />)}
        </div>
      )}
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────
export default function LeagueDetailPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<'teams' | 'players' | 'schedule' | 'results'>('teams')
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<LeagueTeamWithPlayers[]>([])
  const [loadingLeague, setLoadingLeague] = useState(true)

  const loadTeams = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/teams`)
    if (res.ok) setTeams(await res.json())
  }, [leagueId])

  useEffect(() => {
    async function init() {
      setLoadingLeague(true)
      const res = await fetch(`/api/leagues/${leagueId}`)
      if (res.ok) setLeague(await res.json())
      else router.push(`/admin/orgs/${orgSlug}/leagues`)
      setLoadingLeague(false)
    }
    init()
    loadTeams()
  }, [leagueId, orgSlug, router, loadTeams])

  if (loadingLeague) return (
    <div className="flex justify-center items-center h-40">
      <Loader2 size={24} className="animate-spin text-gray-500" />
    </div>
  )

  if (!league) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orgs/${orgSlug}/leagues`} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white">{league.name}</h1>
          <p className="text-gray-500 text-sm">{league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별' : '연간'}</p>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 flex-wrap">
        <Tab active={activeTab === 'teams'} onClick={() => setActiveTab('teams')}>
          <div className="flex items-center gap-1.5"><Trophy size={13} /> 팀 구성</div>
        </Tab>
        <Tab active={activeTab === 'players'} onClick={() => setActiveTab('players')}>
          <div className="flex items-center gap-1.5"><Users size={13} /> 선수 배정</div>
        </Tab>
        <Tab active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')}>
          <div className="flex items-center gap-1.5"><Calendar size={13} /> 일정</div>
        </Tab>
        <Tab active={activeTab === 'results'} onClick={() => setActiveTab('results')}>
          <div className="flex items-center gap-1.5"><ClipboardList size={13} /> 결과 입력</div>
        </Tab>
      </div>

      {/* 탭 내용 */}
      {activeTab === 'teams' && (
        <TeamsTab leagueId={leagueId} teams={teams} onRefresh={loadTeams} />
      )}
      {activeTab === 'players' && (
        <PlayersTab leagueId={leagueId} orgSlug={orgSlug} teams={teams} onRefresh={loadTeams} />
      )}
      {activeTab === 'schedule' && (
        <ScheduleTab leagueId={leagueId} teams={teams} />
      )}
      {activeTab === 'results' && (
        <ResultsTab leagueId={leagueId} teams={teams} />
      )}
    </div>
  )
}
