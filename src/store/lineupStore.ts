'use client'
import { create } from 'zustand'

interface LineupStore {
  onCourt: string[]  // player_id 배열
  setLineup: (playerIds: string[]) => void
  addPlayer: (playerId: string) => void
  removePlayer: (playerId: string) => void
  resetLineup: () => void
}

export const useLineupStore = create<LineupStore>((set) => ({
  onCourt: [],
  setLineup: (playerIds) => set({ onCourt: playerIds }),
  addPlayer: (playerId) =>
    set((state) => ({
      onCourt: state.onCourt.includes(playerId)
        ? state.onCourt
        : [...state.onCourt, playerId],
    })),
  removePlayer: (playerId) =>
    set((state) => ({ onCourt: state.onCourt.filter((id) => id !== playerId) })),
  resetLineup: () => set({ onCourt: [] }),
}))
