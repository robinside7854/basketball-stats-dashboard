import type { Metadata } from 'next'
import { Fira_Code, Fira_Sans, Bebas_Neue, Barlow_Condensed } from 'next/font/google'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
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

// 농구 정체성 — 스코어보드/저지 느낌의 디스플레이 폰트
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-bebas',
})

// 농구 정체성 — 컨덴스드 헤더 폰트 (저지 글꼴)
const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-barlow-condensed',
})

export const metadata: Metadata = {
  title: '파란날개 게임로그',
  description: '파란날개 농구팀 경기 기록 및 통계 대시보드',
  // 홈 화면에 추가 시 상태바 컬러 (구형 iOS Safari 호환용)
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '미라클모닝',
  },
}

export const viewport: import('next').Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${firaCode.variable} ${firaSans.variable} ${bebasNeue.variable} ${barlowCondensed.variable} font-sans bg-gray-950 text-gray-300 min-h-screen`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
        >
          <TooltipProvider>
            {children}
            {/* PWA Service Worker 등록 — 안드로이드 PWA 설치 인식용 */}
            <ServiceWorkerRegister />
            {/* 토스트 위치 — top-center: 모바일/데스크탑 모두에서 하단 sticky CTA / 채팅 FAB / 픽 액션 패널을
                덮지 않음. expand=false 로 스택이 위로 펼쳐지지 않게 하고 offset 으로 상단 헤더 영역 회피. */}
            <Toaster position="top-center" richColors closeButton expand={false} offset="72px" theme="dark" />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
