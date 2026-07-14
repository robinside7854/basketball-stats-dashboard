'use client'
// HighlightsPlayer — YouTube IFrame API 기반 자동 연속재생 플레이어
// 자동재생 구현: setInterval (500ms) 로 currentTime 감시 → clip_end 도달 시 advance
//   + onStateChange 로 ENDED 감지 (예외 상황 백업)
// 다음 클립이 다른 video_id 면 loadVideoById, 같으면 seekTo — 로딩 최소화
//
// Props:
//   clips: 재생할 클립 목록 (부모가 필터 적용 후 전달)
//   startIdx: 초기 재생 인덱스 (URL clip=)
//   onIndexChange: 부모에서 현재 인덱스 추적 (플레이리스트 강조 + URL 반영)
//   autoAdvance: 자동 연속재생 여부
//   onToggleAutoAdvance: 자동재생 토글
import { useEffect, useRef, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, Zap, ZapOff } from 'lucide-react'
import { extractYouTubeId, formatTimestamp } from '@/lib/youtube/utils'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
  }
}

interface Props {
  clips: HighlightClip[]
  currentIdx: number
  onIndexChange: (idx: number) => void
  autoAdvance: boolean
  onToggleAutoAdvance: () => void
}

export default function HighlightsPlayer({ clips, currentIdx, onIndexChange, autoAdvance, onToggleAutoAdvance }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const readyRef = useRef(false)
  const currentVideoIdRef = useRef<string | null>(null)
  const clipsRef = useRef<HighlightClip[]>(clips)
  const currentIdxRef = useRef(currentIdx)
  const autoAdvanceRef = useRef(autoAdvance)
  const onIndexChangeRef = useRef(onIndexChange)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 영상 교체(loadVideoById) 중 목표 시작 초 — 로딩 완료(PLAYING) 때 실제 위치 검증·보정
  // loadVideoById 직후 getCurrentTime() 은 이전 영상 시각을 반환(stale) → 감시 인터벌 오발동 방지용
  const pendingStartRef = useRef<number | null>(null)
  // seekTo 직후에도 currentTime 반영이 비동기 → 짧은 grace 동안 clip_end 판정 중지 (ms epoch)
  const seekGraceUntilRef = useRef(0)

  useEffect(() => { clipsRef.current = clips }, [clips])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { autoAdvanceRef.current = autoAdvance }, [autoAdvance])
  useEffect(() => { onIndexChangeRef.current = onIndexChange }, [onIndexChange])

  const clip = clips[currentIdx] ?? null

  const advanceToNext = useCallback(() => {
    const idx = currentIdxRef.current
    const total = clipsRef.current.length
    if (idx + 1 >= total) {
      // 마지막 클립 → 일시정지
      try { playerRef.current?.pauseVideo() } catch { /* ignore */ }
      return
    }
    onIndexChangeRef.current(idx + 1)
  }, [])

  // 플레이어 인스턴스 생성 (1회)
  useEffect(() => {
    if (!containerRef.current) return
    if (!clip) return

    const firstVideoId = extractYouTubeId(clip.video_url)
    if (!firstVideoId) return

    function initPlayer() {
      if (!containerRef.current) return
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: firstVideoId as string,
        playerVars: {
          start: Math.floor(clip!.clip_start),
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            readyRef.current = true
            currentVideoIdRef.current = firstVideoId as string
            try {
              e.target.seekTo(Math.floor(clip!.clip_start), true)
              e.target.playVideo()
            } catch { /* ignore */ }
          },
          onStateChange: (e) => {
            // ENDED (0) — 자동재생 켜져있으면 다음 클립
            if (e.data === 0 && autoAdvanceRef.current) advanceToNext()
            // 영상 교체 로딩 완료 처리
            if (pendingStartRef.current !== null) {
              const target = pendingStartRef.current
              if (e.data === 1) {
                // PLAYING — loadVideoById 의 startSeconds 가 무시되고 0초부터 시작하는 경우 보정
                pendingStartRef.current = null
                try {
                  const t = e.target.getCurrentTime()
                  if (typeof t === 'number' && Math.abs(t - target) > 2) {
                    e.target.seekTo(target, true)
                    seekGraceUntilRef.current = Date.now() + 1500
                  }
                } catch { /* ignore */ }
              } else if (e.data === 5) {
                // CUED — 자동재생 차단 등으로 재생 시작 실패 → 목표 지점으로 이동 후 재생 시도
                try {
                  e.target.seekTo(target, true)
                  e.target.playVideo()
                } catch { /* ignore */ }
              }
            }
          },
          onError: () => { /* 광고 · 삭제 · 지역제한 등 — 조용히 건너뛰기 */
            if (autoAdvanceRef.current) advanceToNext()
          },
        },
      })
    }

    if (window.YT && window.YT.Player) initPlayer()
    else {
      const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]')
      if (!existing) {
        const tag = document.createElement('script')
        tag.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(tag)
      }
      window.onYouTubeIframeAPIReady = initPlayer
    }

    return () => {
      readyRef.current = false
      currentVideoIdRef.current = null
      try { playerRef.current?.destroy() } catch { /* ignore */ }
      playerRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 클립 변경 → loadVideoById 또는 seekTo
  useEffect(() => {
    if (!clip) return
    const player = playerRef.current
    if (!player || !readyRef.current) return
    const start = Math.floor(clip.clip_start)
    try {
      if (currentVideoIdRef.current !== clip.video_id) {
        pendingStartRef.current = start
        player.loadVideoById({ videoId: clip.video_id, startSeconds: start })
        currentVideoIdRef.current = clip.video_id
      } else if (pendingStartRef.current !== null) {
        // 같은 영상이지만 아직 loadVideoById 로딩 중 — 이 시점의 seekTo 는 무시되고 0초 재생됨
        // 목표만 갱신하면 PLAYING 콜백이 보정해준다
        pendingStartRef.current = start
      } else {
        player.seekTo(start, true)
        player.playVideo()
        seekGraceUntilRef.current = Date.now() + 1200
      }
    } catch { /* ignore */ }
  }, [clip])

  // clip_end 감시 (setInterval 500ms)
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      if (!autoAdvanceRef.current) return
      const player = playerRef.current
      const c = clipsRef.current[currentIdxRef.current]
      if (!player || !readyRef.current || !c) return
      // 영상 교체 로딩 중이거나 seekTo 직후 — getCurrentTime 이 이전 위치를 반환하는 구간이라 판정 중지
      if (pendingStartRef.current !== null) return
      if (Date.now() < seekGraceUntilRef.current) return
      try {
        const t = player.getCurrentTime()
        if (typeof t === 'number' && t >= c.clip_end) advanceToNext()
      } catch { /* ignore */ }
    }, 500)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [advanceToNext])

  const goPrev = () => { if (currentIdx > 0) onIndexChange(currentIdx - 1) }
  const goNext = () => { if (currentIdx + 1 < clips.length) onIndexChange(currentIdx + 1) }
  const togglePlay = () => {
    const player = playerRef.current
    if (!player) return
    try {
      const state = player.getPlayerState()
      if (state === 1) player.pauseVideo()
      else player.playVideo()
    } catch { /* ignore */ }
  }

  // ── Empty / Fallback ────────────────────────────────────────
  if (!clip) {
    return (
      <div
        className="rounded-xl aspect-video flex items-center justify-center"
        style={{ background: 'var(--mm-panel-alt)', border: '1px dashed var(--mm-rule)' }}
      >
        <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>
          재생할 하이라이트가 없습니다
        </p>
      </div>
    )
  }
  if (!clip.video_id) {
    return (
      <div
        className="rounded-xl aspect-video flex flex-col items-center justify-center gap-2 p-6 text-center"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
      >
        <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>YouTube 영상 ID 를 인식하지 못했습니다</p>
        <a href={clip.video_url} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: 'var(--mm-yellow-strong)' }}>
          ▶ 원본 링크 열기
        </a>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-xl overflow-hidden aspect-video bg-black"
        aria-live="polite"
        aria-label={`${clip.player_name} — ${SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}, ${currentIdx + 1}/${clips.length}`}
      >
        <div ref={containerRef} className="w-full h-full" />
      </div>

      {/* 컨트롤 바 */}
      <div
        className="p-2 lg:p-3 flex items-center gap-2 flex-wrap"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      >
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIdx === 0}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer disabled:opacity-40 transition-colors"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="이전 클립"
        >
          <SkipBack size={18} />
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer transition-colors"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }}
          aria-label="재생/정지"
        >
          <Play size={18} />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIdx + 1 >= clips.length}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer disabled:opacity-40 transition-colors"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="다음 클립"
        >
          <SkipForward size={18} />
        </button>

        {/* 진행 표시 */}
        <div className="flex-1 min-w-[120px] flex items-center gap-2 px-2 flex-wrap">
          <span className="text-xs font-mono" style={{ color: 'var(--mm-ink)' }}>
            {currentIdx + 1} / {clips.length}
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--mm-muted)' }}>
            {clip.player_number ? `#${clip.player_number} ` : ''}{clip.player_name}
            <span className="mx-1.5" aria-hidden>·</span>
            {SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}
            <span className="mx-1.5" aria-hidden>·</span>
            {formatTimestamp(clip.video_timestamp)}
          </span>
        </div>

        {/* 자동재생 토글 */}
        <button
          type="button"
          onClick={onToggleAutoAdvance}
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
          style={
            autoAdvance
              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
              : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }
          }
          aria-pressed={autoAdvance}
          aria-label={autoAdvance ? '자동재생 끄기' : '자동재생 켜기'}
        >
          {autoAdvance ? <Zap size={14} /> : <ZapOff size={14} />}
          자동
        </button>
      </div>
    </div>
  )
}
