import { BasketballLoader } from '@/components/league/BasketballIcons'

/**
 * 루트 loading UI — App Router 자동 Suspense fallback.
 * 홈 진입 시 빈 화면 대신 미라클모닝 톤 로더를 노출한다.
 * mm-* 팔레트 (docs/mm-brand-style.md) 를 사용해 라이트/다크 자동 대응.
 */
export default function RootLoading() {
  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center gap-4 px-6"
      style={{ backgroundColor: 'var(--mm-ground)' }}
      role="status"
      aria-live="polite"
    >
      <BasketballLoader size={48} />
      <p
        className="font-jersey text-sm uppercase tracking-[0.22em]"
        style={{ color: 'var(--mm-muted)' }}
      >
        Loading
      </p>
      <span className="sr-only">페이지를 불러오는 중입니다.</span>
    </div>
  )
}
