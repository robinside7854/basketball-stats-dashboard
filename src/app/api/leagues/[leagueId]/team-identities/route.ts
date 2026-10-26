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
//   - form / games_behind (2026-10-14, 특정 분기일 때만): 최근 5경기 · 연승/연패 · 최근 경기일 성적 · 승차
//     (lib/stats/standings.ts). 마감된 정규전만 · 그 분기 기간(날짜)으로 고른다 — 연승이 분기를 넘지 않게.
//     「전체」에서는 정체성이 여러 분기에 걸치고 서로 공존하지 않은 팀도 섞이므로 주지 않는다.
//
// ?withPlayers=1 (2026-10-26 팀 탭 요청 정리 — 종전엔 팀 탭이 정체성마다 /stats?teamId= 를 따로 불러
//   특정 분기 11회 · 「전체」 20회 안팎이 나갔다). 붙이면 한 응답에 함께 준다(스탯 권한 필요 — canViewStats):
//   - identities[].players : getCachedLeagueStats({ teamId, quarterIds }) — /stats?teamId=&quarterIds= 와 **같은 캐시 항목**
//     ⚠ 전체 /stats 응답을 화면에서 팀별로 나눌 수는 없다 — 선수 행은 기간 전체 합 한 줄이고(팀별로 안 갈림),
//       teamId 필터는 이벤트를 그 팀 것만 세어 출전일·리바 점유 분모까지 그 팀 기준으로 다시 만든다.
//   - identities[].regular : 그 정체성 분기들의 정규 명단(league_player_quarters.is_regular, 게스트·외부 제외)
//   - identities[].leader_player_id : 팀 리더(league_team_quarter_leaders, 가장 늦은 분기 값)
//   - unassigned_players : unassignedQuarterId 기간 /stats 행 중 어느 정체성에도 없는 선수(「비정규 선수」 칸)
//   - games : 위 승패를 센 경기 집합(마감 정규전) — 승패 흐름 · 팀 평균의 분모

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'
import { computeTeamForm, computeGamesBehind, type FormGame, type TeamForm } from '@/lib/stats/standings'
import { gameDateRange } from '@/lib/league/currentQuarter'
import { canViewStats } from '@/lib/auth/guard'
import { getCachedLeagueStats } from '@/lib/stats/cachedLeagueStats'
import { resolveTeamId } from '@/lib/league/teamScope'
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
import type { PlayerStat } from '@/types/league'

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
  /** 특정 분기 조회일 때만 — 그 분기에 마감 경기가 없으면 null */
  form?: TeamForm | null
  games_behind?: number | null
  /** withPlayers 일 때만 */
  players?: PlayerStat[]
  regular?: RegularPlayer[]
  leader_player_id?: string | null
}

export interface RegularPlayer { id: string; name: string; number: number | null; position: string | null; photo_url: string | null }

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
  const withPlayers = sp.get('withPlayers') === '1'
  // 선수 기록은 스탯 권한(승인 회원 · 편집 권한자)만 — /stats 라우트와 같은 문.
  //   권한이 없으면 401 이 아니라 팀 전적·경기(리그 열람 권한으로 보던 것)만 준다 — 공개 리그 방문자가
  //   순위·승패 흐름까지 통째로 못 보게 되는 것을 막는다(2026-10-26 리뷰). 화면은 선수 칸만 로그인 안내.
  const playersLocked = withPlayers && !(await canViewStats(req, leagueId))

  const supabase = createClient()

  // 병렬 페치
  const [
    { data: gamesRaw },
    { data: teamsRaw },
    { data: overridesRaw },
    { data: quartersRaw },
  ] = await Promise.all([
    supabase.from('league_games')
      .select('id, date, slot_num, quarter_id, home_team_id, away_team_id, home_score, away_score, is_exhibition, is_started, is_complete')
      .eq('league_id', leagueId)
      // 마감된 정규전만 — 홈 「이번 분기」 순위(app/league/.../page.tsx)와 같은 경기 집합이라야
      //   팀 탭 승패·흐름·승차가 홈과 어긋나지 않는다(진행 중 경기를 세면 팀 탭만 1경기 앞서 있었다).
      .eq('is_complete', true)
      .eq('is_exhibition', false),
    // 임시팀은 정체성(프랜차이즈) 후보가 아니다 — 넣으면 분기 × 임시팀 조합만큼 유령 정체성이 생긴다
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId).is('exhibition_date', null),
    supabase.from('league_team_quarter_overrides').select('quarter_id, team_id, name, color').eq('league_id', leagueId),
    supabase.from('league_quarters').select('id, year, quarter, start_date, end_date').eq('league_id', leagueId).order('year').order('quarter'),
  ])

  type Game = { id: string; date: string; slot_num: number | null; quarter_id: string | null; home_team_id: string | null; away_team_id: string | null; home_score: number; away_score: number; is_exhibition: boolean | null; is_complete: boolean | null }
  type TeamRow = { id: string; name: string; color: string | null }
  type OverrideRow = { quarter_id: string; team_id: string; name: string | null; color: string | null }
  type QuarterRow = { id: string; year: number; quarter: number; start_date: string | null; end_date: string | null }

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

  // 2) 게임 필터 — 특정 분기면 기간(날짜)으로 고른다(lib/league/currentQuarter.ts gameDateRange, 홈과 같은 규칙).
  //    quarter_id 는 기록 화면을 열 때 뒤늦게 채워져, 새 분기 행을 만들기 전에 기록한 경기는 옛 분기로 박힌다.
  //    기간이 없는 분기만 quarter_id 로 폴백한다.
  const selectedQ = quarterId && quarterId !== 'all' ? quarters.find(qq => qq.id === quarterId) ?? null : null
  const selectedRange = selectedQ ? gameDateRange({ ...selectedQ, label: '' }) : null
  const inQuarter = (g: Game) => selectedRange
    ? g.date >= selectedRange.from && g.date <= selectedRange.to
    : g.quarter_id === quarterId
  const targetGames = quarterId && quarterId !== 'all'
    ? games.filter(inQuarter)
    : games
  // 팀명은 특정 분기면 **그 분기 이름**으로 푼다 — 옛 quarter_id 로 박힌 경기에 지난 분기 팀명이 섞이지 않게(홈과 같음).
  const qidFor = (g: Game) => (quarterId && quarterId !== 'all') ? quarterId : g.quarter_id

  // 3) 정체성별 승/패/득실 집계 (친선전·미마감은 조회 단계에서 이미 뺐다)
  for (const g of targetGames) {
    const qid = qidFor(g)
    if (!g.home_team_id || !g.away_team_id || !qid) continue
    const homeId = resolveIdentity(g.home_team_id, qid)
    const awayId = resolveIdentity(g.away_team_id, qid)
    if (!homeId || !awayId) continue
    const h = identityGroups.get(homeId.key)
    const a = identityGroups.get(awayId.key)
    if (!h || !a) continue

    h.gp++; a.gp++
    h.goals_for += g.home_score ?? 0; h.goals_against += g.away_score ?? 0
    a.goals_for += g.away_score ?? 0; a.goals_against += g.home_score ?? 0

    // 같은 팀끼리 잡힌 경기(데이터 이상)는 승패에는 세고 상대전적에서만 뺀다 — 홈 순위표와 같은 처리
    const isSelfMatch = homeId.key === awayId.key
    const scratch = { w: 0, d: 0, l: 0 }
    const ensureH2H = (owner: TeamIdentity, oppKey: string) => {
      if (isSelfMatch) return scratch
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

  // 4-1) 흐름 지표 — 특정 분기만. 기간이 있으면 날짜로(lib/league/currentQuarter.ts 와 같은 원칙),
  //      팀명은 그 분기 이름으로 푼다(옛 quarter_id 로 박힌 경기도 이 분기 정체성으로).
  if (quarterId && quarterId !== 'all') {
    // 위 2) 와 같은 경기 집합 — 승패와 흐름이 서로 다른 경기를 세지 않게
    const formGames: FormGame[] = []
    for (const g of targetGames) {
      if (!g.home_team_id || !g.away_team_id) continue
      const h = resolveIdentity(g.home_team_id, quarterId)
      const a = resolveIdentity(g.away_team_id, quarterId)
      if (!h || !a) continue
      formGames.push({ date: g.date, slot: g.slot_num, homeKey: h.key, awayKey: a.key, homeScore: g.home_score ?? 0, awayScore: g.away_score ?? 0 })
    }
    const form = computeTeamForm(formGames)
    // 승차는 카드에 보이는 승·패(위 3)와 같은 숫자로 — 경기를 한 번이라도 한 팀끼리만 비교
    const gb = computeGamesBehind(identities.filter(id => id.wins + id.losses + id.draws > 0).map(id => ({ key: id.key, wins: id.wins, losses: id.losses })))
    identities = identities.map(id => ({ ...id, form: form.get(id.key) ?? null, games_behind: gb.get(id.key) ?? null }))
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

  const outGamesOf = () => targetGames.map(g => ({
    id: g.id, date: g.date, slot_num: g.slot_num, quarter_id: g.quarter_id,
    home_team_id: g.home_team_id, away_team_id: g.away_team_id,
    home_score: g.home_score, away_score: g.away_score, is_complete: true, is_exhibition: false,
  }))
  if (!withPlayers) return NextResponse.json({ identities })
  if (playersLocked) return NextResponse.json({ identities, unassigned_players: [], games: outGamesOf(), players_locked: true })

  // ── withPlayers: 선수 기록 · 정규 명단 · 리더 · 비정규 · 경기 (한 응답) ──
  const allQids = [...new Set(identities.flatMap(id => id.quarter_ids))]
  const unassignedQid = (() => {
    const v = sp.get('unassignedQuarterId') ?? (quarterId && quarterId !== 'all' ? quarterId : null)
    return v && quarters.some(q => q.id === v) ? v : null
  })()
  const teamScopeId = await resolveTeamId(leagueId)
  const [statsByIdentity, unassignedBase, membershipRes, playersRes, leadersRes, externalIds] = await Promise.all([
    Promise.all(identities.map(id => getCachedLeagueStats(leagueId, { teamId: id.team_id, quarterIds: id.quarter_ids }).then(r => r.players).catch(() => [] as PlayerStat[]))),
    unassignedQid ? getCachedLeagueStats(leagueId, { quarterId: unassignedQid }).then(r => r.players).catch(() => [] as PlayerStat[]) : Promise.resolve([] as PlayerStat[]),
    allQids.length > 0
      ? supabase.from('league_player_quarters').select('league_player_id, team_id, quarter_id, is_regular').in('quarter_id', allQids).eq('is_regular', true)
      : Promise.resolve({ data: [] as Array<{ league_player_id: string; team_id: string | null; quarter_id: string; is_regular: boolean | null }> }),
    // 선수는 팀 소유다(087) — league_id 로 찾으면 대회 묶음에서 0명
    supabase.from('league_players').select('id, name, number, position, photo_url, is_guest').eq('team_id', teamScopeId),
    allQids.length > 0
      ? supabase.from('league_team_quarter_leaders').select('quarter_id, team_id, leader_player_id').in('quarter_id', allQids)
      : Promise.resolve({ data: [] as Array<{ quarter_id: string; team_id: string; leader_player_id: string | null }> }),
    fetchExternalPlayerIds(supabase, leagueId).catch(() => new Set<string>()),
  ])

  type PRow = { id: string; name: string; number: number | null; position: string | null; photo_url: string | null; is_guest: boolean | null }
  const playerById = new Map(((playersRes.data ?? []) as PRow[]).map(p => [p.id, p]))
  // 게스트는 정규로 등록돼 있어도 뺀다(이름 규칙 포함 — 종전 화면과 같은 판정)
  const isGuestRow = (p: PRow) => Boolean(p.is_guest) || p.name.includes('게스트')
  const memberships = (membershipRes.data ?? []) as Array<{ league_player_id: string; team_id: string | null; quarter_id: string }>
  const leaderRows = (leadersRes.data ?? []) as Array<{ quarter_id: string; team_id: string; leader_player_id: string | null }>
  const qOrder = new Map(quarters.map((q, i) => [q.id, i]))

  const withData = identities.map((id, i) => {
    const qset = new Set(id.quarter_ids)
    const seen = new Set<string>()
    const regular: RegularPlayer[] = []
    for (const m of memberships) {
      if (m.team_id !== id.team_id || !qset.has(m.quarter_id) || seen.has(m.league_player_id)) continue
      const p = playerById.get(m.league_player_id)
      if (!p || isGuestRow(p) || externalIds.has(p.id)) continue
      seen.add(p.id)
      regular.push({ id: p.id, name: p.name, number: p.number, position: p.position, photo_url: p.photo_url })
    }
    const leader = leaderRows
      .filter(l => l.team_id === id.team_id && qset.has(l.quarter_id) && l.leader_player_id)
      .sort((a, b) => (qOrder.get(a.quarter_id) ?? 0) - (qOrder.get(b.quarter_id) ?? 0))
      .at(-1)?.leader_player_id ?? null
    return { ...id, players: statsByIdentity[i], regular, leader_player_id: leader }
  })

  const inIdentity = new Set(statsByIdentity.flat().map(p => p.player_id))
  const unassigned_players = unassignedBase.filter(p => !inIdentity.has(p.player_id))

  return NextResponse.json({ identities: withData, unassigned_players, games: outGamesOf() })
}
