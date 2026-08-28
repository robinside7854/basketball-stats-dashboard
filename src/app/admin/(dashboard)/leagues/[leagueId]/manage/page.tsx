'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2, Loader2, Calendar, Users, Trophy, ClipboardList, KeyRound } from 'lucide-react'
import Link from 'next/link'
import type { League, LeagueTeamWithPlayers, LeagueGame } from '@/types/league'
import { countTeamGames } from '@/lib/admin/leagueScale'

// /admin/orgs/[orgSlug]/leagues/[leagueId] 에서 이관 (2026-08-06, 조직 개념 제거).
// 이 화면의 진짜 키는 리그(leagueId)지 조직(orgSlug)이 아니었다 — orgSlug 는
// 뒤로가기 링크와 선수 배정 탭의 명단 조회에만 쓰였는데, 후자는 org_slug 를 공유하는
// 팀(파란날개 청년부/장년부)이 있으면 서로 다른 팀의 선수가 섞여 나오는 버그였다.
// team_id(리그가 속한 팀, leagues.team_id)로 바꿔 유일하게 특정한다.

// ─── 타입 ─────────────────────────────────────────────
interface Player {
  id: string
  name: string
  number: string
  position: string | null
  team_type: string
}

// leagues.select('*') 응답 — types/league.ts 의 League 는 team_id 를 선언하지 않는다.
type LeagueWithTeam = League & { team_id: string }

// ─── 탭 컴포넌트 ──────────────────────────────────────
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer min-h-11 ${
        active ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)]'
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

  // 규모를 숫자로 못 박는다 — "배정된 선수와 경기 기록도 모두"는 몇 명·몇 경기인지 안 알려준다.
  // 확인창을 띄우는 순간에만 경기 수를 세므로 목록 조회 로직(loadGames)과 얽히지 않는다.
  async function deleteTeam(team: LeagueTeamWithPlayers) {
    const teamId = team.id
    const gameCount = await countTeamGames(leagueId, teamId)
    const gamePart = gameCount == null
      ? '이 팀이 편성된 경기와 그 기록(경기 수는 확인하지 못했습니다)'
      : `이 팀이 편성된 ${gameCount}경기와 그 기록`
    if (!confirm(`"${team.name}" 팀을 삭제하시겠습니까?\n\n배정된 선수 ${team.players.length}명, ${gamePart}이 함께 삭제됩니다.\n이 작업은 되돌릴 수 없습니다.`)) return
    const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}`, { method: 'DELETE' })
    if (res.ok) { toast.success('팀 삭제 완료'); onRefresh() }
    else { toast.error('삭제 실패') }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-[var(--mm-ink)] text-sm">팀 추가</h3>
        {/* 375px 에서 입력·색상·추가가 한 줄에 안 들어가 밀렸다 — 줄바꿈을 허용한다 */}
        <div className="flex gap-2 flex-wrap">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="팀 이름"
            className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] flex-1 min-w-0 basis-40"
            onKeyDown={e => e.key === 'Enter' && addTeam()}
          />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-[var(--mm-muted)]">색상</label>
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="w-9 h-9 rounded cursor-pointer border-0 bg-transparent"
            />
          </div>
          <Button onClick={addTeam} disabled={loading} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer shrink-0">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="text-center py-10 text-[var(--mm-muted)] text-sm">팀을 추가해주세요</div>
      ) : (
        <div className="space-y-2">
          {teams.map(team => (
            <div key={team.id} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
                <div>
                  <p className="font-medium text-[var(--mm-ink)]">{team.name}</p>
                  <p className="text-xs text-[var(--mm-muted)]">{team.players.length}명 배정</p>
                </div>
              </div>
              <button
                onClick={() => deleteTeam(team)}
                aria-label={`${team.name} 팀 삭제`}
                title="팀 삭제"
                // 되돌릴 수 없는 액션 — 평상시에도 negative 색을 유지해 일반 버튼과 구분한다
                className="p-2.5 rounded-lg border border-[var(--mm-negative)]/30 bg-[var(--mm-negative-bg)] text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/60 hover:opacity-90 transition-colors cursor-pointer min-h-11 min-w-11 flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]"
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
  teamId,
  teams,
  onRefresh,
}: {
  leagueId: string
  teamId: string
  teams: LeagueTeamWithPlayers[]
  onRefresh: () => void
}) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<string | null>(null)

  const assignedPlayerIds = new Set(teams.flatMap(t => t.players.map(p => p.league_player_id)))

  const loadPlayers = useCallback(async () => {
    setLoadingPlayers(true)
    setLoadError(null)
    const res = await fetch(`/api/admin/teams/${teamId}/players`).catch(() => null)
    if (res?.ok) {
      setAllPlayers(await res.json())
    } else {
      // 조회 실패를 빈 목록처럼 보여주면 "모든 선수가 배정되었습니다"로 읽혀 미배정 선수를 놓친다.
      // 토스트는 몇 초 뒤 사라져 화면만 남으므로, 상태를 화면에 붙박이로 남긴다.
      const d = res ? await res.json().catch(() => ({})) : {}
      setLoadError(d.error ?? '팀 명단을 불러오지 못했습니다')
      setAllPlayers([])
    }
    setLoadingPlayers(false)
  }, [teamId])

  useEffect(() => { loadPlayers() }, [loadPlayers])

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
    return <div className="text-center py-10 text-[var(--mm-muted)] text-sm">먼저 팀을 생성해주세요</div>
  }

  return (
    <div className="space-y-6">
      {/* 미배정 선수 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-[var(--mm-ink)] text-sm">
          미배정 선수 {loadError ? '' : `(${unassigned.length}명)`}
        </h3>
        {loadingPlayers ? (
          <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-[var(--mm-muted)]" /></div>
        ) : loadError ? (
          <div role="alert" className="text-center py-6 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)] text-sm">
            <p>{loadError}</p>
            <p className="mt-1 text-xs opacity-80">미배정 선수가 없는 것이 아니라, 명단 자체를 못 읽은 상태입니다.</p>
            <button
              onClick={loadPlayers}
              className="mt-3 text-sm underline underline-offset-2 cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        ) : unassigned.length === 0 ? (
          <p className="text-xs text-[var(--mm-muted)] py-4 text-center">모든 선수가 배정되었습니다</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {unassigned.map(player => (
              <div key={player.id} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-[var(--mm-panel-alt)]">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-[var(--mm-muted)] w-7 text-right">{player.number}</span>
                  <span className="text-sm text-[var(--mm-ink)]">{player.name}</span>
                  {player.position && <span className="text-xs text-[var(--mm-muted)]">{player.position}</span>}
                </div>
                <select
                  disabled={assigning === player.id}
                  onChange={e => { if (e.target.value) assignPlayer(player.id, e.target.value) }}
                  value=""
                  className="text-xs bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded px-2 py-1 cursor-pointer"
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
          <div key={team.id} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
              <h3 className="font-semibold text-[var(--mm-ink)] text-sm">{team.name} ({team.players.length}명)</h3>
            </div>
            {team.players.length === 0 ? (
              <p className="text-xs text-[var(--mm-muted)]">배정된 선수 없음</p>
            ) : (
              <div className="space-y-1">
                {team.players.map(p => (
                  <div key={p.league_player_id} className="flex items-center justify-between py-1 px-2 rounded hover:bg-[var(--mm-panel-alt)]">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[var(--mm-muted)] w-7 text-right">{p.player_number}</span>
                      <span className="text-sm text-[var(--mm-ink)]">{p.player_name}</span>
                    </div>
                    <button
                      onClick={() => unassignPlayer(p.league_player_id, team.id)}
                      className="text-xs text-[var(--mm-muted)] hover:text-[var(--mm-negative)] transition-colors cursor-pointer px-2 py-0.5"
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const loadGames = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await fetch(`/api/leagues/${leagueId}/games`).catch(() => null)
    if (res?.ok) {
      setGames(await res.json())
    } else {
      // 조회 실패를 빈 목록처럼 보여주면 "일정이 없다"로 오인해 파괴적인 자동 생성을 누르게 된다.
      const d = res ? await res.json().catch(() => ({})) : {}
      setLoadError(d.error ?? '일정을 불러오지 못했습니다')
      setGames([])
    }
    setLoading(false)
  }, [leagueId])

  useEffect(() => { loadGames() }, [loadGames])

  async function generateSchedule() {
    const scope = games.length > 0
      ? `현재 등록된 ${games.length}경기가 모두 삭제되고, 그 경기의 기록(이벤트)도 함께 사라집니다.`
      : '기존 일정이 모두 삭제되고 새로 생성됩니다.'
    if (!confirm(`${scope}\n계속하시겠습니까?`)) return
    setGenerating(true)
    const res = await fetch(`/api/leagues/${leagueId}/schedule`, { method: 'POST' })
    setGenerating(false)
    if (res.ok) { toast.success('일정 생성 완료'); loadGames() }
    else { const d = await res.json().catch(() => ({})); toast.error(d.error ?? '생성 실패') }
  }

  const rounds = Array.from(new Set(games.map(g => g.round_num))).sort((a, b) => a - b)

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={generateSchedule}
          disabled={generating || loading || !!loadError || teams.length < 2}
          title={loadError ? '일정 조회에 실패해 현재 상태를 알 수 없습니다' : undefined}
          className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer"
        >
          {generating ? <Loader2 size={14} className="animate-spin mr-2" /> : <Calendar size={14} className="mr-2" />}
          일정 자동 생성
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[var(--mm-muted)]" /></div>
      ) : loadError ? (
        <div role="alert" className="text-center py-10 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)] text-sm">
          <p>{loadError}</p>
          <p className="mt-1 text-xs opacity-80">현재 일정 상태를 알 수 없어 자동 생성을 막았습니다.</p>
          <button
            onClick={loadGames}
            className="mt-3 text-sm underline underline-offset-2 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      ) : games.length === 0 ? (
        <div className="text-center py-10 text-[var(--mm-muted)] text-sm">일정이 없습니다. 자동 생성 버튼을 눌러주세요</div>
      ) : (
        <div className="space-y-4">
          {rounds.map(r => {
            const roundGames = games.filter(g => g.round_num === r)
            const date = roundGames[0]?.date ?? ''
            return (
              <div key={r}>
                <p className="text-xs font-semibold text-[var(--mm-muted)] mb-2">R{r} · {date}</p>
                <div className="space-y-1.5">
                  {roundGames.map(g => {
                    const home = (g.home_team ?? (g.home_team_id ? teamMap[g.home_team_id] : null))
                    const away = (g.away_team ?? (g.away_team_id ? teamMap[g.away_team_id] : null))
                    return (
                      <div key={g.id} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          {home && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: home.color }} />}
                          <span className="text-[var(--mm-ink)]">{home?.name ?? g.home_team_id}</span>
                        </div>
                        <span className="text-[var(--mm-muted)] text-xs">VS</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--mm-ink)]">{away?.name ?? g.away_team_id}</span>
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [scores, setScores] = useState<Record<string, { home: string; away: string }>>({})
  const [saving, setSaving] = useState<string | null>(null)

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  const loadGames = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const res = await fetch(`/api/leagues/${leagueId}/games`).catch(() => null)
    if (res?.ok) {
      const data: LeagueGame[] = await res.json()
      setGames(data)
      const initial: Record<string, { home: string; away: string }> = {}
      for (const g of data) {
        initial[g.id] = { home: String(g.home_score), away: String(g.away_score) }
      }
      setScores(initial)
    } else {
      // 조회 실패를 빈 목록처럼 보여주면 "먼저 일정을 생성해주세요"로 읽혀,
      // 이미 있는 일정을 다시 만들려 드는(= 기존 경기·기록을 지우는) 행동으로 이어진다.
      const d = res ? await res.json().catch(() => ({})) : {}
      setLoadError(d.error ?? '경기 목록을 불러오지 못했습니다')
      setGames([])
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
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs text-[var(--mm-muted)]">
          <span>R{game.round_num} · {game.date}</span>
          {game.is_complete && <span className="text-[var(--mm-positive)]">완료</span>}
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* min-w-0 이 없으면 팀명이 길 때 카드가 화면 밖으로 늘어난다 */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            {home && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: home.color }} />}
            <span className="text-sm text-[var(--mm-ink)] truncate">{home?.name ?? '?'}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Input
              type="number"
              min={0}
              aria-label={`${home?.name ?? '홈'} 점수`}
              value={s.home}
              onChange={e => setScores(prev => ({ ...prev, [game.id]: { ...prev[game.id], home: e.target.value } }))}
              className="w-14 bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] text-center font-mono"
            />
            <span className="text-[var(--mm-muted)]">-</span>
            <Input
              type="number"
              min={0}
              aria-label={`${away?.name ?? '원정'} 점수`}
              value={s.away}
              onChange={e => setScores(prev => ({ ...prev, [game.id]: { ...prev[game.id], away: e.target.value } }))}
              className="w-14 bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] text-center font-mono"
            />
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm text-[var(--mm-ink)] truncate">{away?.name ?? '?'}</span>
            {away && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: away.color }} />}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={isSaving}
            onClick={() => saveResult(game.id, false)}
            className="text-xs border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] cursor-pointer"
          >
            저장
          </Button>
          {!game.is_complete && (
            <Button
              size="sm"
              disabled={isSaving}
              onClick={() => saveResult(game.id, true)}
              className="text-xs bg-[var(--mm-positive)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer"
            >
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : '완료 처리'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[var(--mm-muted)]" /></div>
  if (loadError) return (
    <div role="alert" className="text-center py-10 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)] text-sm">
      <p>{loadError}</p>
      <p className="mt-1 text-xs opacity-80">경기가 없는 것이 아니라, 목록을 못 읽은 상태입니다.</p>
      <button onClick={loadGames} className="mt-3 text-sm underline underline-offset-2 cursor-pointer">다시 시도</button>
    </div>
  )
  if (games.length === 0) return <div className="text-center py-10 text-[var(--mm-muted)] text-sm">먼저 일정을 생성해주세요</div>

  return (
    <div className="space-y-6">
      {incomplete.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--mm-muted)]">미완료 경기 ({incomplete.length})</h3>
          {incomplete.map(g => <GameRow key={g.id} game={g} />)}
        </div>
      )}
      {complete.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--mm-muted)]">완료된 경기 ({complete.length})</h3>
          {complete.map(g => <GameRow key={g.id} game={g} />)}
        </div>
      )}
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────
export default function LeagueManagePage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params

  const [activeTab, setActiveTab] = useState<'teams' | 'players' | 'schedule' | 'results'>('teams')
  const [league, setLeague] = useState<LeagueWithTeam | null>(null)
  const [teams, setTeams] = useState<LeagueTeamWithPlayers[]>([])
  const [loadingLeague, setLoadingLeague] = useState(true)
  const [leagueError, setLeagueError] = useState<string | null>(null)
  const [teamsError, setTeamsError] = useState<string | null>(null)

  const loadTeams = useCallback(async () => {
    setTeamsError(null)
    const res = await fetch(`/api/leagues/${leagueId}/teams`).catch(() => null)
    if (res?.ok) {
      setTeams(await res.json())
    } else {
      // 팀 조회 실패를 빈 목록처럼 두면 "팀을 추가해주세요" · "먼저 팀을 생성해주세요"로 읽혀
      // 이미 있는 팀을 다시 만들게 된다. 네 탭 모두 teams 에 기대므로 탭 내용 대신 에러를 띄운다.
      const d = res ? await res.json().catch(() => ({})) : {}
      setTeamsError(d.error ?? '팀 목록을 불러오지 못했습니다')
      setTeams([])
    }
  }, [leagueId])

  const loadLeague = useCallback(async () => {
    setLoadingLeague(true)
    setLeagueError(null)
    const res = await fetch(`/api/leagues/${leagueId}`).catch(() => null)
    if (res?.ok) {
      setLeague(await res.json())
    } else {
      // 예전에는 실패하면 조용히 목록으로 튕겼다 — 운영자는 이유를 모른 채 "리그가 사라졌나"로 오해한다.
      const d = res ? await res.json().catch(() => ({})) : {}
      setLeagueError(d.error ?? '리그 정보를 불러오지 못했습니다')
      setLeague(null)
    }
    setLoadingLeague(false)
  }, [leagueId])

  useEffect(() => { loadLeague(); loadTeams() }, [loadLeague, loadTeams])

  if (loadingLeague) return (
    <div className="flex justify-center items-center h-40">
      <Loader2 size={24} className="animate-spin text-[var(--mm-muted)]" />
    </div>
  )

  if (leagueError) return (
    <div role="alert" className="max-w-2xl text-center py-12 px-4 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)] text-sm">
      <p>{leagueError}</p>
      <p className="mt-1 text-xs opacity-80">리그가 삭제된 것이 아니라, 정보를 못 읽은 상태일 수 있습니다.</p>
      <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
        <button onClick={loadLeague} className="text-sm underline underline-offset-2 cursor-pointer">다시 시도</button>
        <Link href="/admin/leagues" className="text-sm underline underline-offset-2 text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer">
          대회 목록으로
        </Link>
      </div>
    </div>
  )

  if (!league) return null

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href={`/admin/leagues/${leagueId}`} className="p-2 -ml-2 text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer rounded-lg min-h-11 min-w-11 flex items-center justify-center">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[var(--mm-ink)]">{league.name}</h1>
            <p className="text-[var(--mm-muted)] text-sm">{league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별' : '연간'}</p>
          </div>
        </div>
        <Link
          href={`/admin/leagues/${leagueId}/draft`}
          className="px-3 py-2 rounded-lg bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 text-sm font-bold flex items-center gap-1.5 transition-opacity cursor-pointer min-h-11"
        >
          <KeyRound size={14} /> 드래프트 관리
        </Link>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 flex-wrap">
        <Tab active={activeTab === 'teams'} onClick={() => setActiveTab('teams')}>
          <div className="flex items-center gap-1.5"><Trophy size={14} /> 팀 구성</div>
        </Tab>
        <Tab active={activeTab === 'players'} onClick={() => setActiveTab('players')}>
          <div className="flex items-center gap-1.5"><Users size={14} /> 선수 배정</div>
        </Tab>
        <Tab active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')}>
          <div className="flex items-center gap-1.5"><Calendar size={14} /> 일정</div>
        </Tab>
        <Tab active={activeTab === 'results'} onClick={() => setActiveTab('results')}>
          <div className="flex items-center gap-1.5"><ClipboardList size={14} /> 결과 입력</div>
        </Tab>
      </div>

      {/* 탭 내용 — 팀 목록을 못 읽었다면 어느 탭도 사실을 보여줄 수 없으므로 에러로 대체한다 */}
      {teamsError ? (
        <div role="alert" className="text-center py-12 px-4 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)] text-sm">
          <p>{teamsError}</p>
          <p className="mt-1 text-xs opacity-80">팀이 없는 것이 아니라, 목록을 못 읽은 상태입니다. 이대로 팀·선수·일정을 손대면 중복이 생깁니다.</p>
          <button onClick={loadTeams} className="mt-3 text-sm underline underline-offset-2 cursor-pointer">다시 시도</button>
        </div>
      ) : (
        <>
          {activeTab === 'teams' && (
            <TeamsTab leagueId={leagueId} teams={teams} onRefresh={loadTeams} />
          )}
          {activeTab === 'players' && (
            <PlayersTab leagueId={leagueId} teamId={league.team_id} teams={teams} onRefresh={loadTeams} />
          )}
          {activeTab === 'schedule' && (
            <ScheduleTab leagueId={leagueId} teams={teams} />
          )}
          {activeTab === 'results' && (
            <ResultsTab leagueId={leagueId} teams={teams} />
          )}
        </>
      )}
    </div>
  )
}
