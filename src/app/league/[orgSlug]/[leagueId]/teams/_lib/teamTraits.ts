// 팀 특성 5가지 — 팀 상세 패널의 「팀 특성」이 같은 기간 모든 팀과 견주도록(2026-11-09 운영진)
// 한 팀만 계산하던 식(TeamDetailPanel 안)을 그대로 옮겨 모든 팀에 같은 식을 쓴다 — 두 벌로 갈라지지 않게.
import type { PlayerStat } from '@/types/league'
import { pickTeamLeader } from './teamLeaders'

export type TraitKey = 'ace' | 'three' | 'fb' | 'def' | 'ft'

export type TeamTraits = {
  /** 에이스 의존도 — 팀 득점 중 정규 득점 1위의 몫(%). 정규 1위가 없으면 null */
  ace: number | null
  /** 외곽 스타일 — 야투 시도 중 3점 시도(%) */
  three: number | null
  /** 속공 — 팀 득점 중 속공 득점(%) */
  fb: number | null
  /** 속공 득점 경기당 */
  fbPg: number
  /** 수비 강도 — 경기당 스틸+블록 */
  def: number | null
  /** 자유투 성공률(%) */
  ft: number | null
}

/** gp = 그 팀의 마감 정규전 수(카드 승패와 같은 경기 집합) */
export function computeTeamTraits(players: readonly PlayerStat[], regularIds: ReadonlySet<string>, gp: number): TeamTraits | null {
  if (players.length === 0) return null
  const sum = (f: (p: PlayerStat) => number) => players.reduce((s, p) => s + f(p), 0)
  const pts = sum(p => p.pts), fga = sum(p => p.fga), fg3a = sum(p => p.fg3a)
  const ftm = sum(p => p.ftm), fta = sum(p => p.fta), fb = sum(p => p.fb_pts ?? 0)
  const g = gp || 1
  const top = pickTeamLeader(players, regularIds, p => p.ppg)
  return {
    ace: top && pts > 0 ? top.pts / pts * 100 : null,
    three: fga > 0 ? fg3a / fga * 100 : null,
    fb: pts > 0 ? fb / pts * 100 : null,
    fbPg: fb / g,
    def: gp > 0 ? sum(p => p.stl + p.blk) / g : null,
    ft: fta > 0 ? ftm / fta * 100 : null,
  }
}
