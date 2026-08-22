// 팀 정체성(Team Identity) API
//
// 팀명 override 를 반영한 "정체성 그룹" 단위로 순위/전적 반환.
// 같은 team_id 라도 override 로 이름이 바뀌면 다른 정체성으로 분리.
//
// GET /api/leagues/[id]/team-identities?quarterId=Q
//   → { identities: TeamIdentity[] }
//
// 예 (미라클모닝):
//   team_id=A 는 Q1-Q2 에서 "락다운", Q3+ 에서 "굿모닝" → 2개 정체성 그룹
//   team_id=B 는 계속 "빅현욱" → 1개
//   team_id=C 는 Q1-Q2 "런앤건", Q3+ "챗지피지기" → 2개
//   전체 = 5개 정체성
//
// 각 정체성:
//   - key: `${team_id}::${display_name}` (유일)
//   - team_id, display_name, color
//   - quarter_ids: 이 정체성이 활성인 분기 id 목록
//   - quarter_labels: 표시용 (예: ["26.1Q", "26.2Q"])
//   - gp/wins/draws/losses/gf/ga
//   - h2h: 상대 정체성 key → {w, d, l}

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'

export interface TeamIdentity {
  key: string
  team_id: string
  display_name: string
  color: string
  quarter_ids: string[]
  quarter_labels: string[]
  gp: number
  wins: number
  draws: number
  losses: number
  goals_for: number
  goals_against: number
  h2h: Record<string, { w: number; d: number; l: number }>
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const quarterId = sp.get('quarterId')

  const supabase = createClient()

  // 병렬 페치
  const [
    { data: gamesRaw },
    { data: teamsRaw },
    { data: overridesRaw },
    { data: quartersRaw },
  ] = await Promise.all([
    supabase.from('league_games')
      .select('id, quarter_id, home_team_id, away_team_id, home_score, away_score, is_exhibition, is_started, is_complete')
      .eq('league_id', leagueId)
      .eq('is_started', true),
    // 임시팀은 정체성(프랜차이즈) 후보가 아니다 — 넣으면 분기 × 임시팀 조합만큼 유령 정체성이 생긴다
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId).is('exhibition_date', null),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
    supabase.from('league_quarters').select('id, year, quarter').eq('league_id', leagueId).order('year').order('quarter'),
  ])

  type Game = { id: string; quarter_id: string | null; home_team_id: string | null; away_team_id: string | null; home_score: number; away_score: number; is_exhibition: boolean | null; is_complete: boolean | null }
  type TeamRow = { id: string; name: string; color: string | null }
  type OverrideRow = { quarter_id: string; team_id: string; name: string | null; color: string | null }
  type QuarterRow = { id: string; year: number; quarter: number }

  const games = (gamesRaw ?? []) as Game[]
  const teams = (teamsRaw ?? []) as TeamRow[]
  const overrides = (overridesRaw ?? []) as OverrideRow[]
  const quarters = (quartersRaw ?? []) as QuarterRow[]

  const baseTeam = new Map(teams.map(t => [t.id, t]))
  const overrideMap = new Map<string, Map<string, { name?: string; color?: string }>>()
  for (const o of overrides) {
    if (!overrideMap.has(o.quarter_id)) overrideMap.set(o.quarter_id, new Map())
    overrideMap.get(o.quarter_id)!.set(o.team_id, { name: o.name ?? undefined, color: o.color ?? undefined })
  }
  const quarterMap = new Map(quarters.map(q => [q.id, q]))

  const resolveIdentity = (team_id: string, quarterIdArg: string | null | undefined): { key: string; team_id: string; display_name: string; color: string } | null => {
    const base = baseTeam.get(team_id)
    if (!base) return null
    const ov = quarterIdArg ? overrideMap.get(quarterIdArg)?.get(team_id) : undefined
    const name = ov?.name ?? base.name
    const color = ov?.color ?? base.color ?? '#9ca3af'
    return { key: `${team_id}::${name}`, team_id, display_name: name, color }
  }

  // 1) 활성 정체성 그룹 계산 — (team_id × quarter) 조합 → 정체성 key
  const identityGroups = new Map<string, TeamIdentity>()
  for (const q of quarters) {
    for (const t of teams) {
      const id = resolveIdentity(t.id, q.id)
      if (!id) continue
      if (!identityGroups.has(id.key)) {
        identityGroups.set(id.key, {
          key: id.key,
          team_id: id.team_id,
          display_name: id.display_name,
          color: id.color,
          quarter_ids: [],
          quarter_labels: [],
          gp: 0, wins: 0, draws: 0, losses: 0, goals_for: 0, goals_against: 0,
          h2h: {},
        })
      }
      const g = identityGroups.get(id.key)!
      if (!g.quarter_ids.includes(q.id)) {
        g.quarter_ids.push(q.id)
        g.quarter_labels.push(`${String(q.year).slice(2)}.${q.quarter}Q`)
      }
    }
  }

  // 2) 게임 필터
  const targetGames = quarterId && quarterId !== 'all'
    ? games.filter(g => g.quarter_id === quarterId)
    : games

  // 3) 정체성별 승/패/득실 집계 (친선전 제외)
  for (const g of targetGames) {
    if (g.is_exhibition) continue
    if (!g.home_team_id || !g.away_team_id || !g.quarter_id) continue
    const homeId = resolveIdentity(g.home_team_id, g.quarter_id)
    const awayId = resolveIdentity(g.away_team_id, g.quarter_id)
    if (!homeId || !awayId) continue
    const h = identityGroups.get(homeId.key)
    const a = identityGroups.get(awayId.key)
    if (!h || !a) continue

    h.gp++; a.gp++
    h.goals_for += g.home_score; h.goals_against += g.away_score
    a.goals_for += g.away_score; a.goals_against += g.home_score

    const ensureH2H = (owner: TeamIdentity, oppKey: string) => {
      if (!owner.h2h[oppKey]) owner.h2h[oppKey] = { w: 0, d: 0, l: 0 }
      return owner.h2h[oppKey]
    }

    if (g.home_score > g.away_score) {
      h.wins++; a.losses++
      ensureH2H(h, awayId.key).w++
      ensureH2H(a, homeId.key).l++
    } else if (g.home_score < g.away_score) {
      a.wins++; h.losses++
      ensureH2H(a, homeId.key).w++
      ensureH2H(h, awayId.key).l++
    } else {
      h.draws++; a.draws++
      ensureH2H(h, awayId.key).d++
      ensureH2H(a, homeId.key).d++
    }
  }

  // 4) quarterId 필터에 따라 반환 정체성 결정
  //    ⚠ 버그 fix: quarterId 지정 시 각 정체성의 quarter_ids 도 그 분기만으로 좁혀야 함.
  //    (예: 빅현욱 identity 는 Q1, Q2, Q3 모두 활성인데 Q1 필터에서도 quarter_ids 가
  //    [Q1, Q2, Q3] 로 반환되면 클라이언트가 stats?quarterIds=Q1,Q2,Q3 로 페치 → Q3 데이터가 섞임)
  let identities: TeamIdentity[]
  if (quarterId && quarterId !== 'all') {
    // 그 분기에 활성인 정체성만 · quarter_ids 도 요청 분기 단일 값으로 좁힘
    const targetLabel = ((): string => {
      const q = quarters.find(qq => qq.id === quarterId)
      return q ? `${String(q.year).slice(2)}.${q.quarter}Q` : ''
    })()
    identities = [...identityGroups.values()]
      .filter(id => id.quarter_ids.includes(quarterId))
      .map(id => ({
        ...id,
        quarter_ids: [quarterId],
        quarter_labels: targetLabel ? [targetLabel] : id.quarter_labels,
      }))
  } else {
    // 전체 — 하나 이상의 분기에서 활성인 모든 정체성 (quarter_ids 는 전체 범위)
    identities = [...identityGroups.values()]
  }

  // 5) 정렬: 승점(3W+1D) desc → 득실차 desc → 득점 desc
  identities.sort((a, b) => {
    const aPts = a.wins * 3 + a.draws
    const bPts = b.wins * 3 + b.draws
    if (bPts !== aPts) return bPts - aPts
    const aDiff = a.goals_for - a.goals_against
    const bDiff = b.goals_for - b.goals_against
    if (bDiff !== aDiff) return bDiff - aDiff
    return b.goals_for - a.goals_for
  })

  void quarterMap  // 명시적 사용 (eslint)

  return NextResponse.json({ identities })
}
