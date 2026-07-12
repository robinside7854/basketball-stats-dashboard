'use client'
// 선수 프로필의 게임 스탯 리더 패널
//
// 경기일별 6부문 (득점/리바/어시/블락/스틸/3점) 1등 등극 횟수를 아이콘으로 표시.
// leader-badges API 응답 오브젝트 그대로 받아서 시각화.
// 카운트 0인 부문도 회색으로 표시해 전체 형태 유지 (있으면 강조).
// 활성 카테고리 클릭 시 해당 부문 리더 등극 날짜 목록 팝업 → 날짜 클릭 시 박스스코어 모달.

import { useState } from 'react'
import { Trophy, Zap, Hand, Shield, Target, Crosshair, X } from 'lucide-react'
import DailyBoxscoreModal from './DailyBoxscoreModal'

export interface LeaderBadgeCounts {
  pts: number
  reb: number
  ast: number
  blk: number
  stl: number
  tp: number
}

export type LeaderCategoryKey = keyof LeaderBadgeCounts

interface Category {
  key: LeaderCategoryKey
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

interface Props {
  badges: LeaderBadgeCounts
  leagueId?: string    // 있으면 카테고리 클릭 시 날짜 팝업 활성화
  playerId?: string    // 카테고리별 리더 등극 날짜 조회에 사용
}

export default function LeaderBadgePanel({ badges, leagueId, playerId }: Props) {
  const total = badges.pts + badges.reb + badges.ast + badges.blk + badges.stl + badges.tp
  const [openCat, setOpenCat] = useState<LeaderCategoryKey | null>(null)
  const [dates, setDates] = useState<string[] | null>(null)
  const [datesLoading, setDatesLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  async function handleCategoryClick(cat: LeaderCategoryKey) {
    if (!leagueId || !playerId || badges[cat] === 0) return
    setOpenCat(cat)
    setDates(null)
    setDatesLoading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/leader-badges/dates?playerId=${playerId}&category=${cat}`)
      if (res.ok) {
        const d = await res.json() as { dates: string[] }
        setDates(d.dates ?? [])
      } else {
        setDates([])
      }
    } finally {
      setDatesLoading(false)
    }
  }

  const activeCategory = CATEGORIES.find(c => c.key === openCat)
  const clickable = Boolean(leagueId && playerId)

  return (
    <div className="px-5 py-4 border-b border-gray-800/60">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-600 uppercase tracking-widest font-bold">게임 스탯 리더</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-amber-900/40 border border-amber-700/50 text-amber-300">
            <Trophy size={12} strokeWidth={2} aria-hidden /> 총 {total}회
          </span>
        </div>
        <p className="text-xs text-gray-500">경기 있는 날 부문별 1등 횟수{clickable && ' · 클릭하여 날짜 보기'}</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {CATEGORIES.map(c => {
          const count = badges[c.key]
          const active = count > 0
          const canClick = clickable && active
          const cls = `flex flex-col items-center justify-center gap-1 rounded-xl border py-2.5 px-1 transition-all ${
            active ? `${c.bg} ${c.border}` : 'bg-gray-800/40 border-gray-800'
          } ${canClick ? 'cursor-pointer hover:brightness-125 hover:scale-[1.02] active:scale-[0.98]' : 'cursor-default'}`
          const content = (
            <>
              <c.Icon size={16} className={active ? c.color : 'text-gray-600'} />
              <p className={`text-[11px] font-bold uppercase tracking-widest ${active ? c.color : 'text-gray-600'}`}>{c.label}</p>
              <p className={`text-lg font-black leading-none tabular-nums ${active ? 'text-white' : 'text-gray-700'}`}>
                {count}
              </p>
            </>
          )
          return canClick ? (
            <button
              key={c.key}
              type="button"
              onClick={() => handleCategoryClick(c.key)}
              className={cls}
              title={`${c.label} 리더 등극 날짜 ${count}회 보기`}
            >
              {content}
            </button>
          ) : (
            <div key={c.key} className={cls}>
              {content}
            </div>
          )
        })}
      </div>

      {/* 날짜 목록 팝업 */}
      {openCat && activeCategory && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
             onClick={e => { if (e.target === e.currentTarget) setOpenCat(null) }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpenCat(null)} />
          <div className="relative z-10 w-full max-w-md max-h-[80vh] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className={`flex items-center justify-between px-5 py-3.5 border-b border-gray-800/60 ${activeCategory.bg}`}>
              <div className="flex items-center gap-2">
                <activeCategory.Icon size={18} className={activeCategory.color} />
                <p className={`text-sm font-black uppercase tracking-widest ${activeCategory.color}`}>
                  {activeCategory.label} 리더 등극 · {badges[activeCategory.key]}회
                </p>
              </div>
              <button
                onClick={() => setOpenCat(null)}
                className="text-gray-500 hover:text-white p-1 rounded-lg hover:bg-gray-800 cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-3">
              {datesLoading ? (
                <div className="py-8 text-center text-xs text-gray-600">불러오는 중...</div>
              ) : !dates || dates.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-600">등록된 날짜가 없습니다</div>
              ) : (
                <div className="space-y-1.5">
                  {dates.map(date => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all cursor-pointer hover:brightness-125 hover:translate-x-0.5 ${activeCategory.bg} ${activeCategory.border}`}
                    >
                      <span className={`text-sm font-bold ${activeCategory.color}`}>{formatKoreanDate(date)}</span>
                      <span className="text-xs text-gray-400 uppercase tracking-widest">박스스코어 →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 박스스코어 모달 — 날짜 선택 시 표시 */}
      {selectedDate && leagueId && (
        <DailyBoxscoreModal
          leagueId={leagueId}
          date={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  )
}

function formatKoreanDate(dateStr: string): string {
  // YYYY-MM-DD → YYYY.MM.DD (요일)
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd} (${days[d.getDay()]})`
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
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-bold ${c.bg} ${c.border} ${c.color}`}
          title={`${c.label} 리더 ${badges[c.key]}회`}
        >
          <c.Icon size={9} />
          <span>{badges[c.key]}</span>
        </span>
      ))}
    </div>
  )
}
