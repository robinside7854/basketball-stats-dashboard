'use client'
import { EditModeProvider } from '@/contexts/EditModeContext'

export default function Providers({ children }: { children: React.ReactNode }) {
  return <EditModeProvider>{children}</EditModeProvider>
}
