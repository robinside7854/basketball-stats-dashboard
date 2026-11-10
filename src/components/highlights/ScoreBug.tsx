'use client'
// 하이라이트 스코어보드 — 중계 화면 「스코어 버그」 (2026-11-10 운영진 · KBL 중계 화면 참고).
//
// ⚠ 영상 위에 겹치지 않는다 — 영상 바로 아래 띠(유튜브 제목줄·조작 막대와 겹쳤다). 전체화면도 영상 아래(가로 포함).
// 윗줄:  [홈 팀 색 칸 · 이름 왼쪽 끝] [홈 점수(진한 칸)][원정 점수(밝은 칸)] [원정 팀 색 칸 · 이름 오른쪽 끝] [날짜 · N경기]
//        점수 두 칸은 가운데에서 맞닿고, 팀 이름은 양 끝으로 벌린다. 점수 낸 쪽 점수 칸 아래 노란 막대 + 「+N」.
// 아랫줄: 장면 이름 · 득점한 선수 · 어시스트(전체화면에서도 누구 어시인지 보이게) · 클러치.
// 시간(경기 시계)은 정확하지 않아 넣지 않는다(운영진).
import { HeartCrack } from 'lucide-react'
import { swatchEdge, textOnBg } from '@/lib/util/contrastColor'

export interface ScoreBugProps {
  home: string
  away: string
  homeScore: number
  awayScore: number
  homeColor?: string | null
  awayColor?: string | null
  /** 이번 장면에서 점수 낸 쪽 */
  scored: 'home' | 'away' | null
  points?: number | null
  label?: string | null
  scorer?: string | null
  assist?: string | null
  clutch?: boolean
  /** 26.11.07 */
  day?: string | null
  /** 그날 몇 경기 */
  slot?: number | null
}

const INK = '#0b1220'
const FALLBACK = '#2a3346'

function fmtDay(d?: string | null) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`
}

function TeamBlock({ name, color, align }: { name: string; color: string; align: 'left' | 'right' }) {
  return (
    <div className={`flex-1 min-w-0 flex items-center px-3 sm:px-4 ${align === 'right' ? 'justify-end text-right' : 'justify-start'}`}
      style={{ background: color, color: textOnBg(color), boxShadow: swatchEdge(color) }}>
      <span className="font-black text-base sm:text-xl break-keep leading-tight" style={{ letterSpacing: '0.01em' }}>{name}</span>
    </div>
  )
}

function ScoreCell({ score, dark, on, points }: { score: number; dark: boolean; on: boolean; points?: number | null }) {
  return (
    <div className="relative shrink-0 w-14 sm:w-20 flex items-center justify-center font-jersey font-black tabular-nums leading-none text-[28px] sm:text-[40px]"
      style={{ background: dark ? INK : '#eef1f6', color: dark ? '#fff' : INK }}>
      {score}
      {on && <span aria-hidden className="absolute left-0 right-0 bottom-0 h-1" style={{ background: 'var(--mm-yellow)' }} />}
      {on && points ? (
        <span className="absolute top-0.5 right-0.5 text-[10px] sm:text-xs font-black px-1 leading-[14px] sm:leading-4 mm-score-pop"
          style={{ background: 'var(--mm-yellow)', color: INK, borderRadius: 3 }}>+{points}</span>
      ) : null}
    </div>
  )
}

export default function ScoreBug(p: ScoreBugProps) {
  const day = fmtDay(p.day)
  const hc = p.homeColor || FALLBACK
  const ac = p.awayColor || FALLBACK
  return (
    <div className="w-full" style={{ background: INK, color: '#fff' }}
      role="img"
      aria-label={`스코어보드: ${p.home} ${p.homeScore} 대 ${p.awayScore} ${p.away}${p.slot ? `, ${p.slot}경기` : ''}`}>
      <div className="flex items-stretch h-12 sm:h-14">
        <TeamBlock name={p.home} color={hc} align="left" />
        <ScoreCell score={p.homeScore} dark on={p.scored === 'home'} points={p.points} />
        <ScoreCell score={p.awayScore} dark={false} on={p.scored === 'away'} points={p.points} />
        <TeamBlock name={p.away} color={ac} align="right" />
        {(day || p.slot) && (
          <div className="shrink-0 flex flex-col items-center justify-center px-2 sm:px-3 tabular-nums leading-tight" style={{ background: INK }}>
            {day && <span className="text-[10px] sm:text-xs font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>{day}</span>}
            {p.slot && <span className="font-jersey text-base sm:text-xl font-black" style={{ color: 'var(--mm-yellow)' }}>{p.slot}경기</span>}
          </div>
        )}
      </div>
      {(p.label || p.scorer || p.assist || p.clutch) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 sm:px-4 py-1 text-xs sm:text-sm font-bold break-keep" style={{ borderTop: '2px solid var(--mm-yellow)' }}>
          {p.clutch && (
            <span className="inline-flex items-center gap-1 px-1.5 rounded-sm" style={{ background: 'var(--mm-live-bg)', color: '#fff' }}>
              <HeartCrack size={12} aria-hidden />클러치
            </span>
          )}
          {p.label && <span style={{ color: 'var(--mm-yellow)' }}>{p.label}</span>}
          {p.scorer && <span>{p.scorer}</span>}
          {p.assist && <span style={{ color: 'rgba(255,255,255,0.75)' }}>어시스트 {p.assist}</span>}
        </div>
      )}
    </div>
  )
}
