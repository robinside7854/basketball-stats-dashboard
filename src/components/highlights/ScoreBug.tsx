'use client'
// 하이라이트 스코어보드 — 중계 화면 「스코어 버그」 (2026-11-10 운영진 · KBL 중계 화면 참고).
//
// ⚠ 영상 위에 겹치지 않는다 — 영상 바로 아래 띠(유튜브 제목줄·조작 막대와 겹쳤다).
// 모양: [왼쪽 팀 · 팀 색][왼쪽 점수][오른쪽 점수][오른쪽 팀 · 팀 색][날짜 / N경기] 한 덩어리.
//   점수 두 칸은 가운데에서 맞닿고, 팀 이름은 점수 바로 옆에 붙는다. 폰은 폭을 채우고, 태블릿·PC 는
//   내용만큼만 차지해 가운데에 놓인다(넓은 화면에서 팀 이름과 점수가 멀어지던 문제 — 운영진).
//   칸 사이 선·그림자 없음(튀어나온 선이 지저분했다). 둥근 모서리는 바깥 한 번.
// 좌우 = 기록 화면과 같다(부르는 쪽이 정한다 — 홈 = 왼쪽, 그 쿼터에 좌우를 바꿨으면 반대).
// 아랫줄: 장면 이름 · 득점 선수 · 어시스트 · 클러치. 경기 시계는 넣지 않는다(정확하지 않다).
import { HeartCrack, ArrowRight } from 'lucide-react'
import { textOnBg } from '@/lib/util/contrastColor'

export interface ScoreBugSide { name: string; score: number; color?: string | null; scored: boolean }
export interface ScoreBugProps {
  left: ScoreBugSide
  right: ScoreBugSide
  points?: number | null
  label?: string | null
  scorer?: string | null
  assist?: string | null
  clutch?: boolean
  day?: string | null
  slot?: number | null
}

const INK = '#0b1220'
// 판 바탕 — 온볼 어두운 바탕(검정 계열)에 묻히지 않게 한 단계 밝은 남색 + 바깥 얇은 밝은 테(2026-11-11 운영진)
const FRAME = '#1d2738'
const FALLBACK = '#2a3346'

function fmtDay(d?: string | null) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`
}

function Team({ side }: { side: ScoreBugSide }) {
  const bg = side.color || FALLBACK
  return (
    <div className="flex-1 sm:flex-none sm:min-w-[128px] min-w-0 flex items-center justify-center text-center px-1.5 sm:px-4"
      style={{ background: bg, color: textOnBg(bg) }}>
      <span className="font-black text-sm min-[400px]:text-base sm:text-lg leading-tight break-keep">{side.name}</span>
    </div>
  )
}

function Score({ side, dark, points }: { side: ScoreBugSide; dark: boolean; points?: number | null }) {
  return (
    <div className="relative shrink-0 w-12 min-[400px]:w-14 sm:w-[72px] flex items-center justify-center font-jersey font-black tabular-nums leading-none text-[28px] sm:text-[36px]"
      style={{ background: INK, color: '#fff', boxShadow: dark ? 'inset -1px 0 0 rgba(255,255,255,0.18)' : undefined }}>
      {side.score}
      {side.scored && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: 'var(--mm-yellow)' }} />}
      {side.scored && points ? (
        <span className="absolute top-1 right-1 text-[10px] font-black leading-none px-1 py-0.5 rounded-sm mm-score-pop"
          style={{ background: 'var(--mm-yellow)', color: INK }}>+{points}</span>
      ) : null}
    </div>
  )
}

export default function ScoreBug(p: ScoreBugProps) {
  const day = fmtDay(p.day)
  return (
    <div className="w-full sm:w-fit sm:max-w-full sm:mx-auto rounded-md overflow-hidden" style={{ background: FRAME, color: '#fff', boxShadow: '0 0 0 1px rgba(255,255,255,0.22), 0 6px 18px rgba(0,0,0,0.35)' }}
      role="img"
      aria-label={`스코어보드: ${p.left.name} ${p.left.score} 대 ${p.right.score} ${p.right.name}${p.slot ? `, ${p.slot}경기` : ''}`}>
      <div className="flex items-stretch h-12 sm:h-14">
        <Team side={p.left} />
        <Score side={p.left} dark points={p.points} />
        <Score side={p.right} dark={false} points={p.points} />
        <Team side={p.right} />
        {(day || p.slot) && (
          <div className="shrink-0 flex flex-col items-center justify-center px-2.5 sm:px-3 tabular-nums leading-tight">
            {day && <span className="text-[10px] sm:text-xs font-bold" style={{ color: 'rgba(255,255,255,0.65)' }}>{day}</span>}
            {p.slot && <span className="font-jersey text-base sm:text-xl font-black" style={{ color: 'var(--mm-yellow)' }}>{p.slot}경기</span>}
          </div>
        )}
      </div>
      {(p.label || p.scorer || p.assist || p.clutch) && (
        // 아랫줄 = 밝은 띠(윗줄과 색으로 나뉜다 — 노란 구분선은 노랑 팀 칸과 섞여 뺐다)
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 text-xs sm:text-sm font-bold break-keep" style={{ background: '#eef1f6', color: INK }}>
          {p.clutch && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-xs" style={{ background: 'var(--mm-live-bg)', color: '#fff' }}>
              <HeartCrack size={12} aria-hidden />클러치
            </span>
          )}
          {p.label && <span className="px-1.5 py-0.5 rounded-sm text-xs" style={{ background: INK, color: 'var(--mm-yellow)' }}>{p.label}</span>}
          {/* 어시스트는 「패스한 사람 → 득점한 사람」 화살표로(글자 줄이기 — 운영진) */}
          {p.assist && (
            <span className="inline-flex items-center gap-1" aria-label={`${p.assist} 어시스트`}>
              <span style={{ color: '#5b6577' }}>{p.assist}</span>
              <ArrowRight size={14} strokeWidth={2.5} aria-hidden style={{ color: '#5b6577' }} />
            </span>
          )}
          {p.scorer && <span>{p.scorer}</span>}
        </div>
      )}
    </div>
  )
}
