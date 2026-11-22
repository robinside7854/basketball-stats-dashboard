import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더(ai_rob)에도 lockfile 이 있어 Turbopack 이 워크스페이스 루트를 잘못 추론하던 문제 해결.
  // 이 프로젝트 폴더를 명시적 루트로 고정 (dev/build CSS 파싱 오류 방지).
  turbopack: {
    root: __dirname,
  },
  // 자주 쓰는 대형 패키지 트리쉐이킹 최적화 — 초기 번들 크기·빌드 속도 개선
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },
  // ⚠ 메타데이터 스트리밍 끄기 (2026-11-22 — 안드로이드 크롬 「이 앱을 설치할 수 없습니다」의 원인).
  //   Next 는 generateMetadata 가 async 인 화면(리그 layout)에서 메타 태그를 <body> 로 늦게 흘려보낸다.
  //   그런데 크롬은 <head> 안의 <link rel="manifest"> 만 읽는다 → 리그 화면이 「매니페스트 없음」이 되어
  //   설치가 막히고 설치 안내(beforeinstallprompt)도 안 떴다. 모든 접속을 「봇」처럼 취급하면
  //   메타 태그가 처음부터 <head> 에 들어간다. 되돌리지 말 것.
  htmlLimitedBots: /.*/,
  // Supabase Storage 이미지 최적화 허용
  // 실제 프로젝트 호스트는 env(NEXT_PUBLIC_SUPABASE_URL) 로 접근하지만 hostname 은 와일드카드로 커버.
  // 선수 프로필: <Image fill sizes> 로 옵티마이저 통해 AVIF/WebP · 3배 밀도 대응까지 자동 서빙.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
    // AVIF 우선 · WebP 폴백 — 모바일 데이터 사용량 감소
    formats: ['image/avif', 'image/webp'],
    // 프로필 사진은 대부분 100~200px · 로스터 그리드는 160px · 히어로는 140px 이므로
    // 옵티마이저 캐시 파편화 방지 위해 imageSizes 를 실 사용 폭 근처로 축소.
    imageSizes: [64, 96, 128, 160, 192, 256, 384],
  },
};

export default nextConfig;
