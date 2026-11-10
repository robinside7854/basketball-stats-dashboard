'use client'
// 하이라이트 스코어보드 — 중계 화면 「스코어 버그」 모양 (2026-11-10 운영진 「KBL·NBA 처럼 프로답게」).
//
// ⚠ 영상 위에 겹치지 않는다 — 영상 바로 아래 띠로 붙는다(유튜브 제목줄·조작 막대와 겹쳤다).
//   전체화면: 세로 = 영상 아래 띠 · 가로 = 오른쪽 조작부 안의 세로형(compact).
// 모양: 팀마다 [팀 색 막대 | 팀 이름 | 점수] 두 칸 + 오른쪽 정보 칸(득점 종류·+점수·클러치).
//   이번 장면에서 점수를 낸 팀은 점수칸이 노랑, 「+N」이 붙는다. 배경은 영상 옆이라 테마와 무관하게 검정 고정.
import { HeartCrack } from 'lucide-react'
import { swatchEdge } from '@/lib/util/contrastColor'

export interface ScoreBugProps {
  home: string
  away: string
  homeScore: number
  awayScore: number
  /** 이번 장면에서 점수 낸 쪽 */
  scored: 'home' | 'away' | null
  scoredColor?: string | null
  points?: number | null
  label?: string | null
  clutch?: boolean
  compact?: boolean
}

const BG = '#0b0f17'
const CELL = '#151b26'
const YELLOW = 'var(--mm-yellow)'

function TeamCell({ name, score, on, color, points, compact }: { name: string; score: number; on: boolean; color?: string | null; points?: number | null; compact?: boolean }) {
  return (
    <div className="flex items-stretch min-w-0 flex-1" style={{ background: CELL }}>
      <span aria-hidden className="w-1.5 shrink-0" style={{ background: on && color ? color : 'rgba(255,255,255,0.18)', boxShadow: on && color ? swatchEdge(color) : undefined }} />
      <span className={`flex-1 min-w-0 flex items-center px-2 font-bold break-keep ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}
        style={{ color: on ? '#fff' : 'rgba(255,255,255,0.72)', letterSpacing: '0.02em' }}>
        {name}
      </span>
      <span className={`relative shrink-0 flex items-center justify-center font-jersey font-black tabular-nums leading-none ${compact ? 'min-w-10 px-1.5 gap-1 text-lg' : 'w-14 sm:w-16 text-2xl sm:text-3xl pt-1'}`}
        style={{ background: on ? YELLOW : 'transparent', color: on ? '#0b0f17' : '#fff' }}>
        {compact && on && points ? <span className="text-[10px] font-black mm-score-pop">+{points}</span> : null}
        {score}
        {!compact && on && points ? (
          <span className="absolute top-0.5 right-0.5 text-[10px] font-black px-1 leading-[14px] mm-score-pop"
            style={{ background: '#fff', color: '#0b0f17', borderRadius: 3 }}>+{points}</span>
        ) : null}
      </span>
    </div>
  )
}

export default function ScoreBug({ home, away, homeScore, awayScore, scored, scoredColor, points, label, clutch, compact = false }: ScoreBugProps) {
  // 세로형(가로 전체화면 칸)은 높이가 모자라 정보 칸을 빼고 팀 두 줄만 — 장면 이름은 바로 아래 제목에 있다
  const info = !compact && (label || clutch) ? (
    <div className={`shrink-0 flex items-center justify-center gap-1 px-2 font-black ${compact ? 'text-[11px] py-1' : 'text-xs sm:text-sm'}`}
      style={{ background: clutch ? 'var(--mm-live-bg)' : '#222b3a', color: '#fff', letterSpacing: '0.04em' }}>
      {clutch && <HeartCrack size={13} aria-hidden />}
      {clutch ? '클러치' : label}
    </div>
  ) : null
  return (
    <div
      className={`w-full flex ${compact ? 'flex-col gap-px' : 'items-stretch gap-px h-11 sm:h-12'}`}
      style={{ background: BG, color: '#fff' }}
      aria-label={`스코어보드: ${home} ${homeScore} 대 ${awayScore} ${away}`}
      role="img"
    >
      <div className={`flex ${compact ? 'flex-col gap-px' : 'flex-1 gap-px min-w-0'}`}>
        <div className={compact ? 'flex h-7' : 'flex flex-1 min-w-0'}>
          <TeamCell name={home} score={homeScore} on={scored === 'home'} color={scored === 'home' ? scoredColor : null} points={points} compact={compact} />
        </div>
        <div className={compact ? 'flex h-7' : 'flex flex-1 min-w-0'}>
          <TeamCell name={away} score={awayScore} on={scored === 'away'} color={scored === 'away' ? scoredColor : null} points={points} compact={compact} />
        </div>
      </div>
      {info}
    </div>
  )
}
