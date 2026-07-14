'use client'
// 선수 자동 배지 스트립 — 4종 카운트 표시.
// 카운트 > 0 인 배지는 클릭 가능 → PlayerBadgeDetailModal 로 상세 목록.
// 스타일: mm-* 팔레트, 44px 터치 타겟.

import { useState } from 'react'
import { Target, Layers, Trophy, Zap } from 'lucide-react'
import PlayerBadgeDetailModal from './PlayerBadgeDetailModal'
import WinningShotReelModal from './WinningShotReelModal'

export type BadgeSummary = {
  perfect_game: number
  double_double: number
  triple_double: number
  winning_shot: number
}

type BadgeKey = keyof BadgeSummary

interface Category {
  key: BadgeKey
  label: string
  short: string
  Icon: typeof Trophy
  goldEmphasis?: boolean  // triple_double 만 금색 강조
}

const CATEGORIES: Category[] = [
  { key: 'perfect_game',  label: '퍼펙트게임',   short: 'PERFECT',  Icon: Target },
  { key: 'double_double', label: '더블더블',     short: '2X-10',    Icon: Layers },
  { key: 'triple_double', label: '트리플더블',   short: '3X-10',    Icon: Trophy, goldEmphasis: true },
  { key: 'winning_shot',  label: '위닝샷',       short: 'CLUTCH',   Icon: Zap },
]

interface Props {
  leagueId: string
  playerId: string
  summary: BadgeSummary
}

export default function PlayerBadgeStrip({ leagueId, playerId, summary }: Props) {
  const [openKey, setOpenKey] = useState<BadgeKey | null>(null)
  const [winningReelOpen, setWinningReelOpen] = useState(false)
  const total = summary.perfect_game + summary.double_double + summary.triple_double + summary.winning_shot

  return (
    <div className="px-5 py-4 border-b border-[color:var(--mm-rule)]">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-xs text-[color:var(--mm-muted)] uppercase tracking-widest font-bold">자동 배지</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]">
            <Trophy size={12} strokeWidth={2} aria-hidden /> 총 {total}회
          </span>
        </div>
        <p className="text-xs text-[color:var(--mm-muted)]">경기 하이라이트 자동 집계 · 클릭하여 경기 보기</p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {CATEGORIES.map(c => {
          const count = summary[c.key]
          const active = count > 0
          const canClick = active
          const activeStyle = c.goldEmphasis
            ? 'bg-[color:var(--mm-yellow)] border-[color:var(--mm-black)]'
            : 'bg-[color:var(--mm-yellow-soft)] border-[color:var(--mm-yellow)]'
          const iconColor = active
            ? (c.goldEmphasis ? 'text-[color:var(--mm-black)]' : 'text-[color:var(--mm-yellow-strong)]')
            : 'text-[color:var(--mm-muted)]'
          const labelColor = active
            ? (c.goldEmphasis ? 'text-[color:var(--mm-black)]' : 'text-[color:var(--mm-yellow-strong)]')
            : 'text-[color:var(--mm-muted)]'
          const countColor = active
            ? (c.goldEmphasis ? 'text-[color:var(--mm-black)]' : 'text-[color:var(--mm-ink)]')
            : 'text-[color:var(--mm-muted)]'
          const cls = `relative flex flex-col items-center justify-center gap-1 rounded-sm border py-3 px-2 min-h-[88px] transition-shadow duration-200 ${
            active ? activeStyle : 'bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)]'
          } ${canClick ? 'cursor-pointer hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1' : 'cursor-default'}`

          const content = (
            <>
              <c.Icon size={22} className={iconColor} aria-hidden />
              <p className={`text-[10px] font-bold uppercase tracking-widest text-center ${labelColor}`}>{c.label}</p>
              <p className={`font-jersey font-black text-2xl leading-none tabular-nums ${countColor}`}>{count}</p>
            </>
          )

          return canClick ? (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                // 위닝샷은 텍스트 리스트 대신 하이라이트 릴 팝업으로 재생
                if (c.key === 'winning_shot') setWinningReelOpen(true)
                else setOpenKey(c.key)
              }}
              className={cls}
              aria-label={c.key === 'winning_shot' ? `위닝샷 ${count}회 · 릴 재생` : `${c.label} ${count}회 · 상세 보기`}
              title={c.key === 'winning_shot' ? `위닝샷 ${count}회 · 클릭하여 재생` : `${c.label} ${count}회`}
            >
              {content}
            </button>
          ) : (
            <div key={c.key} className={cls} aria-label={`${c.label} 0회`}>
              {content}
            </div>
          )
        })}
      </div>

      {openKey && (
        <PlayerBadgeDetailModal
          leagueId={leagueId}
          playerId={playerId}
          badgeKey={openKey}
          categoryLabel={CATEGORIES.find(c => c.key === openKey)!.label}
          onClose={() => setOpenKey(null)}
        />
      )}
      {winningReelOpen && (
        <WinningShotReelModal
          leagueId={leagueId}
          playerId={playerId}
          onClose={() => setWinningReelOpen(false)}
        />
      )}
    </div>
  )
}
