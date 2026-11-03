import LeagueSubstitutionPanel from '@/components/league/LeagueSubstitutionPanel'
import type { LeaguePlayer } from '@/types/league'
import { RefreshCw, UserPlus } from 'lucide-react'
import type { GameSlot, IrregularPlayer, MinRow, RosterPlayer, Setter } from '../_lib/types'
import { useEscapeKey } from '@/hooks/useEscapeKey'

// 교체 모달 (호출부가 showSubModal 일 때만 그린다)
export default function SubstitutionModal({
  leagueId, leagueHeaders, selectedSlot, selectedSlotId, currentQuarter,
  allPlayers, homeRoster, awayRoster, minutes,
  setShowSubModal, setMinutes, setHomeRoster, setAwayRoster,
  isTournament, irregularRoster, assignedIds, setPendingIrregular,
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
  isTournament: boolean
  irregularRoster: IrregularPlayer[]
  assignedIds: Set<string>
  setPendingIrregular: Setter<IrregularPlayer | null>
}) {
  // 선수를 고르면 이 모달을 닫고 팀 선택 모달(IrregularTeamModal)로 넘긴다 — 모달 위 모달을 피한다
  function pick(p: IrregularPlayer) { setShowSubModal(false); setPendingIrregular(p) }
  const homeLendable = homeRoster.filter(p => p.is_regular !== false)
  const awayLendable = awayRoster.filter(p => p.is_regular !== false)
  useEscapeKey(() => setShowSubModal(false))
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowSubModal(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-label="선수 교체" className="relative w-full max-w-lg bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-2xl p-4 shadow-2xl"
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

        {/* 게스트·임시 선수 · 타팀 임시 출전 — 2026-11-03 입력 패드 아래에서 여기로(운영진: 자주 있는 일이 아니다).
            대회에는 비정규·타 팀 개념이 없다. */}
        {!isTournament && irregularRoster.length > 0 && (
          <details className="mt-3 rounded-lg" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
            <summary className="flex items-center gap-1.5 px-3 min-h-11 cursor-pointer text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
              <UserPlus size={14} aria-hidden /> 게스트·임시 선수 추가
            </summary>
            <div className="flex flex-wrap gap-1 px-3 pb-3">
              {irregularRoster.map(p => {
                const isAdded = assignedIds.has(p.id)
                return (
                  <button key={p.id} onClick={() => !isAdded && pick(p)} disabled={isAdded}
                    className="px-2.5 py-1 min-h-9 text-xs font-medium transition-colors"
                    style={isAdded
                      ? { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', cursor: 'not-allowed', textDecoration: 'line-through', borderRadius: '4px' }
                      : { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', cursor: 'pointer', borderRadius: '4px' }}>
                    {p.number ? `#${p.number} ` : ''}{p.name}
                  </button>
                )
              })}
            </div>
          </details>
        )}
        {!isTournament && (homeLendable.length > 0 || awayLendable.length > 0) && (
          <details className="mt-2 rounded-lg" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)' }}>
            <summary className="flex items-center gap-1.5 px-3 min-h-11 cursor-pointer text-xs font-bold" style={{ color: 'var(--mm-yellow-strong)' }}>
              <RefreshCw size={14} aria-hidden /> 타팀 임시 출전 <span className="font-normal" style={{ color: 'var(--mm-muted)' }}>이번 경기에만</span>
            </summary>
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {homeLendable.map(p => (
                <button key={p.id} onClick={() => pick(p as IrregularPlayer)}
                  className="px-2 py-1 min-h-9 text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }}>
                  {p.name} <span style={{ color: 'var(--mm-muted)' }}>→ {selectedSlot?.away_team?.name}</span>
                </button>
              ))}
              {awayLendable.map(p => (
                <button key={p.id} onClick={() => pick(p as IrregularPlayer)}
                  className="px-2 py-1 min-h-9 text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }}>
                  {p.name} <span style={{ color: 'var(--mm-muted)' }}>→ {selectedSlot?.home_team?.name}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
