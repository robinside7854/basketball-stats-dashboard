'use client'
// 영상 리뷰 — 코치가 경기 영상을 보며 수비 장면에 핀을 꽂는 화면 (편집모드 전용)
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin, Lock } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LabelInput from '@/components/pins/LabelInput'
import PinList from '@/components/pins/PinList'
import { useGameStore } from '@/store/gameStore'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import type { CoachPin, LabelOption } from '@/types/coachPin'
import type { Tournament, Game } from '@/types/database'
import SubTabNav from '@/components/layout/SubTabNav'
import { videoSubTabs } from '@/components/layout/subTabs'

export default function ReviewPage() {
  const { isEditMode, openPinModal } = useEditMode()

  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Lock size={32} className="text-gray-600" aria-hidden />
        <div>
          <div className="text-lg font-bold text-white">편집 모드 전용</div>
          <p className="text-gray-400 text-sm mt-1">영상 리뷰는 편집 모드에서만 가능합니다</p>
        </div>
        <button
          onClick={openPinModal}
          className="px-5 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer transition-colors"
        >
          PIN 입력
        </button>
      </div>
    )
  }
  return <ReviewInner />
}

function ReviewInner() {
  const team = useTeam()
  const params = useParams<{ org: string }>()
  const org = params.org
  const { teamHeaders } = useEditMode()
  const ytPlayer = useGameStore(s => s.ytPlayer)

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [pins, setPins] = useState<CoachPin[]>([])
  const [labelOptions, setLabelOptions] = useState<LabelOption[]>([])

  const [drafting, setDrafting] = useState(false)   // 라벨 입력 중
  const [draftTs, setDraftTs] = useState(0)
  const [draftLabel, setDraftLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedGame = games.find(g => g.id === selectedGId)

  useEffect(() => {
    fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then((d: unknown) => setTournaments(Array.isArray(d) ? d : []))
    fetch(`/api/pins/labels?org=${org}&team=${team}`).then(r => r.json()).then((d: unknown) => setLabelOptions(Array.isArray(d) ? d : []))
  }, [team, org])

  useEffect(() => {
    if (!selectedTId) { setGames([]); return }
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then((d: unknown) => setGames(Array.isArray(d) ? d : []))
  }, [selectedTId])

  const loadPins = useCallback(() => {
    if (!selectedGId) { setPins([]); return }
    fetch(`/api/pins?gameId=${selectedGId}`).then(r => r.json()).then((d: unknown) => setPins(Array.isArray(d) ? d : []))
  }, [selectedGId])

  useEffect(() => { loadPins() }, [loadPins])

  // ── YouTube 원격 제어 (기록 페이지와 동일) ──────────────────
  const seekRelative = useCallback((delta: number) => {
    if (!ytPlayer) return
    try {
      ytPlayer.seekTo((ytPlayer.getCurrentTime() ?? 0) + delta, true)
      ytPlayer.unMute()
    } catch {}
  }, [ytPlayer])

  const seekTo = useCallback((ts: number) => {
    if (!ytPlayer) return
    try { ytPlayer.seekTo(ts, true); ytPlayer.unMute(); ytPlayer.playVideo() } catch {}
  }, [ytPlayer])

  const togglePlay = useCallback(() => {
    if (!ytPlayer) return
    try {
      if (ytPlayer.getPlayerState() === 1) ytPlayer.pauseVideo()
      else { ytPlayer.unMute(); ytPlayer.playVideo() }
    } catch {}
  }, [ytPlayer])

  // 핀 꽂기 — 현재 시각을 잡고 영상을 멈춘 뒤 라벨 입력을 연다
  const startPin = useCallback(() => {
    if (!ytPlayer) { toast.error('영상이 준비되지 않았습니다'); return }
    let ts = 0
    try { ts = ytPlayer.getCurrentTime() ?? 0; ytPlayer.pauseVideo() } catch {}
    setDraftTs(ts)
    setDraftLabel('')
    setDrafting(true)
  }, [ytPlayer])

  // 키보드 — 라벨 입력 중에는 단축키를 비활성화한다 (타이핑과 충돌)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (drafting) return
      if (!ytPlayer) return
      if (e.code === 'Space')           { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); seekRelative(e.shiftKey ? -10 : -5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(e.shiftKey ? 10 : 5) }
      else if (e.code === 'KeyP')       { e.preventDefault(); startPin() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer, drafting, togglePlay, seekRelative, startPin])

  async function savePin() {
    if (saving) return
    const label = draftLabel.trim()
    if (!label) { toast.error('라벨을 입력하세요'); return }
    if (!selectedGId) return
    setSaving(true)
    try {
      const res = await fetch('/api/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ org, team, gameId: selectedGId, videoTimestamp: draftTs, label }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(res.status === 401 ? '편집 권한이 만료되었습니다. PIN을 다시 입력하세요.' : (d.error ?? '저장 실패'))
        return
      }
      toast.success(`핀 저장됨 · ${label}`)
      setDrafting(false)
      setDraftLabel('')
      loadPins()
      fetch(`/api/pins/labels?org=${org}&team=${team}`).then(r => r.json()).then((d: unknown) => setLabelOptions(Array.isArray(d) ? d : []))
      try { ytPlayer?.playVideo() } catch {}
    } finally {
      setSaving(false)
    }
  }

  async function deletePin(id: string) {
    const target = pins.find(p => p.id === id)
    if (!confirm(`'${target?.label ?? '이 핀'}' 핀을 삭제할까요? 되돌릴 수 없습니다.`)) return
    const res = await fetch(`/api/pins/${id}?org=${org}&team=${team}`, {
      method: 'DELETE',
      headers: { ...teamHeaders },
    })
    if (!res.ok) {
      toast.error(res.status === 401 ? '편집 권한이 만료되었습니다. PIN을 다시 입력하세요.' : '삭제 실패')
      return
    }
    toast.success('핀 삭제됨')
    loadPins()
  }

  function cancelDraft() {
    setDrafting(false)
    setDraftLabel('')
    try { ytPlayer?.playVideo() } catch {}
  }

  return (
    <div className="space-y-3">
      {/* ReviewInner 는 부모(ReviewPage)에서 isEditMode 일 때만 렌더되므로 항상 true */}
      <SubTabNav tabs={videoSubTabs(true)} />

      {/* 대회 / 경기 선택 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <Select value={selectedTId} onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 w-full sm:w-52 text-sm">
            <SelectValue placeholder="대회 선택" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedGId} onValueChange={v => setSelectedGId(v ?? '')} disabled={!selectedTId}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 w-full sm:w-56 text-sm">
            <SelectValue placeholder="경기 선택" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {games.map(g => <SelectItem key={g.id} value={g.id}>{g.date} vs {g.opponent}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!selectedGame ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">대회와 경기를 선택하세요</p>
        </div>
      ) : !selectedGame.youtube_url ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">이 경기에는 연결된 영상이 없습니다</p>
          <p className="text-sm mt-2">대회 관리 탭에서 YouTube 영상을 먼저 연결하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 영상 + 조작 */}
          <div className="lg:col-span-2 space-y-3">
            <YouTubePlayer
              key={selectedGame.id}
              youtubeUrl={selectedGame.youtube_url}
              startOffset={selectedGame.youtube_start_offset}
            />

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => seekRelative(-5)}
                className="min-h-[44px] px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-bold cursor-pointer transition-colors"
              >
                ← 5초
              </button>
              <button
                type="button"
                onClick={startPin}
                disabled={drafting}
                className="min-h-[44px] px-5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40
                           text-black text-sm font-black cursor-pointer transition-colors inline-flex items-center gap-1.5"
              >
                <MapPin size={16} aria-hidden />
                핀 꽂기
              </button>
              <button
                type="button"
                onClick={() => seekRelative(5)}
                className="min-h-[44px] px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-bold cursor-pointer transition-colors"
              >
                5초 →
              </button>
            </div>
            <p className="text-center text-xs text-gray-600">
              단축키 — P 핀 꽂기 · Space 재생/정지 · ←/→ 5초 (Shift 10초)
            </p>
          </div>

          {/* 핀 목록 + 라벨 입력 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-gray-300">핀 목록</h2>
              <span className="text-xs text-gray-600 tabular-nums">{pins.length}개</span>
            </div>

            {drafting && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                <p className="text-xs text-amber-400 font-bold">
                  {Math.floor(draftTs / 60)}:{String(Math.floor(draftTs % 60)).padStart(2, '0')} 지점에 핀 추가
                </p>
                <LabelInput
                  value={draftLabel}
                  onChange={setDraftLabel}
                  onSubmit={savePin}
                  options={labelOptions}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={savePin}
                    disabled={saving || !draftLabel.trim()}
                    className="flex-1 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                               text-white text-sm font-bold cursor-pointer transition-colors"
                  >
                    {saving ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDraft}
                    className="px-4 min-h-[44px] rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700
                               text-sm cursor-pointer transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            <PinList pins={pins} onSeek={seekTo} onDelete={deletePin} editable />
          </div>
        </div>
      )}
    </div>
  )
}
