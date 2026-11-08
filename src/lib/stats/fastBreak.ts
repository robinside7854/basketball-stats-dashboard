// 속공 판정 — 정본 (2026-11 운영진 요청).
//
// 정의: **수비 리바운드 · 스틸 · 상대 팀 득점 직후 7초(영상 시각) 안에 같은 팀이 성공한 득점**.
//   · 상대 팀 득점(2026-11-08 운영진 추가) = 상대가 성공한 야투·앤드원·자유투. 넣고 바로 달려가 넣은 점수도 속공이다.
//     득점한 팀이 그 뒤에 다른 기록(스틸·파울 등)을 남기면 그 기회는 끊긴다.
//   · 득점 = 야투 성공(shot_*) + 앤드원 성공. 자유투(free_throw·ft_2pt·ft_3pt_*)는 넣지 않는다 —
//     파울 뒤 자유투는 시계가 멈춘 세트 플레이라 「달려가서 넣은 점수」가 아니다.
//   · 그 사이에 **상대 팀 기록이 하나라도 있으면** 공격권이 넘어간 것으로 보고 끊는다.
//   · 같은 팀이 리바운드·스틸을 다시 하면 그 시각부터 다시 잰다(가장 최근 것 기준).
//   · 시각은 같은 경기 · 같은 쿼터 안에서만 비교한다(쿼터마다 영상이 따로라 시각이 다시 0부터다).
//   · 영상 시각이 없는 기록은 판정하지 않는다(속공 아님).
// 점수는 이 함수가 매기지 않는다 — 호출부가 scorePoints + isPlusOneFor 로 센 그 점수를 속공 몫으로도 더한다
//   (득점 계산이 두 벌이 되면 화면마다 숫자가 갈린다).
// ⚠ 판정식을 화면·라우트에서 다시 쓰지 말 것. 이 함수 하나만 쓴다.

export const FAST_BREAK_WINDOW_SEC = 7

const TRIGGER = new Set(['dreb', 'steal'])

export interface FastBreakEvent {
  id: string | number
  league_game_id: string
  quarter: number | null
  video_timestamp: number | null
  team_id: string | null
  type: string
  result: string | null
}

/** 상대에게 속공 기회를 주는 득점인가 — 성공한 야투·앤드원·자유투 */
export function isScoreTrigger(type: string, result: string | null): boolean {
  if (result !== 'made') return false
  return type.startsWith('shot_') || type === 'and_one' || type === 'free_throw' || type.startsWith('ft_')
}

/** 득점 성공 중 속공으로 볼 수 있는 기록인가(종류만 — 시각 조건은 fastBreakIds) */
export function isFastBreakScoringType(type: string, result: string | null): boolean {
  if (result !== 'made') return false
  return type.startsWith('shot_') || type === 'and_one'
}

/** 속공 득점인 기록 id 모음 */
export function fastBreakIds(events: readonly FastBreakEvent[], windowSec = FAST_BREAK_WINDOW_SEC): Set<string> {
  const groups = new Map<string, FastBreakEvent[]>()
  for (const e of events) {
    if (typeof e.video_timestamp !== 'number') continue
    const k = `${e.league_game_id}|${e.quarter ?? ''}`
    const arr = groups.get(k)
    if (arr) arr.push(e)
    else groups.set(k, [e])
  }
  const out = new Set<string>()
  for (const list of groups.values()) {
    // 같은 초면 리바운드·스틸을 먼저 본다(같은 초에 뺏고 넣은 장면)
    list.sort((a, b) => (a.video_timestamp! - b.video_timestamp!) || (Number(TRIGGER.has(b.type)) - Number(TRIGGER.has(a.type))))
    const lastTrigger = new Map<string, number>()   // team → 시각
    // 마지막 득점 — 득점하지 않은 쪽(상대)에게 속공 기회가 된다
    let lastScore: { by: string; t: number } | null = null
    for (const e of list) {
      const t = e.video_timestamp!
      const team = e.team_id
      if (!team) continue
      // 상대 팀 기록 = 그 사이에 공격권이 넘어갔다 → 다른 팀들의 대기 중인 속공 기회를 지운다
      for (const other of [...lastTrigger.keys()]) if (other !== team) lastTrigger.delete(other)
      const scored = isScoreTrigger(e.type, e.result)
      // 득점한 팀이 득점 말고 다른 기록을 남겼다 → 그 득점으로 생긴 상대의 기회는 끊긴다
      if (lastScore && lastScore.by === team && !scored) lastScore = null
      if (TRIGGER.has(e.type)) { lastTrigger.set(team, t); continue }
      if (isFastBreakScoringType(e.type, e.result)) {
        const from = lastTrigger.get(team)
        const afterScore = lastScore && lastScore.by !== team ? lastScore.t : null
        const inWindow = (s: number | null | undefined) => s != null && t - s >= 0 && t - s <= windowSec
        if (inWindow(from) || inWindow(afterScore)) out.add(String(e.id))
      }
      if (scored) lastScore = { by: team, t }
    }
  }
  return out
}
