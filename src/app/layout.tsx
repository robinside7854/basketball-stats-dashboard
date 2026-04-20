import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans } from 'next/font/google'
import './globals.css'

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-fira-code',
})

const firaSans = Fira_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-fira-sans',
})

export const metadata: Metadata = {
  title: '파란날개 게임로그',
  description: '파란날개 농구팀 경기 기록 및 통계 대시보드',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${firaCode.variable} ${firaSans.variable} font-sans bg-gray-950 text-white min-h-screen`}>
        {children}
      </body>
    </html>
  )
}
