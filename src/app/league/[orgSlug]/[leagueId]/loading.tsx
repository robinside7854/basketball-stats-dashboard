// 리그 홈 로딩 스켈레톤 — 캐시 미스(배포 직후·태그 무효화 직후) 시 빈 화면 대신 즉시 뼈대를 보여줘 체감 대기를 줄인다.
// (2026-10-26) 실제 홈 순서와 맞췄다: 「지난 토요일 나」 → 경기일 카드 → 이번 분기(순위 · 리더).
export default function LeagueHomeLoading() {
  const box = 'rounded-md mm-shimmer'
  const card = 'p-4 space-y-3 border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]'
  const radius = { borderRadius: 'var(--mm-radius-card)' }
  return (
    <div className="space-y-4 lg:space-y-5" aria-hidden>
      {/* 지난 토요일 나 */}
      <div className={card} style={radius}>
        <div className={`${box} h-4 w-28`} />
        <div className="grid grid-cols-3 gap-2">
          <div className={`${box} h-10`} />
          <div className={`${box} h-10`} />
          <div className={`${box} h-10`} />
        </div>
        <div className={`${box} h-9 w-2/3`} />
      </div>

      {/* 경기일 카드 */}
      <div className={card} style={radius}>
        <div className={`${box} h-7 w-40`} />
        <div className={`${box} h-9`} />
        <div className={`${box} h-9`} />
        <div className={`${box} h-9`} />
      </div>

      {/* 이번 분기 — 순위 · 리더 */}
      <div className={`${box} h-7 w-32`} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        <div className={`${box} h-40`} />
        <div className={`${box} h-40`} />
      </div>
    </div>
  )
}
