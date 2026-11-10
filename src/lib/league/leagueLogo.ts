import { resolveTeamId } from '@/lib/league/teamScope'
import { loadClub } from '@/lib/club/settings'
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

/**
 * 동호회 로고 — 동호회(teams.logo_url)에 올린 값이 먼저, 없으면 위 표(2026-11-10 플랫폼화 2단계).
 *   새 동호회는 CEO 콘솔 「기본 정보 → 로고 주소」로 넣는다. 위 표는 옛 값 폴백으로만 남긴다.
 */
export async function clubLogoOf(leagueId: string): Promise<string | null> {
  try {
    const teamId = await resolveTeamId(leagueId)
    const club = teamId ? await loadClub(teamId) : null
    if (club?.row.logo_url) return club.row.logo_url
  } catch { /* 조회가 실패해도 표 값으로 */ }
  return leagueLogoOf(leagueId)
}
