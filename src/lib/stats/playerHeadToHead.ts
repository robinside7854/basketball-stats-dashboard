// 선수 vs 선수 맞대결 — 순수 함수 (2026-10-14).
//
// 출처: kbl-stats 선수 비교의 「맞대결」 발상(두 선수가 상대편으로 만난 경기만 모아 전적·평균)을
//   이 리그의 이벤트 기록에 맞게 옮겼다. 팀 단위 누적 맞대결(`/head-to-head`)과 같은 원칙을 쓴다.
//
// 규칙
//   · 입력 경기는 호출부가 고른다 — **마감 + 정규전(친선 제외)** 만.
//   · 그 경기에 「나왔다」 = 본인 이벤트(교체 포함)나 어시스트가 하나라도 있다.
//   · 그 경기의 팀은 **이 경기의 두 팀 중 하나**로만 고른다: 이벤트 team_id 다수결 → 경기 한정 배정
//     (league_game_players) → 분기 소속. 무관한 팀이 박히면 그 경기가 통째로 사라진다(daily-boxscore 와 같은 원칙).
//   · 두 선수의 팀이 다르면 맞대결, 같으면 같은 팀.
//   · 한 줄 누적은 boxLine.ts, 득점은 scorePoints() + isPlusOneFor() — 다른 식을 쓰지 않는다.
//   · 평균은 **하루 평균**(맞대결이 있었던 날 수로 나눈다) — 이 앱의 평균 단위.

import { emptyBoxLine, applyEventToBoxLine, isAssistEvent, addBoxLine, type BoxLine } from './boxLine'
import { scorePoints, isPlusOneFor, type GamePlusOne, type ScoringRules } from './scoring'

export interface H2HGame extends GamePlusOne {
  id: string
  date: string
  slot_num: number | null
  quarter_id: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
}

export interface H2HEvent {
  id: string
  league_game_id: string
  league_player_id: string | null
  related_player_id: string | null
  team_id: string | null
  type: string
  result: string | null
  quarter: number | null
}

export interface H2HMeeting {
  game_id: string
  date: string
  slot_num: number | null
  /** 'a' | 'b' = 이긴 쪽, 'draw' = 무승부 */
  winner: 'a' | 'b' | 'draw'
  a_pts: number
  b_pts: number
  /** 경기 스코어 — a 팀 기준 */
  score: string
}

export interface PlayerHeadToHead {
  opposite: {
    games: number
    /** 맞대결이 있었던 날 수 — 하루 평균의 분모 */
    days: number
    a_wins: number
    b_wins: number
    draws: number
    a: BoxLine
    b: BoxLine
    /** 최근 맞대결 (최신 먼저, 최대 10) */
    recent: H2HMeeting[]
  }
  teammates: { games: number; wins: number; losses: number; draws: number }
}

export function computePlayerHeadToHead(input: {
  a: string
  b: string
  games: readonly H2HGame[]
  events: readonly H2HEvent[]
  /** `${gameId}:${playerId}` → team_id (league_game_players) */
  assignedTeam: ReadonlyMap<string, string>
  /** `${quarterId}:${playerId}` → team_id (league_player_quarters) */
  quarterTeam: ReadonlyMap<string, string>
  plusOneSet: Set<string>
  rules: ScoringRules
}): PlayerHeadToHead {
  const { a, b, games, events, assignedTeam, quarterTeam, plusOneSet, rules } = input
  const gameById = new Map(games.map(g => [g.id, g]))
  const ids = [a, b] as const

  // 경기별 · 선수별: 나왔는지 · 팀 투표 · 한 줄
  type Slot = { votes: Map<string, number>; line: BoxLine }
  const per = new Map<string, Slot>() // key `${gameId}:${pid}`
  const slot = (gid: string, pid: string) => {
    const k = `${gid}:${pid}`
    let s = per.get(k)
    if (!s) { s = { votes: new Map(), line: emptyBoxLine() }; per.set(k, s) }
    return s
  }
  const seen = new Set<string>()
  for (const e of events) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const g = gameById.get(e.league_game_id)
    if (!g) continue
    const both = [g.home_team_id, g.away_team_id]
    const pid = e.league_player_id
    if (pid && (pid === a || pid === b)) {
      const s = slot(g.id, pid)
      if (e.team_id && both.includes(e.team_id)) s.votes.set(e.team_id, (s.votes.get(e.team_id) ?? 0) + 1)
      const pts = scorePoints(e.type, e.result, isPlusOneFor(pid, g, plusOneSet, e.quarter ?? null), rules)
      applyEventToBoxLine(s.line, e.type, e.result, pts)
    }
    const rel = e.related_player_id
    if (rel && (rel === a || rel === b) && isAssistEvent(e.type, e.result, rel)) {
      const s = slot(g.id, rel)
      if (e.team_id && both.includes(e.team_id)) s.votes.set(e.team_id, (s.votes.get(e.team_id) ?? 0) + 1)
      s.line.ast++
    }
  }

  const teamOf = (g: H2HGame, pid: string): string | null => {
    const s = per.get(`${g.id}:${pid}`)
    if (!s) return null // 안 나왔다
    const both = [g.home_team_id, g.away_team_id]
    const top = [...s.votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]
    const cands = [top, assignedTeam.get(`${g.id}:${pid}`), g.quarter_id ? quarterTeam.get(`${g.quarter_id}:${pid}`) : undefined]
    return (cands.find(c => c && both.includes(c)) as string | undefined) ?? null
  }
  const scoreFor = (g: H2HGame, tid: string) => {
    const home = g.home_team_id === tid
    const my = (home ? g.home_score : g.away_score) ?? 0
    const opp = (home ? g.away_score : g.home_score) ?? 0
    return { my, opp }
  }

  const out: PlayerHeadToHead = {
    opposite: { games: 0, days: 0, a_wins: 0, b_wins: 0, draws: 0, a: emptyBoxLine(), b: emptyBoxLine(), recent: [] },
    teammates: { games: 0, wins: 0, losses: 0, draws: 0 },
  }
  const days = new Set<string>()
  const meetings: H2HMeeting[] = []
  for (const g of games) {
    const ta = teamOf(g, a)
    const tb = teamOf(g, b)
    if (!ta || !tb) continue
    const { my, opp } = scoreFor(g, ta)
    if (ta === tb) {
      out.teammates.games++
      if (my > opp) out.teammates.wins++
      else if (my < opp) out.teammates.losses++
      else out.teammates.draws++
      continue
    }
    const o = out.opposite
    o.games++
    days.add(g.date)
    const winner: H2HMeeting['winner'] = my > opp ? 'a' : my < opp ? 'b' : 'draw'
    if (winner === 'a') o.a_wins++
    else if (winner === 'b') o.b_wins++
    else o.draws++
    const la = per.get(`${g.id}:${ids[0]}`)!.line
    const lb = per.get(`${g.id}:${ids[1]}`)!.line
    addBoxLine(o.a, la)
    addBoxLine(o.b, lb)
    meetings.push({ game_id: g.id, date: g.date, slot_num: g.slot_num, winner, a_pts: la.pts, b_pts: lb.pts, score: `${my}-${opp}` })
  }
  out.opposite.days = days.size
  out.opposite.recent = meetings
    .sort((x, y) => y.date.localeCompare(x.date) || (y.slot_num ?? 0) - (x.slot_num ?? 0))
    .slice(0, 10)
  return out
}
