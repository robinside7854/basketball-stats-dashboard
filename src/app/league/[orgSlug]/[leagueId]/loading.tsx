// 리그 홈 로딩 스켈레톤 — 캐시 미스(60s 경과 후 첫 방문·배포 직후·태그 무효화 직후) 시
// 빈 화면 대신 즉시 뼈대를 보여줘 체감 대기를 줄인다. (하위 라우트들과 동일하게 홈에도 추가 · 2026-07-27)
export default function LeagueHomeLoading() {
  const box = 'rounded-md bg-[color:var(--mm-panel-alt)] animate-pulse'
  return (
    <div className="space-y-3" aria-hidden>
      {/* 헤더 — 실제 헤더(page.tsx)와 동일하게 테마 추종 카드로 (2026-08 캐주얼 전환) */}
      <div
        className="px-5 py-6 lg:px-6 lg:py-8 -mx-2 sm:mx-0 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]"
        style={{ borderRadius: 'var(--mm-radius-card)' }}
      >
        <div className={`${box} h-9 lg:h-12 w-3/5 max-w-md`} />
      </div>

      {/* 공지 · 마일스톤 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <div className={`${box} h-40`} />
        <div className={`${box} h-40`} />
      </div>

      {/* 하단 탭 영역 — HomeSectionTabs 와 동일하게 카드 프레임 없이 탭 바 + 간격 + 카드 */}
      <div className="flex gap-2 px-1 py-3 border-b border-[color:var(--mm-rule)]">
        <div className={`${box} h-6 w-20`} />
        <div className={`${box} h-6 w-24`} />
        <div className={`${box} h-6 w-20`} />
        <div className={`${box} h-6 w-24`} />
      </div>
      <div
        className="p-4 space-y-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]"
        style={{ borderRadius: 'var(--mm-radius-card)' }}
      >
        <div className={`${box} h-14`} />
        <div className={`${box} h-14`} />
        <div className={`${box} h-14`} />
      </div>
    </div>
  )
}
