'use client'
import { create } from 'zustand'
import type { Game, Tournament } from '@/types/database'

interface GameStore {
  currentGame: Game | null
  currentTournament: Tournament | null
  currentQuarter: number
  ytPlayer: YT.Player | null
  setCurrentGame: (game: Game | null) => void
  setCurrentTournament: (t: Tournament | null) => void
  setCurrentQuarter: (q: number) => void
  setYtPlayer: (player: YT.Player | null) => void
  getCurrentTimestamp: () => number
  seekTo: (seconds: number) => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentGame: null,
  currentTournament: null,
  currentQuarter: 1,
  ytPlayer: null,
  setCurrentGame: (game) => set({ currentGame: game }),
  setCurrentTournament: (t) => set({ currentTournament: t }),
  setCurrentQuarter: (q) => set({ currentQuarter: q }),
  setYtPlayer: (player) => set({ ytPlayer: player }),
  getCurrentTimestamp: () => {
    const player = get().ytPlayer
    if (!player) return 0
    try { return player.getCurrentTime() } catch { return 0 }
  },
  seekTo: (seconds: number) => {
    const player = get().ytPlayer
    if (!player) return
    try { player.seekTo(seconds, true) } catch {}
  },
}))
