import type { Metadata } from 'next'
import { Fira_Sans, Bebas_Neue, Barlow_Condensed } from 'next/font/google'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TooltipProvider } from '@/components/ui/tooltip'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import ThemedToaster from '@/components/ThemedToaster'
import './globals.css'
import { siteUrl } from '@/lib/siteUrl'
import { appleWebAppMetadata } from '@/lib/pwa/appShell'

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

// 루트 기본 메타데이터 — 자체 metadata 가 없는 모든 경로(/admin, /stats, /roster …)가 이 값을 상속.
// 온볼은 서비스 정체성, 동호회(클럽) 이름은 화면 안에서만 보여준다는 원칙(2026-08) →
// 브라우저 탭·링크 공유 카드 등 "바깥으로 보이는" 자리에는 항상 온볼만 노출하고 클럽명은 절대 섞지 않는다.
// 리그 화면(league/[orgSlug]/[leagueId]/layout.tsx, boxscore/[date]/page.tsx)의 generateMetadata 도
// 같은 원칙으로 "온볼 — <페이지 종류>" 형태만 쓴다 (여러 탭을 구분하되 클럽명은 여전히 안 드러남).
export const metadata: Metadata = {
  // OG 이미지 등 상대 경로를 절대 URL로 계산하는 기준. 카톡/메신저 미리보기는 절대 URL이 아니면
  // 안정적으로 못 가져온다. 프로덕션 도메인은 owner가 onball 커스텀 도메인으로 옮길 수도 있어
  // 하드코딩 대신 env(NEXT_PUBLIC_SITE_URL)로 뺐다 — 값이 없으면 현재 Vercel 기본 도메인로 폴백.
  metadataBase: new URL(siteUrl()),
  title: '온볼',
  description: '구기 동호회의 경기 영상에 기록을 붙여, 선수 개인의 하이라이트와 시즌 기록을 각자에게 돌려주는 서비스',
  openGraph: {
    title: '온볼',
    description: '공이 온 순간은, 사라지지 않는다',
    siteName: '온볼',
    type: 'website',
    locale: 'ko_KR',
  },
  twitter: {
    card: 'summary_large_image',
    title: '온볼',
    description: '공이 온 순간은, 사라지지 않는다',
  },
  // 홈 화면에 추가 시 상태바 컬러 · iOS 런치 스크린 (구형 iOS Safari 호환용)
  //   실제 값은 `@/lib/pwa/appShell` 에 있다 — 리그 레이아웃이 title 만 동호회명으로 바꿔
  //   같은 함수를 다시 부르기 때문(Next 는 appleWebApp 을 필드 단위로 통째 덮어쓴다).
  appleWebApp: appleWebAppMetadata('온볼'),
}

export const viewport: import('next').Viewport = {
  // 앱 다크 지반색(--mm-ground)과 동일. 예전 #0a0a0a 는 차가운 검정이라
  // 상태바 → 콘텐츠로 넘어갈 때 색이 튀었다. (2026-08-10)
  themeColor: '#191714',
  width: 'device-width',
  initialScale: 1,
}

// 설치 프롬프트 선점 — ⚠ 이 스크립트가 <head> 에 있어야 하는 이유가 있다.
//   beforeinstallprompt 는 **문서 로드 직후 딱 한 번** 발생한다. 그런데 우리 설치 버튼은
//   '내 기록' 페이지 안에 있어서, 홈으로 들어와 탭을 이동하면(클라이언트 라우팅)
//   컴포넌트가 마운트될 땐 이미 이벤트가 지나간 뒤였다 → 버튼이 영영 안 떴다 (2026-08-10 사용자 신고).
//   그래서 하이드레이션보다 먼저 문서 레벨에서 이벤트를 붙잡아 window 에 보관하고,
//   뒤늦게 마운트되는 버튼은 이 보관분을 읽어간다. 이미 마운트돼 있는 경우를 위해
//   커스텀 이벤트도 함께 쏜다.
const INSTALL_PROMPT_CAPTURE = `(function(){try{
window.addEventListener('beforeinstallprompt',function(e){
e.preventDefault();window.__onballInstallPrompt=e;
window.dispatchEvent(new Event('onball:installable'));
});
window.addEventListener('appinstalled',function(){
window.__onballInstallPrompt=null;
window.dispatchEvent(new Event('onball:installed'));
});
}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/* Pretendard(한글 본문 폰트) — CSS @import(직렬 왕복) 대신 head 에서 병렬 로드.
            preconnect 로 DNS+TLS 를 미리 데워 크리티컬 패스 지연을 줄인다. 서브셋 CSS 는 작고,
            실제 woff2 글리프는 display:swap 로 논블로킹 로드된다. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_CAPTURE }} />
      </head>
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
