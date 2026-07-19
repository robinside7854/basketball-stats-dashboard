'use client'
// 코치 핀 모아보기 — 라벨/경기로 걸러 이어 보기 (공개)
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { MapPin } from 'lucide-react'
import HighlightsPlayer from '@/components/highlights/HighlightsPlayer'
import VideoSubTabNav from '@/components/layout/VideoSubTabNav'
import { useTeam } from '@/contexts/TeamContext'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { pinClipBounds, type CoachPinWithGame } from '@/types/coachPin'
import type { HighlightClip } from '@/lib/highlights/types'

// game 이 확실히 존재함을 컴파일러가 증명할 수 있도록 narrow 된 타입 (playable 필터 통과 후에만 사용)
type PlayableCoachPin = CoachPinWithGame & { game: NonNullable<CoachPinWithGame['game']> }

export default function PinsPage() {
  const team = useTeam()
  const params = useParams<{ org: string }>()
  const org = params.org

  const [pins, setPins] = useState<CoachPinWithGame[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetch(`/api/pins?org=${org}&team=${team}`)
      .then(r => r.json())
      .then((d: CoachPinWithGame[]) => setPins(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [org, team])

  // 영상 연결된 핀만 재생 가능 — game 이 있고 youtube_url 이 유효한 핀만 통과시켜 이후 코드가 game 을 non-null 로 다룰 수 있게 한다
  const playable = useMemo(
    () => pins.filter((p): p is PlayableCoachPin => !!p.game?.youtube_url && !!extractYouTubeId(p.game.youtube_url)),
    [pins],
  )

  const filtered = useMemo(
    () => playable.filter(p => (!label || p.label === label) && (!gameId || p.game_id === gameId)),
    [playable, label, gameId],
  )

  // 교차 필터 — 각 축은 자기 축을 뺀 나머지만 반영
  const labelCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of playable) {
      if (gameId && p.game_id !== gameId) continue
      m.set(p.label, (m.get(p.label) ?? 0) + 1)
    }
    return m
  }, [playable, gameId])

  const gameOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>()
    for (const p of playable) {
      if (label && p.label !== label) continue
      const prev = m.get(p.game_id)
      if (prev) prev.count++
      else m.set(p.game_id, { id: p.game_id, name: `${p.game.date} vs ${p.game.opponent}`, count: 1 })
    }
    return [...m.values()].sort((a, b) => b.name.localeCompare(a.name))
  }, [playable, label])

  const allLabels = useMemo(
    () => [...new Set(playable.map(p => p.label))].sort((a, b) => a.localeCompare(b)),
    [playable],
  )

  const clips: HighlightClip[] = useMemo(() => filtered.map(p => {
    const { start, end } = pinClipBounds(p.video_timestamp)
    return {
      event_id: p.id,
      video_url: p.game.youtube_url!,
      video_id: extractYouTubeId(p.game.youtube_url!) ?? '',
      video_timestamp: p.video_timestamp,
      clip_start: start,
      clip_end: end,
      player_id: null,
      player_name: '',
      player_number: null,
      player_photo: null,
      team_id: p.game_id,
      team_name: '',
      team_color: '',
      shot_type: 'coach_pin',
      points: 0,
      game_id: p.game_id,
      home_team_name: '',
      away_team_name: '',
      game_date: p.game.date,
      opponent_name: p.game.opponent,
    }
  }), [filtered])

  // 필터 변경으로 idx 가 범위를 벗어나면 렌더 중 파생시켜 보정 (state-in-effect 지양)
  const safeIdx = idx < clips.length ? idx : 0
  const current = filtered[safeIdx]

  const chip = (active: boolean, off: boolean): React.CSSProperties => ({
    background: off ? 'var(--mm-panel)' : active ? 'var(--mm-yellow)' : 'var(--mm-panel)',
    color: off ? 'var(--mm-muted)' : active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
    border: `1px ${off ? 'dashed' : 'solid'} ${active && !off ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
    borderRadius: '4px',
    opacity: off ? 0.4 : 1,
    cursor: off ? 'not-allowed' : 'pointer',
  })

  if (loading) return (
    <div className="space-y-3">
      <VideoSubTabNav />
      <div className="text-center py-20 text-gray-500">불러오는 중…</div>
    </div>
  )

  if (playable.length === 0) {
    return (
      <div className="space-y-3">
        <VideoSubTabNav />
        <div className="text-center py-20 text-gray-500">
          <MapPin size={32} className="mx-auto mb-3 text-gray-600" aria-hidden />
          <p className="text-lg">아직 모인 핀이 없습니다</p>
          <p className="text-sm mt-2">영상 리뷰 탭에서 장면에 핀을 꽂으면 여기 모입니다</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <VideoSubTabNav />

      <div className="flex items-center gap-2">
        <MapPin size={20} className="text-amber-400" aria-hidden />
        <h1 className="text-xl font-bold text-white">코치 핀</h1>
        <span className="text-xs text-gray-500 tabular-nums">{filtered.length} / {playable.length}</span>
      </div>

      {/* 필터 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">라벨</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setLabel(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors" style={chip(label === null, false)}>
              전체
            </button>
            {allLabels.map(l => {
              const n = labelCounts.get(l) ?? 0
              const active = label === l
              const off = !active && n === 0
              return (
                <button key={l} type="button" disabled={off}
                  onClick={() => setLabel(active ? null : l)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                  style={chip(active, off)}
                  title={off ? '현재 선택한 경기에 이 라벨의 핀이 없습니다' : undefined}
                >
                  {l}<span className="text-[10px] opacity-70 tabular-nums">{n}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">경기</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setGameId(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors" style={chip(gameId === null, false)}>
              전체
            </button>
            {gameOptions.map(g => {
              const active = gameId === g.id
              return (
                <button key={g.id} type="button"
                  onClick={() => setGameId(active ? null : g.id)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                  style={chip(active, false)}
                >
                  {g.name}<span className="text-[10px] opacity-70 tabular-nums">{g.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="text-center py-16 text-gray-500">조건에 맞는 핀이 없습니다</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <HighlightsPlayer
              clips={clips}
              currentIdx={safeIdx}
              onIndexChange={setIdx}
              hideScoreboard
              captionOverride={{
                primary: current?.label ?? '',
                secondary: current ? `${current.game.date} vs ${current.game.opponent}` : undefined,
              }}
            />
          </div>
          <div className="lg:col-span-4 bg-gray-900 border border-gray-800 rounded-xl p-3">
            <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {filtered.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`w-full text-left px-2 py-2 min-h-[44px] rounded-lg cursor-pointer transition-colors
                      ${i === safeIdx ? 'bg-blue-600/30 border border-blue-500/50' : 'hover:bg-gray-800'}`}
                  >
                    <div className="text-sm font-bold text-white truncate">{p.label}</div>
                    <div className="text-xs text-gray-500 truncate">{p.game.date} vs {p.game.opponent}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
