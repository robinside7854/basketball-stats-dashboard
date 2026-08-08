'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { sortJerseyNum } from '@/lib/utils'
import { Plus, Upload, X, Check, Merge, ChevronUp, ChevronDown, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import PlayerCard from '@/components/roster/PlayerCard'
import PlayerForm from '@/components/roster/PlayerForm'

// 카드 클릭 · 합치기 · 비교 클릭 후에만 필요 — 초기 번들에서 분리
const PlayerDetailModal = dynamic(() => import('@/components/roster/PlayerDetailModal'), { ssr: false })
const PlayerMergeModal = dynamic(() => import('@/components/roster/PlayerMergeModal'), { ssr: false })
const PlayerCompareModal = dynamic(() => import('@/components/roster/PlayerCompareModal'), { ssr: false })
import { ArrowLeftRight } from 'lucide-react'
import type { Player } from '@/types/database'
// xlsx 는 업로드/템플릿 다운로드 클릭 시에만 필요 (~412KB) → 초기 번들에서 제거하고 동적 로드
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
  const { isEditMode, teamHeaders } = useEditMode()
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
  const [showCompare, setShowCompare] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function fetchPlayers() {
    const res = await fetch(`/api/players?team=${team}`)
    const data = await res.json()
    setPlayers(data)
  }

  async function downloadTemplate() {
    // xlsx 동적 로드
    const XLSX = await import('xlsx')
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
    await fetch(`/api/players/${id}`, { method: 'DELETE', headers: { ...teamHeaders } })
    toast.success('선수가 삭제되었습니다')
    fetchPlayers()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const data = new Uint8Array(ev.target!.result as ArrayBuffer)
      // xlsx 동적 로드
      const XLSX = await import('xlsx')
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
      // ?team=&org= 로 소속 팀을 넘겨야 한다 — 서버가 PIN 을 "그 팀의 것"인지 대조하는 데 쓴다.
      // body 의 team_type 은 서버가 신뢰하지 않는다(50경기 전부 'youth' 인 컬럼이라 믿을 수 없음).
      const res = await fetch(`/api/players?team=${team}&org=${org}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
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
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="font-bold text-[28px] leading-none text-[var(--mm-ink)] tracking-tight">선수 명단</h1>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowCompare(true)} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] cursor-pointer">
            <ArrowLeftRight size={16} className="mr-2" /> 선수 비교
          </Button>
          <Button variant="outline" onClick={downloadTemplate} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] cursor-pointer">
            <Download size={16} className="mr-2" /> 템플릿 다운로드
          </Button>
          {isEditMode && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
              <Button variant="outline" onClick={() => fileRef.current?.click()} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] cursor-pointer">
                <Upload size={16} className="mr-2" /> 엑셀 업로드
              </Button>
              <Button variant="outline" onClick={() => setShowMerge(true)} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] cursor-pointer">
                <Merge size={16} className="mr-2" /> 선수 통합
              </Button>
              <Button onClick={() => { setEditPlayer(null); setShowForm(true) }} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 cursor-pointer">
                <Plus size={16} className="mr-2" /> 선수 추가
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterPos('')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
              filterPos === '' ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)]'
            }`}
          >
            전체
          </button>
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setFilterPos(p => p === pos ? '' : pos)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                filterPos === pos ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)]'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-[var(--mm-rule)] mx-1" />

        <div className="flex gap-1.5 flex-wrap">
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
                className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  active ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)]'
                }`}
              >
                {label}
                {active && <Icon size={11} />}
              </button>
            )
          })}
        </div>

        <span className="ml-auto text-xs text-[var(--mm-muted)]">{displayed.length}명</span>
      </div>

      {uploadRows && (
        <div className="mb-6 bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-[var(--mm-ink)]">{uploadRows.length}명 미리보기 — 확인 후 업로드</p>
            <Button size="sm" variant="ghost" onClick={() => setUploadRows(null)} className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] p-1 cursor-pointer">
              <X size={16} />
            </Button>
          </div>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]">
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
                  <tr key={i} className="border-t border-[var(--mm-rule)] hover:bg-[var(--mm-panel-alt)]">
                    <td className="px-3 py-1.5 text-[var(--mm-yellow-strong)] font-bold">{r.number}</td>
                    <td className="px-3 py-1.5 font-medium text-[var(--mm-ink)]">{r.name}</td>
                    <td className="px-3 py-1.5 text-[var(--mm-ink-soft)]">{r.birthdate ?? '-'}</td>
                    <td className="px-3 py-1.5 text-[var(--mm-ink-soft)]">{r.height_cm ? `${r.height_cm}cm` : '-'}</td>
                    <td className="px-3 py-1.5">{r.is_pro ? <span className="text-xs bg-[var(--mm-yellow)] text-[var(--mm-black)] px-1.5 py-0.5 rounded font-bold">선출</span> : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end mt-3">
            <Button onClick={handleBulkUpload} disabled={uploading} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 cursor-pointer">
              <Check size={16} className="mr-2" /> {uploading ? '업로드 중...' : `${uploadRows.length}명 등록`}
            </Button>
          </div>
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="text-center py-20 text-[var(--mm-muted)]">
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
          org={org}
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

      {showCompare && (
        <PlayerCompareModal
          candidates={players}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}
