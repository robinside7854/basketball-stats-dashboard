import type { GameSlot, RosterPlayer } from './types'

/** 한쪽(홈 또는 어웨이)의 팀·점수 묶음. 좌우로 그리는 위젯은 전부 이걸 통해 읽는다 —
 *  이름만 뒤집고 점수를 그대로 두는 부분 반전이 가장 흔한 오표기다. */
export function buildSideView(
  side: 'home' | 'away',
  selectedSlot: GameSlot | null,
  liveScore: { home: number; away: number } | null,
  homeRoster: RosterPlayer[],
  awayRoster: RosterPlayer[],
) {
  const team = side === 'home' ? selectedSlot?.home_team : selectedSlot?.away_team
  const score = side === 'home'
    ? (liveScore?.home ?? selectedSlot?.home_score ?? 0)
    : (liveScore?.away ?? selectedSlot?.away_score ?? 0)
  return {
    side,
    team,
    score,
    roster: side === 'home' ? homeRoster : awayRoster,
    // 팀 색은 팀을 따라간다. 좌우가 바뀌어도 같은 팀은 같은 색이어야 한다.
    color: team?.color ?? (side === 'home' ? '#3b82f6' : '#ef4444'),
    label: side === 'home' ? 'HOME' : 'AWAY',
  }
}
export type SideView = ReturnType<typeof buildSideView>
