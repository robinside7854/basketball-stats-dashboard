'use client'
// 스탯 게이팅 안내 카드 — 비로그인/미승인 사용자에게 로그인 유도 (2026-07-28)
//   홈 섹션(리더보드·하이라이트·마일스톤) 대체 카드 + 전체 페이지(스탯·어워즈·하이라이트) 게이트 공용.
//   로그인 버튼 → mm-open-login 이벤트 (LeagueLayout 이 수신해 LoginModal 오픈)
import { Lock, LogIn, ChevronRight } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'

interface Props {
  title?: string
  description?: string
  /** 페이지 본문 전체를 대체하는 큰 게이트 (스탯/어워즈/하이라이트 페이지) */
  fullPage?: boolean
}

export default function StatGate({
  title = '회원 전용 콘텐츠입니다',
  description = '가입 승인된 회원만 볼 수 있어요. 로그인하거나 가입을 요청해 주세요.',
  fullPage = false,
}: Props) {
  const body = (
    <div className={`flex flex-col items-center justify-center text-center px-6 ${fullPage ? 'py-16 sm:py-24' : 'py-10'}`}>
      <span
        className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
        style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-rule)' }}
        aria-hidden
      >
        <Lock size={20} style={{ color: 'var(--mm-ink)' }} />
      </span>
      <h3 className="font-bold text-lg sm:text-xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
        {title}
      </h3>
      <p className="text-[13px] mt-1.5 leading-relaxed max-w-sm break-keep" style={{ color: 'var(--mm-muted)' }}>
        {description}
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent('mm-open-login'))}
        className="mt-4 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-bold text-sm cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] min-h-[44px]"
        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
      >
        <LogIn size={15} aria-hidden />
        로그인 · 가입 요청
        <ChevronRight size={15} aria-hidden />
      </button>
      <p className="text-[11px] mt-3" style={{ color: 'var(--mm-muted)' }}>
        우리 팀 선수라면 이름으로 가입 요청 → 운영자 승인 후 바로 열려요
      </p>
    </div>
  )

  if (fullPage) {
    return (
      <div className="max-w-2xl mx-auto">
        <SectionCard variant="standalone" emphasized>{body}</SectionCard>
      </div>
    )
  }
  return <SectionCard variant="standalone">{body}</SectionCard>
}
