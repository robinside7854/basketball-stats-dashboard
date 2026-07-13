import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 자주 쓰는 대형 패키지 트리쉐이킹 최적화 — 초기 번들 크기·빌드 속도 개선
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },
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
