import { RefreshCw, UserPlus } from 'lucide-react'
import LeagueEventInputPad from '@/components/league/LeagueEventInputPad'
import type { SideView } from '../_lib/sides'
import type { GameSlot, IrregularPlayer, RosterPlayer, Setter } from '../_lib/types'

// 기록 중 입력 영역 — 입력 패드 · (대회) 상대 점수 안내 · 게스트·임시 선수 추가 · 타팀 임시 출전
export default function RecordingTools({
  leagueId, leagueHeaders, selectedSlot, selectedSlotId, currentQuarter, isTournament,
  leftSide, rightSide, sideView, onCourt, homeRoster, awayRoster, irregularRoster, assignedIds,
  foulCounts, activePlusOneIds, oppTeam,
  handleEventSaved, fetchLiveScore, loadRoster, setPendingIrregular,
}: {
  leagueId: string
  leagueHeaders: Record<string, string>
  selectedSlot: GameSlot
  selectedSlotId: string
  currentQuarter: number
  isTournament: boolean
  leftSide: 'home' | 'away'
  rightSide: 'home' | 'away'
  sideView: (side: 'home' | 'away') => SideView
  onCourt: string[]
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  irregularRoster: IrregularPlayer[]
  assignedIds: Set<string>
  foulCounts: Record<string, number>
  activePlusOneIds: string[]
  oppTeam: GameSlot['home_team']
  handleEventSaved: (eventType?: string) => void
  fetchLiveScore: () => Promise<void>
  loadRoster: (slot: GameSlot) => Promise<void>
  setPendingIrregular: Setter<IrregularPlayer | null>
}) {
  return (
    <>
      {/* 좌우가 뒤집힌 쿼터에서는 패드에 **넘기는 짝을 통째로 맞바꾼다.**
          패드 안에서는 '왼쪽/오른쪽' 으로만 쓰이고 이벤트의 team_id 는 선수
          객체에서 나오므로, 바꿔 넘겨도 기록은 그대로다.
          ⚠ 선수와 팀을 **한 쌍으로** 같이 바꿔야 한다 — 하나만 바꾸면 상대 선수
            즉석 등록이 반대 팀으로 들어간다. */}
      <LeagueEventInputPad
        leagueId={leagueId}
        gameId={selectedSlotId}
        currentQuarter={currentQuarter}
        leagueHeaders={leagueHeaders}
        homePlayers={sideView(leftSide).roster.filter(p => onCourt.includes(p.id))}
        awayPlayers={sideView(rightSide).roster.filter(p => onCourt.includes(p.id))}
        homeTeam={sideView(leftSide).team ?? undefined}
        awayTeam={sideView(rightSide).team ?? undefined}
        onEventSaved={(eventType) => { handleEventSaved(eventType); fetchLiveScore() }}
        foulCounts={foulCounts}
        activePlusOneIds={activePlusOneIds.length > 0 ? activePlusOneIds : undefined}
        onOpponentRegistered={() => { if (selectedSlot) loadRoster(selectedSlot) }}
        // 대회는 상대 선수를 기록하지 않는다 — 점수만 위 「상대 득점」 으로 남긴다
        opponentRecording={!isTournament}
      />

      {/* 상대 점수 안내 (대회) — 실시간으로 따라 누르지 않는다.
          사용자 결정(2026-08-30): 우리 기록만으로도 손이 모자라므로
          **마감할 때 최종 점수를 한 번에** 넣는다. 그 입력은 마감 모달에 있다. */}
      {isTournament && oppTeam && (
        <div
          className="p-3"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
            <strong style={{ color: 'var(--mm-ink-soft)' }}>{oppTeam.name ?? '상대팀'}</strong> 점수는
            경기 <strong style={{ color: 'var(--mm-ink-soft)' }}>마감</strong>할 때 최종 점수로 한 번에 넣습니다.
            {selectedSlot.opponent_score_manual != null && (
              <> · 현재 입력값 <strong style={{ color: 'var(--mm-ink)' }}>{selectedSlot.opponent_score_manual}점</strong></>
            )}
          </p>
        </div>
      )}

      {/* 비정규 선수 추가 — 대회에는 비정규 개념이 없다(참가 등록이 곧 명단) */}
      {!isTournament && irregularRoster.length > 0 && (
        <div
          className="p-3"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <UserPlus size={14} style={{ color: 'var(--mm-muted)' }} />
            <p className="t-label" style={{ color: 'var(--mm-muted)' }}>게스트·임시 선수 추가</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {irregularRoster.map(p => {
              const isAdded = assignedIds.has(p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => !isAdded && setPendingIrregular(p)}
                  disabled={isAdded}
                  className="px-2.5 py-1 text-xs font-medium transition-colors"
                  style={isAdded
                    ? { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', cursor: 'not-allowed', textDecoration: 'line-through', borderRadius: '4px' }
                    : { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', cursor: 'pointer', borderRadius: '4px' }
                  }
                >
                  {p.number ? `#${p.number} ` : ''}{p.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 타팀 임시 출전 (경기 진행 중) — 칩 클릭 시 팀 선택 모달 사용.
          ⚠ 대회에는 "타 팀" 이 없다(미라클 원팀 vs 외부 상대). 여기에 상대팀으로
            선수를 보내면 우리 선수 기록이 상대 점수로 들어간다. */}
      {(() => {
        if (isTournament) return null
        const homeLendable = homeRoster.filter(p => p.is_regular !== false)
        const awayLendable = awayRoster.filter(p => p.is_regular !== false)
        if (homeLendable.length === 0 && awayLendable.length === 0) return null
        return (
          <div
            className="p-3 space-y-2"
            style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }}
          >
            <div className="flex items-center gap-1.5">
              <RefreshCw size={14} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
              <p className="t-label" style={{ color: 'var(--mm-yellow-strong)' }}>타팀 임시 출전</p>
              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>이번 경기에만 적용</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {homeLendable.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPendingIrregular(p as IrregularPlayer)}
                  className="px-2 py-1 text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }}
                >
                  {p.name} <span style={{ color: 'var(--mm-muted)' }}>→ {selectedSlot?.away_team?.name}</span>
                </button>
              ))}
              {awayLendable.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPendingIrregular(p as IrregularPlayer)}
                  className="px-2 py-1 text-xs font-medium cursor-pointer transition-colors"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }}
                >
                  {p.name} <span style={{ color: 'var(--mm-muted)' }}>→ {selectedSlot?.home_team?.name}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}
    </>
  )
}
