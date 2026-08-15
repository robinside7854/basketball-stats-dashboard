// 파괴 액션 확인창에 넣을 "실제로 사라지는 개수".
//
// 왜 필요한가: 지금까지 확인 문구는 "경기, 선수, 팀 데이터가 모두 삭제됩니다" 한 줄이었다.
// 운영자는 그 문장을 '설정 몇 줄'로 읽지 '지난 시즌 303경기의 기록'으로 읽지 않는다.
// 숫자를 문장에 박아 넣어야 손이 멈춘다.
//
// 실패하면 null 을 준다 — 그때는 숫자를 지어내지 말고 "규모를 확인하지 못했다"고
// 그대로 말해야 한다. 0 으로 떨어뜨리면 "아무것도 안 지워지는구나"라는 반대 거짓말이 된다.
export interface LeagueScale {
  games: number
  teams: number
  players: number
}

export async function countLeagueScale(leagueId: string): Promise<LeagueScale | null> {
  const [gamesRes, teamsRes] = await Promise.all([
    fetch(`/api/leagues/${leagueId}/games`).catch(() => null),
    fetch(`/api/leagues/${leagueId}/teams`).catch(() => null),
  ])
  if (!gamesRes?.ok || !teamsRes?.ok) return null
  try {
    const games = await gamesRes.json()
    const teams = await teamsRes.json()
    if (!Array.isArray(games) || !Array.isArray(teams)) return null
    return {
      games: games.length,
      teams: teams.length,
      players: (teams as { players?: unknown[] }[]).reduce((n, t) => n + (t.players?.length ?? 0), 0),
    }
  } catch {
    return null
  }
}

// 리그 팀 하나를 지울 때 함께 사라지는 경기 수. 확인창을 띄우는 순간에만 세므로
// 화면의 목록 조회 상태(loadError 등)와 얽히지 않는다. 실패하면 null.
export async function countTeamGames(leagueId: string, leagueTeamId: string): Promise<number | null> {
  const res = await fetch(`/api/leagues/${leagueId}/games`).catch(() => null)
  if (!res?.ok) return null
  try {
    const games = await res.json()
    if (!Array.isArray(games)) return null
    return (games as { home_team_id?: string | null; away_team_id?: string | null }[])
      .filter(g => g.home_team_id === leagueTeamId || g.away_team_id === leagueTeamId).length
  } catch {
    return null
  }
}
