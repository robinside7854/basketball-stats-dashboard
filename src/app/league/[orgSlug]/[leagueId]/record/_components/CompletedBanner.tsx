import { CheckCircle2, ClipboardList, Loader2, RefreshCw } from 'lucide-react'
import { accentOrInk } from '@/lib/util/contrastColor'
import type { GameSlot, Setter } from '../_lib/types'

// ── 마감된 경기 배너 ── (최종 스코어 · 「기록 내역」 · 「다시 기록하기」)
export default function CompletedBanner({
  selectedSlot, liveScore, reopening, reopenGame, setShowGameLog,
}: {
  selectedSlot: GameSlot
  liveScore: { home: number; away: number } | null
  reopening: boolean
  reopenGame: () => Promise<void>
  setShowGameLog: Setter<boolean>
}) {
  return (
    <div className="space-y-3">
      <div className="bg-[color:var(--mm-ground)] border border-[color:var(--mm-rule)] rounded-2xl overflow-hidden">
        {/* 최종 스코어 */}
        <div className="grid grid-cols-[1fr_auto_1fr]">
          <div className="py-5 px-4 text-center min-w-0">
            <p className="text-xs font-bold mb-2 break-keep" style={{ color: accentOrInk(selectedSlot.home_team?.color ?? '#3b82f6'), lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {selectedSlot.home_team?.name ?? '홈팀'}
            </p>
            <p className="text-5xl font-black text-[color:var(--mm-ink)] tabular-nums leading-none">{liveScore?.home ?? selectedSlot.home_score}</p>
          </div>
          <div className="flex flex-col items-center justify-center px-4 border-x border-[color:var(--mm-rule)]">
            <span className="text-2xl text-[color:var(--mm-muted)] font-black leading-none">:</span>
          </div>
          <div className="py-5 px-4 text-center min-w-0">
            <p className="text-xs font-bold mb-2 break-keep" style={{ color: accentOrInk(selectedSlot.away_team?.color ?? '#ef4444'), lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {selectedSlot.away_team?.name ?? '어웨이팀'}
            </p>
            <p className="text-5xl font-black text-[color:var(--mm-ink)] tabular-nums leading-none">{liveScore?.away ?? selectedSlot.away_score}</p>
          </div>
        </div>
        {/* 마감 배너 */}
        <div className="border-t border-[color:var(--mm-rule)] py-4 px-6 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-[color:var(--mm-muted)]" />
            <span className="text-lg font-black text-[color:var(--mm-ink-soft)] tracking-tight">마감된 경기입니다</span>
          </div>
          <p className="text-xs text-[color:var(--mm-ink-soft)]">「기록 내역」에서 고치거나 지울 수 있고, 「다시 기록하기」로 이어서 기록할 수 있습니다</p>
        </div>
        {/* 하단 버튼 행 */}
        <div className="grid grid-cols-2 border-t border-[color:var(--mm-rule)]/60">
          <button
            onClick={() => setShowGameLog(true)}
            className="py-2.5 min-h-11 flex items-center justify-center gap-1.5 text-[color:var(--mm-ink)] hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel)]/60 text-xs font-medium transition-colors cursor-pointer border-r border-[color:var(--mm-rule)]/60"
          >
            <ClipboardList size={14} />
            기록 내역
          </button>
          <button
            onClick={reopenGame}
            disabled={reopening}
            className="py-2.5 min-h-11 flex items-center justify-center gap-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 btn-press"
          >
            {reopening
              ? <><Loader2 size={14} className="animate-spin" />복귀 중...</>
              : <><RefreshCw size={14} />다시 기록하기</>}
          </button>
        </div>
      </div>
    </div>
  )
}
