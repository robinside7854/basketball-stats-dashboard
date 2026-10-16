// 「내 기록」(/me) 로딩 자리 — 실제 화면과 같은 배치로 그린다(Taste 리디자인 2026-10-16).
//   PC(lg): 왼쪽 380px 프로필 카드 + 오른쪽 카드 3장 · 모바일: 한 줄로 쌓인다.
//   loading.tsx(서버)와 MePageClient·PersonalDashboard(클라이언트)가 같이 쓴다 — 훅 없는 순수 컴포넌트.
import type { ReactNode } from 'react'

function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={`min-w-0 ${className}`}
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderRadius: 'var(--mm-radius-card)',
        boxShadow: 'var(--mm-shadow-sm)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}

function Block({ className = '', round = 'ctl' }: { className?: string; round?: 'ctl' | 'chip' }) {
  return (
    <div
      aria-hidden
      className={`mm-shimmer ${className}`}
      style={{ borderRadius: round === 'chip' ? 'var(--mm-radius-chip)' : 'var(--mm-radius-ctl)' }}
    />
  )
}

/** 오른쪽 칼럼 카드 3장(출석률 · 베스트샷 · 마일스톤) */
export function DashboardCardsSkeleton() {
  return (
    <div className="min-w-0 space-y-4 lg:space-y-5" role="status" aria-label="불러오는 중…">
      <Card className="p-4 lg:px-6 lg:py-5">
        <Block className="h-5 w-24 mb-4" />
        <div className="flex items-center gap-4">
          <Block className="w-[76px] h-[76px] shrink-0" round="chip" />
          <div className="flex-1 space-y-2">
            <Block className="h-4 w-3/4" />
            <Block className="h-3 w-1/2" />
          </div>
        </div>
      </Card>
      <Card className="p-4 lg:px-6 lg:py-5">
        <Block className="h-5 w-28 mb-4" />
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Block className="aspect-video" />
          <Block className="aspect-video" />
          <Block className="aspect-video" />
        </div>
      </Card>
      <Card className="p-4 md:p-5">
        <Block className="h-5 w-32 mb-4" />
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="space-y-1.5">
              <Block className="h-3 w-2/3" />
              <Block className="h-2 w-full" round="chip" />
            </div>
          ))}
        </div>
      </Card>
      <span className="sr-only">불러오는 중…</span>
    </div>
  )
}

/** 왼쪽 프로필 카드 */
export function ProfileCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <Block className="w-14 h-14 shrink-0" round="chip" />
        <div className="flex-1 space-y-2">
          <Block className="h-5 w-32" />
          <Block className="h-3 w-12" />
        </div>
      </div>
      <div className="px-4 sm:px-5 py-3 sm:py-4 space-y-2">
        <Block className="h-[52px] w-full" round="chip" />
        <Block className="h-3 w-2/3 mx-auto" />
      </div>
      <div className="px-4 md:px-5 py-3 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--mm-rule)' }}>
        <Block className="h-3 w-28" />
        <Block className="h-9 w-28" />
      </div>
    </Card>
  )
}

/** 페이지 전체(인증 확인 중 · 라우트 로딩) */
export default function MePageSkeleton() {
  return (
    <div className="grid gap-4 lg:gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0">
        <ProfileCardSkeleton />
      </div>
      <DashboardCardsSkeleton />
    </div>
  )
}
