import { useCallback, useEffect, useState } from 'react'
import { seekBy } from '@/lib/youtube/utils'
import {
  loadPlaybackRate, savePlaybackRate, stepPlaybackRate, type PlaybackRate,
} from '@/lib/youtube/playbackRate'

// ── YouTube 원격 제어 + 키보드 단축키 (기록 화면의 첫 effect) ──────────────
export type UseYoutubeRemoteCtx = {
  ytPlayer: YT.Player | null
}

export function useYoutubeRemote(ctx: UseYoutubeRemoteCtx) {
  const { ytPlayer } = ctx
  // ── 재생 속도 (2026-11-03) ───────────────────────────────────
  //   기기마다 마지막 속도를 기억한다. 쿼터를 넘기면 플레이어가 새로 만들어지므로
  //   (VideoColumn 의 key=영상 주소) 플레이어가 바뀔 때마다 다시 적용한다.
  //   서버 렌더에서는 localStorage 가 없어 1× 로 시작하고, 클라이언트 첫 렌더에서 기억값을 읽는다
  //   (이 화면은 'use client' 전용이라 hydration 불일치 경고는 없다).
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(() =>
    typeof window === 'undefined' ? 1 : loadPlaybackRate())
  useEffect(() => {
    if (!ytPlayer) return
    try { ytPlayer.setPlaybackRate(playbackRate) } catch {}
  }, [ytPlayer, playbackRate])
  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    setPlaybackRateState(rate)
    savePlaybackRate(rate)
  }, [])

  // ── YouTube 원격 제어 ────────────────────────────────────────
  function seekRelative(delta: number) {
    if (!ytPlayer) return
    try {
      seekBy(ytPlayer, delta)
      ytPlayer.unMute()
    } catch {}
  }
  function togglePlay() {
    if (!ytPlayer) return
    try {
      const state = ytPlayer.getPlayerState()
      if (state === 1 /* PLAYING */) ytPlayer.pauseVideo()
      else { ytPlayer.unMute(); ytPlayer.playVideo() }
    } catch {}
  }

  // 키보드 단축키: Space(재생/정지), ←/→(±5s), Shift+←/→(±10s), [ / ](속도 한 단계)
  //   ⚠ Backspace(마지막 기록 삭제) 단축키는 2026-10-12 에 뺐다 — 화면 어디서든 눌리면
  //     확인 없이 기록이 지워졌다. 되돌리기는 기록 패드의 「↩ 취소」 하나로 한다.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (!ytPlayer) return
      if (e.code === 'Space')      { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); seekRelative(e.shiftKey ? -10 : -5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(e.shiftKey ? 10 : 5) }
      else if (e.key === '[') { e.preventDefault(); setPlaybackRate(stepPlaybackRate(playbackRate, -1)) }
      else if (e.key === ']') { e.preventDefault(); setPlaybackRate(stepPlaybackRate(playbackRate, 1)) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer, playbackRate]) // eslint-disable-line react-hooks/exhaustive-deps

  return { seekRelative, togglePlay, playbackRate, setPlaybackRate }
}
