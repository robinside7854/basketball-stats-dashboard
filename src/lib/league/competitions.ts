import { createClient } from '@/lib/supabase/admin'

// 경기묶음 = leagues 행 하나. mode 로 성격이 갈린다.
//   league     — 내부 인원을 팀으로 나눠 치르는 시즌
//   tournament — 외부 동호회와 붙는 대회 묶음
// 한 팀이 둘 다 가질 수 있다 (UNIQUE (team_id, season_year, slug) 라 같은 해도 가능).
export type Competition = {
  id: string
  slug: string
  name: string
  mode: 'league' | 'tournament'
  season_year: number
  status: string
  game_count: number
}

// 이 묶음이 속한 팀의 모든 묶음. URL 에 팀 id 가 없어서 leagues.team_id 로 올라간다.
export async function fetchTeamCompetitions(leagueId: string): Promise<Competition[]> {
  const sb = createClient()

  const { data: self, error: selfErr } = await sb
    .from('leagues')
    .select('team_id')
    .eq('id', leagueId)
    .maybeSingle()
  if (selfErr) throw new Error(`leagues: leagueId=${leagueId} 조회 실패 — ${selfErr.message}`)
  if (!self?.team_id) return []

  const { data, error } = await sb
    .from('leagues')
    .select('id, slug, name, mode, season_year, status')
    .eq('team_id', self.team_id)
    .order('season_year', { ascending: false })
  if (error) throw new Error(`leagues: team_id=${self.team_id} 형제 묶음 조회 실패 — ${error.message}`)

  const rows = data ?? []
  if (rows.length === 0) return []

  // 경기 수는 "빈 묶음을 회원에게 보일지" 판단에 쓴다 (Step 3 노출 규칙).
  //   묶음마다 count 쿼리를 돌리면 왕복이 늘어나므로 한 번에 가져와 센다.
  const { data: games, error: gErr } = await sb
    .from('league_games')
    .select('league_id')
    .in('league_id', rows.map(r => r.id))
  if (gErr) throw new Error(`league_games: 묶음별 경기 수 조회 실패 — ${gErr.message}`)

  const counts = new Map<string, number>()
  for (const g of games ?? []) counts.set(g.league_id, (counts.get(g.league_id) ?? 0) + 1)

  return rows
    .map(r => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      mode: r.mode === 'tournament' ? ('tournament' as const) : ('league' as const),
      season_year: r.season_year,
      status: r.status ?? '',
      game_count: counts.get(r.id) ?? 0,
    }))
    // 같은 해면 리그를 먼저 — 내부 시즌이 그 팀의 본류이고 대회는 그 위에 얹히는 활동이다.
    .sort((a, b) =>
      b.season_year - a.season_year ||
      (a.mode === b.mode ? a.name.localeCompare(b.name) : a.mode === 'league' ? -1 : 1),
    )
}

// 회원에게 보일 묶음만 남긴다.
//   빈 묶음(경기 0건)은 숨긴다 — 운영자가 만들어만 두고 아직 안 쓴 대회가 탭으로 뜨면
//   회원은 "여기 들어가면 뭐가 있나" 하고 눌렀다가 빈 화면을 본다. 지금 보고 있는
//   묶음은 비어 있어도 남긴다(그걸 숨기면 자기가 있는 곳이 목록에서 사라진다).
export function visibleCompetitions(
  all: Competition[],
  currentId: string,
  canEdit: boolean,
): Competition[] {
  if (canEdit) return all
  return all.filter(c => c.game_count > 0 || c.id === currentId)
}
