import type { Metadata } from 'next'
import { Fira_Sans, Bebas_Neue, Barlow_Condensed } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import ThemedToaster from '@/components/ThemedToaster'
import './globals.css'

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

// iOS 아이폰 세로 해상도 media query 목록 (device-width/height × DPR).
//   각 항목은 하나의 아이폰 세대군을 타깃 → 모두 동일 마스터 스플래시로 매핑.
const SPLASH_DEVICES = [
  '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 Pro Max
  '(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 Plus / 15 Pro Max / 14 Pro Max
  '(device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 Pro
  '(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 15 Plus / 14 Plus / 13 Pro Max / 12 Pro Max
  '(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 16 / 15 Pro / 15 / 14 Pro
  '(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 14 / 13 / 13 Pro / 12 / 12 Pro
  '(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // X / XS / 11 Pro
  '(device-width: 360px) and (device-height: 780px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 13 mini / 12 mini
  '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)', // 11 Pro Max / XS Max
  '(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', // 11 / XR
  '(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', // SE 2/3 · 8 · 7 · 6s
  '(device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)', // SE 1
]

export const metadata: Metadata = {
  title: '파란날개 게임로그',
  description: '파란날개 농구팀 경기 기록 및 통계 대시보드',
  // 홈 화면에 추가 시 상태바 컬러 (구형 iOS Safari 호환용)
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '미라클모닝',
    // iOS 전용 런치 스크린(전면 스플래시).
    //   안드로이드는 매니페스트 background_color + 아이콘으로 자동 구성되므로 여기서 다루지 않음.
    //   마스터 이미지 1장(/splash/apple-splash.png, 1290×2796)을 모든 아이폰 해상도 media query에 매핑 →
    //   기기별 화면비 차이는 iOS가 스케일. 핵심 콘텐츠는 중앙 안전영역(1000×1000)에 두어 크롭 대비.
    //   ※ 픽셀 퍼펙트가 필요하면 url 을 해상도별 파일로 교체 (scripts/gen-splash 로 자동 생성).
    startupImage: SPLASH_DEVICES.map((media) => ({
      url: '/splash/apple-splash.png',
      media,
    })),
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
      <body className={`${firaSans.variable} ${bebasNeue.variable} ${barlowCondensed.variable} font-sans bg-gray-950 text-gray-300 min-h-screen`}>
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
                덮지 않음. expand=false 로 스택이 위로 펼쳐지지 않게 하고 offset 으로 상단 헤더 영역 회피.
                theme 은 next-themes 와 동기화 (ThemedToaster). */}
            <ThemedToaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
