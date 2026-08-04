'use client'
// 비공개 리그 전체 화면 게이트 (2026-08-04)
//   isLeaguePublic=false 이고 승인 회원 세션도 없을 때 LeagueLayout 이 children 대신 이 화면만 렌더한다.
//
//   ⚠️ 클럽 이름을 절대 표시하지 않는다 — 링크를 가진 사람이 보는 화면이지만,
//      "여기가 어느 동호회인지"가 새어 나가면 비공개로 전환한 의미가 없다.
//      leagueId(UUID)는 받아 로그인 API 호출에만 쓰고, 화면·탭 제목 어디에도 리그/팀/동호회
//      이름을 노출하지 않는다 (탭 제목은 layout.tsx 의 generateMetadata 가 별도로 중립화한다).
//
//   로그인 버튼은 StatGate 와 같은 mm-open-login 커스텀 이벤트 패턴을 쓰되, 이 화면은
//   LeagueLayoutClient(이벤트 리스너 + LoginModal 보유) 밖에서 렌더되므로 리스너와 모달을
//   이 컴포넌트가 직접 들고 있어야 한다 — 그래야 이벤트를 던져도 실제로 모달이 열린다.
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Lock, LogIn, ChevronRight } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

const LoginModal = dynamic(() => import('./LoginModal'), { ssr: false })

interface Props {
  leagueId: string
}

export default function PrivateLeagueGate({ leagueId }: Props) {
  const [loginOpen, setLoginOpen] = useState(false)

  useEffect(() => {
    const open = () => setLoginOpen(true)
    window.addEventListener('mm-open-login', open)
    return () => window.removeEventListener('mm-open-login', open)
  }, [])

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ background: 'var(--mm-ground)' }}
    >
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Basketball size={26} />
          <span
            className="font-jersey font-black uppercase"
            style={{ color: 'var(--mm-ink)', fontSize: 26, letterSpacing: '0.14em' }}
          >
            OnBall
          </span>
        </div>

        <div
          className="px-5 py-8 sm:px-8 sm:py-10"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '6px' }}
        >
          <span
            className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
            style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-rule)' }}
            aria-hidden
          >
            <Lock size={24} style={{ color: 'var(--mm-ink)' }} />
          </span>

          <h1
            className="font-jersey font-black uppercase text-xl sm:text-2xl mb-2"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            비공개로 운영되는 페이지입니다
          </h1>
          <p
            className="text-[14px] leading-relaxed break-keep"
            style={{ color: 'var(--mm-ink-soft)' }}
          >
            가입 승인된 회원만 볼 수 있어요.
            <br />
            로그인하거나 가입을 요청해 주세요.
          </p>

          <button
            type="button"
            onClick={() => setLoginOpen(true)}
            className="mt-6 inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-jersey font-black uppercase text-sm tracking-[0.12em] cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] min-h-[44px]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
          >
            <LogIn size={15} aria-hidden />
            로그인 · 가입 요청
            <ChevronRight size={15} aria-hidden />
          </button>

          <p className="text-[11px] mt-4" style={{ color: 'var(--mm-muted)' }}>
            소속 동호회의 회원이라면 이름으로 가입 요청 → 운영자 승인 후 바로 열려요
          </p>
        </div>
      </div>

      {loginOpen && (
        <LoginModal leagueId={leagueId} onClose={() => setLoginOpen(false)} />
      )}
    </main>
  )
}
