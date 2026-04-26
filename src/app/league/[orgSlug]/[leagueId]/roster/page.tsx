'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock, Download, Upload, Crown, ChevronDown, Pencil, Check, X } from 'lucide-react'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F']

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }
type PlayerQuarterMap = Record<string, Record<string, { team_id: string | null; is_regular: boolean | null }>>
type LeaderMap = Record<string, Record<string, string | null>>

function parsePositions(pos: string | null): string[] {
  if (!pos) return []
  return pos.split(',').map(p => p.trim()).filter(Boolean)
}

// 생년월일 분리 입력 컴포넌트 (년 4자리 / 월 2자리 / 일 2자리)
function BirthDateInput({ value, onChange, className }: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const parts = value ? value.split('-') : ['', '', '']
  const y = parts[0] ?? '', m = parts[1] ?? '', d = parts[2] ?? ''

  function update(newY: string, newM: string, newD: string) {
    if (!newY && !newM && !newD) { onChange(''); return }
    const yy = newY.padStart(4, '0').slice(0, 4)
    const mm = newM.padStart(2, '0').slice(0, 2)
    const dd = newD.padStart(2, '0').slice(0, 2)
    if (newY.length === 4 || newM || newD) onChange(`${yy}-${mm}-${dd}`)
    else onChange(newY ? `${newY}-${mm}-${dd}` : '')
  }

  const base = `bg-gray-800 border border-gray-700 text-white rounded-lg text-center focus:outline-none focus:border-blue-500 ${className ?? ''}`
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" placeholder="년도" min={1900} max={2099}
        value={y} maxLength={4}
        onChange={e => update(e.target.value.slice(0, 4), m, d)}
        className={`${base} w-16 px-1 py-1.5 text-xs`}
      />
      <span className="text-gray-600 text-xs">/</span>
      <input
        type="number" placeholder="월" min={1} max={12}
        value={Number(m) || ''} maxLength={2}
        onChange={e => update(y, String(e.target.value).padStart(2,'0').slice(0,2), d)}
        className={`${base} w-12 px-1 py-1.5 text-xs`}
      />
      <span className="text-gray-600 text-xs">/</span>
      <input
        type="number" placeholder="일" min={1} max={31}
        value={Number(d) || ''} maxLength={2}
        onChange={e => update(y, m, String(e.target.value).padStart(2,'0').slice(0,2))}
        className={`${base} w-12 px-1 py-1.5 text-xs`}
      />
    </div>
  )
}

function PositionBadge({ pos }: { pos: string }) {
  const colors: Record<string, string> = {
    PG: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    SG: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    SF: 'bg-green-500/20 text-green-300 border-green-500/40',
    PF: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    C:  'bg-red-500/20 text-red-300 border-red-500/40',
    G:  'bg-sky-500/20 text-sky-300 border-sky-500/40',
    F:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${colors[pos] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
      {pos}
    </span>
  )
}

function formatBirthDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function calcAge(dateStr: string | null): string {
  if (!dateStr) return ''
  const birth = new Date(dateStr)
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return `${age}세`
}

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

  // Add form
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', position: [] as string[], birth_date: '' })

  // Bulk
  const [bulkUploading, setBulkUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Inline edit (card)
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', position: [] as string[], birth_date: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // Quarter cell edit
  const [editingCell, setEditingCell] = useState<{ playerId: string; quarterId: string } | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)

  // Quarter form
  const [showQForm, setShowQForm] = useState(false)
  const [qYear, setQYear] = useState(new Date().getFullYear())
  const [qQuarter, setQQuarter] = useState(1)
  const [savingQ, setSavingQ] = useState(false)

  const currentYear = new Date().getFullYear()
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
        position: form.position.length > 0 ? form.position.join(',') : null,
        birth_date: form.birth_date || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('선수 추가 완료')
      setForm({ name: '', position: [], birth_date: '' })
      setShowForm(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '추가 실패')
    }
  }

  function startEdit(p: LeaguePlayer) {
    setEditingPlayerId(p.id)
    setEditForm({
      name: p.name,
      position: parsePositions(p.position),
      birth_date: p.birth_date ?? '',
    })
  }

  async function saveEdit(playerId: string) {
    if (!editForm.name.trim()) { toast.error('이름을 입력하세요'); return }
    setSavingEdit(true)
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({
        name: editForm.name.trim(),
        position: editForm.position.length > 0 ? editForm.position.join(',') : null,
        birth_date: editForm.birth_date || null,
      }),
    })
    setSavingEdit(false)
    if (res.ok) {
      toast.success('수정 완료')
      setEditingPlayerId(null)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '수정 실패')
    }
  }

  function cancelEdit() {
    setEditingPlayerId(null)
  }

  function togglePosition(pos: string, arr: string[], setArr: (v: string[]) => void) {
    setArr(arr.includes(pos) ? arr.filter(p => p !== pos) : [...arr, pos])
  }

  async function downloadTemplate() {
    const xlsx = await import('xlsx')
    const ws = xlsx.utils.aoa_to_sheet([
      ['이름', '포지션', '생년월일'],
      ['홍길동', 'PG', '1995-03-15'],
      ['김철수', 'SF,PF', '1998-07-22'],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }]
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
          birth_date: String(r['생년월일'] ?? '').trim() || null,
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

  function getCellTeamColor(quarterId: string, playerId: string): string | null {
    const m = membershipMap[quarterId]?.[playerId]
    if (!m || !m.is_regular || !m.team_id) return null
    const team = teams.find(t => t.id === m.team_id)
    return team?.color ?? null
  }

  function getCellTeamId(quarterId: string, playerId: string): string | null {
    return membershipMap[quarterId]?.[playerId]?.team_id ?? null
  }

  function isLeader(quarterId: string, teamId: string | null, playerId: string): boolean {
    if (!teamId) return false
    return leaderMap[quarterId]?.[teamId] === playerId
  }

  function getCellIsRegular(quarterId: string, playerId: string): boolean | null {
    return membershipMap[quarterId]?.[playerId]?.is_regular ?? null
  }

  return (
    <div className="space-y-5">
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
        <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">새 선수 추가</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="이름 *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              className="bg-gray-800 border-gray-700 text-white"
            />
            <BirthDateInput
              value={form.birth_date}
              onChange={v => setForm(f => ({ ...f, birth_date: v }))}
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">포지션 (복수 선택 가능)</p>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos, form.position, v => setForm(f => ({ ...f, position: v })))}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    form.position.includes(pos)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
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

      {/* 선수 카드 그리드 */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.map(p => {
            const positions = parsePositions(p.position)
            const isEditing = editingPlayerId === p.id

            // Check if leader in any current quarter
            const isAnyLeader = displayQuarters.some(q => {
              const teamId = getCellTeamId(q.id, p.id)
              return teamId ? isLeader(q.id, teamId, p.id) : false
            })

            return (
              <div
                key={p.id}
                className="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all"
              >
                {isEditing ? (
                  /* ── 편집 모드 ── */
                  <div className="space-y-3">
                    <Input
                      autoFocus
                      value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="이름"
                      className="bg-gray-800 border-gray-700 text-white text-sm"
                    />
                    <BirthDateInput
                      value={editForm.birth_date}
                      onChange={v => setEditForm(f => ({ ...f, birth_date: v }))}
                    />
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">포지션</p>
                      <div className="flex flex-wrap gap-1.5">
                        {POSITIONS.map(pos => (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => togglePosition(pos, editForm.position, v => setEditForm(f => ({ ...f, position: v })))}
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                              editForm.position.includes(pos)
                                ? 'bg-blue-600 border-blue-500 text-white'
                                : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                            }`}
                          >
                            {pos}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => saveEdit(p.id)}
                        disabled={savingEdit}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50 transition-colors"
                      >
                        {savingEdit ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}저장
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer transition-colors"
                      >
                        <X size={11} />취소
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── 뷰 모드 ── */
                  <>
                    {/* 카드 헤더: 이름 + 편집/삭제 버튼 */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isAnyLeader && <Crown size={13} className="text-yellow-400 shrink-0" />}
                        <span className="text-base font-bold text-white truncate">{p.name}</span>
                      </div>
                      {isEditMode && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(p)}
                            className="text-gray-600 hover:text-blue-400 transition-colors cursor-pointer p-1"
                            title="선수 정보 수정"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => deletePlayer(p.id)}
                            disabled={deletingId === p.id}
                            className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 p-1"
                            title="선수 삭제"
                          >
                            {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 포지션 배지 */}
                    <div className="flex flex-wrap gap-1 mb-2 min-h-[22px]">
                      {positions.length > 0
                        ? positions.map(pos => <PositionBadge key={pos} pos={pos} />)
                        : <span className="text-xs text-gray-700">포지션 미지정</span>
                      }
                    </div>

                    {/* 생년월일 */}
                    {p.birth_date ? (
                      <p className="text-xs text-gray-500 mb-3">
                        {formatBirthDate(p.birth_date)}
                        <span className="ml-1.5 text-gray-600">({calcAge(p.birth_date)})</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-700 mb-3">생년월일 미입력</p>
                    )}

                    {/* 분기별 팀 배정 */}
                    {displayQuarters.length > 0 && (
                      <div className="border-t border-gray-800 pt-2.5 mt-2 space-y-1.5">
                        {displayQuarters.map(q => {
                          const cellKey = `${q.id}:${p.id}`
                          const isSaving = savingCell === cellKey
                          const isEditingCell = editingCell?.quarterId === q.id && editingCell?.playerId === p.id
                          const label = getCellLabel(q.id, p.id)
                          const teamId = getCellTeamId(q.id, p.id)
                          const teamColor = getCellTeamColor(q.id, p.id)
                          const isRegular = getCellIsRegular(q.id, p.id)
                          const isPlayerLeader = isLeader(q.id, teamId, p.id)

                          return (
                            <div key={q.id} className="flex items-center justify-between gap-2">
                              <span className={`text-xs font-mono shrink-0 ${q.is_current ? 'text-blue-400' : 'text-gray-600'}`}>
                                {String(q.year).slice(2)}.{q.quarter}Q
                              </span>

                              {isSaving ? (
                                <Loader2 size={11} className="animate-spin text-gray-500 ml-auto" />
                              ) : isEditingCell && isEditMode ? (
                                <select
                                  autoFocus
                                  defaultValue={teamId ?? ''}
                                  onBlur={e => {
                                    const val = e.target.value
                                    if (val === '__irregular') updateMembership(q.id, p.id, null, false)
                                    else if (val === '') setEditingCell(null)
                                    else updateMembership(q.id, p.id, val, true)
                                  }}
                                  onChange={e => {
                                    const val = e.target.value
                                    if (val === '__irregular') updateMembership(q.id, p.id, null, false)
                                    else if (val !== '') updateMembership(q.id, p.id, val, true)
                                  }}
                                  className="flex-1 bg-gray-800 border border-blue-500 text-white rounded px-2 py-0.5 text-xs cursor-pointer"
                                >
                                  <option value="">미배정</option>
                                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                  <option value="__irregular">비정규</option>
                                </select>
                              ) : (
                                <div className="flex items-center gap-1.5 ml-auto">
                                  {isRegular && teamId && (
                                    <>
                                      {isEditMode && (
                                        <button
                                          onClick={() => toggleLeader(q.id, teamId, p.id)}
                                          title="팀 리더 지정/해제"
                                          className={`transition-colors cursor-pointer ${isPlayerLeader ? 'text-yellow-400' : 'text-gray-700 hover:text-yellow-600'}`}
                                        >
                                          <Crown size={10} />
                                        </button>
                                      )}
                                      {!isEditMode && isPlayerLeader && (
                                        <Crown size={10} className="text-yellow-400" />
                                      )}
                                    </>
                                  )}
                                  <button
                                    onClick={() => isEditMode && setEditingCell({ playerId: p.id, quarterId: q.id })}
                                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${
                                      isEditMode ? 'cursor-pointer hover:bg-gray-800' : 'cursor-default'
                                    }`}
                                  >
                                    {label !== '—' && label !== '비정규' && teamColor ? (
                                      <span
                                        className="inline-block w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: teamColor }}
                                      />
                                    ) : null}
                                    <span className={
                                      label === '비정규' ? 'text-gray-600' :
                                      label === '—' ? 'text-gray-700' :
                                      'text-white font-medium'
                                    }>
                                      {label}
                                    </span>
                                    {isEditMode && <ChevronDown size={9} className="text-gray-600" />}
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
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
