import LeagueSubstitutionPanel from '@/components/league/LeagueSubstitutionPanel'
import type { LeaguePlayer } from '@/types/league'
import type { GameSlot, MinRow, RosterPlayer, Setter } from '../_lib/types'

// 교체 모달 (호출부가 showSubModal 일 때만 그린다)
export default function SubstitutionModal({
  leagueId, leagueHeaders, selectedSlot, selectedSlotId, currentQuarter,
  allPlayers, homeRoster, awayRoster, minutes,
  setShowSubModal, setMinutes, setHomeRoster, setAwayRoster,
}: {
  leagueId: string
  leagueHeaders: Record<string, string>
  selectedSlot: GameSlot
  selectedSlotId: string
  currentQuarter: number
  allPlayers: LeaguePlayer[]
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  minutes: MinRow[]
  setShowSubModal: Setter<boolean>
  setMinutes: Setter<MinRow[]>
  setHomeRoster: Setter<RosterPlayer[]>
  setAwayRoster: Setter<RosterPlayer[]>
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowSubModal(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-2xl p-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-[color:var(--mm-ink)]">선수 교체</h3>
          <button onClick={() => setShowSubModal(false)} className="text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] cursor-pointer transition-colors text-xs">닫기</button>
        </div>
        <LeagueSubstitutionPanel
          leagueId={leagueId}
          gameId={selectedSlotId}
          currentQuarter={currentQuarter}
          leagueHeaders={leagueHeaders}
          players={allPlayers}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          homeTeam={selectedSlot?.home_team ?? undefined}
          awayTeam={selectedSlot?.away_team ?? undefined}
          minutes={minutes}
          onSubstitution={async () => {
            await Promise.all([
              fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
                .then(r => r.json()).then(setMinutes),
              fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/roster`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                  if (d?.home) setHomeRoster(d.home)
                  if (d?.away) setAwayRoster(d.away)
                }),
            ])
          }}
        />
      </div>
    </div>
  )
}
