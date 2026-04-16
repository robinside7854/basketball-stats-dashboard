'use client'
import { createContext, useContext } from 'react'

export type TeamType = 'youth' | 'senior'

export const TEAM_LABELS: Record<TeamType, string> = {
  youth: '청년부',
  senior: '장년부',
}

export const TEAM_COLORS: Record<TeamType, { accent: string; border: string; text: string }> = {
  youth:  { accent: 'blue',   border: 'border-blue-500/60',   text: 'text-blue-400'   },
  senior: { accent: 'orange', border: 'border-orange-500/60', text: 'text-orange-400' },
}

const TeamContext = createContext<TeamType>('youth')

export function useTeam() {
  return useContext(TeamContext)
}

export function TeamProvider({ team, children }: { team: TeamType; children: React.ReactNode }) {
  return (
    <TeamContext.Provider value={team}>
      {children}
    </TeamContext.Provider>
  )
}
