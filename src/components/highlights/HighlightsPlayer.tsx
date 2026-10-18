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
//   (2026-10-13) 「전체화면 연속 재생」(몰입 모드) — 리그 하이라이트 피드만 연다(ref 의 open()).
//     · 같은 iframe 을 CSS 로 화면에 꽉 채운다 — 새 플레이어를 띄우거나 DOM 을 옮기면 iframe 이
//       다시 로드돼 재생이 끊기고, iPhone 은 사용자 탭 없이 다시 재생을 못 한다.
//     · 몰입 모드에서만 clip_end 도달 시 다음 클립으로 넘어간다(위 7/15 결정은 일반 화면에 그대로).
//     · Fullscreen API(+ Android 가로 고정)는 되는 기기에서만 — iPhone 은 요소 전체화면이 없어
//       오버레이가 화면을 채우고 「가로로 돌리면」 안내를 한 번 띄운다.
//   (2026-10-14) `immersiveOnly` — 박스스코어 「하이라이트 보기」처럼 화면에 재생기를 두지 않고
//     버튼 한 번으로 바로 몰입 모드를 여는 곳 전용. 평소엔 화면 밖에 숨어(inert) 영상만 미리 준비하고,
//     열리기 전에는 재생·키보드 조작을 하지 않는다. 안 넘기면 종전 그대로(파란날개 포함).
import { useEffect, useRef, useCallback, useImperativeHandle, useState, type Ref } from 'react'
import { Play, Pause, SkipBack, SkipForward, HeartCrack } from 'lucide-react'
import ImmersiveControls from './ImmersiveControls'
import PlayerName from '@/components/league/ui/PlayerName'
import { extractYouTubeId, formatTimestamp, seekBy } from '@/lib/youtube/utils'
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
  /** 몰입 모드(전체화면 연속 재생)를 여는 손잡이 — 리그 피드만 넘긴다. 안 넘기면 종전 그대로 */
  ref?: Ref<HighlightsPlayerHandle>
  /** 몰입 모드가 열리고 닫힐 때 — 부모가 고정(sticky) 칸의 z-index 를 올리는 데 쓴다 */
  onImmersiveChange?: (open: boolean) => void
  /** 몰입 모드 전용 재생기 — 평소엔 화면 밖에 숨고(준비만), 열리기 전엔 재생·키보드 조작을 하지 않는다.
   *  ⚠ 숨은 위치가 fixed 라 조상에 transform 이 있으면 어긋난다 — 부르는 쪽이 body 포털로 띄울 것 */
  immersiveOnly?: boolean
}

export type HighlightsPlayerHandle = {
  /** ⚠ 클릭 핸들러 안에서 동기로 부를 것 — Fullscreen API 는 사용자 제스처 안에서만 열린다 */
  openImmersive: () => void
}

// ── 전체화면 API (webkit 접두 포함) ────────────────────────────────
type FsDoc = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => Promise<void> | void
}
type FsEl = HTMLElement & { webkitRequestFullscreen?: (opts?: unknown) => Promise<void> | void }
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void>; unlock?: () => void }

function fullscreenElement(): Element | null {
  const d = document as FsDoc
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null
}
function canElementFullscreen(el: HTMLElement): boolean {
  const d = document as FsDoc
  const enabled = d.fullscreenEnabled || d.webkitFullscreenEnabled
  return !!enabled && (typeof el.requestFullscreen === 'function' || typeof (el as FsEl).webkitRequestFullscreen === 'function')
}
const ROTATE_HINT_KEY = 'highlights:immersiveRotateHint'

export default function HighlightsPlayer({ clips, currentIdx, onIndexChange, captionOverride, hideScoreboard, ref, onImmersiveChange, immersiveOnly = false }: Props) {
  // 플레이어 콜백은 1회 생성이라 ref 로 읽는다 (마운트 동안 바뀌지 않는 값이지만 규칙을 맞춘다)
  const immersiveOnlyRef = useRef(immersiveOnly)
  useEffect(() => { immersiveOnlyRef.current = immersiveOnly }, [immersiveOnly])
  const containerRef = useRef<HTMLDivElement>(null)
  // 키보드 모달 판정용 — containerRef 의 div 는 YT.Player 가 iframe 으로 갈아끼워 DOM 에서 떨어지므로 못 쓴다
  const rootRef = useRef<HTMLDivElement>(null)
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

  // ── 몰입 모드 상태 ──
  const stageRef = useRef<HTMLDivElement>(null)
  const [immersive, setImmersive] = useState(false)
  const immersiveRef = useRef(false)
  const enteredFullscreenRef = useRef(false)   // 우리가 Fullscreen API 로 들어갔는가 (나갈 때 되돌림)
  const [playing, setPlaying] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [finished, setFinished] = useState(false)  // 마지막 클립 끝까지 봄
  const [rotateHint, setRotateHint] = useState(false)
  const onImmersiveChangeRef = useRef(onImmersiveChange)
  useEffect(() => { onImmersiveChangeRef.current = onImmersiveChange }, [onImmersiveChange])
  // 몰입 모드에서 클립 끝 → 다음 클립 (플레이어 콜백은 1회 생성이라 ref 로 최신 동작을 잡는다)
  const advanceRef = useRef<() => void>(() => {})

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

  advanceRef.current = () => {
    if (!immersiveRef.current) return
    const list = clipsRef.current
    let next = currentIdxRef.current + 1
    while (next < list.length && !list[next].video_id) next++   // 영상 ID 없는 클립은 건너뛴다
    if (next < list.length) {
      seekGraceUntilRef.current = Date.now() + 1500   // 다음 클립 seek 가 반영되기 전 재판정 방지
      onIndexChangeRef.current(next)
    } else {
      try { playerRef.current?.pauseVideo() } catch { /* ignore */ }
      setFinished(true)
    }
  }

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
          fs: 1,   // YouTube 자체 전체화면 버튼 (기본값과 같음 — iPhone 몰입 모드의 대안 경로라 명시)
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
            // 몰입 전용 재생기는 열리기 전엔 준비만 한다 — 화면 밖에서 소리가 나면 안 된다.
            //   (열린 뒤에 준비가 끝났으면 아래로 내려가 바로 재생한다)
            if (immersiveOnlyRef.current && !immersiveRef.current) return
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
            if (e.data === 1) setPlaying(true)
            else if (e.data === 2 || e.data === 0) setPlaying(false)
            // 몰입 모드 — 영상 자체가 clip_end 전에 끝나면 다음 클립으로
            if (e.data === 0 && immersiveRef.current) advanceRef.current()
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
            // 몰입 모드는 연속 재생이 목적이라 막힌 영상은 잠깐 뒤 건너뛴다
            if (immersiveRef.current) setTimeout(() => advanceRef.current(), 800)
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
    // 몰입 전용 재생기가 닫혀 있으면 재생하지 않는다 — 여는 순간 openImmersive 가 지금 클립을 튼다
    if (immersiveOnlyRef.current && !immersiveRef.current) return
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

  // ── 몰입 모드 ────────────────────────────────────────────────
  // 클립이 바뀌면 「끝까지 봄」 해제
  useEffect(() => { setFinished(false) }, [currentIdx])

  const revealControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
  }, [])

  // 멈춰 있으면 조작부를 띄워 둔다 · 재생이 시작되면 3초 뒤 숨김
  useEffect(() => {
    if (!immersive) return
    if (!playing) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      setControlsVisible(true)
    } else {
      revealControls()
    }
  }, [immersive, playing, revealControls])

  const closeImmersive = useCallback(() => {
    if (!immersiveRef.current) return
    immersiveRef.current = false
    setImmersive(false)
    setRotateHint(false)
    setFinished(false)
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
    try { (screen.orientation as LockableOrientation | undefined)?.unlock?.() } catch { /* ignore */ }
    if (enteredFullscreenRef.current) {
      enteredFullscreenRef.current = false
      if (fullscreenElement()) {
        const d = document as FsDoc
        try {
          const r = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.()
          if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {})
        } catch { /* ignore */ }
      }
    }
    onImmersiveChangeRef.current?.(false)
  }, [])

  const openImmersive = useCallback(() => {
    if (immersiveRef.current) return
    const el = stageRef.current
    const cur = clipsRef.current[currentIdxRef.current]
    if (!el || !cur) return
    immersiveRef.current = true
    setImmersive(true)
    setFinished(false)
    setControlsVisible(true)
    onImmersiveChangeRef.current?.(true)

    // ① 요소 전체화면 — 제스처 안에서 동기로 요청해야 한다 (Android Chrome · PC · iPad)
    if (canElementFullscreen(el)) {
      try {
        const fe = el as FsEl
        const r = fe.requestFullscreen ? fe.requestFullscreen({ navigationUI: 'hide' }) : fe.webkitRequestFullscreen?.()
        enteredFullscreenRef.current = true
        Promise.resolve(r).then(() => {
          // ② 가로 고정 — 전체화면 상태에서만 허용된다(Android Chrome). PC·iPad 는 거절 → 무시
          const o = screen.orientation as LockableOrientation | undefined
          o?.lock?.('landscape')?.catch?.(() => {})
        }).catch(() => { enteredFullscreenRef.current = false })
      } catch { enteredFullscreenRef.current = false }
    } else {
      // iPhone Safari — 요소 전체화면이 없다. 세로로 들고 있으면 한 번만 가로 안내
      try {
        const portrait = window.matchMedia?.('(orientation: portrait)').matches
        if (portrait && !localStorage.getItem(ROTATE_HINT_KEY)) {
          localStorage.setItem(ROTATE_HINT_KEY, '1')
          setRotateHint(true)
        }
      } catch { /* 저장소 막힘 — 안내 생략 */ }
    }

    // ③ 지금 클립 처음부터 재생 (탭 제스처 안이라 iPhone 도 재생이 허용될 가능성이 가장 높다)
    const player = playerRef.current
    if (player && readyRef.current && pendingStartRef.current === null) {
      try {
        player.seekTo(Math.floor(cur.clip_start), true)
        player.playVideo()
        seekGraceUntilRef.current = Date.now() + 1200
      } catch { /* ignore */ }
    }
  }, [])

  useImperativeHandle(ref, () => ({ openImmersive }), [openImmersive])

  // 몰입 모드 동안: 클립 끝 감시 · 페이지 스크롤 잠금 · 시스템 전체화면 해제(Esc·뒤로가기) 추적
  useEffect(() => {
    if (!immersive) return
    const tick = setInterval(() => {
      const p = playerRef.current
      if (!p || !readyRef.current) return
      if (pendingStartRef.current !== null) return
      if (Date.now() < seekGraceUntilRef.current) return
      const c = clipsRef.current[currentIdxRef.current]
      if (!c) return
      try {
        if (p.getPlayerState() !== 1) return
        if (p.getCurrentTime() >= c.clip_end) advanceRef.current()
      } catch { /* ignore */ }
    }, 400)

    const html = document.documentElement
    const prevOverflow = html.style.overflow
    html.style.overflow = 'hidden'

    // 전체화면을 사용자가 시스템으로 빠져나오면(PC Esc · Android 뒤로가기) 오버레이도 닫는다
    const onFsChange = () => {
      if (enteredFullscreenRef.current && !fullscreenElement()) {
        enteredFullscreenRef.current = false
        closeImmersive()
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      clearInterval(tick)
      html.style.overflow = prevOverflow
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [immersive, closeImmersive])

  // 안내는 4초 뒤 스스로 걷힌다
  useEffect(() => {
    if (!rotateHint) return
    const t = setTimeout(() => setRotateHint(false), 4000)
    return () => clearTimeout(t)
  }, [rotateHint])

  // 언마운트(필터 칩으로 피드가 바뀜 등) 때 잠금·전체화면을 남기지 않는다
  useEffect(() => () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (immersiveRef.current) closeImmersive()
  }, [closeImmersive])

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
  const seek = (delta: number) => {
    const player = playerRef.current
    if (!player || !readyRef.current) return
    try { seekBy(player, delta) } catch { /* ignore */ }
  }

  // 키보드 조작 — 기록 화면과 같은 키(Space·←/→ ±5초) + 클립 이동(, / .)
  // iframe 안에 포커스가 있으면 이 리스너에 안 오고 YouTube 자체 단축키가 처리한다.
  // 매 렌더 새 핸들러를 쓰도록 ref 로 최신 클로저를 잡아 리스너는 1회만 등록.
  const keyHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandlerRef.current = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return  // 브라우저 단축키 방해 금지
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
    // 이 플레이어를 담지 않은 모달이 열려 있으면 뒤 페이지 영상이 움직이면 안 된다.
    // (모달 안의 HighlightsPlayer 는 자기 모달이 rootRef 를 포함하므로 계속 동작)
    const el = rootRef.current
    // 몰입 전용 재생기는 닫혀 있는 동안 키를 받지 않는다(숨은 영상이 Space 로 재생되면 안 된다)
    if (immersiveOnlyRef.current && !immersiveRef.current) return
    if (immersiveRef.current && e.key === 'Escape') { e.preventDefault(); closeImmersive(); return }
    // (몰입 모드의 오버레이는 이 플레이어 안쪽 dialog 라 제외)
    const dialogs = document.querySelectorAll('[aria-modal="true"], [role="dialog"]')
    if (!el || Array.from(dialogs).some(d => !d.contains(el) && !el.contains(d))) return
    if (immersiveRef.current) revealControls()
    if (e.code === 'Space') {
      // 포커스된 버튼·링크는 Space 로 스스로 눌리게 둔다 — 여기서 또 토글하면 두 번 눌림
      if (t && t.closest('button, a, [role="button"]')) return
      e.preventDefault(); togglePlay()
    }
    else if (e.code === 'ArrowLeft')  { e.preventDefault(); seek(-5) }
    else if (e.code === 'ArrowRight') { e.preventDefault(); seek(5) }
    else if (e.key === ',') { e.preventDefault(); goPrev() }
    else if (e.key === '.') { e.preventDefault(); goNext() }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyHandlerRef.current(e)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

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
    <div
      ref={rootRef}
      className="space-y-2"
      // 몰입 전용: 닫혀 있는 동안 화면 밖(포커스·보조기기에서도 빠짐). 크기는 남겨야 YouTube 가 영상을 준비한다.
      //   열리면 무대가 fixed inset-0 으로 뷰포트를 채우므로 이 자리는 그대로 둬도 된다.
      style={immersiveOnly ? { position: 'fixed', left: '-10000px', top: 0, width: '480px' } : undefined}
      inert={immersiveOnly && !immersive ? true : undefined}
      aria-hidden={immersiveOnly && !immersive ? true : undefined}
    >
      {/* 몰입 모드 무대 — 평소엔 아무 스타일 없는 껍데기. ⚠ 요소 구조를 모드마다 바꾸지 말 것:
          iframe 이 다시 마운트되면 재생이 끊긴다(클래스만 바꾼다). */}
      <div
        ref={stageRef}
        className={immersive ? 'fixed inset-0 z-[1000] flex items-center justify-center overflow-hidden' : undefined}
        style={immersive ? { background: '#000', width: '100dvw', height: '100dvh' } : undefined}
        role={immersive ? 'dialog' : undefined}
        aria-modal={immersive ? true : undefined}
        aria-label={immersive ? '하이라이트 전체화면 연속 재생' : undefined}
        onPointerMove={immersive ? (e) => { if (e.pointerType === 'mouse') revealControls() } : undefined}
      >
      <div
        className={immersive
          ? 'relative aspect-video bg-black [&_iframe]:absolute [&_iframe]:inset-0 [&_iframe]:w-full [&_iframe]:h-full'
          : 'relative rounded-xl overflow-hidden aspect-video bg-black'}
        style={immersive ? { width: 'min(100dvw, calc(100dvh * 16 / 9))' } : undefined}
        aria-live="polite"
        aria-label={captionOverride
          ? `${captionOverride.primary}, ${currentIdx + 1}/${clips.length}`
          : `${clip.player_name} — ${SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}${clip.assist_player_name ? `, ${clip.assist_player_name} 어시스트` : ''}, ${currentIdx + 1}/${clips.length}`}
      >
        <div ref={containerRef} className="w-full h-full" />
        {/* 스코어보드 오버레이 (option A — 상단 · 항상 표시 · pointer-events-none 로 클릭 통과) */}
        {!hideScoreboard && hasScore && (clip.home_team_name || clip.away_team_name) && !(immersive && controlsVisible) && (
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
                  style={{ background: 'var(--mm-live-bg)', color: '#fff', borderRadius: '3px' }}
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
      {immersive && (
        <ImmersiveControls
          visible={controlsVisible}
          playing={playing}
          finished={finished}
          title={captionOverride
            ? captionOverride.primary
            : `${clip.player_number ? `#${clip.player_number} ` : ''}${clip.player_name} · ${SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}`}
          // 어시스트는 둘째 줄 맨 앞 — 첫 줄은 폰에서 잘리기 쉬워 「내 기록」의 어시스트 클립이 왜 내 것인지 안 보였다
          subtitle={captionOverride?.secondary
            ?? ([clip.assist_player_name ? `${clip.assist_player_name} 어시스트` : null, [clip.home_team_name, clip.away_team_name].filter(Boolean).join(' vs ') || null].filter(Boolean).join(' · ') || undefined)}
          index={currentIdx}
          total={clips.length}
          showRotateHint={rotateHint}
          onReveal={revealControls}
          onClose={closeImmersive}
          onPrev={() => { goPrev(); revealControls() }}
          onNext={() => { goNext(); revealControls() }}
          onTogglePlay={() => { togglePlay(); revealControls() }}
          onRestart={() => { setFinished(false); if (currentIdx === 0) { try { playerRef.current?.seekTo(Math.floor(clip.clip_start), true); playerRef.current?.playVideo() } catch { /* ignore */ } } else onIndexChange(0) }}
          onDismissHint={() => setRotateHint(false)}
        />
      )}
      </div>
      {/* 몰입 모드 동안 페이지 자리 유지 — 무대가 흐름에서 빠져 뒤 화면이 출렁이지 않게 */}
      {immersive && <div className="rounded-xl aspect-video bg-black" aria-hidden />}

      {/* 컨트롤 바 */}
      <div
        className="p-2 lg:p-3 flex items-center gap-2 flex-wrap"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      >
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIdx === 0}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer disabled:opacity-40 transition-[transform,filter] duration-200 hover:brightness-95 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="이전 클립"
        >
          <SkipBack size={20} />
        </button>
        {/* ±5초 — 기록 화면 트랜스포트와 같이 아이콘 없이 숫자 라벨 */}
        <button
          type="button"
          onClick={(e) => { seek(-5); e.currentTarget.blur() }}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 text-sm font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="5초 뒤로"
        >
          −5초
        </button>
        {/* 주 재생/정지 CTA — 브랜드 노랑 · 채워진 삼각형 · hover 밝기 · active 눌림 · focus 링 */}
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[52px] px-3 cursor-pointer transition-[transform,filter] duration-200 hover:brightness-95 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px', boxShadow: 'var(--mm-shadow-sm)' }}
          aria-label="재생/정지"
        >
          <Play size={20} fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={(e) => { seek(5); e.currentTarget.blur() }}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 text-sm font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          aria-label="5초 앞으로"
        >
          +5초
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={currentIdx + 1 >= clips.length}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 cursor-pointer disabled:opacity-40 transition-[transform,filter] duration-200 hover:brightness-95 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
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
                {clip.player_number ? `#${clip.player_number} ` : ''}
                <PlayerName id={clip.player_id} name={clip.player_name} hitArea={false} />
                <span className="mx-1.5" aria-hidden>·</span>
                {SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}
                {/* 어시스트한 선수 — 「내 기록」에 어시스트 클립이 섞여 있어도 왜 내 클립인지 보이게 (2026-10-18) */}
                {clip.assist_player_name && (
                  <>
                    <span className="mx-1.5" aria-hidden>·</span>
                    <PlayerName id={clip.assist_player_id ?? null} name={clip.assist_player_name} hitArea={false} /> 어시스트
                  </>
                )}
              </>
            )}
            <span className="mx-1.5" aria-hidden>·</span>
            {formatTimestamp(clip.video_timestamp)}
          </span>
        </div>

        {/* 자동재생 토글 제거 (2026-07-15 사용자 요구) — 다음 클립은 SkipForward 로만 이동 */}
      </div>
      {/* 키보드 안내 — 물리 키보드 전제라 데스크톱만 */}
      <p className="hidden md:block text-sm px-1" style={{ color: 'var(--mm-muted)' }}>
        ← → 5초 · Space 재생/정지 · 쉼표(,) 마침표(.) 이전/다음 클립
      </p>
    </div>
  )
}
