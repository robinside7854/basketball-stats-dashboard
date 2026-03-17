'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Game } from '@/types/database'

const ROUNDS = ['조별예선', '16강', '8강', '4강', '결승']

interface Props { tournamentId: string; game: Game | null; onClose: () => void; onSaved: () => void }

function secondsToMMSS(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function mmssToSeconds(value: string): number {
  const parts = value.split(':')
  if (parts.length === 2) {
    const m = parseInt(parts[0]) || 0
    const s = parseInt(parts[1]) || 0
    return m * 60 + s
  }
  return parseInt(value) || 0
}

export default function GameForm({ tournamentId, game, onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    date: game?.date ?? new Date().toISOString().split('T')[0],
    opponent: game?.opponent ?? '',
    round: game?.round ?? '',
    venue: game?.venue ?? '',
    youtube_url: game?.youtube_url ?? '',
    youtube_start_offset: secondsToMMSS(game?.youtube_start_offset ?? 0),
    our_score: game?.our_score ?? 0,
    opponent_score: game?.opponent_score ?? 0,
    notes: game?.notes ?? '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const body = {
      ...form,
      tournament_id: tournamentId,
      youtube_start_offset: mmssToSeconds(form.youtube_start_offset),
      our_score: Number(form.our_score),
      opponent_score: Number(form.opponent_score),
      round: form.round || null,
    }
    const url = game ? `/api/games/${game.id}` : '/api/games'
    const method = game ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) onSaved()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg">
        <DialogHeader><DialogTitle>{game ? '경기 수정' : '경기 추가'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">날짜 *</label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">경기 구분</label>
              <Select value={form.round} onValueChange={v => setForm(p => ({ ...p, round: v ?? '' }))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white">
                  {ROUNDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">상대팀 *</label>
            <Input value={form.opponent} onChange={e => setForm(p => ({ ...p, opponent: e.target.value }))} required placeholder="OO팀" className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">장소</label>
            <Input value={form.venue} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">YouTube URL</label>
            <Input value={form.youtube_url} onChange={e => setForm(p => ({ ...p, youtube_url: e.target.value }))} placeholder="https://youtu.be/..." className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div>
            <label className="text-sm text-gray-400 mb-1 block">영상 시작 오프셋 (예: 08:40)</label>
            <Input type="text" value={form.youtube_start_offset} onChange={e => setForm(p => ({ ...p, youtube_start_offset: e.target.value }))} placeholder="MM:SS" className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-gray-400 mb-1 block">우리팀 점수</label>
              <Input type="number" value={form.our_score} onChange={e => setForm(p => ({ ...p, our_score: Number(e.target.value) }))} className="bg-gray-800 border-gray-700 text-white" />
            </div>
            <div>
              <label className="text-sm text-gray-400 mb-1 block">상대팀 점수</label>
              <Input type="number" value={form.opponent_score} onChange={e => setForm(p => ({ ...p, opponent_score: Number(e.target.value) }))} className="bg-gray-800 border-gray-700 text-white" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-gray-700 text-gray-300">취소</Button>
            <Button type="submit" className="bg-blue-500 hover:bg-blue-600">저장</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
