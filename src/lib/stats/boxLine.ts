// 이벤트 1건 → 박스스코어 한 줄(선수 또는 팀) 누적 — 날짜별 박스스코어와 누적 맞대결이 같이 쓴다.
//
// ⚠ 점수(pts)는 여기서 계산하지 않는다. 호출부가 `scorePoints()`(+1 판정은 `isPlusOneFor()`)로
//   구해 넘긴다 — 득점 규칙의 정본은 scoring.ts 하나여야 한다.
// ⚠ 어시스트는 이벤트의 related_player_id 쪽에 붙으므로 호출부가 따로 센다(`isAssistEvent`).

export interface BoxLine {
  pts: number; reb: number; oreb: number; dreb: number; ast: number; stl: number; blk: number
  tov: number; pf: number; fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
}

export const emptyBoxLine = (): BoxLine => ({
  pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
  fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
})

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']

/** 성공한 야투 + 어시스트 대상이 있으면 어시스트 1개 */
export function isAssistEvent(type: string, result: string | null, relatedPlayerId: string | null): boolean {
  return !!relatedPlayerId && result === 'made' && SHOT_TYPES.includes(type)
}

export function applyEventToBoxLine(s: BoxLine, type: string, result: string | null, pts: number): void {
  const made = result === 'made'
  switch (type) {
    case 'shot_3p':
      s.fg3a++; s.fga++
      if (made) { s.fg3m++; s.fgm++; s.pts += pts }
      break
    case 'shot_2p_mid': case 'shot_layup': case 'shot_post':
      s.fga++
      if (made) { s.fgm++; s.pts += pts }
      break
    case 'and_one':
      if (made) { s.pts += pts }
      break
    case 'ft_2pt': case 'ft_3pt_1': case 'ft_3pt_2': case 'free_throw':
      s.fta++
      if (made) { s.ftm++; s.pts += pts }
      break
    case 'oreb': s.oreb++; s.reb++; break
    case 'dreb': s.dreb++; s.reb++; break
    case 'steal': s.stl++; break
    case 'block': s.blk++; break
    case 'turnover': s.tov++; break
    case 'foul': s.pf++; break
  }
}

export function addBoxLine(into: BoxLine, s: BoxLine): void {
  for (const k of Object.keys(into) as (keyof BoxLine)[]) into[k] += s[k]
}
