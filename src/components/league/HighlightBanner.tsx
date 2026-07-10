'use client'
import { useState } from 'react'
import { Trophy, Flame, Award } from 'lucide-react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import { CountUp } from '@/components/league/StatCell'
import { HalfCourtDecoration } from '@/components/league/BasketballIcons'
import { textOnBg } from '@/lib/util/contrastColor'

export type HighlightPlayer = {
  player_id: string
  name: string
  number?: number | null
  pts: number
  ppg: number
  gp: number
  fg3m?: number
  fg3a?: number
  fg3_pct?: number
}

export type HighlightTeam = {
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  rate: number  // 0-100
}

interface Props {
  leagueId: string
  topTeam: HighlightTeam | null
  scoringKing: HighlightPlayer | null
  hotHand: HighlightPlayer | null
  dateRangeLabel: string
}

export default function HighlightBanner({ leagueId, topTeam, scoringKing, hotHand, dateRangeLabel }: Props) {
  const [quickView, setQuickView] = useState<{ id: string; name: string } | null>(null)

  if (!topTeam && !scoringKing && !hotHand) return null

  return (
    <>
      <div className="relative rounded-2xl bg-gradient-to-r from-amber-950/40 via-gray-900 to-orange-950/40 border border-amber-700/30 overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)]">
        {/* 상단 amber accent gradient line — 매거진 느낌 */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
        />
        {/* 코트 라인 배경 데코 */}
        <div className="absolute inset-0 text-orange-500/30 pointer-events-none" aria-hidden>
          <HalfCourtDecoration className="w-full h-full opacity-50" />
        </div>
        <div className="relative px-5 lg:px-6 pt-3 lg:pt-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-jersey text-xs lg:text-sm font-bold text-amber-400 uppercase tracking-[0.18em]">이번 주의 하이라이트</span>
            <span className="text-xs text-gray-500">· {dateRangeLabel}</span>
          </div>
        </div>
        <div className="relative grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-gray-800/60">

          {/* A. 이 주 최고 승률 팀 */}
          {topTeam ? (() => {
            const teamBg = topTeam.color ?? '#3b82f6'
            const teamFg = textOnBg(teamBg)
            return (
              <div
                className="px-4 py-4 lg:px-5 lg:py-5 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2"
                style={{ animationDelay: '80ms', animationDuration: '520ms', animationFillMode: 'backwards' }}
              >
                <div
                  className="shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center border-2"
                  style={{ backgroundColor: `${teamBg}22`, borderColor: teamBg }}
                >
                  <Trophy size={22} className="lg:w-7 lg:h-7" style={{ color: teamBg, fill: teamBg }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-jersey text-xs text-amber-400 font-bold uppercase tracking-[0.18em]">이 주 승률 1위</p>
                  <p className="text-base lg:text-xl font-black text-white truncate flex items-center gap-1.5">
                    <span
                      className="px-2 py-0.5 rounded"
                      style={{ backgroundColor: teamBg, color: teamFg }}
                    >{topTeam.name}</span>
                  </p>
                  <p className="text-xs lg:text-sm text-gray-500 mt-0.5">
                    <span className="text-green-400 font-bold">{topTeam.wins}승</span>
                    <span className="mx-1">·</span>
                    <span className="text-red-400 font-bold">{topTeam.losses}패</span>
                    {topTeam.draws > 0 && <><span className="mx-1">·</span><span>{topTeam.draws}무</span></>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display text-4xl lg:text-5xl text-amber-300 leading-none">
                    <CountUp value={topTeam.rate} decimals={1} />
                    <span className="text-2xl lg:text-3xl">%</span>
                  </p>
                  <p className="font-jersey text-xs text-gray-500 font-bold mt-1 tracking-widest">승률</p>
                </div>
              </div>
            )
          })() : <div className="px-4 py-4 text-center text-xs text-gray-600">데이터 없음</div>}

          {/* B. 이 주 득점왕 (누적 PTS) */}
          {scoringKing ? (
            <button
              onClick={() => setQuickView({ id: scoringKing.player_id, name: scoringKing.name })}
              className="px-4 py-4 lg:px-5 lg:py-5 flex items-center gap-3 hover:bg-amber-900/10 cursor-pointer transition-colors text-left group animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: '200ms', animationDuration: '520ms', animationFillMode: 'backwards' }}
            >
              <div className="shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/40 flex items-center justify-center">
                <Award size={22} className="text-amber-400 lg:w-7 lg:h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-jersey text-xs text-amber-400 font-bold uppercase tracking-[0.18em]">이 주의 득점왕</p>
                <p className="text-base lg:text-xl font-black text-white truncate group-hover:text-amber-200 transition-colors flex items-center gap-1.5 flex-wrap">
                  <span>{scoringKing.name}</span>
                  {scoringKing.number != null && <span className="jersey-num text-xs lg:text-sm">{scoringKing.number}</span>}
                </p>
                <p className="text-xs lg:text-sm text-gray-500 mt-0.5">{scoringKing.gp}경기 · PPG {scoringKing.ppg}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display text-4xl lg:text-5xl text-amber-300 leading-none tabular-nums">
                  <CountUp value={scoringKing.pts} decimals={0} />
                </p>
                <p className="font-jersey text-xs text-gray-500 font-bold mt-1 tracking-widest">PTS 누적</p>
              </div>
            </button>
          ) : <div className="px-4 py-4 text-center text-xs text-gray-600">데이터 없음</div>}

          {/* C. 3점왕 (기존 유지) */}
          {hotHand ? (
            <button
              onClick={() => setQuickView({ id: hotHand.player_id, name: hotHand.name })}
              className="px-4 py-4 lg:px-5 lg:py-5 flex items-center gap-3 hover:bg-orange-900/10 cursor-pointer transition-colors text-left group animate-in fade-in slide-in-from-bottom-2"
              style={{ animationDelay: '320ms', animationDuration: '520ms', animationFillMode: 'backwards' }}
            >
              <div className="shrink-0 w-12 h-12 lg:w-14 lg:h-14 rounded-full bg-gradient-to-br from-orange-500/30 to-orange-600/10 border border-orange-500/40 flex items-center justify-center">
                <Flame size={22} className="text-orange-400 lg:w-7 lg:h-7" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-jersey text-xs text-orange-400 font-bold uppercase tracking-[0.18em]">3점왕 · Hot Hand</p>
                <p className="text-base lg:text-xl font-black text-white truncate group-hover:text-orange-200 transition-colors flex items-center gap-1.5 flex-wrap">
                  <span>{hotHand.name}</span>
                  {hotHand.number != null && <span className="jersey-num text-xs lg:text-sm">{hotHand.number}</span>}
                </p>
                <p className="text-xs lg:text-sm text-gray-500 mt-0.5">{hotHand.fg3m ?? 0}/{hotHand.fg3a ?? 0} · {hotHand.gp}경기</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display text-4xl lg:text-5xl text-orange-300 leading-none">
                  <CountUp value={hotHand.fg3_pct ?? 0} decimals={1} />
                  <span className="text-2xl lg:text-3xl">%</span>
                </p>
                <p className="font-jersey text-xs text-gray-500 font-bold mt-1 tracking-widest">3P%</p>
              </div>
            </button>
          ) : <div className="px-4 py-4 text-center text-xs text-gray-600">데이터 없음</div>}
        </div>
      </div>

      {quickView && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickView.id}
          playerName={quickView.name}
          onClose={() => setQuickView(null)}
        />
      )}
    </>
  )
}
