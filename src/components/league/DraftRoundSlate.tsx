'use client'
// 라운드 슬레이트 — current_round 가 오를 때 0.9초짜리 "ROUND n" 풀스크린.
//
// z-[95]: 픽 공개(DraftPickReveal, z-100) 아래에 깔린다. 픽 확정 직후 라운드가 오르므로
// 두 연출이 겹칠 수 있는데, 주인공은 픽 공개다.
// pointer-events-none: 단장의 탭을 절대 막지 않는다(0.9초 동안 픽 버튼이 죽으면 안 된다).
//
// 색: 팀 중립이라 팀 컬러를 쓰지 않는다. 배경은 mm-ground 의 다크값을 직접 쓴다 —
// 토큰(var(--mm-ground))은 라이트 테마에서 아이보리로 뒤집히는데 이 포털은 항상 어두운 화면이라
// 뒤집히면 노란 글자가 읽히지 않는다.

import { useEffect, useRef } from 'react'

const SLATE_MS = 900
const SLATE_REDUCED_MS = 400

export default function DraftRoundSlate({ round, onDone }: { round: number | null; onDone: () => void }) {
  if (round == null) return null
  // key: 라운드가 바뀔 때마다 다시 마운트 → CSS 애니메이션이 1회 재생된다(JS 로 상태를 되돌리지 않는다)
  return <RoundSlateInner key={round} round={round} onDone={onDone} />
}

function RoundSlateInner({ round, onDone }: { round: number; onDone: () => void }) {
  // onDone 을 deps 에 넣으면 부모가 인라인 화살표를 넘길 때 재렌더마다 타이머가 새로 걸려
  // 슬레이트가 영영 언마운트되지 않는다 — 최신 함수는 ref 로, 타이머는 마운트 1회만.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => {
    // 모션 최소화 설정이면 페이드/스케일 없이 0.4초만 띄우고 걷는다
    const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const t = setTimeout(() => onDoneRef.current(), (reduce ? SLATE_REDUCED_MS : SLATE_MS) + 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="dp-slate fixed inset-0 z-[95] flex items-center justify-center pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <p className="dp-slate-text font-black leading-none tracking-[0.12em] text-[15vw] sm:text-[12vw] lg:text-[10vw]">
        ROUND {round}
      </p>
      <style jsx>{`
        .dp-slate {
          /* 기본 상태를 '보이는 상태'로 둔다 — 모션 최소화에서 애니메이션을 끄면 그대로 보인다 */
          opacity: 1;
          background: rgba(25, 23, 20, 0.88);
          animation: dp-slate-fade 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .dp-slate-text {
          color: var(--mm-yellow, #F5C95C);
          font-family: var(--font-bebas), 'Bebas Neue', Impact, sans-serif;
          animation: dp-slate-pop 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes dp-slate-fade {
          0%   { opacity: 0; }
          14%  { opacity: 1; }
          76%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes dp-slate-pop {
          0%   { transform: scale(0.94); opacity: 0; }
          18%  { transform: scale(1);    opacity: 1; }
          76%  { transform: scale(1);    opacity: 1; }
          100% { transform: scale(1);    opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dp-slate, .dp-slate-text { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}
