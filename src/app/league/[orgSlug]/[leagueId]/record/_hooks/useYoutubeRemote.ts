import { useEffect } from 'react'
import { seekBy } from '@/lib/youtube/utils'

// ── YouTube 원격 제어 + 키보드 단축키 (기록 화면의 첫 effect) ──────────────
export type UseYoutubeRemoteCtx = {
  ytPlayer: YT.Player | null
}

export function useYoutubeRemote(ctx: UseYoutubeRemoteCtx) {
  const { ytPlayer } = ctx
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

  // 키보드 단축키: Space(재생/정지), ←/→(±5s), Shift+←/→(±10s)
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
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  return { seekRelative, togglePlay }
}
