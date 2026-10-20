import LeagueStatsPanel from '@/components/league/LeagueStatsPanel'
import type { LeaguePlayer } from '@/types/league'
import type { GameSlot, RosterPlayer, Setter } from '../_lib/types'
import { useEscapeKey } from '@/hooks/useEscapeKey'

// 실시간 박스스코어 모달 (호출부가 showBoxscoreModal 일 때만 그린다)
export default function BoxscoreModal({
  leagueId, selectedSlot, selectedSlotId, allPlayers, statsRefresh, homeRoster, awayRoster,
  setShowBoxscoreModal,
}: {
  leagueId: string
  selectedSlot: GameSlot
  selectedSlotId: string
  allPlayers: LeaguePlayer[]
  statsRefresh: number
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  setShowBoxscoreModal: Setter<boolean>
}) {
  useEscapeKey(() => setShowBoxscoreModal(false))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowBoxscoreModal(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="live-boxscore-title" className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-2xl p-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 id="live-boxscore-title" className="text-sm font-black text-[color:var(--mm-ink)]">실시간 박스스코어</h3>
          <button onClick={() => setShowBoxscoreModal(false)} className="text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] cursor-pointer transition-colors text-xs">닫기</button>
        </div>
        <LeagueStatsPanel
          leagueId={leagueId}
          gameId={selectedSlotId}
          players={allPlayers}
          refreshKey={statsRefresh}
          homePlayers={homeRoster}
          awayPlayers={awayRoster}
          homeTeam={selectedSlot?.home_team ?? undefined}
          awayTeam={selectedSlot?.away_team ?? undefined}
        />
      </div>
    </div>
  )
}
