// 드래프트 포털 레이아웃 — 일반 리그 페이지의 사이드바/탭/푸터를 제외한
// 풀스크린 단독 layout. 토큰 공유 링크 전용.

export default function DraftPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 text-white">
      {children}
    </div>
  )
}
