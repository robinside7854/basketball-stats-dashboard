'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock } from 'lucide-react'
import type { LeaguePlayer } from '@/types/league'

const POSITIONS = ['G', 'F', 'C', 'PG', 'SG', 'SF', 'PF']

export default function LeagueRosterPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [players, setPlayers] = useState<LeaguePlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', number: '', position: '' })
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/leagues/${leagueId}/players`)
    if (res.ok) setPlayers(await res.json())
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">선수단</h2>
          <p className="text-gray-500 text-sm">{players.length}명 등록</p>
        </div>
        {isEditMode ? (
          <Button
            onClick={() => setShowForm(v => !v)}
            className="bg-blue-600 hover:bg-blue-500 cursor-pointer"
            size="sm"
          >
            <Plus size={14} className="mr-1" />선수 추가
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
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">이름</th>
                <th className="text-left px-4 py-3">포지션</th>
                {isEditMode && <th className="w-10 px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id} className={`border-b border-gray-800/50 ${i % 2 === 0 ? '' : 'bg-gray-900/50'} hover:bg-gray-800/30 transition-colors`}>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.number ?? '—'}</td>
                  <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{p.position ?? '—'}</td>
                  {isEditMode && (
                    <td className="px-4 py-3">
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
    </div>
  )
}
