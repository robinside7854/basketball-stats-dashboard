// 서브탭 페이지 공용 로딩 스켈레톤
//
// 목적: 스와이프 전환 시 빈 화면 대신 자연스러운 골격 노출
// 사용: 각 서브탭 loading.tsx 에서 렌더 (Next.js App Router 관례)
// 스타일: 페이지 배경색과 매칭, animate-pulse

export default function SubTabLoadingSkeleton() {
  return (
    <div className="space-y-4 lg:space-y-5 animate-pulse">
      {/* 서브탭 바 자리 */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-800">
        <div className="h-9 w-24 rounded-t bg-gray-800/50" />
        <div className="h-9 w-20 rounded-t bg-gray-800/30" />
      </div>

      {/* 헤더 자리 (제목 + 부제) */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-40 bg-gray-800 rounded mb-2" />
          <div className="h-4 w-24 bg-gray-800/60 rounded" />
        </div>
        <div className="h-9 w-24 bg-gray-800/40 rounded-lg" />
      </div>

      {/* 컨텐츠 카드 자리 (그리드) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 lg:gap-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-gray-900/40 border border-gray-800/50 rounded-2xl p-3">
            <div className="flex gap-3">
              <div className="w-32 h-40 bg-gray-800/60 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-24 bg-gray-800 rounded" />
                <div className="h-4 w-16 bg-gray-800/60 rounded" />
                <div className="h-3 w-full bg-gray-800/40 rounded mt-3" />
                <div className="h-3 w-2/3 bg-gray-800/40 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
