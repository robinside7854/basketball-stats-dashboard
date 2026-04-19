'use client'
import { createContext, useContext } from 'react'

const OrgContext = createContext<string>('paranalgae')

export function useOrg() {
  return useContext(OrgContext)
}

export function OrgProvider({ org, children }: { org: string; children: React.ReactNode }) {
  return <OrgContext.Provider value={org}>{children}</OrgContext.Provider>
}
