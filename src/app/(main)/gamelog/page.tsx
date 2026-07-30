'use client'
import { useEffect, useRef, useState } from 'react'
import { Trash2, Scissors, Circle, X, ArrowUp, ArrowDown, Play, Square } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useGameStore } from '@/store/gameStore'
import { useEditMode } from '@/contexts/EditModeContext'
import { formatTimestamp } from '@/lib/youtube/utils'
import { EVENT_LABELS } from '@/types/database'
import type { Tournament, Game, GameEvent } from '@/types/database'

const EVENT_ICONS: Record<string, { Icon: LucideIcon; className: string }> = {
  shot_3p: { Icon: Circle, className: 'fill-yellow-400 text-yellow-400' },
  shot_2p_mid: { Icon: Circle, className: 'fill-blue-400 text-blue-400' },
  free_throw: { Icon: Circle, className: 'fill-[var(--mm-ink-soft)] text-[var(--mm-ink-soft)]' },
  oreb: { Icon: Circle, className: 'fill-green-400 text-green-400' },
  dreb: { Icon: Circle, className: 'fill-green-400 text-green-400' },
  assist: { Icon: Circle, className: 'fill-blue-400 text-blue-400' },
  steal: { Icon: Circle, className: 'fill-emerald-400 text-emerald-400' },
  block: { Icon: Circle, className: 'fill-purple-400 text-purple-400' },
  turnover: { Icon: Circle, className: 'fill-red-400 text-red-400' },
  foul: { Icon: Circle, className: 'fill-orange-400 text-orange-400' },
  opp_score: { Icon: X, className: 'text-red-400' },
  sub_in: { Icon: ArrowUp, className: 'text-green-400' },
  sub_out: { Icon: ArrowDown, className: 'text-red-400' },
  quarter_start: { Icon: Play, className: 'fill-current text-[var(--mm-muted)]' },
  quarter_end: { Icon: Square, className: 'fill-current text-[var(--mm-muted)]' },
  shot_layup: { Icon: Circle, className: 'fill-orange-400 text-orange-400' },
  shot_post: { Icon: Circle, className: 'fill-red-400 text-red-400' },
}

const QUARTER_OPTIONS = [
  { value: 1, label: 'Q1' },
  { value: 2, label: 'Q2' },
  { value: 3, label: 'Q3' },
  { value: 4, label: 'Q4' },
  { value: 5, label: 'OT1' },
  { value: 6, label: 'OT2' },
]

export default function GameLogPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [events, setEvents] = useState<GameEvent[]>([])
  const [filterPlayer, setFilterPlayer] = useState('')
  const { seekTo } = useGameStore()
  const { isEditMode } = useEditMode()

  // 쿼터 분리 팝오버 상태
  const [splitTarget, setSplitTarget] = useState<{ eventId: string; currentQ: number } | null>(null)
  const [splitNewQ, setSplitNewQ] = useState<number>(0)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch('/api/tournaments').then(r => r.json()).then(setTournaments) }, [])
  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
  }, [selectedTId])
  useEffect(() => {
    if (!selectedGId) return
    fetchEvents()
  }, [selectedGId, games])

  // 팝오버 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSplitTarget(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function fetchEvents() {
    const data = await fetch(`/api/events?gameId=${selectedGId}`).then(r => r.json())
    setEvents(data)
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    toast.success('이벤트 삭제됨')
    fetchEvents()
  }

  function openSplitPopover(eventId: string, currentQ: number) {
    const next = currentQ < 4 ? currentQ + 1 : currentQ + 1 <= 6 ? currentQ + 1 : currentQ
    setSplitNewQ(next)
    setSplitTarget({ eventId, currentQ })
  }

  async function confirmSplit() {
    if (!splitTarget || !splitNewQ || !selectedGId) return
    const res = await fetch('/api/events/split-quarter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: selectedGId, fromEventId: splitTarget.eventId, newQuarter: splitNewQ }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error || '쿼터 분리 실패')
      return
    }
    const oldLabel = splitTarget.currentQ > 4 ? `OT${splitTarget.currentQ - 4}` : `Q${splitTarget.currentQ}`
    const newLabel = splitNewQ > 4 ? `OT${splitNewQ - 4}` : `Q${splitNewQ}`
    toast.success(`${oldLabel} → ${newLabel} 쿼터 분리 완료 (${data.updated}개 이벤트)`)
    setSplitTarget(null)
    fetchEvents()
  }

  const uniquePlayers = Array.from(new Map(events.filter(e => e.player).map(e => [e.player_id, e.player!])).values())
  const filtered = filterPlayer ? events.filter(e => e.player_id === filterPlayer || e.related_player_id === filterPlayer) : events
  const quarters = [1, 2, 3, 4, 5, 6]

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={selectedTId} onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}>
          <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-52">
            <SelectValue placeholder="대회 선택">
              {selectedTId ? (() => { const t = tournaments.find(t => t.id === selectedTId); return t ? `${t.name} (${t.year})` : undefined })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedGId} onValueChange={v => setSelectedGId(v ?? '')} disabled={!selectedTId}>
          <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-52">
            <SelectValue placeholder="경기 선택">
              {selectedGId ? (() => { const g = games.find(g => g.id === selectedGId); return g ? `${g.date} vs ${g.opponent}` : undefined })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
            {games.map(g => <SelectItem key={g.id} value={g.id}>{g.date} vs {g.opponent}</SelectItem>)}
          </SelectContent>
        </Select>
        {uniquePlayers.length > 0 && (
          <Select value={filterPlayer} onValueChange={v => setFilterPlayer(v ?? '')}>
            <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-40">
              <SelectValue placeholder="선수 필터">
                {filterPlayer ? (() => { const p = uniquePlayers.find(p => p.id === filterPlayer); return p ? `${p.number}번 ${p.name}` : undefined })() : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
              <SelectItem value="">전체</SelectItem>
              {uniquePlayers.map(p => <SelectItem key={p.id} value={p.id}>{p.number}번 {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* 안내 배너 — 편집 모드에서만 */}
      {isEditMode && selectedGId && events.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-[var(--mm-yellow-soft)] border border-[color:var(--mm-yellow)]/40 rounded-lg text-xs text-[var(--mm-yellow-strong)] flex items-center gap-2">
          <Scissors size={12} className="shrink-0" aria-hidden="true" />
          각 이벤트 우측의 <strong className="inline-flex items-center gap-1"><Scissors size={11} aria-hidden="true" /> 버튼</strong>을 클릭하면 해당 이벤트부터 쿼터를 분리할 수 있습니다
        </div>
      )}

      {selectedGId && events.length === 0 && (
        <div className="text-center py-16 text-[var(--mm-muted)]">기록된 이벤트가 없습니다</div>
      )}

      {quarters.map(q => {
        const qEvents = filtered.filter(e => e.quarter === q)
        if (qEvents.length === 0) return null
        return (
          <div key={q} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-[var(--mm-rule)]" />
              <span className="text-[var(--mm-ink)] font-bold text-sm px-3 py-1 bg-[var(--mm-panel)] rounded-full border border-[var(--mm-rule)]">
                Q{q > 4 ? `OT${q - 4}` : q}
              </span>
              <div className="h-px flex-1 bg-[var(--mm-rule)]" />
            </div>
            <div className="space-y-1">
              {qEvents.map(e => {
                const iconSpec = EVENT_ICONS[e.type]
                return (
                <div key={e.id} className="relative flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-[var(--mm-panel)] transition-colors group">
                  {/* 타임코드 */}
                  <button
                    onClick={() => e.video_timestamp != null && seekTo(e.video_timestamp)}
                    className="text-[var(--mm-yellow-strong)] hover:opacity-80 text-xs font-mono w-14 shrink-0 text-right cursor-pointer"
                    title="클릭 시 영상 해당 구간으로 이동"
                  >
                    {e.video_timestamp != null ? formatTimestamp(e.video_timestamp) : '--:--'}
                  </button>
                  {/* 아이콘 */}
                  {iconSpec
                    ? <iconSpec.Icon className={`h-3.5 w-3.5 shrink-0 ${iconSpec.className}`} aria-hidden="true" />
                    : <Circle className="h-3.5 w-3.5 shrink-0 fill-[var(--mm-muted)] text-[var(--mm-muted)]" aria-hidden="true" />}
                  {/* 내용 */}
                  <div className="flex-1 text-sm">
                    {e.player && <span className="font-medium text-[var(--mm-ink)]">[{e.player.number}] {e.player.name}</span>}
                    {' '}
                    <span className="text-[var(--mm-ink-soft)]">{EVENT_LABELS[e.type]}</span>
                    {e.result && <span className={`ml-2 font-bold ${e.result === 'made' ? 'text-green-400' : 'text-red-400'}`}>{e.result === 'made' ? '✓' : '✗'}</span>}
                    {e.related_player && <span className="text-[var(--mm-muted)] text-xs ml-2">(어시스트: {e.related_player.name})</span>}
                    {e.type === 'opp_score' && <span className="ml-2 text-red-400">+{e.points}점</span>}
                  </div>
                  {/* 쿼터 분리 / 삭제 버튼 — 편집 모드에서만 */}
                  {isEditMode && (
                    <>
                      <button
                        onClick={() => openSplitPopover(e.id, e.quarter)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--mm-yellow-strong)] hover:opacity-80 p-1 cursor-pointer"
                        title="이 이벤트부터 쿼터 분리"
                      >
                        <Scissors size={13} aria-hidden="true" />
                      </button>
                      <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 p-1 cursor-pointer">
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </>
                  )}

                  {/* 쿼터 분리 팝오버 */}
                  {splitTarget?.eventId === e.id && (
                    <>
                    {/* 모바일 백드롭 */}
                    <div className="sm:hidden fixed inset-0 bg-[var(--mm-ink)]/60 z-40" onClick={() => setSplitTarget(null)} />
                    <div
                      ref={popoverRef}
                      className="fixed bottom-0 inset-x-0 sm:absolute sm:right-16 sm:top-0 sm:bottom-auto sm:inset-x-auto z-50 bg-[var(--mm-panel-alt)] border border-[color:var(--mm-yellow)]/50 rounded-t-2xl sm:rounded-xl shadow-2xl p-4 w-full sm:w-64 pb-safe-or-4 sm:pb-4"
                    >
                      <div className="text-xs text-[var(--mm-yellow-strong)] font-bold mb-2 flex items-center gap-1.5">
                        <Scissors size={12} aria-hidden="true" />
                        쿼터 분리
                      </div>
                      <p className="text-xs text-[var(--mm-muted)] mb-3">
                        이 이벤트부터 같은 Q{splitTarget.currentQ} 이후 기록을 아래 쿼터로 변경합니다
                      </p>
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {QUARTER_OPTIONS.filter(o => o.value !== splitTarget.currentQ).map(o => (
                          <button
                            key={o.value}
                            onClick={() => setSplitNewQ(o.value)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${splitNewQ === o.value ? 'bg-[var(--mm-yellow)] text-[var(--mm-black)]' : 'bg-[var(--mm-panel)] text-[var(--mm-muted)] hover:bg-[var(--mm-rule)]'}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={confirmSplit}
                          className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-[var(--mm-yellow)] hover:brightness-95 text-[var(--mm-black)] transition-colors cursor-pointer"
                        >
                          Q{splitTarget.currentQ} → {splitNewQ > 4 ? `OT${splitNewQ - 4}` : `Q${splitNewQ}`} 변경
                        </button>
                        <button
                          onClick={() => setSplitTarget(null)}
                          className="px-3 py-1.5 rounded-lg text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] bg-[var(--mm-panel)] hover:bg-[var(--mm-rule)] transition-colors cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                    </>
                  )}
                </div>
              )})}
            </div>
          </div>
        )
      })}

      {!selectedGId && (
        <div className="text-center py-16 text-[var(--mm-muted)]">대회와 경기를 선택하면 게임 로그가 표시됩니다</div>
      )}
    </div>
  )
}
