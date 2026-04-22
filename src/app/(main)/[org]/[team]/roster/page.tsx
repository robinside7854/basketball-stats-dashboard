'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { sortJerseyNum } from '@/lib/utils'
import { Plus, Upload, X, Check, Merge, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PlayerCard from '@/components/roster/PlayerCard'
import PlayerForm from '@/components/roster/PlayerForm'
import PlayerDetailModal from '@/components/roster/PlayerDetailModal'
import PlayerMergeModal from '@/components/roster/PlayerMergeModal'
import type { Player } from '@/types/database'
import * as XLSX from 'xlsx'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import { useOrg } from '@/contexts/OrgContext'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
type SortKey = 'number' | 'age' | 'games'
type SortDir = 'asc' | 'desc'

interface UploadRow {
  number: number
  name: string
  birthdate: string | null
  height_cm: number | null
  is_pro: boolean
}

function parseExcelBirthdate(raw: string | number | undefined): string | null {
  if (!raw) return null
  const s = String(raw).replace(/\D/g, '')
  if (s.length === 6) {
    const yy = parseInt(s.slice(0, 2))
    const year = yy >= 70 ? 1900 + yy : 2000 + yy
    const month = s.slice(2, 4)
    const day = s.slice(4, 6)
    return `${year}-${month}-${day}`
  }
  return null
}

export default function RosterPage() {
  const team = useTeam()
  const org = useOrg()
  const { isEditMode } = useEditMode()
  const [players, setPlayers] = useState<Player[]>([])
  const [gamesCount, setGamesCount] = useState<Record<string, number>>({})
  const [showForm, setShowForm] = useState(false)
  const [editPlayer, setEditPlayer] = useState<Player | null>(null)
  const [uploadRows, setUploadRows] = useState<UploadRow[] | null>(null)
  const [uploading, setUploading] = useState(false)
  const [filterPos, setFilterPos] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('number')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null)
  const [showMerge, setShowMerge] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchPlayers() {
    const res = await fetch(`/api/players?team=${team}`)
    const data = await res.json()
    setPlayers(data)
  }

  function downloadTemplate() {
    const headers = ['순번', '생년월일(YYMMDD)', '이름', '등번호', '포지션', '키(cm)', '선출여부(선출/공란)']
    const example = [1, '950315', '홍길동', '23', 'SG', 185, '']
    const ws = XLSX.utils.aoa_to_sheet([headers, example])
    ws['!cols'] = headers.map((_, i) => ({ wch: [6, 18, 10, 8, 8, 8, 18][i] }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '선수명단')
    XLSX.writeFile(wb, '선수명단_템플릿.xlsx')
  }

  async function fetchGamesCount() {
    const res = await fetch(`/api/players/games-count?team=${team}&org=${org}`)
    setGamesCount(await res.json())
  }

  useEffect(() => {
    fetchPlayers()
    fetchGamesCount()
  }, [team])

  async function handleDelete(id: string) {
    if (!confirm('선수를 삭제하시겠습니까?')) return
    await fetch(`/api/players/${id}`, { method: 'DELETE' })
    toast.success('선수가 삭제되었습니다')
    fetchPlayers()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target!.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const parsed: UploadRow[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as unknown[]
        const name = String(row[2] ?? '').trim()
        const num = Number(row[3])
        if (!name || isNaN(num)) continue
        parsed.push({
          number: num,
          name,
          birthdate: parseExcelBirthdate(row[1] as string | number),
          height_cm: row[5] ? Number(row[5]) : null,
          is_pro: String(row[6] ?? '').trim() === '선출',
        })
      }
      setUploadRows(parsed)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function handleBulkUpload() {
    if (!uploadRows) return
    setUploading(true)
    let success = 0
    for (const row of uploadRows) {
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...row, is_active: true, team_type: team }),
      })
      if (res.ok) success++
    }
    setUploading(false)
    setUploadRows(null)
    await fetchPlayers()
    toast.success(`${success}명 업로드 완료`)
  }

  function handleSortClick(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'number' ? 'asc' : 'desc')
    }
  }

  const displayed = useMemo(() => {
    let list = filterPos
      ? players.filter(p => p.position?.split(',').map(s => s.trim()).includes(filterPos))
      : players
    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'number') {
        cmp = sortJerseyNum(a.number, b.number)
      } else if (sortKey === 'age') {
        const da = a.birthdate ?? '9999'
        const db = b.birthdate ?? '9999'
        cmp = da.localeCompare(db)
      } else {
        const ga = gamesCount[a.id] ?? 0
        const gb = gamesCount[b.id] ?? 0
        cmp = ga - gb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [players, filterPos, sortKey, sortDir, gamesCount])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">선수 명단</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadTemplate} className="border-gray-700 text-gray-400 hover:text-white hover:border-gray-500">
            <Download size={16} className="mr-2" /> 템플릿 다운로드
          </Button>
          {isEditMode && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} className="border-gray-700 text-gray-300 hover:text-white">
                <Upload size={16} className="mr-2" /> 엑셀 업로드
              </Button>
              <Button variant="outline" onClick={() => setShowMerge(true)} className="border-orange-700/60 text-orange-400 hover:text-orange-300 hover:border-orange-500">
                <Merge size={16} className="mr-2" /> 선수 통합
              </Button>
              <Button onClick={() => { setEditPlayer(null); setShowForm(true) }} className="bg-blue-500 hover:bg-blue-600">
                <Plus size={16} className="mr-2" /> 선수 추가
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1.5">
          <button
            onClick={() => setFilterPos('')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              filterPos === '' ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            전체
          </button>
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPos(p => p === pos ? '' : pos)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                filterPos === pos ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-gray-700 mx-1" />

        <div className="flex gap-1.5">
          {([
            { key: 'number', label: '등번호' },
            { key: 'age',    label: '나이' },
            { key: 'games',  label: '출전경기' },
          ] as { key: SortKey; label: string }[]).map(({ key, label }) => {
            const active = sortKey === key
            const Icon = sortDir === 'asc' ? ChevronUp : ChevronDown
            return (
              <button
                key={key}
                onClick={() => handleSortClick(key)}
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  active ? 'bg-blue-500 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                {label}
                {active && <Icon size={11} />}
              </button>
            )
          })}
        </div>

        <span className="ml-auto text-xs text-gray-500">{displayed.length}명</span>
      </div>

      {uploadRows && (
        <div className="mb-6 bg-gray-900 border border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-white">{uploadRows.length}명 미리보기 — 확인 후 업로드</p>
            <Button size="sm" variant="ghost" onClick={() => setUploadRows(null)} className="text-gray-400 hover:text-white p-1">
              <X size={16} />
            </Button>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-gray-800 text-gray-400">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">이름</th>
                  <th className="px-3 py-2">생년월일</th>
                  <th className="px-3 py-2">키</th>
                  <th className="px-3 py-2">선출</th>
                </tr>
              </thead>
              <tbody>
                {uploadRows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/50">
                    <td className="px-3 py-1.5 text-blue-400 font-bold">{r.number}</td>
                    <td className="px-3 py-1.5 font-medium">{r.name}</td>
                    <td className="px-3 py-1.5 text-gray-400">{r.birthdate ?? '-'}</td>
                    <td className="px-3 py-1.5 text-gray-400">{r.height_cm ? `${r.height_cm}cm` : '-'}</td>
                    <td className="px-3 py-1.5">{r.is_pro ? <span className="text-xs bg-yellow-500 text-black px-1.5 py-0.5 rounded font-bold">선출</span> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-3">
            <Button onClick={handleBulkUpload} disabled={uploading} className="bg-blue-500 hover:bg-blue-600">
              <Check size={16} className="mr-2" /> {uploading ? '업로드 중...' : `${uploadRows.length}명 등록`}
            </Button>
          </div>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">{players.length === 0 ? '등록된 선수가 없습니다' : '해당 포지션 선수가 없습니다'}</p>
          {players.length === 0 && <p className="text-sm mt-2">선수 추가 버튼을 눌러 시작하세요</p>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {displayed.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              onEdit={isEditMode ? () => { setEditPlayer(player); setShowForm(true) } : undefined}
              onDelete={isEditMode ? () => handleDelete(player.id) : undefined}
              onDetail={() => setDetailPlayerId(player.id)}
            />
          ))}
        </div>
      )}

      {detailPlayerId && (
        <PlayerDetailModal
          playerId={detailPlayerId}
          team={team}
          onClose={() => setDetailPlayerId(null)}
          onPlayerUpdate={(updated) => setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p))}
        />
      )}

      {showForm && (
        <PlayerForm
          player={editPlayer}
          teamType={team}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); fetchPlayers(); toast.success(editPlayer ? '수정 완료' : '선수 추가 완료') }}
        />
      )}

      {showMerge && (
        <PlayerMergeModal
          players={players}
          onClose={() => setShowMerge(false)}
          onMerged={fetchPlayers}
        />
      )}
    </div>
  )
}
