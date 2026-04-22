'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock, GripVertical } from 'lucide-react'
import type { LeaguePlayer, LeagueTeamWithPlayers } from '@/types/league'

const TEAM_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316']

type DragSource =
  | { type: 'pool'; playerId: string }
  | { type: 'team'; playerId: string; teamId: string }

export default function LeagueTeamsPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [teams, setTeams] = useState<LeagueTeamWithPlayers[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewTeam, setShowNewTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamColor, setNewTeamColor] = useState(TEAM_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState<string | null>(null) // teamId or 'pool'
  const dragSrc = useRef<DragSource | null>(null)

  async function load() {
    setLoading(true)
    const [teamsRes, playersRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/teams`),
      fetch(`/api/leagues/${leagueId}/players`),
    ])
    const [teamsData, playersData] = await Promise.all([teamsRes.json(), playersRes.json()])
    setTeams(teamsData ?? [])
    setAllPlayers(playersData ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [leagueId])

  // 팀에 배정되지 않은 선수 풀
  const assignedIds = new Set(teams.flatMap(t => t.players.map(p => p.league_player_id)))
  const pool = allPlayers.filter(p => !assignedIds.has(p.id))

  async function createTeam() {
    if (!newTeamName.trim()) { toast.error('팀 이름을 입력하세요'); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/teams`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ name: newTeamName.trim(), color: newTeamColor }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('팀 생성 완료')
      setNewTeamName('')
      setNewTeamColor(TEAM_COLORS[0])
      setShowNewTeam(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '생성 실패')
    }
  }

  async function deleteTeam(teamId: string) {
    if (!confirm('이 팀을 삭제하시겠습니까? 배정된 선수는 풀로 돌아갑니다.')) return
    const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    if (res.ok) { toast.success('팀 삭제 완료'); load() }
    else toast.error('삭제 실패')
  }

  async function assignPlayer(teamId: string, league_player_id: string) {
    const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}/players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id }),
    })
    if (!res.ok) { const d = await res.json(); toast.error(d.error ?? '배정 실패') }
  }

  async function unassignPlayer(teamId: string, league_player_id: string) {
    const res = await fetch(
      `/api/leagues/${leagueId}/teams/${teamId}/players?league_player_id=${league_player_id}`,
      { method: 'DELETE', headers: leagueHeaders }
    )
    if (!res.ok) toast.error('해제 실패')
  }

  // Drag & Drop handlers
  function onDragStart(src: DragSource) {
    dragSrc.current = src
  }

  async function onDrop(target: string) { // teamId or 'pool'
    const src = dragSrc.current
    dragSrc.current = null
    setDragOver(null)
    if (!src) return
    if (target === 'pool') {
      if (src.type === 'pool') return
      await unassignPlayer(src.teamId, src.playerId)
      load()
    } else {
      // dropping onto a team
      if (src.type === 'pool') {
        await assignPlayer(target, src.playerId)
      } else if (src.teamId !== target) {
        await unassignPlayer(src.teamId, src.playerId)
        await assignPlayer(target, src.playerId)
      }
      load()
    }
  }

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 size={24} className="animate-spin text-gray-500" />
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">팀 구성</h2>
          <p className="text-gray-500 text-sm">{teams.length}개 팀</p>
        </div>
        {isEditMode ? (
          <Button onClick={() => setShowNewTeam(v => !v)} className="bg-blue-600 hover:bg-blue-500 cursor-pointer" size="sm">
            <Plus size={14} className="mr-1" />팀 추가
          </Button>
        ) : (
          <button
            onClick={openPinModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <Lock size={12} />편집 모드
          </button>
        )}
      </div>

      {/* 팀 생성 폼 */}
      {showNewTeam && isEditMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">새 팀 추가</h3>
          <Input
            placeholder="팀 이름 *"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white"
            onKeyDown={e => e.key === 'Enter' && createTeam()}
          />
          <div className="flex gap-2 flex-wrap">
            {TEAM_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewTeamColor(c)}
                className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${newTeamColor === c ? 'border-white scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={createTeam} disabled={saving} className="bg-blue-600 hover:bg-blue-500 cursor-pointer" size="sm">
              {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}생성
            </Button>
            <Button onClick={() => setShowNewTeam(false)} variant="outline" size="sm" className="border-gray-700 text-gray-300 cursor-pointer">취소</Button>
          </div>
        </div>
      )}

      {isEditMode && (
        <p className="text-xs text-gray-500 text-center">선수를 드래그해서 팀에 배정하거나 풀로 돌려보내세요</p>
      )}

      <div className="space-y-4">
        {/* 미배정 선수 풀 */}
        <div
          className={`bg-gray-900 border rounded-2xl p-4 transition-colors ${
            dragOver === 'pool' ? 'border-blue-500 bg-blue-900/10' : 'border-gray-800'
          }`}
          onDragOver={e => { e.preventDefault(); if (isEditMode) setDragOver('pool') }}
          onDragLeave={() => setDragOver(null)}
          onDrop={e => { e.preventDefault(); if (isEditMode) onDrop('pool') }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm text-gray-300">미배정 선수</h3>
            <span className="text-xs text-gray-500">{pool.length}명</span>
          </div>
          {pool.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-3">모든 선수가 팀에 배정됨</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {pool.map(p => (
                <div
                  key={p.id}
                  draggable={isEditMode}
                  onDragStart={() => isEditMode && onDragStart({ type: 'pool', playerId: p.id })}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm ${
                    isEditMode ? 'cursor-grab active:cursor-grabbing hover:border-gray-500' : ''
                  }`}
                >
                  {isEditMode && <GripVertical size={12} className="text-gray-600" />}
                  <span className="text-gray-400 text-xs font-mono">{p.number ?? '—'}</span>
                  <span className="text-white">{p.name}</span>
                  {p.position && <span className="text-gray-500 text-xs">{p.position}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 팀 목록 */}
        {teams.map(team => (
          <div
            key={team.id}
            className={`bg-gray-900 border rounded-2xl p-4 transition-colors ${
              dragOver === team.id ? 'border-blue-500 bg-blue-900/10' : 'border-gray-800'
            }`}
            onDragOver={e => { e.preventDefault(); if (isEditMode) setDragOver(team.id) }}
            onDragLeave={() => setDragOver(null)}
            onDrop={e => { e.preventDefault(); if (isEditMode) onDrop(team.id) }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                <h3 className="font-semibold text-white">{team.name}</h3>
                <span className="text-xs text-gray-500">{team.players.length}명</span>
              </div>
              {isEditMode && (
                <button
                  onClick={() => deleteTeam(team.id)}
                  className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            {team.players.length === 0 ? (
              <p className="text-xs text-gray-600 text-center py-3 border border-dashed border-gray-800 rounded-lg">
                {isEditMode ? '선수를 드래그해서 배정하세요' : '배정된 선수 없음'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {team.players.map(p => (
                  <div
                    key={p.league_player_id}
                    draggable={isEditMode}
                    onDragStart={() => isEditMode && onDragStart({ type: 'team', playerId: p.league_player_id, teamId: team.id })}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm ${
                      isEditMode ? 'cursor-grab active:cursor-grabbing hover:border-gray-500' : ''
                    }`}
                  >
                    {isEditMode && <GripVertical size={12} className="text-gray-600" />}
                    <span className="text-gray-400 text-xs font-mono">{p.player_number ?? '—'}</span>
                    <span className="text-white">{p.player_name}</span>
                    {p.position && <span className="text-gray-500 text-xs">{p.position}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {teams.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">생성된 팀이 없습니다</p>
            {isEditMode && <p className="text-xs mt-1">위 버튼으로 팀을 추가하세요</p>}
          </div>
        )}
      </div>
    </div>
  )
}
