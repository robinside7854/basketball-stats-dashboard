import MePageSkeleton from '@/components/league/auth/MePageSkeleton'

// 「내 기록」 라우트 로딩 — 실제 화면과 같은 배치의 자리 표시(제목 + 프로필 카드 + 카드 3장)
export default function Loading() {
  return (
    <div className="space-y-4 lg:space-y-5">
      <h2 className="font-black text-[28px] lg:text-[40px] leading-none text-[color:var(--mm-ink)] tracking-tight">내 기록</h2>
      <MePageSkeleton />
    </div>
  )
}
