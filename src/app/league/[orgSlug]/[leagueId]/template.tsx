'use client'
// 리그 섹션 페이지 전환 · 스와이프 제거 (사용자 요청 · UX 부드럽지 못함 · 연결 끊김)
// 이전엔 PageSwipeTransition 으로 좌우 스와이프 지원했으나 제거함.
// children 만 그대로 렌더 · 페이지 이동은 상단 탭바 · 하단 나비 클릭으로만.

export default function Template({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
