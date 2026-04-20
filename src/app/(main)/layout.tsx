import TabNav from '@/components/layout/TabNav'
import Providers from '@/components/layout/Providers'
import { Toaster } from '@/components/ui/sonner'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <TabNav />
      <main className="container mx-auto px-4 py-4 max-w-[1600px]">
        {children}
      </main>
      <Toaster richColors theme="dark" />
    </Providers>
  )
}
