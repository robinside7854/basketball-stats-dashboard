// 서브탭 페이지 공용 로딩 스켈레톤
//
// 목적: 스와이프 전환 시 빈 화면 대신 자연스러운 골격 노출
// 사용: 각 서브탭 loading.tsx 에서 렌더 (Next.js App Router 관례)
// 스타일: 페이지 배경색과 매칭, animate-pulse

export default function SubTabLoadingSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-5 animate-pulse">
      {/* 서브탭 바 자리 */}
      <div className="flex items-center gap-1 mb-4 border-b border-[color:var(--mm-rule)]">
        <div className="h-9 w-24 rounded-t bg-[color:var(--mm-rule)]" />
        <div className="h-9 w-20 rounded-t bg-[color:var(--mm-rule)]" />
      </div>

      {/* 헤더 자리 (제목 + 부제) */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-40 bg-[color:var(--mm-rule)] rounded mb-2" />
          <div className="h-4 w-24 bg-[color:var(--mm-rule)] rounded" />
        </div>
        <div className="h-9 w-24 bg-[color:var(--mm-rule)] rounded-lg" />
      </div>

      {/* 컨텐츠 카드 자리 (그리드) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 lg:gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-2xl p-3">
            <div className="flex gap-3">
              <div className="w-32 h-40 bg-[color:var(--mm-rule)] rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-24 bg-[color:var(--mm-rule)] rounded" />
                <div className="h-4 w-16 bg-[color:var(--mm-rule)] rounded" />
                <div className="h-3 w-full bg-[color:var(--mm-rule)] rounded mt-3" />
                <div className="h-3 w-2/3 bg-[color:var(--mm-rule)] rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
