'use client'
// 선수 프로필의 리더 뱃지 패널
//
// 경기일별 6부문 (득점/리바/어시/블락/스틸/3점) 1등 등극 횟수를 아이콘으로 표시.
// leader-badges API 응답 오브젝트 그대로 받아서 시각화.
// 카운트 0인 부문도 회색으로 표시해 전체 형태 유지 (있으면 강조).

import { Trophy, Zap, Hand, Shield, Target, Crosshair } from 'lucide-react'

export interface LeaderBadgeCounts {
  pts: number
  reb: number
  ast: number
  blk: number
  stl: number
  tp: number
}

interface Category {
  key: keyof LeaderBadgeCounts
  label: string
  Icon: typeof Trophy
  color: string
  bg: string
  border: string
}

const CATEGORIES: Category[] = [
  { key: 'pts', label: '득점',   Icon: Trophy,    color: 'text-amber-300',   bg: 'bg-amber-500/15',   border: 'border-amber-500/40' },
  { key: 'reb', label: '리바',   Icon: Shield,    color: 'text-orange-300',  bg: 'bg-orange-500/15',  border: 'border-orange-500/40' },
  { key: 'ast', label: '어시',   Icon: Hand,      color: 'text-cyan-300',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/40' },
  { key: 'blk', label: '블락',   Icon: Target,    color: 'text-purple-300',  bg: 'bg-purple-500/15',  border: 'border-purple-500/40' },
  { key: 'stl', label: '스틸',   Icon: Zap,       color: 'text-emerald-300', bg: 'bg-emerald-500/15', border: 'border-emerald-500/40' },
  { key: 'tp',  label: '3점',    Icon: Crosshair, color: 'text-pink-300',    bg: 'bg-pink-500/15',    border: 'border-pink-500/40' },
]

export default function LeaderBadgePanel({ badges }: { badges: LeaderBadgeCounts }) {
  const total = badges.pts + badges.reb + badges.ast + badges.blk + badges.stl + badges.tp

  return (
    <div className="px-5 py-4 border-b border-gray-800/60">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-bold">경기일 리더</p>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/50 text-amber-300">
            🏆 총 {total}회
          </span>
        </div>
        <p className="text-[10px] text-gray-500">경기 있는 날 부문별 1등 횟수</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {CATEGORIES.map(c => {
          const count = badges[c.key]
          const active = count > 0
          return (
            <div
              key={c.key}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-1 transition-colors ${
                active ? `${c.bg} ${c.border}` : 'bg-gray-800/40 border-gray-800'
              }`}
            >
              <c.Icon size={16} className={active ? c.color : 'text-gray-600'} />
              <p className={`text-[9px] font-bold uppercase tracking-widest ${active ? c.color : 'text-gray-600'}`}>{c.label}</p>
              <p className={`text-lg font-black leading-none tabular-nums ${active ? 'text-white' : 'text-gray-700'}`}>
                {count}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 간략형 (roster 카드 등에서 인라인 표시용) — 0 초과 부문만 요약 표시.
 */
export function LeaderBadgeInline({ badges, className = '' }: { badges: LeaderBadgeCounts; className?: string }) {
  const items = CATEGORIES.filter(c => badges[c.key] > 0)
  if (items.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {items.map(c => (
        <span
          key={c.key}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${c.bg} ${c.border} ${c.color}`}
          title={`${c.label} 리더 ${badges[c.key]}회`}
        >
          <c.Icon size={9} />
          <span>{badges[c.key]}</span>
        </span>
      ))}
    </div>
  )
}
