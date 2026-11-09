import TabNav from '@/components/layout/TabNav'
import Providers from '@/components/layout/Providers'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <TabNav />
      <main className="container mx-auto px-4 py-4 max-w-[1600px]">
        {children}
      </main>
      {/* 알림(Toaster)은 루트 layout 의 ThemedToaster 하나 — 여기 또 달면 두 개씩 뜬다(2026-11-09) */}
    </Providers>
  )
}
