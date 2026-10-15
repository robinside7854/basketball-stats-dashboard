// 홈 맨 위 경기일 카드(LastRoundTimeline)의 데이터 모양 — 서버(홈 page.tsx computeRecentRounds)가 만든다.
// (2026-10-15) 종전엔 NbaRoundsSummary(홈 탭 「지난 경기일」)에 있던 타입. 그 탭을 빼며 컴포넌트를 지우고 타입만 옮겼다.
import type { DayTeamRecord } from '@/lib/stats/dayRecord'

/** 그날 팀 한 줄 — lib/stats/dayRecord.ts 의 결과(색은 resolver 가 늘 채운다) */
export type RoundTeamSummary = Omit<DayTeamRecord, 'color'> & { color: string }

/** 그날의 경기 한 칸. 팀명은 서버가 (team_id, quarter_id) 정체성으로 풀어 둔 값이다. */
export type RoundGame = {
  id: string
  slot_num: number | null
  home: { name: string; color: string } | null
  away: { name: string; color: string } | null
  home_score: number
  away_score: number
  youtube_url: string | null
  youtube_start_offset: number
}

export type RoundSummary = {
  date: string
  weekLabel: string
  gamesCount: number
  teams: RoundTeamSummary[]
  /** 슬롯 순서(1→N). 캐시가 옛 모양일 수 있어 optional */
  games?: RoundGame[]
}
