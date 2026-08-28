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
//   (2026-07-15) 자동재생(autoAdvance) 기능 제거 — 사용자 요구
//     · 클립 종료 시 다음 클립으로 자동 이동하지 않음
//     · 다음 이동은 SkipForward 버튼 or 플레이리스트 클릭
import { useEffect, useRef, useCallback } from 'react'
import { Play, Pause, SkipBack, SkipForward, HeartCrack } from 'lucide-react'
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
  // 코치 핀처럼 선수/슛유형이 없는 클립용 — 하단 캡션을 통째로 대체
  captionOverride?: { primary: string; secondary?: string }
  // 스코어보드 숨김 (핀은 점수 맥락이 없음)
  hideScoreboard?: boolean
}

export default function HighlightsPlayer({ clips, currentIdx, onIndexChange, captionOverride, hideScoreboard }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const readyRef = useRef(false)
  const currentVideoIdRef = useRef<string | null>(null)
  const clipsRef = useRef<HighlightClip[]>(clips)
  const currentIdxRef = useRef(currentIdx)
  const onIndexChangeRef = useRef(onIndexChange)
  // 영상 교체(loadVideoById) 중 목표 시작 초 — 로딩 완료(PLAYING) 때 실제 위치 검증·보정
  // loadVideoById 직후 getCurrentTime() 은 이전 영상 시각을 반환(stale) → 감시 인터벌 오발동 방지용
  const pendingStartRef = useRef<number | null>(null)
  // pendingStartRef 안전 타임아웃 — onStateChange 가 예외적으로 안 오면 perma-block 방지
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // seekTo 직후에도 currentTime 반영이 비동기 → 짧은 grace 동안 clip_end 판정 중지 (ms epoch)
  const seekGraceUntilRef = useRef(0)

  // pendingStartRef setter with auto-clear (프리즈 방지)
  const setPendingStart = useCallback((v: number | null) => {
    pendingStartRef.current = v
    if (pendingTimeoutRef.current) { clearTimeout(pendingTimeoutRef.current); pendingTimeoutRef.current = null }
    if (v !== null) {
      pendingTimeoutRef.current = setTimeout(() => {
        pendingStartRef.current = null
        pendingTimeoutRef.current = null
      }, 5000)
    }
  }, [])

  useEffect(() => { clipsRef.current = clips }, [clips])
  useEffect(() => { currentIdxRef.current = currentIdx }, [currentIdx])
  useEffect(() => { onIndexChangeRef.current = onIndexChange }, [onIndexChange])

  const clip = clips[currentIdx] ?? null

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
            // ⚠ Race fix: onReady 가 뜨기 전에 사용자가 필터/클립 바꿨을 수 있음
            //    → 현재(최신) clip 을 다시 계산해서 그것을 로드
            //    이전엔 firstVideoId 로 seekTo/play 만 해서 이후 clip 변경이 반영 안 됨 (검은 화면)
            const cur = clipsRef.current[currentIdxRef.current]
            if (!cur) return
            const targetVid = extractYouTubeId(cur.video_url)
            const targetStart = Math.floor(cur.clip_start)
            try {
              if (targetVid && targetVid !== firstVideoId) {
                // 다른 비디오로 교체 필요
                setPendingStart(targetStart)
                e.target.loadVideoById({ videoId: targetVid, startSeconds: targetStart })
                currentVideoIdRef.current = targetVid
              } else {
                e.target.seekTo(targetStart, true)
                e.target.playVideo()
              }
            } catch { /* ignore */ }
          },
          onStateChange: (e) => {
            // ENDED (0) — 자동 다음 클립 이동 없음 (사용자 요구로 자동재생 제거)
            //   → 영상은 그 자리에서 정지 · 다음 클립은 SkipForward 또는 플레이리스트 클릭으로만
            // 영상 교체 로딩 완료 처리
            if (pendingStartRef.current !== null) {
              const target = pendingStartRef.current
              if (e.data === 1) {
                // PLAYING — loadVideoById 의 startSeconds 가 무시되고 0초부터 시작하는 경우 보정
                setPendingStart(null)
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
            setPendingStart(null)  // 프리즈 방지
            // (자동재생 제거 이후) 에러 시에도 자동 다음 이동 없음 · 유저가 SkipForward 로 이동
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
      if (pendingTimeoutRef.current) { clearTimeout(pendingTimeoutRef.current); pendingTimeoutRef.current = null }
      pendingStartRef.current = null
      try { playerRef.current?.destroy() } catch { /* ignore */ }
      playerRef.current = null
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 클립 변경 → loadVideoById 또는 seekTo
  // ⚠ 플레이어 미준비 상태면 아무 것도 안 함 (검은 화면 원인)
  //    onReady 콜백이 currentIdxRef 를 다시 읽어서 그때의 최신 clip 을 로드하도록 함 (race fix)
  useEffect(() => {
    if (!clip) return
    const player = playerRef.current
    if (!player || !readyRef.current) return  // 미준비 → onReady 가 대신 처리 (Race fix)
    const start = Math.floor(clip.clip_start)
    try {
      if (currentVideoIdRef.current !== clip.video_id) {
        setPendingStart(start)
        player.loadVideoById({ videoId: clip.video_id, startSeconds: start })
        currentVideoIdRef.current = clip.video_id
      } else if (pendingStartRef.current !== null) {
        // 같은 영상이지만 아직 loadVideoById 로딩 중 — seekTo 는 무시되고 0초 재생됨
        // 목표만 갱신하면 PLAYING 콜백이 보정해준다
        setPendingStart(start)
      } else {
        player.seekTo(start, true)
        player.playVideo()
        seekGraceUntilRef.current = Date.now() + 1200
      }
    } catch { /* ignore */ }
  }, [clip, setPendingStart])

  // clip_end 감시 로직 완전 제거 (2026-07-16 버그 수정)
  //   이전에는 clip_end 도달 시 pauseVideo() 를 매 500ms 호출 → 사용자가 play 눌러도 즉시 다시 pause 되던 버그
  //   자동재생도 없어졌으니 클립 종료 후 계속 재생되도록 방치.
  //   다음 클립은 SkipForward 버튼 or 플레이리스트 클릭으로만 이동.
  //   clip_end 는 여전히 참조용 (히스토리 · 하이라이트 릴 구간 표시) 이지만 재생 제어 로직 없음.

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

  // 스코어보드 데이터 (option A — 재생기 상단 오버레이)
  const scoreHome = clip.score_home_after ?? 0
  const scoreAway = clip.score_away_after ?? 0
  const hasScore = (clip.score_home_after != null) || (clip.score_away_after != null)
  const homeScored = clip.team_name === clip.home_team_name
  const awayScored = clip.team_name === clip.away_team_name

  return (
    <div className="space-y-2">
      <div
        className="relative rounded-xl overflow-hidden aspect-video bg-black"
        aria-live="polite"
        aria-label={captionOverride
          ? `${captionOverride.primary}, ${currentIdx + 1}/${clips.length}`
          : `${clip.player_name} — ${SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}, ${currentIdx + 1}/${clips.length}`}
      >
        <div ref={containerRef} className="w-full h-full" />
        {/* 스코어보드 오버레이 (option A — 상단 · 항상 표시 · pointer-events-none 로 클릭 통과) */}
        {!hideScoreboard && hasScore && (clip.home_team_name || clip.away_team_name) && (
          <div
            className="absolute top-0 left-0 right-0 pointer-events-none flex items-center justify-center px-2 py-1.5 sm:py-2 z-10"
            style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0) 100%)',
            }}
            aria-label={`스코어보드: ${clip.home_team_name} ${scoreHome} 대 ${scoreAway} ${clip.away_team_name}`}
          >
            <div
              className="inline-flex items-center gap-1.5 sm:gap-2.5 max-w-full"
              style={{ color: '#fff' }}
            >
              {/* 홈 팀 */}
              <span
                className="flex items-center gap-1 min-w-0 max-w-[38vw] sm:max-w-none"
                style={{ opacity: homeScored ? 1 : 0.8 }}
              >
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 shrink-0"
                  style={{
                    background: homeScored ? (clip.team_color || '#fff') : 'rgba(255,255,255,0.4)',
                    borderRadius: '2px',
                    boxShadow: homeScored ? '0 0 0 1px rgba(255,255,255,0.4)' : undefined,
                  }}
                />
                <span
                  className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.08em] truncate"
                  style={{ maxWidth: '18ch' }}
                >
                  {clip.home_team_name || '홈'}
                </span>
              </span>
              {/* 홈 스코어 */}
              <span
                className="font-jersey font-black text-lg sm:text-2xl leading-none tabular-nums"
                style={{
                  color: homeScored ? 'var(--mm-yellow)' : '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                }}
              >
                {scoreHome}
              </span>
              <span
                aria-hidden
                className="font-jersey font-black text-base sm:text-xl leading-none"
                style={{ color: 'rgba(255,255,255,0.55)' }}
              >
                :
              </span>
              {/* 원정 스코어 */}
              <span
                className="font-jersey font-black text-lg sm:text-2xl leading-none tabular-nums"
                style={{
                  color: awayScored ? 'var(--mm-yellow)' : '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                }}
              >
                {scoreAway}
              </span>
              {/* 원정 팀 */}
              <span
                className="flex items-center gap-1 min-w-0 max-w-[38vw] sm:max-w-none"
                style={{ opacity: awayScored ? 1 : 0.8 }}
              >
                <span
                  className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.08em] truncate"
                  style={{ maxWidth: '18ch' }}
                >
                  {clip.away_team_name || '원정'}
                </span>
                <span
                  aria-hidden
                  className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 shrink-0"
                  style={{
                    background: awayScored ? (clip.team_color || '#fff') : 'rgba(255,255,255,0.4)',
                    borderRadius: '2px',
                    boxShadow: awayScored ? '0 0 0 1px rgba(255,255,255,0.4)' : undefined,
                  }}
                />
              </span>
              {/* 클러치 뱃지 (재생기 스코어보드 우측) */}
              {clip.is_clutch && (
                <span
                  className="inline-flex items-center gap-0.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-[0.12em] px-1.5 py-0.5 ml-0.5 sm:ml-1"
                  style={{ background: '#ef4444', color: '#fff', borderRadius: '3px' }}
                  aria-label="클러치 슛"
                >
                  <HeartCrack size={14} aria-hidden />
                  <span className="hidden sm:inline">클러치</span>
                </span>
              )}
            </div>
          </div>
        )}
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
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer disabled:opacity-40 transition-all duration-200 hover:brightness-95 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="이전 클립"
        >
          <SkipBack size={20} />
        </button>
        {/* 주 재생/정지 CTA — 브랜드 노랑 · 채워진 삼각형 · hover 밝기 · active 눌림 · focus 링 */}
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[52px] px-3 cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px', boxShadow: '0 2px 8px -3px rgba(0,0,0,0.35)' }}
          aria-label="재생/정지"
        >
          <Play size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIdx + 1 >= clips.length}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer disabled:opacity-40 transition-all duration-200 hover:brightness-95 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="다음 클립"
        >
          <SkipForward size={20} />
        </button>

        {/* 진행 표시 */}
        <div className="flex-1 min-w-[120px] flex items-center gap-2 px-2 flex-wrap">
          <span className="text-xs font-mono" style={{ color: 'var(--mm-ink)' }}>
            {currentIdx + 1} / {clips.length}
          </span>
          <span className="text-xs truncate" style={{ color: 'var(--mm-muted)' }}>
            {captionOverride ? (
              <>
                <span style={{ color: 'var(--mm-ink)', fontWeight: 700 }}>{captionOverride.primary}</span>
                {captionOverride.secondary && (
                  <>
                    <span className="mx-1.5" aria-hidden>·</span>
                    {captionOverride.secondary}
                  </>
                )}
              </>
            ) : (
              <>
                {clip.player_number ? `#${clip.player_number} ` : ''}{clip.player_name}
                <span className="mx-1.5" aria-hidden>·</span>
                {SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}
              </>
            )}
            <span className="mx-1.5" aria-hidden>·</span>
            {formatTimestamp(clip.video_timestamp)}
          </span>
        </div>

        {/* 자동재생 토글 제거 (2026-07-15 사용자 요구) — 다음 클립은 SkipForward 로만 이동 */}
      </div>
    </div>
  )
}
