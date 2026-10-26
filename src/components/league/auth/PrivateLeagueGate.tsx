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
import { Lock, LogIn, ChevronRight, UserPlus } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

const LoginModal = dynamic(() => import('./LoginModal'), { ssr: false })

interface Props {
  leagueId: string
}

export default function PrivateLeagueGate({ leagueId }: Props) {
  const [loginOpen, setLoginOpen] = useState(false)
  const [startStep, setStartStep] = useState<'login' | 'signup'>('signup')

  useEffect(() => {
    const open = () => setLoginOpen(true)
    window.addEventListener('mm-open-login', open)
    return () => window.removeEventListener('mm-open-login', open)
  }, [])

  // 이 기기에서 본 적 있는 사람 (2026-10-26 점검 MVP 1) — 화면이 서버에서 그려진 뒤 브라우저 저장값으로 갈린다.
  //   returning: 예전에 로그인했던 회원(로그인이 풀린 것) → 로그인 창을 바로 연다. 로그인하면 지금 주소가 그대로 다시 열린다.
  //   pending:   가입 요청을 보낸 기기 → 「승인 대기 중」. (종전엔 대기 배지가 게이트 안쪽 화면에만 있어 비공개 리그에선 안 보였다)
  //   ⚠ 저장값은 '1' 뿐 — 이름·동호회 정보는 남기지 않는다.
  const [mode, setMode] = useState<'new' | 'pending' | 'returning'>('new')
  useEffect(() => {
    let m: 'new' | 'pending' | 'returning' = 'new'
    try {
      if (localStorage.getItem(`mm_member:${leagueId}`)) m = 'returning'
      else if (localStorage.getItem(`mm_signup_pending:${leagueId}`)) m = 'pending'
    } catch { /* 저장소가 막혀 있으면 처음 온 사람으로 */ }
    if (m === 'new') return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장값은 그린 뒤에만 읽을 수 있다
    setMode(m)
    if (m === 'returning') { setStartStep('login'); setLoginOpen(true) }
  }, [leagueId])

  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6 py-16"
      style={{ background: 'var(--mm-ground)' }}
    >
      <div className="w-full max-w-md text-center">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Basketball size={26} />
          <span
            className="font-bold"
            style={{ color: 'var(--mm-ink)', fontSize: 26 }}
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
            className="font-black text-xl sm:text-2xl mb-2"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            {mode === 'returning' ? '다시 로그인해 주세요' : mode === 'pending' ? '가입 승인을 기다리고 있어요' : '비공개로 운영되는 페이지입니다'}
          </h1>
          <p
            className="text-sm leading-relaxed break-keep"
            style={{ color: 'var(--mm-ink-soft)' }}
          >
            {mode === 'returning' ? (
              <>로그인이 풀렸어요. 로그인하면 보던 화면이 그대로 열려요.</>
            ) : mode === 'pending' ? (
              <>운영자가 승인하면 <b>이름</b>과 <b>생년월일 6자리</b>로 로그인할 수 있어요.<br />승인이 늦으면 운영진에게 알려 주세요.</>
            ) : (
              <>가입 승인된 회원만 볼 수 있어요.<br />로그인하거나 가입을 요청해 주세요.</>
            )}
          </p>

          {/* 2026-10-14: 비회원이 대부분이라 「가입 요청」을 먼저, 크게. 로그인은 그 아래 보조 버튼.
              2026-10-26: 예전 회원·승인 대기자에게는 로그인이 먼저. */}
          {mode !== 'new' && (
            <button
              type="button"
              onClick={() => { setStartStep('login'); setLoginOpen(true) }}
              className="mm-press mt-6 w-full inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-md font-bold text-sm cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] min-h-[44px]"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
            >
              <LogIn size={16} aria-hidden />
              로그인
              <ChevronRight size={16} aria-hidden />
            </button>
          )}
          {mode === 'new' && (<>
          <button
            type="button"
            onClick={() => { setStartStep('signup'); setLoginOpen(true) }}
            className="mm-press mt-6 w-full inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-md font-bold text-sm cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] min-h-[44px]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
          >
            <UserPlus size={16} aria-hidden />
            가입 요청하기
            <ChevronRight size={16} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => { setStartStep('login'); setLoginOpen(true) }}
            className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-md font-bold text-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] min-h-[44px]"
            style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
          >
            <LogIn size={16} aria-hidden />
            이미 승인됐어요 · 로그인
          </button>
          </>)}

          <p className="text-xs mt-4" style={{ color: 'var(--mm-muted)' }}>
            소속 동호회의 회원이라면 이름으로 가입 요청 → 운영자 승인 후 바로 열려요
          </p>
        </div>
      </div>

      {loginOpen && (
        <LoginModal leagueId={leagueId} initialStep={startStep} onClose={() => setLoginOpen(false)} />
      )}
    </main>
  )
}
