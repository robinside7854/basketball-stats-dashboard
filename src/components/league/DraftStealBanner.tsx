'use client'
// 가로채기 배너 — 내가 골라 둔 선수를 다른 팀이 먼저 뽑았을 때 3초간 상단에 뜬다.
//
// 상단 스티키 현황 바(z-30) 바로 아래에 붙고 z-20 이라 현황 바를 가리지 않는다.
// 픽 공개(z-100)보다 아래이므로 전면 연출과 싸우지 않는다.
// 아이콘은 lucide AlertTriangle 20 하나. 액센트는 가로챈 팀의 컬러(왼쪽 보더)뿐.

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

export interface StealBannerData {
  /** 픽 번호 — 같은 사건이 두 번 뜨지 않도록 key 로 쓴다 */
  pickNumber: number
  playerName: string
  teamName: string
  teamColor: string
}

const BANNER_MS = 3000

export default function DraftStealBanner({ data, onDone }: { data: StealBannerData | null; onDone: () => void }) {
  if (!data) return null
  return <StealBannerInner key={data.pickNumber} data={data} onDone={onDone} />
}

function StealBannerInner({ data, onDone }: { data: StealBannerData; onDone: () => void }) {
  // onDone 을 deps 에 넣으면 부모가 인라인 화살표를 넘길 때 재렌더마다 타이머가 새로 걸려
  // 배너가 영영 안 사라진다 — 최신 함수는 ref 로 들고, 타이머는 마운트 1회만 건다.
  const onDoneRef = useRef(onDone)
  useEffect(() => { onDoneRef.current = onDone }, [onDone])
  useEffect(() => {
    const t = setTimeout(() => onDoneRef.current(), BANNER_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className="dp-steal sticky z-20 mb-2 rounded-lg pl-3 pr-3 py-2.5 min-h-11 flex items-center gap-2 bg-[var(--mm-panel)] border border-[var(--mm-rule)]"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 3.25rem)',
        borderLeftColor: data.teamColor,
        borderLeftWidth: 4,
      }}
      role="alert"
    >
      <AlertTriangle size={20} className="text-[var(--mm-yellow-strong)] shrink-0" aria-hidden />
      <p className="text-base font-bold text-[var(--mm-ink)] leading-snug break-keep min-w-0">
        {data.playerName} 선수를 {data.teamName}에 빼앗겼습니다 — 다시 골라 주세요
      </p>
      <style jsx>{`
        .dp-steal {
          animation: dp-steal-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes dp-steal-in {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .dp-steal { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}
