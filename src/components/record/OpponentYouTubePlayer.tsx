'use client'
import { useEffect, useRef } from 'react'
import { extractYouTubeId } from '@/lib/youtube/utils'

interface Props {
  youtubeUrl: string
  startOffset: number
  onPlayerReady: (player: YT.Player) => void
  onPlayerDestroy: () => void
}

declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
    _ytApiCallbacks: Array<() => void>
  }
}

export default function OpponentYouTubePlayer({ youtubeUrl, startOffset, onPlayerReady, onPlayerDestroy }: Props) {
  const playerRef = useRef<HTMLDivElement>(null)
  const videoId = extractYouTubeId(youtubeUrl)

  useEffect(() => {
    if (!videoId) return

    function initPlayer() {
      if (!playerRef.current) return
      const player = new window.YT.Player(playerRef.current, {
        videoId: videoId as string,
        playerVars: { start: startOffset, rel: 0, modestbranding: 1 },
        events: {
          onReady: () => onPlayerReady(player),
          onError: () => console.warn('YouTube player error'),
        },
      })
    }

    if (window.YT && window.YT.Player) {
      initPlayer()
    } else if (document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      // API 스크립트는 이미 로드 중 — 콜백 큐에 등록
      if (!window._ytApiCallbacks) window._ytApiCallbacks = []
      window._ytApiCallbacks.push(initPlayer)
      const origCallback = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        origCallback?.()
        window._ytApiCallbacks?.forEach(fn => fn())
        window._ytApiCallbacks = []
      }
    } else {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      window.onYouTubeIframeAPIReady = initPlayer
    }

    return () => onPlayerDestroy()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, startOffset])

  if (!videoId) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-center aspect-video">
        {youtubeUrl ? (
          <div className="text-center px-6">
            <p className="text-yellow-400 text-sm mb-2">영상 URL 형식을 인식하지 못했습니다</p>
            <p className="text-gray-600 text-xs">지원 형식: youtu.be/… · watch?v=… · /live/… · /shorts/…</p>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">YouTube URL을 경기에 등록하면 여기서 재생됩니다</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl overflow-hidden aspect-video bg-black">
      <div ref={playerRef} className="w-full h-full" />
    </div>
  )
}
