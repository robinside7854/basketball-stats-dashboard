// 드래프트 포털 레이아웃 — 일반 리그 페이지의 사이드바/탭/푸터를 제외한
// 풀스크린 단독 layout. 토큰 공유 링크 전용.

export default function DraftPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    // 표면은 mm 토큰 하나로 — gray-950/gray-900 은 라이트 테마에서 값이 뒤집히는데
    // text-white 는 #0f172a 로 같이 뒤집혀 「흰 배경 + 흰 글자」 조합이 나왔다(2026-09-18 감사).
    <div className="min-h-screen bg-[var(--mm-ground)] text-[var(--mm-ink)]">
      {children}
    </div>
  )
}
