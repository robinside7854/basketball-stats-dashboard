import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 자주 쓰는 대형 패키지 트리쉐이킹 최적화 — 초기 번들 크기·빌드 속도 개선
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },
  // Supabase Storage 이미지 최적화 허용
  // 실제 프로젝트 호스트는 env(NEXT_PUBLIC_SUPABASE_URL) 로 접근하지만 hostname 은 와일드카드로 커버.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
};

export default nextConfig;
