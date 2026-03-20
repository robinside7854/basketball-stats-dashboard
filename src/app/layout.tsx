import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import TabNav from '@/components/layout/TabNav'
import Providers from '@/components/layout/Providers'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: '파란날개 게임로그',
  description: '파란날개 농구팀 경기 기록 및 통계 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        <Providers>
          <TabNav />
          <main className="container mx-auto px-4 py-4 max-w-[1600px]">
            {children}
          </main>
          <Toaster richColors theme="dark" />
        </Providers>
      </body>
    </html>
  )
}
