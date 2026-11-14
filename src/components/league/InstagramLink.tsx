// 인스타그램 모양 아이콘(lucide 의 브랜드 아이콘이 빠져 직접 그린다) — 홈·「나」 바로가기 공용
export function InstagramIcon({ className = '', size }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} width={size} height={size} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}
