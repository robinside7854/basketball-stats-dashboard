// 팀 순위의 「흐름」 지표 — 승차 · 최근 5경기 · 연승/연패 · 최근 경기일 성적 (2026-10-14).
//
// 출처: kbl-stats `lib/games.ts` 의 computeStandings · notableStreak · gamesBehindLabel 을 옮겨 왔다.
//   다른 점
//   · 무승부가 있다(동호회 자체전). 무는 연승·연패를 끊고, 승차 계산에서는 빠진다(승·패만 센다).
//   · 승·패·득실·순위 정렬은 이미 각 화면(홈 `computeCurrentQuarterStandings` · `team-identities`)이
//     계산한다 — 여기서는 그 위에 얹는 흐름 지표만 만든다. 승률 표기(pctLabel)는 옮기지 않았다(온볼은 %).
//   · 하루 9경기라 「최근 5경기」 ≈ 그날 하루다. 그래서 **최근 경기일 성적**(그 팀이 마지막으로 뛴 날의 승-패)을 같이 준다.
//
// ⚠ 입력은 **한 분기의** 마감된 정규전만 넣는다(친선 제외). 미라클은 분기마다 팀 정체성이 바뀌므로
//   연승·연패가 분기를 넘어 이어지면 다른 팀의 기록이 붙는다. 팀 키는 정체성 키(`(team_id, quarter_id)` 해석 결과).

export type FormResult = 'W' | 'L' | 'D'

/** 경기 하나 — 팀 키는 이미 정체성으로 풀린 값 */
export interface FormGame {
  date: string
  /** 같은 날짜 안 순서 (slot_num). 없으면 뒤로 */
  slot: number | null
  homeKey: string
  awayKey: string
  homeScore: number
  awayScore: number
}

export interface TeamForm {
  /** 최근 5경기, 오래된 것 → 최근 */
  last5: FormResult[]
  /** 지금 이어지는 연승(W)·연패(L) — 마지막 경기가 무거나 경기가 없으면 null */
  streakKind: 'W' | 'L' | null
  streakCount: number
  /** 그 팀이 마지막으로 뛴 날의 성적 */
  lastDay: { date: string; wins: number; losses: number; draws: number } | null
}

/** 연승·연패를 따로 보여 줄 최소 경기 수 (kbl-stats 와 같은 규칙 — 1연승은 소식이 아니다) */
export const STREAK_SHOW_MIN = 2

/** 경기 순서대로 팀별 흐름을 만든다. 같은 팀끼리 잡힌 경기(데이터 이상)는 건너뛴다. */
export function computeTeamForm(games: readonly FormGame[]): Map<string, TeamForm> {
  const ordered = [...games].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.slot ?? 999) - (b.slot ?? 999))
  const results = new Map<string, { date: string; r: FormResult }[]>()
  const push = (key: string, date: string, r: FormResult) => {
    let arr = results.get(key)
    if (!arr) { arr = []; results.set(key, arr) }
    arr.push({ date, r })
  }
  for (const g of ordered) {
    if (g.homeKey === g.awayKey) continue
    const h: FormResult = g.homeScore > g.awayScore ? 'W' : g.homeScore < g.awayScore ? 'L' : 'D'
    const a: FormResult = h === 'W' ? 'L' : h === 'L' ? 'W' : 'D'
    push(g.homeKey, g.date, h)
    push(g.awayKey, g.date, a)
  }

  const out = new Map<string, TeamForm>()
  for (const [key, arr] of results) {
    const last = arr[arr.length - 1]
    let n = 0
    for (let i = arr.length - 1; i >= 0 && arr[i].r === last.r; i--) n++
    const day = arr.filter(x => x.date === last.date)
    out.set(key, {
      last5: arr.slice(-5).map(x => x.r),
      streakKind: last.r === 'D' ? null : last.r,
      streakCount: last.r === 'D' ? 0 : n,
      lastDay: {
        date: last.date,
        wins: day.filter(x => x.r === 'W').length,
        losses: day.filter(x => x.r === 'L').length,
        draws: day.filter(x => x.r === 'D').length,
      },
    })
  }
  return out
}

/**
 * 1위와의 승차 — ((선두 승 − 내 승) + (내 패 − 선두 패)) / 2. 무는 세지 않는다.
 * 선두 = 승−패 가 가장 큰 팀(정렬 기준이 승점이든 승률이든 승차가 음수가 되지 않게).
 */
export function computeGamesBehind<T extends { key: string; wins: number; losses: number }>(rows: readonly T[]): Map<string, number> {
  const out = new Map<string, number>()
  if (rows.length === 0) return out
  const lead = rows.reduce((best, r) => (r.wins - r.losses > best.wins - best.losses ? r : best))
  for (const r of rows) out.set(r.key, ((lead.wins - r.wins) + (r.losses - lead.losses)) / 2)
  return out
}

/** 보여 줄 만한 연승·연패 { label: '3연승', kind } — 2경기 미만이면 null */
export function notableStreak(f: Pick<TeamForm, 'streakKind' | 'streakCount'>): { label: string; kind: 'W' | 'L' } | null {
  if (!f.streakKind || f.streakCount < STREAK_SHOW_MIN) return null
  return { label: `${f.streakCount}${f.streakKind === 'W' ? '연승' : '연패'}`, kind: f.streakKind }
}

/** 승차 표기 (0 → '-', 0.5 단위) */
export const gamesBehindLabel = (gb: number) => (gb === 0 ? '-' : Number.isInteger(gb) ? String(gb) : gb.toFixed(1))

/** 최근 경기일 성적 표기 — '5승 4패' (무가 있으면 '5승 1무 3패') */
export const dayRecordLabel = (d: { wins: number; losses: number; draws: number }) =>
  `${d.wins}승 ${d.draws > 0 ? `${d.draws}무 ` : ''}${d.losses}패`
