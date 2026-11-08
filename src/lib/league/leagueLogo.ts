// 리그(동호회) 로고 (2026-11-08 운영진 — 미라클 로고).
//   leagues 표에 로고 칸이 아직 없어 코드 쪽 표 하나로 둔다. 동호회가 늘어 로고를 화면에서 바꿔야 하면
//   그때 leagues.logo_url 칸(마이그레이션)으로 옮긴다 — 부르는 곳은 이 함수 하나라 거기만 고치면 된다.
//   파일은 public/leagues/ — 흰 바탕을 투명하게 바꾼 정사각 PNG(512).
const LEAGUE_LOGOS: Record<string, string> = {
  '8eda8257-8907-4bf3-a7de-e5e7fde54a89': '/leagues/miracle-logo.png', // 미라클모닝농구단
}

export function leagueLogoOf(leagueId: string): string | null {
  return LEAGUE_LOGOS[leagueId] ?? null
}
