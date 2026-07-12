// 이 파일의 default export 컴포넌트는 제거됨 (dead code, E안 브랜드 이식 시 삭제).
// 페이지에서 아래 타입만 import type 으로 사용 중이므로 타입 정의만 유지.
// 새로운 하이라이트 UI 는 NbaHero / NbaLeaders / NbaRoundsSummary 로 대체됨.

export type HighlightPlayer = {
  player_id: string
  name: string
  number?: number | null
  pts: number
  ppg: number
  gp: number
  rd?: number                 // 라운드(=날짜) 수 — 라운드 임팩트 계산용
  ppr?: number                // Points Per Round — 라운드 단위 평균
  roundSeries?: Array<{ date: string; pts: number }>  // 최근 라운드별 득점 시리즈
  fg3m?: number
  fg3a?: number
  fg3_pct?: number
}

export type HighlightTeam = {
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  rate: number  // 0-100
}
