'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Tournament, Player } from '@/types/database'

interface Props { tournament: Tournament | null; onClose: () => void; onSaved: () => void }

export default function TournamentForm({ tournament, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    name: tournament?.name ?? '',
    year: tournament?.year ?? new Date().getFullYear(),
    type: tournament?.type ?? 'regular',
    description: tournament?.description ?? '',
  })
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/players').then(r => r.json()).then((data: Player[]) => {
      setAllPlayers(data.filter(p => p.is_active))
    })
    if (tournament) {
      fetch(`/api/tournament-players?tournamentId=${tournament.id}`)
        .then(r => r.json())
        .then(data => setSelectedPlayerIds(data.player_ids || []))
    }
  }, [tournament])

  const togglePlayer = (id: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const url = tournament ? `/api/tournaments/${tournament.id}` : '/api/tournaments'
    const method = tournament ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    if (!res.ok) { toast.error('대회 저장 실패'); return }
    const saved = await res.json()
    const tId = saved.id ?? tournament?.id
    // 선수 목록 저장
    const r2 = await fetch('/api/tournament-players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournament_id: tId, player_ids: selectedPlayerIds }),
    })
    if (!r2.ok) {
      const err = await r2.json()
      toast.error(`참석 선수 저장 실패: ${err.error ?? '알 수 없는 오류'}`)
      return
    }
    onSaved()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{tournament ? '대회 수정' : '대회 추가'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm text-gray-400 mb-1 block">대회명 *</label>
            <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">연도 *</label>
              <Input type="number" value={form.year} onChange={e => setForm(p => ({ ...p, year: Number(e.target.value) }))} required className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">대회 유형</label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as typeof form.type }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white">
                  <SelectItem value="pro">선출부</SelectItem>
                  <SelectItem value="amateur">비선출부</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">설명</label>
            <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="bg-gray-800 border-gray-700 text-white" />
          </div>

          {/* 참석 선수 선택 */}
          {allPlayers.length > 0 && (
            <div>
              <label className="text-sm text-gray-400 mb-2 block">
                참석 선수 <span className="text-blue-400">({selectedPlayerIds.length}명 선택)</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {allPlayers.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePlayer(p.id)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium transition-colors text-left ${
                      selectedPlayerIds.includes(p.id)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    <span className="font-bold">{p.number}</span> {p.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">선택하지 않으면 전체 선수가 경기 기록에 표시됩니다</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700 text-gray-300">취소</Button>
            <Button type="submit" className="bg-blue-500 hover:bg-blue-600">저장</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
