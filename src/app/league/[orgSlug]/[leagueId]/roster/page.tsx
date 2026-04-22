'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock, Download, Upload, Crown, ChevronDown } from 'lucide-react'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'

const POSITIONS = ['G', 'F', 'C', 'PG', 'SG', 'SF', 'PF']

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }
type PlayerQuarterMap = Record<string, Record<string, { team_id: string | null; is_regular: boolean | null }>>
// playerQuarterMap[quarterId][playerId] = { team_id, is_regular }

type LeaderMap = Record<string, Record<string, string | null>>
// leaderMap[quarterId][teamId] = leader_player_id

export default function LeagueRosterPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [players, setPlayers] = useState<LeaguePlayer[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [membershipMap, setMembershipMap] = useState<PlayerQuarterMap>({})
  const [leaderMap, setLeaderMap] = useState<LeaderMap>({})
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', number: '', position: '' })
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [bulkUploading, setBulkUploading] = useState(false)
  const [editingCell, setEditingCell] = useState<{ playerId: string; quarterId: string } | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)

  // New quarter form
  const [showQForm, setShowQForm] = useState(false)
  const [qYear, setQYear] = useState(new Date().getFullYear())
  const [qQuarter, setQQuarter] = useState(1)
  const [savingQ, setSavingQ] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentYear = new Date().getFullYear()
  // Show only current year quarters (show all if none for current year)
  const displayQuarters = quarters.filter(q => q.year === currentYear).length > 0
    ? quarters.filter(q => q.year === currentYear)
    : quarters

  async function load() {
    setLoading(true)
    const [pRes, tRes, qRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/players`),
      fetch(`/api/leagues/${leagueId}/teams`),
      fetch(`/api/leagues/${leagueId}/quarters`),
    ])

    const playersData: LeaguePlayer[] = pRes.ok ? await pRes.json() : []
    const teamsData: LeagueTeam[] = tRes.ok ? (await tRes.json()).map((t: LeagueTeam & { players?: unknown[] }) => {
      const { players: _, ...rest } = t as LeagueTeam & { players?: unknown[] }
      void _
      return rest
    }) : []
    const quartersData: Quarter[] = qRes.ok ? await qRes.json() : []

    setPlayers(playersData)
    setTeams(teamsData)
    setQuarters(quartersData)

    // Fetch player memberships + leaders for each quarter
    if (quartersData.length > 0) {
      const results = await Promise.all(quartersData.map(q =>
        Promise.all([
          fetch(`/api/leagues/${leagueId}/quarters/${q.id}/players`),
          fetch(`/api/leagues/${leagueId}/quarters/${q.id}/leaders`),
        ])
      ))

      const newMembership: PlayerQuarterMap = {}
      const newLeader: LeaderMap = {}

      for (let i = 0; i < quartersData.length; i++) {
        const q = quartersData[i]
        const [mRes, lRes] = results[i]
        newMembership[q.id] = {}
        newLeader[q.id] = {}
        if (mRes.ok) {
          const rows = await mRes.json() as Array<{ id: string; team_id: string | null; is_regular: boolean | null }>
          for (const r of rows) {
            newMembership[q.id][r.id] = { team_id: r.team_id, is_regular: r.is_regular }
          }
        }
        if (lRes.ok) {
          const rows = await lRes.json() as Array<{ team_id: string; leader_player_id: string | null }>
          for (const r of rows) {
            newLeader[q.id][r.team_id] = r.leader_player_id
          }
        }
      }

      setMembershipMap(newMembership)
      setLeaderMap(newLeader)
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [leagueId])

  async function addPlayer() {
    if (!form.name.trim()) { toast.error('이름을 입력하세요'); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({
        name: form.name.trim(),
        number: form.number ? Number(form.number) : null,
        position: form.position || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('선수 추가 완료')
      setForm({ name: '', number: '', position: '' })
      setShowForm(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '추가 실패')
    }
  }

  async function downloadTemplate() {
    const xlsx = await import('xlsx')
    const ws = xlsx.utils.aoa_to_sheet([
      ['이름', '포지션', '비고'],
      ['홍길동', 'PG', ''],
      ['김철수', 'SF', '주장'],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 16 }]
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, '선수명단')
    xlsx.writeFile(wb, '선수명단_템플릿.xlsx')
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setBulkUploading(true)
    try {
      const xlsx = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = xlsx.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = xlsx.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' })

      const uploadPlayers = rows
        .filter(r => String(r['이름'] ?? '').trim())
        .map(r => ({
          name: String(r['이름']).trim(),
          position: String(r['포지션'] ?? '').trim() || null,
          number: null as number | null,
        }))

      if (uploadPlayers.length === 0) { toast.error('유효한 선수 데이터가 없습니다'); setBulkUploading(false); return }

      const res = await fetch(`/api/leagues/${leagueId}/players/bulk`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ players: uploadPlayers }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`${data.inserted}명 등록 완료`)
        load()
      } else {
        toast.error(data.error ?? '등록 실패')
      }
    } catch {
      toast.error('파일 처리 중 오류가 발생했습니다')
    }
    setBulkUploading(false)
  }

  async function deletePlayer(id: string) {
    if (!confirm('이 선수를 삭제하시겠습니까?')) return
    setDeletingId(id)
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${id}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    setDeletingId(null)
    if (res.ok) { toast.success('삭제 완료'); load() }
    else toast.error('삭제 실패')
  }

  async function createQuarter() {
    setSavingQ(true)
    const res = await fetch(`/api/leagues/${leagueId}/quarters`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ year: qYear, quarter: qQuarter, is_current: false }),
    })
    setSavingQ(false)
    if (res.ok) {
      toast.success(`${qYear % 100}.${qQuarter}Q 생성 완료`)
      setShowQForm(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '생성 실패')
    }
  }

  async function updateMembership(quarterId: string, playerId: string, teamId: string | null, isRegular: boolean) {
    const cellKey = `${quarterId}:${playerId}`
    setSavingCell(cellKey)
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${quarterId}/players`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: playerId, team_id: teamId, is_regular: isRegular }),
    })
    setSavingCell(null)
    if (res.ok) {
      setMembershipMap(prev => ({
        ...prev,
        [quarterId]: { ...(prev[quarterId] ?? {}), [playerId]: { team_id: teamId, is_regular: isRegular } },
      }))
      setEditingCell(null)
    } else {
      toast.error('저장 실패')
    }
  }

  async function toggleLeader(quarterId: string, teamId: string, playerId: string) {
    const current = leaderMap[quarterId]?.[teamId]
    const newLeader = current === playerId ? null : playerId
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${quarterId}/leaders`, {
      method: 'PUT',
      headers: leagueHeaders,
      body: JSON.stringify({ team_id: teamId, leader_player_id: newLeader }),
    })
    if (res.ok) {
      setLeaderMap(prev => ({
        ...prev,
        [quarterId]: { ...(prev[quarterId] ?? {}), [teamId]: newLeader },
      }))
    } else {
      toast.error('리더 변경 실패')
    }
  }

  function getCellLabel(quarterId: string, playerId: string): string {
    const m = membershipMap[quarterId]?.[playerId]
    if (!m || m.is_regular === null) return '—'
    if (!m.is_regular) return '비정규'
    const team = teams.find(t => t.id === m.team_id)
    return team?.name ?? '—'
  }

  function getCellTeamId(quarterId: string, playerId: string): string | null {
    return membershipMap[quarterId]?.[playerId]?.team_id ?? null
  }

  function isLeader(quarterId: string, teamId: string | null, playerId: string): boolean {
    if (!teamId) return false
    return leaderMap[quarterId]?.[teamId] === playerId
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">선수단</h2>
          <p className="text-gray-500 text-sm">{players.length}명 등록</p>
        </div>
        {isEditMode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="엑셀 템플릿 다운로드"
            >
              <Download size={12} />템플릿
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={bulkUploading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              title="엑셀 파일로 대량 등록"
            >
              {bulkUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}대량 등록
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkUpload} />
            <Button
              onClick={() => setShowForm(v => !v)}
              className="bg-blue-600 hover:bg-blue-500 cursor-pointer"
              size="sm"
            >
              <Plus size={14} className="mr-1" />선수 추가
            </Button>
          </div>
        ) : (
          <button
            onClick={openPinModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <Lock size={12} />편집 모드
          </button>
        )}
      </div>

      {/* 선수 추가 폼 */}
      {showForm && isEditMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">새 선수 추가</h3>
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="이름 *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-gray-800 border-gray-700 text-white col-span-1"
            />
            <Input
              placeholder="등번호"
              type="number"
              value={form.number}
              onChange={e => setForm(f => ({ ...f, number: e.target.value }))}
              className="bg-gray-800 border-gray-700 text-white"
            />
            <select
              value={form.position}
              onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-md text-white text-sm px-3"
            >
              <option value="">포지션</option>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <Button onClick={addPlayer} disabled={saving} className="bg-blue-600 hover:bg-blue-500 cursor-pointer" size="sm">
              {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}추가
            </Button>
            <Button onClick={() => setShowForm(false)} variant="outline" size="sm" className="border-gray-700 text-gray-300 cursor-pointer">
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 선수 목록 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">등록된 선수가 없습니다</p>
          {isEditMode && <p className="text-xs mt-1">위 버튼으로 선수를 추가하세요</p>}
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 w-12 shrink-0">#</th>
                <th className="text-left px-4 py-3 min-w-[80px]">이름</th>
                <th className="text-left px-4 py-3 w-16">포지션</th>
                {displayQuarters.map(q => (
                  <th key={q.id} className="text-center px-3 py-3 min-w-[80px] whitespace-nowrap">
                    <span className={q.is_current ? 'text-blue-400' : ''}>
                      {String(q.year).slice(2)}.{q.quarter}Q
                    </span>
                  </th>
                ))}
                {isEditMode && <th className="w-10 px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id} className={`border-b border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-900/50'} hover:bg-gray-800/30 transition-colors`}>
                  <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{p.number ?? '—'}</td>
                  <td className="px-4 py-2.5 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{p.position ?? '—'}</td>
                  {displayQuarters.map(q => {
                    const cellKey = `${q.id}:${p.id}`
                    const isSaving = savingCell === cellKey
                    const isEditing = editingCell?.quarterId === q.id && editingCell?.playerId === p.id
                    const label = getCellLabel(q.id, p.id)
                    const teamId = getCellTeamId(q.id, p.id)
                    const isPlayerLeader = isLeader(q.id, teamId, p.id)
                    const m = membershipMap[q.id]?.[p.id]
                    const isRegular = m?.is_regular ?? null

                    return (
                      <td key={q.id} className="px-2 py-2 text-center">
                        {isEditing && isEditMode ? (
                          <div className="flex flex-col gap-1 min-w-[110px]">
                            <select
                              autoFocus
                              defaultValue={teamId ?? ''}
                              onBlur={e => {
                                const val = e.target.value
                                if (val === '__irregular') updateMembership(q.id, p.id, null, false)
                                else if (val === '') { setEditingCell(null) }
                                else updateMembership(q.id, p.id, val, true)
                              }}
                              onChange={e => {
                                const val = e.target.value
                                if (val === '__irregular') updateMembership(q.id, p.id, null, false)
                                else if (val !== '') updateMembership(q.id, p.id, val, true)
                              }}
                              className="w-full bg-gray-800 border border-blue-500 text-white rounded px-2 py-1 text-xs cursor-pointer"
                            >
                              <option value="">미배정</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                              <option value="__irregular">비정규</option>
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            {isSaving ? (
                              <Loader2 size={12} className="animate-spin text-gray-500" />
                            ) : (
                              <>
                                <button
                                  onClick={() => isEditMode && setEditingCell({ playerId: p.id, quarterId: q.id })}
                                  className={`text-xs px-2 py-0.5 rounded transition-colors ${
                                    isEditMode ? 'cursor-pointer hover:bg-gray-700' : 'cursor-default'
                                  } ${
                                    label === '비정규' ? 'text-gray-500' :
                                    label === '—' ? 'text-gray-700' :
                                    'text-white font-medium'
                                  }`}
                                >
                                  {label}
                                  {isEditMode && label !== '—' && <ChevronDown size={9} className="inline ml-0.5 opacity-40" />}
                                </button>
                                {isRegular && teamId && isEditMode && (
                                  <button
                                    onClick={() => toggleLeader(q.id, teamId, p.id)}
                                    title="팀 리더 지정/해제"
                                    className={`transition-colors cursor-pointer ${isPlayerLeader ? 'text-yellow-400' : 'text-gray-700 hover:text-yellow-600'}`}
                                  >
                                    <Crown size={11} />
                                  </button>
                                )}
                                {isRegular && teamId && !isEditMode && isPlayerLeader && (
                                  <Crown size={11} className="text-yellow-400" />
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  {isEditMode && (
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => deletePlayer(p.id)}
                        disabled={deletingId === p.id}
                        className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        {deletingId === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 분기 관리 */}
      {isEditMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">분기 관리</h3>
            <button
              onClick={() => setShowQForm(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white cursor-pointer transition-colors"
            >
              <Plus size={12} />분기 추가
            </button>
          </div>
          {quarters.length === 0 && !showQForm && (
            <p className="text-xs text-gray-600">아직 등록된 분기가 없습니다. 분기를 추가해 팀 구성을 관리하세요.</p>
          )}
          {quarters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quarters.map(q => (
                <span key={q.id} className={`text-xs px-2.5 py-1 rounded-full border ${q.is_current ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-700 text-gray-400'}`}>
                  {String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' ●' : ''}
                </span>
              ))}
            </div>
          )}
          {showQForm && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={qYear}
                onChange={e => setQYear(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={qQuarter}
                onChange={e => setQQuarter(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
              >
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}Q</option>)}
              </select>
              <Button onClick={createQuarter} disabled={savingQ} size="sm" className="bg-blue-600 hover:bg-blue-500 cursor-pointer">
                {savingQ ? <Loader2 size={13} className="animate-spin" /> : '생성'}
              </Button>
              <Button onClick={() => setShowQForm(false)} variant="outline" size="sm" className="border-gray-700 text-gray-400 cursor-pointer">취소</Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
