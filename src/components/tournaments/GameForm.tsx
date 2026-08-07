'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEditMode } from '@/contexts/EditModeContext'
import type { Game } from '@/types/database'

interface YTVideo {
  video_id: string
  title: string
  url: string
  thumbnail: string | null
  parsed: { round?: string; opponent?: string; date?: string; tournament?: string }
  score: number
}

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
  const [ytSearching, setYtSearching] = useState(false)
  const [ytSuggestions, setYtSuggestions] = useState<YTVideo[]>([])
  const { teamHeaders } = useEditMode()

  async function searchYouTube() {
    if (!form.date || !form.opponent) return
    setYtSearching(true)
    setYtSuggestions([])
    const res = await fetch(
      `/api/youtube/search?date=${form.date}&opponent=${encodeURIComponent(form.opponent)}`
    )
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? 'YouTube 검색 실패')
    } else if (data.videos?.length === 0) {
      toast.info('일치하는 영상을 찾지 못했습니다')
    } else {
      setYtSuggestions(data.videos ?? [])
    }
    setYtSearching(false)
  }

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
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...teamHeaders }, body: JSON.stringify(body) })
    if (res.ok) onSaved()
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] max-w-lg">
        <DialogHeader><DialogTitle>{game ? '경기 수정' : '경기 추가'}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[var(--mm-muted)] mb-1 block">날짜 *</label>
              <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
            </div>
            <div>
              <label className="text-sm text-[var(--mm-muted)] mb-1 block">경기 구분</label>
              <Select value={form.round} onValueChange={v => setForm(p => ({ ...p, round: v ?? '' }))}>
                <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
                  {ROUNDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">상대팀 *</label>
            <Input value={form.opponent} onChange={e => setForm(p => ({ ...p, opponent: e.target.value }))} required placeholder="OO팀" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>
          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">장소</label>
            <Input value={form.venue} onChange={e => setForm(p => ({ ...p, venue: e.target.value }))} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>
          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">YouTube URL</label>
            <div className="flex gap-2">
              <Input
                value={form.youtube_url}
                onChange={e => { setForm(p => ({ ...p, youtube_url: e.target.value })); setYtSuggestions([]) }}
                placeholder="https://youtu.be/..."
                className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={searchYouTube}
                disabled={!form.date || !form.opponent || ytSearching}
                className="border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)] shrink-0 px-3 disabled:opacity-40 cursor-pointer"
                title={!form.date || !form.opponent ? '날짜와 상대팀을 먼저 입력하세요' : 'basket-lab 채널에서 자동 검색'}
              >
                {ytSearching
                  ? <span className="text-xs whitespace-nowrap">검색 중...</span>
                  : <><Search size={14} className="mr-1" aria-hidden="true" /><span className="text-xs">자동검색</span></>
                }
              </Button>
            </div>
            {/* 검색 결과 */}
            {ytSuggestions.length > 0 && (
              <div className="mt-1.5 border border-[var(--mm-rule)] rounded-lg overflow-hidden bg-[var(--mm-panel)]">
                <p className="text-xs text-[var(--mm-muted)] px-3 py-1.5 border-b border-[var(--mm-rule)]">basket-lab 채널 검색 결과 — 클릭하면 URL 자동 입력</p>
                {ytSuggestions.slice(0, 4).map(v => (
                  <button
                    key={v.video_id}
                    type="button"
                    onClick={() => { setForm(p => ({ ...p, youtube_url: v.url })); setYtSuggestions([]) }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--mm-panel-alt)] border-b border-[var(--mm-rule)] last:border-0 flex items-start gap-2.5 transition-colors cursor-pointer"
                  >
                    {v.thumbnail && (
                      <img src={v.thumbnail} alt="" className="w-14 h-10 object-cover rounded shrink-0 opacity-80" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[var(--mm-ink-soft)] line-clamp-2 leading-snug">{v.title}</p>
                      <p className="text-[var(--mm-muted)] mt-0.5">
                        {v.parsed.date ?? ''}{v.parsed.round ? ` · ${v.parsed.round}` : ''}
                        {v.score >= 10 && <span className="ml-1.5 text-[var(--mm-positive)] font-bold">추천</span>}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {!form.youtube_url && !ytSearching && ytSuggestions.length === 0 && (
              <p className="text-xs text-[var(--mm-muted)] mt-1">날짜·상대팀 입력 후 자동검색 버튼으로 basket-lab 영상 연결</p>
            )}
          </div>
          <div>
            <label className="text-sm text-[var(--mm-muted)] mb-1 block">영상 시작 오프셋 (예: 08:40)</label>
            <Input type="text" value={form.youtube_start_offset} onChange={e => setForm(p => ({ ...p, youtube_start_offset: e.target.value }))} placeholder="MM:SS" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[var(--mm-muted)] mb-1 block">우리팀 점수</label>
              <Input type="number" value={form.our_score} onChange={e => setForm(p => ({ ...p, our_score: Number(e.target.value) }))} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
            </div>
            <div>
              <label className="text-sm text-[var(--mm-muted)] mb-1 block">상대팀 점수</label>
              <Input type="number" value={form.opponent_score} onChange={e => setForm(p => ({ ...p, opponent_score: Number(e.target.value) }))} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] cursor-pointer">취소</Button>
            <Button type="submit" className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 cursor-pointer">저장</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
