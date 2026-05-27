'use client'
import { useState } from 'react'
import { Trophy, Flame } from 'lucide-react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import { CountUp } from '@/components/league/StatCell'

export type HighlightPlayer = {
  player_id: string
  name: string
  number?: number | null
  // MVP 지표
  pts: number
  ppg: number
  gp: number
  // Hot Hand 지표
  fg3m?: number
  fg3a?: number
  fg3_pct?: number
}

interface Props {
  leagueId: string
  mvp: HighlightPlayer | null
  hotHand: HighlightPlayer | null
  dateRangeLabel: string  // "5/17 ~ 5/23" 같은 표시 문자열
}

export default function HighlightBanner({ leagueId, mvp, hotHand, dateRangeLabel }: Props) {
  const [quickView, setQuickView] = useState<{ id: string; name: string } | null>(null)

  if (!mvp && !hotHand) return null

  return (
    <>
      <div className="rounded-2xl bg-gradient-to-r from-amber-950/40 via-gray-900 to-rose-950/40 border border-amber-700/30 overflow-hidden">
        <div className="px-5 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">이번 주의 하이라이트</span>
            <span className="text-[10px] text-gray-500">· {dateRangeLabel}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-800/60">
          {/* MVP */}
          {mvp ? (
            <button
              onClick={() => setQuickView({ id: mvp.player_id, name: mvp.name })}
              className="px-5 py-4 flex items-center gap-4 hover:bg-amber-900/10 cursor-pointer transition-colors text-left group"
            >
              <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/10 border border-amber-500/40 flex items-center justify-center">
                <Trophy size={22} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">이 주의 MVP</p>
                <p className="text-base font-black text-white truncate group-hover:text-amber-200 transition-colors">
                  {mvp.name}
                  {mvp.number != null && <span className="text-gray-600 font-mono text-xs ml-1.5">#{mvp.number}</span>}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">{mvp.gp}경기 · {mvp.pts}pts 누적</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-black text-amber-300 leading-none">
                  <CountUp value={mvp.ppg} decimals={1} />
                </p>
                <p className="text-[10px] text-gray-500 font-bold mt-1">PPG</p>
              </div>
            </button>
          ) : <div className="px-5 py-4 text-center text-xs text-gray-600">데이터 없음</div>}

          {/* Hot Hand */}
          {hotHand ? (
            <button
              onClick={() => setQuickView({ id: hotHand.player_id, name: hotHand.name })}
              className="px-5 py-4 flex items-center gap-4 hover:bg-rose-900/10 cursor-pointer transition-colors text-left group"
            >
              <div className="shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-rose-500/30 to-rose-600/10 border border-rose-500/40 flex items-center justify-center">
                <Flame size={22} className="text-rose-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">Hot Hand · 3P%</p>
                <p className="text-base font-black text-white truncate group-hover:text-rose-200 transition-colors">
                  {hotHand.name}
                  {hotHand.number != null && <span className="text-gray-600 font-mono text-xs ml-1.5">#{hotHand.number}</span>}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">{hotHand.fg3m ?? 0}/{hotHand.fg3a ?? 0} · {hotHand.gp}경기</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-black text-rose-300 leading-none">
                  <CountUp value={hotHand.fg3_pct ?? 0} decimals={1} />%
                </p>
                <p className="text-[10px] text-gray-500 font-bold mt-1">3P%</p>
              </div>
            </button>
          ) : <div className="px-5 py-4 text-center text-xs text-gray-600">데이터 없음</div>}
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
