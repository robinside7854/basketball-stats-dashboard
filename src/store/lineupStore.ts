'use client'
import { create } from 'zustand'

interface LineupStore {
  // 홈/어웨이 분리 출전 명단
  homeOnCourt: string[]
  awayOnCourt: string[]

  // 하위 호환: 전체 onCourt (homeOnCourt + awayOnCourt)
  onCourt: string[]

  setHomeLineup: (playerIds: string[]) => void
  setAwayLineup: (playerIds: string[]) => void
  // 분기 배정 없을 때 단순 모드 (기존 호환)
  setLineup: (playerIds: string[]) => void

  addHomePlayer: (playerId: string) => void
  addAwayPlayer: (playerId: string) => void
  addPlayer: (playerId: string) => void   // 하위 호환
  removePlayer: (playerId: string) => void

  resetLineup: () => void
}

export const useLineupStore = create<LineupStore>((set, get) => ({
  homeOnCourt: [],
  awayOnCourt: [],
  onCourt: [],

  setHomeLineup: (playerIds) =>
    set((s) => ({
      homeOnCourt: playerIds,
      onCourt: [...playerIds, ...s.awayOnCourt],
    })),

  setAwayLineup: (playerIds) =>
    set((s) => ({
      awayOnCourt: playerIds,
      onCourt: [...s.homeOnCourt, ...playerIds],
    })),

  // 기존 호환: 단순 모드 (분기 배정 없을 때)
  setLineup: (playerIds) =>
    set({ homeOnCourt: playerIds, awayOnCourt: [], onCourt: playerIds }),

  addHomePlayer: (playerId) =>
    set((s) => {
      if (s.homeOnCourt.includes(playerId)) return s
      const homeOnCourt = [...s.homeOnCourt, playerId]
      return { homeOnCourt, onCourt: [...homeOnCourt, ...s.awayOnCourt] }
    }),

  addAwayPlayer: (playerId) =>
    set((s) => {
      if (s.awayOnCourt.includes(playerId)) return s
      const awayOnCourt = [...s.awayOnCourt, playerId]
      return { awayOnCourt, onCourt: [...s.homeOnCourt, ...awayOnCourt] }
    }),

  removePlayer: (playerId) =>
    set((s) => {
      const homeOnCourt = s.homeOnCourt.filter((id) => id !== playerId)
      const awayOnCourt = s.awayOnCourt.filter((id) => id !== playerId)
      return { homeOnCourt, awayOnCourt, onCourt: [...homeOnCourt, ...awayOnCourt] }
    }),

  resetLineup: () => set({ homeOnCourt: [], awayOnCourt: [], onCourt: [] }),

  // addPlayer 하위 호환 인터페이스
  addPlayer: (playerId: string) => {
    const s = get()
    if (!s.onCourt.includes(playerId)) {
      const homeOnCourt = [...s.homeOnCourt, playerId]
      set({ homeOnCourt, onCourt: [...homeOnCourt, ...s.awayOnCourt] })
    }
  },
}))
