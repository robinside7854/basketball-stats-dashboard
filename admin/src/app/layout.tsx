import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Basketball Stats Admin',
  description: '농구 스탯 대시보드 어드민',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-gray-950 text-white min-h-screen`}>
        {children}
        <Toaster richColors theme="dark" />
      </body>
    </html>
  )
}
