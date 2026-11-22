'use client'
import { whenYouTubeReady } from '@/lib/youtube/iframeApi'
import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/gameStore'
import { extractYouTubeId } from '@/lib/youtube/utils'

interface Props {
  youtubeUrl: string
  startOffset: number
  resumeAt?: number
  /** 폰에서 유튜브 자체 조작 막대·버튼을 끄고 영상 위 터치를 막는다(2026-11-22 운영진 — 기록 화면은 우리 버튼만).
   *  만들 때의 화면 폭으로 정한다(폭이 바뀌어도 다시 만들지 않는다). 제목·로고가 잠깐 뜨는 것은 유튜브 규정상 못 끈다. */
  bareOnMobile?: boolean
}

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
  }
}

export default function YouTubePlayer({ youtubeUrl, startOffset, resumeAt, bareOnMobile = false }: Props) {
  const playerRef = useRef<HTMLDivElement>(null)
  const ytPlayerRef = useRef<YT.Player | null>(null)
  const setYtPlayer = useGameStore(s => s.setYtPlayer)
  const videoId = extractYouTubeId(youtubeUrl)

  useEffect(() => {
    if (!videoId) return

    // 기존 플레이어 완전 파괴 후 div 초기화
    if (ytPlayerRef.current) {
      try { ytPlayerRef.current.destroy() } catch { /* ignore */ }
      ytPlayerRef.current = null
    }
    if (playerRef.current) playerRef.current.innerHTML = ''

    function initPlayer() {
      if (!playerRef.current) return
      const bare = bareOnMobile && window.matchMedia('(max-width: 1023.98px)').matches
      const player = new window.YT.Player(playerRef.current, {
        videoId: videoId as string,
        playerVars: {
          start: Math.floor(resumeAt ?? startOffset), rel: 0, modestbranding: 1,
          ...(bare ? { controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1 } : {}),
        },
        events: {
          onReady: () => {
            if (resumeAt && resumeAt > 1) player.seekTo(Math.floor(resumeAt), true)
            ytPlayerRef.current = player
            setYtPlayer(player)
          },
          onError: () => console.warn('YouTube player error'),
        },
      })
    }

    const cancelWait = whenYouTubeReady(initPlayer)   // 공용 기다리기(다른 재생기와 덮어쓰지 않게)

    return () => {
      cancelWait()
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy() } catch { /* ignore */ }
        ytPlayerRef.current = null
      }
      if (playerRef.current) playerRef.current.innerHTML = ''
      setYtPlayer(null)
    }
  }, [videoId, startOffset, setYtPlayer])

  if (!videoId) {
    return (
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl flex items-center justify-center aspect-video">
        {youtubeUrl ? (
          <div className="text-center px-6">
            <p className="text-[var(--mm-yellow-strong)] text-sm mb-2">영상 URL 형식을 인식하지 못했습니다</p>
            <a href={youtubeUrl} target="_blank" rel="noopener noreferrer"
               className="text-[var(--mm-yellow-strong)] hover:underline text-xs underline break-all">
              ▶ {youtubeUrl}
            </a>
            <p className="text-[var(--mm-muted)] text-xs mt-2">지원 형식: youtu.be/… · watch?v=… · /live/… · /shorts/…</p>
          </div>
        ) : (
          <p className="text-[var(--mm-muted)] text-sm">YouTube URL을 경기에 등록하면 여기서 재생됩니다</p>
        )}
      </div>
    )
  }

  return (
    <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
      <div ref={playerRef} className="w-full h-full" />
      {/* 폰: 영상 위 터치를 막아 유튜브 조작 막대·추천 칸이 뜨지 않게 — 재생·이동은 아래 우리 버튼으로 */}
      {bareOnMobile && <div aria-hidden className="absolute inset-0 lg:hidden" />}
    </div>
  )
}
