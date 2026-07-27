// 리그 홈 로딩 스켈레톤 — 캐시 미스(60s 경과 후 첫 방문·배포 직후·태그 무효화 직후) 시
// 빈 화면 대신 즉시 뼈대를 보여줘 체감 대기를 줄인다. (하위 라우트들과 동일하게 홈에도 추가 · 2026-07-27)
export default function LeagueHomeLoading() {
  const box = 'rounded-md bg-[color:var(--mm-panel-alt)] animate-pulse'
  return (
    <div className="space-y-5 lg:space-y-4" aria-hidden>
      {/* 헤더 */}
      <div className="court-bg rounded-2xl px-5 py-6 lg:px-6 lg:py-8 -mx-2 sm:mx-0 border border-gray-800/40">
        <div className={`${box} h-9 lg:h-12 w-3/5 max-w-md`} />
      </div>

      {/* 공지 · 마일스톤 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <div className={`${box} h-40`} />
        <div className={`${box} h-40`} />
      </div>

      {/* 하단 탭 영역 */}
      <div className="rounded-md border border-[color:var(--mm-rule)] overflow-hidden bg-[color:var(--mm-panel)]">
        <div className="flex gap-2 px-3 py-3 border-b border-[color:var(--mm-rule)]">
          <div className={`${box} h-6 w-20`} />
          <div className={`${box} h-6 w-24`} />
          <div className={`${box} h-6 w-20`} />
          <div className={`${box} h-6 w-24`} />
        </div>
        <div className="p-4 space-y-3">
          <div className={`${box} h-14`} />
          <div className={`${box} h-14`} />
          <div className={`${box} h-14`} />
        </div>
      </div>
    </div>
  )
}
