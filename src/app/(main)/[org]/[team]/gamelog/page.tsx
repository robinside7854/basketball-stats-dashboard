'use client'
// 게임 로그 — 경기 이벤트 목록 + 플레이 뷰어(2026-11-05)
//   이벤트를 누르면 그 경기 영상이 그 장면을 튼다. 재생기는 하이라이트 공용 HighlightsPlayer 를 그대로 쓴다.
//   주소 `?game=<경기id>&play=<이벤트id>` 로 그 장면을 바로 열 수 있다. 편집 모드(삭제·쿼터 분리)는 종전 그대로.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Scissors, Play } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import { extractYouTubeId, formatTimestamp } from '@/lib/youtube/utils'
import { EVENT_LABELS } from '@/types/database'
import type { Tournament, Game, GameEvent } from '@/types/database'
import SubTabNav from '@/components/layout/SubTabNav'
import { gameSubTabs } from '@/components/layout/subTabs'
import HighlightsPlayer, { type HighlightsPlayerHandle } from '@/components/highlights/HighlightsPlayer'
import type { HighlightClip } from '@/lib/highlights/types'
import { PLAY_CHIPS, chipOf, matchesFilter, playWindow, quarterLabel, type PlayChip } from '@/lib/playViewer'

const AUTO_ADVANCE_KEY = 'gamelog:autoAdvance'

/** 「지금 장면」 한 줄 — 선수 · 기록 이름 · 성공 슛 점수 */
function playTitle(e: GameEvent): string {
  const who = e.player ? `${e.player.number}번 ${e.player.name} ` : ''
  const pts = chipOf(e) === 'made' && e.points ? ` +${e.points}` : ''
  return `${who}${EVENT_LABELS[e.type] ?? e.type}${pts}`
}

const EVENT_ICONS: Record<string, string> = {
  shot_3p: '🟡', shot_2p_mid: '🔵', free_throw: '⚪',
  oreb: '🟢', dreb: '🟢', assist: '🔵', steal: '💚', block: '💜',
  turnover: '🔴', foul: '🟠', opp_score: '❌',
  sub_in: '⬆️', sub_out: '⬇️', quarter_start: '▶️', quarter_end: '⏹️',
  shot_layup: '🟠', shot_post: '🔴',
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
  const team = useTeam()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [events, setEvents] = useState<GameEvent[]>([])
  const [filterPlayer, setFilterPlayer] = useState('')
  const [filterQuarter, setFilterQuarter] = useState<number | null>(null)
  const [chips, setChips] = useState<ReadonlySet<PlayChip>>(new Set())
  const [currentPlayId, setCurrentPlayId] = useState<string | null>(null)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const playerRef = useRef<HighlightsPlayerHandle | null>(null)
  // 목록을 직접 눌러 고른 장면은 이미 화면에 있다 — 그때는 스크롤하지 않는다(재생기 이전/다음·자동 넘김일 때만)
  const pickedFromListRef = useRef(false)
  const urlReadyRef = useRef(false)
  const { isEditMode, teamHeaders } = useEditMode()

  const [splitTarget, setSplitTarget] = useState<{ eventId: string; currentQ: number } | null>(null)
  const [splitNewQ, setSplitNewQ] = useState<number>(0)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(setTournaments) }, [team])

  // 주소로 들어온 장면 열기 — 경기에서 대회를 거꾸로 찾아 고른다(대회·경기 선택은 화면 상태라 주소엔 경기만 둔다)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const gid = q.get('game')
    if (gid) {
      setSelectedGId(gid)
      setCurrentPlayId(q.get('play'))
      fetch(`/api/games/${gid}`).then(r => r.ok ? r.json() : null).then((g: Game | null) => { if (g?.tournament_id) setSelectedTId(g.tournament_id) })
    }
    try { setAutoAdvance(localStorage.getItem(AUTO_ADVANCE_KEY) === '1') } catch { /* 저장소 막힘 — 기본 꺼짐 */ }
    urlReadyRef.current = true
  }, [])

  // 고른 경기·장면을 주소에 반영 (뒤로가기 기록은 남기지 않는다)
  useEffect(() => {
    if (!urlReadyRef.current) return
    const q = new URLSearchParams(window.location.search)
    if (selectedGId) q.set('game', selectedGId); else q.delete('game')
    if (selectedGId && currentPlayId) q.set('play', currentPlayId); else q.delete('play')
    const qs = q.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }, [selectedGId, currentPlayId])
  useEffect(() => {
    if (!selectedTId) return
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
  }, [selectedTId])
  useEffect(() => {
    if (!selectedGId) return
    fetchEvents()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGId, games])

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
    await fetch(`/api/events/${id}`, { method: 'DELETE', headers: { ...teamHeaders } })
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
      headers: { 'Content-Type': 'application/json', ...teamHeaders },
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
  const filtered = events.filter(e => matchesFilter(e, { chips, quarter: filterQuarter, playerId: filterPlayer }))
  const quarters = [1, 2, 3, 4, 5, 6]
  const presentQuarters = quarters.filter(q => events.some(e => e.quarter === q))

  const game = games.find(g => g.id === selectedGId)
  const youtubeUrl = game?.youtube_url ?? ''
  const videoId = youtubeUrl ? extractYouTubeId(youtubeUrl) : null

  // 이벤트 → 클립. 이벤트 id 로 객체를 한 번만 만든다 — 필터를 바꿀 때마다 새 객체면 재생기가 같은 장면을 처음부터 다시 튼다
  const clipById = useMemo(() => {
    const m = new Map<string, HighlightClip>()
    if (!videoId) return m
    for (const e of events) {
      const w = playWindow(e)
      if (!w) continue
      m.set(e.id, {
        event_id: e.id, video_url: youtubeUrl, video_id: videoId,
        video_timestamp: e.video_timestamp!, clip_start: w.start, clip_end: w.end,
        player_id: e.player_id ?? null, player_name: e.player?.name ?? '', player_number: e.player ? Number(e.player.number) || null : null,
        player_photo: e.player?.photo_url ?? null, team_id: null, team_name: '', team_color: '',
        shot_type: e.type, points: e.points, game_id: e.game_id, home_team_name: '', away_team_name: '',
      })
    }
    return m
  }, [events, videoId, youtubeUrl])

  const playlist = filtered.map(e => clipById.get(e.id)).filter((c): c is HighlightClip => !!c)
  const foundIdx = currentPlayId ? playlist.findIndex(c => c.event_id === currentPlayId) : -1
  const currentIdx = foundIdx >= 0 ? foundIdx : 0
  // 고른 장면이 필터로 빠지면 재생기는 목록 첫 장면을 보여 준다 — 표시도 그쪽을 따른다
  const activeId = currentPlayId && playlist.length > 0 ? playlist[currentIdx].event_id : null
  const activeEvent = activeId ? events.find(e => e.id === activeId) ?? null : null
  const caption = activeEvent ?? events.find(e => e.id === playlist[0]?.event_id) ?? null

  function pickPlay(e: GameEvent) {
    if (!clipById.has(e.id)) return
    pickedFromListRef.current = true
    setCurrentPlayId(e.id)
    playerRef.current?.activate()   // 포스터 상태면 이 클릭(제스처) 안에서 재생기를 만든다
  }

  useEffect(() => {
    if (!activeId) return
    if (pickedFromListRef.current) { pickedFromListRef.current = false; return }
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    // center — 폰에서는 위에 고정된 영상이 화면 윗부분을 가린다
    document.getElementById(`play-${activeId}`)?.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
  }, [activeId])

  function toggleChip(k: PlayChip) {
    setChips(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n })
  }
  function toggleAutoAdvance() {
    const v = !autoAdvance
    setAutoAdvance(v)
    try { localStorage.setItem(AUTO_ADVANCE_KEY, v ? '1' : '0') } catch { /* 저장소 막힘 — 이번 화면에서만 */ }
  }
  const chipCls = (on: boolean) => `min-h-11 px-3 rounded-full text-base font-medium border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] ${on ? 'bg-[var(--mm-yellow)] text-[var(--mm-black)] border-[var(--mm-yellow)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)] hover:text-[var(--mm-ink)]'}`

  return (
    <div>
      <SubTabNav tabs={gameSubTabs(isEditMode)} />

      <div className="flex flex-wrap gap-3 mb-6">
        <Select value={selectedTId} onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId(''); setCurrentPlayId(null) }}>
          <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-52 cursor-pointer">
            <SelectValue placeholder="대회 선택">
              {selectedTId ? (() => { const t = tournaments.find(t => t.id === selectedTId); return t ? `${t.name} (${t.year})` : undefined })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedGId} onValueChange={v => { setSelectedGId(v ?? ''); setCurrentPlayId(null) }} disabled={!selectedTId}>
          <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-52 cursor-pointer">
            <SelectValue placeholder="경기 선택">
              {selectedGId ? (() => { const g = games.find(g => g.id === selectedGId); return g ? `${g.date} vs ${g.opponent}` : undefined })() : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
            {games.map(g => <SelectItem key={g.id} value={g.id}>{g.date} vs {g.opponent}</SelectItem>)}
          </SelectContent>
        </Select>
        {uniquePlayers.length > 0 && (
          <Select value={filterPlayer} onValueChange={v => setFilterPlayer(v ?? '')}>
            <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-40 cursor-pointer">
              <SelectValue placeholder="선수 필터">
                {filterPlayer ? (() => { const p = uniquePlayers.find(p => p.id === filterPlayer); return p ? `${p.number}번 ${p.name}` : undefined })() : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
              <SelectItem value="">전체</SelectItem>
              {uniquePlayers.map(p => <SelectItem key={p.id} value={p.id}>{p.number}번 {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {presentQuarters.length > 1 && (
          <Select value={filterQuarter == null ? '' : String(filterQuarter)} onValueChange={v => setFilterQuarter(v ? Number(v) : null)}>
            <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-32 cursor-pointer" aria-label="쿼터 필터">
              <SelectValue placeholder="쿼터">
                {filterQuarter != null ? quarterLabel(filterQuarter) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
              <SelectItem value="">전체 쿼터</SelectItem>
              {presentQuarters.map(q => <SelectItem key={q} value={String(q)}>{quarterLabel(q)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {selectedGId && events.length > 0 && (
        <div className="mb-6 space-y-3">
          {videoId ? (
            <>
              {/* 폰: 목록을 내려도 영상이 보이게 상단 탭 아래 고정 (기록 화면과 같은 자리) */}
              <div className="sticky top-[52px] z-30 bg-[var(--mm-ground)] lg:static lg:z-auto">
                <HighlightsPlayer
                  ref={playerRef}
                  clips={playlist}
                  currentIdx={currentIdx}
                  onIndexChange={i => { const c = playlist[i]; if (c) setCurrentPlayId(c.event_id) }}
                  captionOverride={caption ? { primary: playTitle(caption), secondary: quarterLabel(caption.quarter) } : undefined}
                  hideScoreboard
                  autoAdvance={autoAdvance}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="flex-1 min-w-0 text-base text-[var(--mm-ink)]" aria-live="polite">
                  {activeEvent ? (
                    <>
                      <span className="text-[var(--mm-muted)]">지금 장면 · </span>
                      <span className="font-mono">{quarterLabel(activeEvent.quarter)} {formatTimestamp(activeEvent.video_timestamp!)}</span>
                      {' '}<span className="font-bold">{playTitle(activeEvent)}</span>
                      {activeEvent.related_player && <span className="text-[var(--mm-ink-soft)]"> · 어시스트 {activeEvent.related_player.name}</span>}
                    </>
                  ) : (
                    <span className="text-[var(--mm-muted)]">아래 목록에서 장면을 누르면 그 순간부터 재생돼요</span>
                  )}
                </p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoAdvance}
                  onClick={toggleAutoAdvance}
                  className="inline-flex items-center gap-2 min-h-11 px-3 rounded-lg text-base text-[var(--mm-ink)] bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] transition-colors cursor-pointer hover:bg-[var(--mm-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                >
                  <span aria-hidden className={`relative inline-block w-9 h-5 rounded-full transition-colors ${autoAdvance ? 'bg-[var(--mm-yellow)]' : 'bg-[var(--mm-rule)]'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-[var(--mm-panel)] transition-transform ${autoAdvance ? 'translate-x-4' : ''}`} />
                  </span>
                  자동 넘김 {autoAdvance ? '켬' : '끔'}
                </button>
              </div>
            </>
          ) : (
            <p className="text-base text-[var(--mm-muted)]">이 경기는 영상이 없어요</p>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="기록 종류 필터 (여러 개 선택)">
            {PLAY_CHIPS.map(c => (
              <button key={c.key} type="button" aria-pressed={chips.has(c.key)} onClick={() => toggleChip(c.key)} className={chipCls(chips.has(c.key))}>
                {c.label}
              </button>
            ))}
            {chips.size > 0 && (
              <button type="button" onClick={() => setChips(new Set())} className={chipCls(false)}>전체 보기</button>
            )}
          </div>
        </div>
      )}

      {isEditMode && selectedGId && events.length > 0 && (
        <div className="mb-4 px-4 py-2.5 bg-[var(--mm-yellow-soft)] border border-[var(--mm-yellow)] rounded-lg text-xs text-[var(--mm-yellow-strong)] flex items-center gap-2">
          <Scissors size={14} className="shrink-0" />
          각 이벤트 우측의 <strong>✂️ 버튼</strong>을 클릭하면 해당 이벤트부터 쿼터를 분리할 수 있습니다
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
              <span className="text-[var(--mm-ink)] font-bold text-sm px-3 py-1 bg-[var(--mm-panel)] rounded-full border border-[color:var(--color-hoop-orange-500)]">
                {quarterLabel(q)}
              </span>
              <div className="h-px flex-1 bg-[var(--mm-rule)]" />
            </div>
            <div className="space-y-1">
              {qEvents.map(e => {
                const playable = clipById.has(e.id)
                const isActive = e.id === activeId
                return (
                <div
                  key={e.id}
                  id={`play-${e.id}`}
                  // 줄 아무 데나 눌러도 재생 (마우스 편의) — 키보드는 왼쪽 시각 버튼. 편집 버튼 클릭은 건드리지 않는다
                  //   쿼터 분리 팝업(이 줄 안에 그려짐)이 열려 있을 때도 건드리지 않는다
                  onClick={ev => { if (playable && !splitTarget && !(ev.target as HTMLElement).closest('button')) pickPlay(e) }}
                  className={`relative flex items-center gap-3 px-4 py-2 rounded-lg transition-colors group ${playable ? 'cursor-pointer' : ''} ${isActive ? 'bg-[var(--mm-yellow-soft)] border-l-4 border-[var(--mm-yellow)]' : 'hover:bg-[var(--mm-panel-alt)]'}`}
                >
                  <button
                    type="button"
                    onClick={() => pickPlay(e)}
                    disabled={!playable}
                    aria-current={isActive ? 'true' : undefined}
                    aria-label={playable
                      ? `${formatTimestamp(e.video_timestamp!)} 장면 재생`
                      : e.video_timestamp == null ? '영상 시각이 기록되지 않아 재생할 수 없어요' : '이 경기는 영상이 없어 재생할 수 없어요'}
                    className="inline-flex items-center justify-end gap-1 min-h-11 text-[var(--mm-yellow-strong)] hover:brightness-90 text-sm font-mono w-16 shrink-0 text-right cursor-pointer disabled:cursor-default disabled:text-[var(--mm-muted)] disabled:hover:brightness-100 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                  >
                    {playable && <Play size={14} aria-hidden fill={isActive ? 'currentColor' : 'none'} />}
                    {e.video_timestamp != null ? formatTimestamp(e.video_timestamp) : '--:--'}
                  </button>
                  <span className="text-sm">{EVENT_ICONS[e.type] || '•'}</span>
                  <div className="flex-1 text-sm">
                    {e.player && <span className="font-medium text-[var(--mm-ink)]">[{e.player.number}] {e.player.name}</span>}
                    {' '}
                    <span className="text-[var(--mm-ink-soft)]">{EVENT_LABELS[e.type]}</span>
                    {e.result && <span className={`ml-2 font-bold ${e.result === 'made' ? 'text-green-400' : 'text-red-400'}`}>{e.result === 'made' ? '✓' : '✗'}</span>}
                    {e.related_player && <span className="text-[var(--mm-muted)] text-xs ml-2">(어시스트: {e.related_player.name})</span>}
                    {e.type === 'opp_score' && <span className="ml-2 text-red-400">+{e.points}점</span>}
                    {isActive && <span className="ml-2 text-xs font-bold text-[var(--mm-yellow-strong)]">지금 장면</span>}
                  </div>
                  {isEditMode && (
                    <>
                      <button
                        onClick={() => openSplitPopover(e.id, e.quarter)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--mm-yellow-strong)] hover:brightness-90 p-1 min-h-11 min-w-11 flex items-center justify-center cursor-pointer"
                        title="이 이벤트부터 쿼터 분리"
                      >
                        <Scissors size={14} />
                      </button>
                      <button onClick={() => deleteEvent(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-400 p-1 min-h-11 min-w-11 flex items-center justify-center cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}

                  {splitTarget?.eventId === e.id && (
                    <>
                    {/* 모바일 백드롭 */}
                    <div className="sm:hidden fixed inset-0 bg-[var(--mm-ink)]/60 z-40" onClick={() => setSplitTarget(null)} />
                    <div
                      ref={popoverRef}
                      className="fixed bottom-0 inset-x-0 sm:absolute sm:right-16 sm:top-0 sm:bottom-auto sm:inset-x-auto z-50 bg-[var(--mm-panel)] border border-[var(--mm-yellow)] rounded-t-2xl sm:rounded-xl shadow-2xl p-4 w-full sm:w-64 pb-safe-or-4 sm:pb-4"
                    >
                      <div className="text-xs text-[var(--mm-yellow-strong)] font-bold mb-2 flex items-center gap-1.5">
                        <Scissors size={14} />
                        쿼터 분리
                      </div>
                      <p className="text-xs text-[var(--mm-ink-soft)] mb-3">
                        이 이벤트부터 같은 Q{splitTarget.currentQ} 이후 기록을 아래 쿼터로 변경합니다
                      </p>
                      <div className="flex gap-1.5 mb-3 flex-wrap">
                        {QUARTER_OPTIONS.filter(o => o.value !== splitTarget.currentQ).map(o => (
                          <button
                            key={o.value}
                            onClick={() => setSplitNewQ(o.value)}
                            className={`min-h-9 px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${splitNewQ === o.value ? 'bg-[var(--mm-yellow)] text-[var(--mm-black)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'}`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={confirmSplit}
                          className="flex-1 min-h-11 py-1.5 rounded-lg text-xs font-bold bg-[var(--mm-yellow)] hover:brightness-95 text-[var(--mm-black)] transition-colors cursor-pointer"
                        >
                          Q{splitTarget.currentQ} → {splitNewQ > 4 ? `OT${splitNewQ - 4}` : `Q${splitNewQ}`} 변경
                        </button>
                        <button
                          onClick={() => setSplitTarget(null)}
                          className="min-h-11 px-3 py-1.5 rounded-lg text-xs text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] bg-[var(--mm-panel-alt)] transition-colors cursor-pointer"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                    </>
                  )}
                </div>
                )
              })}
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
