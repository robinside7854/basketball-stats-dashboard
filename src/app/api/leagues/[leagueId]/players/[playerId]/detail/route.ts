import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canViewStats } from '@/lib/auth/guard'
import { scorePoints, fetchScoringRules, type ScoringRules, isPlusOneFor, type GamePlusOne } from '@/lib/stats/scoring'
import { resolveTeamId } from '@/lib/league/teamScope'
import { computeLastPlayed } from '@/lib/stats/lastPlayed'
import { buildPercentileBars, type PercentileInput } from '@/lib/stats/percentileBars'
import { buildQuarterRow, type QuarterTableRow } from '@/lib/stats/quarterTable'
import { findSimilarStyle, similarReasonText, type StyleInput } from '@/lib/stats/similarStyle'
import { isAssistEvent, FIELD_SHOT_TYPES } from '@/lib/stats/boxLine'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'
import {
  loadPeriodStats, quarterPeriod, gameInPeriod, pickPlayerRow, rankMinRounds, rankOf, type StatsPeriod,
} from '@/lib/stats/playerTotals'
import { computeRoleLabels, roleLabelsPublic } from '@/lib/stats/roleLabels'
import { requireCeoSession } from '@/lib/auth/ceo'
import type { PlayerStat } from '@/types/league'
import type { SupabaseClient } from '@supabase/supabase-js'

// 「선수 숫자는 한 벌」(2026-10-14) — 이 라우트의 합계·하루 평균·순위·백분위·비슷한 선수는 전부
//   computeLeagueStats(스탯 탭과 같은 결과)에서 나온다(playerTotals.ts). 아래 자체 이벤트 루프는
//   **그 결과에 없는 것**(커리어 하이·슛 분포·최근 경기·월별·연속 기록·승패·듀오)만 만든다 —
//   그래서 같은 경기 집합(친선 제외·같은 기간·외부 팀 이벤트 제외·출전시간만 있는 날 포함)을 쓴다.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId') ?? undefined
  // 라운드(R) 기준 고정 — 경기 슬롯 단위는 2026-08-10 삭제했다.
  // 쿼리파라미터를 그대로 읽으면 옛 화면의 unit=game 요청이 여기서만 되살아난다.
  const unit = 'round'
  const supabase = createClient()

  // (2026-10-14) 분기별 기록표만 따로 — `?quarterRows=only`. 분기마다 computeLeagueStats 를 병렬로 돌려
  //   무겁다(분기 수는 한 자릿수). 선수 카드가 첫 화면을 그린 뒤 따로 받는다 — 본 응답을 늦추지 않으려고.
  if (searchParams.get('quarterRows') === 'only') {
    const quarter_rows = await loadQuarterRows(supabase, leagueId, playerId).catch(() => [] as QuarterTableRow[])
    return NextResponse.json({ quarter_rows })
  }

  // 이 파일에는 득점 계산이 5곳 있었다. 전부 이 룰 하나를 공유한다.
  const scoringRules: ScoringRules = await fetchScoringRules(supabase, leagueId)

  // 기간 — 분기는 **날짜 범위**(gameDateRange 와 같은 규칙), 기간이 없는 분기만 quarter_id 폴백.
  //   예전엔 이 라우트만 `g.quarter_id === quarterId` 로 골라, 분기별 기록표(날짜 기준)와 숫자가 갈렸다.
  let period: StatsPeriod = 'all'
  if (quarterId) {
    const { data: qRow } = await supabase
      .from('league_quarters')
      .select('id, start_date, end_date')
      .eq('id', quarterId)
      .eq('league_id', leagueId)
      .maybeSingle()
    period = qRow ? quarterPeriod(qRow as { id: string; start_date: string | null; end_date: string | null }) : { quarterId }
  }
  // 스탯 탭과 같은 전원 집계 — 아래 이벤트 조회와 겹쳐 돌린다. (조기 반환 시 미처리 거부 방지용 catch)
  const statsP = loadPeriodStats(leagueId, period)
  statsP.catch(() => {})
  // 역할 라벨 공개 여부(leagues.rules.role_labels_public) — 꺼져 있으면 CEO 에게만 「미리보기」로 싣는다.
  const roleVisibilityP: Promise<'public' | 'preview' | 'hidden'> = (async () => {
    const { data } = await supabase.from('leagues').select('rules').eq('id', leagueId).maybeSingle()
    if (roleLabelsPublic((data as { rules?: unknown } | null)?.rules)) return 'public'
    return (await requireCeoSession()) ? 'preview' : 'hidden'
  })().catch(() => 'hidden' as const)
  const externalTeamIds = await fetchExternalTeamIds(supabase, leagueId)

  // (2026-10-14) 마지막 출전일 + 그 뒤 결장 경기일 — 분기와 무관한 값이라 분기 없는 요청에서만 계산한다
  //   (선수 카드는 분기 없는 첫 응답에서 읽는다). ⚠ 이 값만 친선일 포함 — computeLastPlayed 머리 주석.
  //   아래 집계와 독립이라 먼저 띄워 두고 응답 직전에 받는다. 실패하면 null.
  const lastPlayedP = quarterId ? Promise.resolve(undefined) : computeLastPlayed(supabase, leagueId, playerId)

  const [
    { data: leaguePlayers },
    { data: allGames },
    { data: teams },
    { data: league },
    { data: memberships },
    { data: gpRows },
  ] = await Promise.all([
    // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 대회 묶음에서 0명이 나와
    //   plus_one 맵이 비고, 가산점이 에러 없이 조용히 빠진다.
    supabase.from('league_players').select('id, name, number, photo_url, plus_one').eq('team_id', await resolveTeamId(leagueId)),
    supabase
      .from('league_games')
      .select('id, date, quarter_id, home_team_id, away_team_id, home_score, away_score, round_num, plus_one_player_id, plus_one_extra_ids, plus_one_quarters, is_exhibition')
      .eq('league_id', leagueId)
      .eq('is_started', true)   // 마감 여부와 무관하게 기록 시작된 게임 전체 포함
      // 친선전(비공식)은 제외 — 이 라우트는 순위·통산최고·월별·승패·스트릭을 만드는 스탯 페이지다.
      //   빠뜨리면 비공식 경기로 개인 최고 기록이 갱신되고 순위가 흔들린다.
      //   (2026-08-23 발견: 8/22 친선전 10경기·592이벤트가 그대로 섞여 있었다)
      .eq('is_exhibition', false)
      .order('date', { ascending: false }),
    supabase.from('league_teams').select('id, name, color').eq('league_id', leagueId),
    supabase.from('leagues').select('name').eq('id', leagueId).single(),
    supabase
      .from('league_player_quarters')
      .select('quarter_id, team_id')
      .eq('league_player_id', playerId)
      .eq('league_id', leagueId),
    // 게임별 비정규/타팀 임시 출전 배정 (정규 팀보다 우선 적용)
    supabase
      .from('league_game_players')
      .select('league_game_id, team_id')
      .eq('league_player_id', playerId)
      .eq('league_id', leagueId),
  ])

  // 기간 필터 — computeLeagueStats 와 같은 경기 집합
  const games = (allGames ?? []).filter(g => gameInPeriod(g, period))

  // 분기별 팀명/색상 override — 항상 전체를 조회해서 게임별로 그 게임의 quarter override 를 적용.
  // (누적 뷰에서도 Q1-Q2 게임의 상대가 락다운으로 정확히 표시되도록.)
  const { data: allOverridesData } = await supabase
    .from('league_team_quarter_overrides')
    .select('quarter_id, team_id, name, color')
    .eq('league_id', leagueId)
  type OverrideRow = { quarter_id: string; team_id: string; name: string | null; color: string | null }
  const overrideMap: Record<string, Record<string, { name?: string; color?: string }>> = {}
  for (const ov of (allOverridesData as OverrideRow[] | null) ?? []) {
    if (!overrideMap[ov.quarter_id]) overrideMap[ov.quarter_id] = {}
    overrideMap[ov.quarter_id][ov.team_id] = { name: ov.name ?? undefined, color: ov.color ?? undefined }
  }

  // 게임의 quarter_id 기반 팀 이름/색상 조회 (누적 뷰에서 게임별로 정확히 적용됨)
  const baseTeamMap = Object.fromEntries((teams ?? []).map(t => [t.id, { name: t.name, color: t.color ?? '#9ca3af' }]))
  function resolveTeamName(teamId: string, qId: string | null | undefined): string {
    const ov = qId ? overrideMap[qId]?.[teamId] : undefined
    return ov?.name ?? baseTeamMap[teamId]?.name ?? '—'
  }

  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  // 듀오 파트너 표시용 메타 (이름/등번호/사진)
  type LPMeta = { id: string; name: string | null; number: number | null; photo_url: string | null }
  const playerMetaMap: Record<string, LPMeta> = Object.fromEntries(
    ((leaguePlayers ?? []) as unknown as LPMeta[]).map(p => [p.id, p])
  )
  const gameIds = (games ?? []).map(g => g.id)
  const gameMap = Object.fromEntries((games ?? []).map(g => [g.id, g]))
  const gamePlusOneMap: Record<string, GamePlusOne> = {}
  for (const g of games ?? []) gamePlusOneMap[g.id] = g as GamePlusOne
  const leagueName = (league as { name?: string } | null)?.name ?? ''

  const qTeamMap: Record<string, string> = {}
  for (const m of memberships ?? []) {
    if (m.quarter_id) qTeamMap[m.quarter_id] = m.team_id
  }
  // 게임별 배정 (비정규/타팀 임시 출전) — 정규 팀보다 우선
  const gpTeamMap: Record<string, string> = {}
  for (const r of gpRows ?? []) {
    if (r.league_game_id && r.team_id) gpTeamMap[r.league_game_id] = r.team_id
  }

  if (gameIds.length === 0) {
    return NextResponse.json({ rankings: {}, career_high: {}, shot_breakdown: {}, recent_games: [], player_stats: null, last_played: await lastPlayedP })
  }

  // 서버측 db-max-rows(=1000) 우회 위해 페이지네이션 청크 조회.
  // playerEvents · assistEvents · allEvents 3종은 서로 독립적이므로 병렬 실행.
  const CHUNK = 1000
  type PlayerEventRow = { league_game_id: string; type: string; result: string | null; points: number | null; team_id: string | null }
  type AssistEventRow = { league_game_id: string; team_id: string | null; type: string; result: string | null; related_player_id: string | null }
  type AllEventRow = { league_player_id: string | null; league_game_id: string; related_player_id: string | null; type: string; result: string | null; points: number | null; team_id: string | null }

  const fetchPaged = async <T,>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  ): Promise<T[]> => {
    const out: T[] = []
    for (let pg = 0; ; pg++) {
      const { data: chunk } = await build(pg * CHUNK, (pg + 1) * CHUNK - 1)
      if (!chunk || chunk.length === 0) break
      out.push(...chunk)
      if (chunk.length < CHUNK) break
    }
    return out
  }

  const [playerEvents, assistEvents, allEvents] = await Promise.all([
    fetchPaged<PlayerEventRow>((from, to) =>
      supabase
        .from('league_game_events')
        .select('league_game_id, type, result, points, team_id, quarter')
        .in('league_game_id', gameIds)
        .eq('league_player_id', playerId)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchPaged<AssistEventRow>((from, to) =>
      supabase
        .from('league_game_events')
        .select('league_game_id, team_id, type, result, related_player_id')
        .in('league_game_id', gameIds)
        .eq('related_player_id', playerId)
        .eq('result', 'made')
        .in('type', FIELD_SHOT_TYPES as string[])
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchPaged<AllEventRow>((from, to) =>
      supabase
        .from('league_game_events')
        .select('league_player_id, league_game_id, related_player_id, type, result, points, team_id, quarter')
        .in('league_game_id', gameIds)
        .not('league_player_id', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ])

  // 이벤트의 team_id 기반 게임별 출전 팀 결정 (진실의 원천 — 실제 발생한 사건 기준)
  // 같은 게임 안에서 다수결 (정상 데이터는 모두 동일하지만 데이터 일관성 보호 차원)
  const eventTeamCount: Record<string, Record<string, number>> = {}
  for (const e of (playerEvents ?? [])) {
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    const tid = (e as { team_id?: string | null }).team_id
    if (!tid) continue
    if (!eventTeamCount[e.league_game_id]) eventTeamCount[e.league_game_id] = {}
    eventTeamCount[e.league_game_id][tid] = (eventTeamCount[e.league_game_id][tid] ?? 0) + 1
  }
  // 어시스트 이벤트도 반영 (관전 안 한 게임에서 어시스트만 있을 수 있음)
  for (const e of (assistEvents ?? [])) {
    const tid = (e as { team_id?: string | null }).team_id
    if (!tid) continue
    if (!eventTeamCount[e.league_game_id]) eventTeamCount[e.league_game_id] = {}
    eventTeamCount[e.league_game_id][tid] = (eventTeamCount[e.league_game_id][tid] ?? 0) + 1
  }
  const eventTeamMap: Record<string, string> = {}
  for (const [gId, counts] of Object.entries(eventTeamCount)) {
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    if (top) eventTeamMap[gId] = top[0]
  }

  // 헬퍼: 게임 g 에서 이 선수가 실제로 뛴 팀 ID
  // 우선순위: ① 이벤트 team_id 다수결 (진실) → ② league_game_players → ③ league_player_quarters
  function teamForGame(g: { id: string; quarter_id?: string | null } | null | undefined): string | undefined {
    if (!g) return undefined
    return eventTeamMap[g.id] ?? gpTeamMap[g.id] ?? (g.quarter_id ? qTeamMap[g.quarter_id] : undefined)
  }

  // allEvents 는 위에서 playerEvents/assistEvents 와 함께 병렬 페이지네이션 완료.

  // ── Per-game stats ───────────────────────────────────────────
  type GS = {
    pts: number; reb: number; oreb: number; dreb: number
    ast: number; stl: number; blk: number; tov: number; pf: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  }
  const perGame: Record<string, GS> = {}
  const ensureG = (gId: string): GS => {
    if (!perGame[gId]) perGame[gId] = {
      pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
    }
    return perGame[gId]
  }

  const sb = {
    layup: { m: 0, a: 0 }, mid:   { m: 0, a: 0 }, post:  { m: 0, a: 0 },
    three: { m: 0, a: 0 }, ft:    { m: 0, a: 0 },
  }

  for (const e of playerEvents ?? []) {
    // sub_in/sub_out은 실제 출전 기록이 아니므로 perGame 엔트리 생성 안 함 (GP 인플레이션 방지)
    if (e.type === 'sub_in' || e.type === 'sub_out') continue
    // 외부(상대) 팀 이벤트는 우리 기록이 아니다 — computeLeagueStats 와 같은 거름
    if (e.team_id && externalTeamIds.has(e.team_id)) continue
    const s = ensureG(e.league_game_id)
    const made = e.result === 'made'
    const isPlusOne = isPlusOneFor(playerId, gamePlusOneMap[e.league_game_id], plusOneSet, (e as { quarter?: number | null }).quarter ?? null)
    const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++; sb.three.a++
        if (made) { s.fg3m++; s.fgm++; s.pts += pts; sb.three.m++ }
        break
      case 'shot_2p_mid': s.fga++; sb.mid.a++; if (made) { s.fgm++; s.pts += pts; sb.mid.m++ }; break
      case 'shot_layup':  s.fga++; sb.layup.a++; if (made) { s.fgm++; s.pts += pts; sb.layup.m++ }; break
      case 'shot_post':   s.fga++; sb.post.a++; if (made) { s.fgm++; s.pts += pts; sb.post.m++ }; break
      case 'and_one':
        if (made) { s.pts += pts }; break
      case 'ft_2pt':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += pts; sb.ft.m++ }; break
      case 'ft_3pt_1':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += pts; sb.ft.m++ }; break
      case 'free_throw': case 'ft_3pt_2':
        s.fta++; sb.ft.a++; if (made) { s.ftm++; s.pts += pts; sb.ft.m++ }; break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }
  }
  for (const e of assistEvents ?? []) {
    if (e.team_id && externalTeamIds.has(e.team_id)) continue
    if (!isAssistEvent(e.type, e.result, e.related_player_id)) continue
    ensureG(e.league_game_id).ast++
  }

  // 출전시간만 기록되고 이벤트가 없는 경기도 출전이다 — computeLeagueStats 의 gp 보정과 같은 규칙
  //   (기간 안에 이벤트가 하나라도 있는 선수에 한해). 빠뜨리면 위쪽 출전일과 최근 경기·월별이 어긋난다.
  if ((playerEvents?.length ?? 0) > 0 || (assistEvents?.length ?? 0) > 0) {
    const { data: minRows } = await supabase
      .from('league_player_minutes')
      .select('league_game_id')
      .eq('league_player_id', playerId)
      .in('league_game_id', gameIds)
    for (const m of (minRows ?? []) as { league_game_id: string }[]) {
      if (gameMap[m.league_game_id]) ensureG(m.league_game_id)
    }
  }

  const playedGames = Object.keys(perGame)

  // ── unit(라운드/게임) 단위 승패 판정 — recentGames 카드와 연승(sWin) 스트릭이 공유 ──
  //   과거엔 recentGames 가 "그 unit의 첫 경기" 하나만으로 승패를 판정해, 스탯은 하루
  //   합산인데 승패만 첫 경기인 사고가 났다(2026-08-09, 김로빈 8/8 2승4패인데 W로 표시됨).
  //   이제 이 함수 하나로 두 곳 모두 "그 unit에 속한 모든 게임"을 합산해 판정한다.
  //   unit === 'game' 모드에서는 unitKey 가 gId 자체라 게임 하나 = 판정 하나로 기존과 동일.
  function computeUnitRecord(unitKey: string): { wins: number; losses: number; draws: number; games: number; result: 'W' | 'L' | 'D' } {
    let wins = 0, losses = 0, draws = 0
    for (const gId of playedGames) {
      const g = gameMap[gId] as { date?: string; home_team_id?: string; away_team_id?: string; home_score?: number; away_score?: number } | undefined
      if (!g) continue
      const thisUnitKey = unit === 'round' ? (g.date ?? gId) : gId
      if (thisUnitKey !== unitKey) continue
      const tid = teamForGame(gameMap[gId] as { id: string; quarter_id?: string | null })
      if (!tid) continue
      const isHome = g.home_team_id === tid
      const my = isHome ? (g.home_score ?? 0) : (g.away_score ?? 0)
      const opp = isHome ? (g.away_score ?? 0) : (g.home_score ?? 0)
      if (my > opp) wins++
      else if (my < opp) losses++
      else draws++
    }
    const result: 'W' | 'L' | 'D' = wins > losses ? 'W' : wins < losses ? 'L' : 'D'
    return { wins, losses, draws, games: wins + losses + draws, result }
  }

  // ── 집계 단위 (aggregateMap): round=라운드별, game=경기별 ──────
  const aggregateMap: Record<string, GS> = {}
  const unitToFirstGame: Record<string, string> = {}  // unitKey → first gameId
  for (const gId of playedGames) {
    const g = gameMap[gId] as { date?: string } | undefined
    // '라운드' = 경기일(date) 기준 그룹핑 (round_num은 하루 내 슬롯 번호라 부정확)
    const unitKey = unit === 'round' ? (g?.date ?? gId) : gId
    if (!aggregateMap[unitKey]) {
      aggregateMap[unitKey] = { pts:0, reb:0, oreb:0, dreb:0, ast:0, stl:0, blk:0, tov:0, pf:0, fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0 }
      unitToFirstGame[unitKey] = gId
    }
    const s = perGame[gId]
    aggregateMap[unitKey].pts  += s.pts;  aggregateMap[unitKey].reb   += s.reb
    aggregateMap[unitKey].oreb += s.oreb; aggregateMap[unitKey].dreb  += s.dreb
    aggregateMap[unitKey].ast  += s.ast;  aggregateMap[unitKey].stl   += s.stl
    aggregateMap[unitKey].blk  += s.blk;  aggregateMap[unitKey].tov   += s.tov
    aggregateMap[unitKey].pf   += s.pf;   aggregateMap[unitKey].fgm   += s.fgm
    aggregateMap[unitKey].fga  += s.fga;  aggregateMap[unitKey].fg3m  += s.fg3m
    aggregateMap[unitKey].fg3a += s.fg3a; aggregateMap[unitKey].ftm   += s.ftm
    aggregateMap[unitKey].fta  += s.fta
  }
  const playedUnits = Object.keys(aggregateMap).sort((a, b) => {
    const da = (gameMap[unitToFirstGame[a]] as {date?:string})?.date ?? a
    const db = (gameMap[unitToFirstGame[b]] as {date?:string})?.date ?? b
    return da.localeCompare(db)
  })

  // ── Career High Day (unit 파라미터와 무관하게 항상 "일자" 기준 집계) ──
  // 같은 날의 여러 경기를 합산한 하루치 스탯에서 최고점 선정
  type CHDay = { value: number; date: string; extra?: string }
  const chDay: Record<string, CHDay | null> = {
    pts: null, reb: null, ast: null, stl: null, blk: null, fgPct: null, fg3m: null,
  }
  const dayMap: Record<string, GS> = {}
  for (const gId of playedGames) {
    const g = gameMap[gId] as { date?: string } | undefined
    if (!g?.date) continue
    if (!dayMap[g.date]) dayMap[g.date] = {
      pts:0, reb:0, oreb:0, dreb:0, ast:0, stl:0, blk:0, tov:0, pf:0,
      fgm:0, fga:0, fg3m:0, fg3a:0, ftm:0, fta:0,
    }
    const s = perGame[gId]
    const d = dayMap[g.date]
    d.pts += s.pts; d.reb += s.reb; d.oreb += s.oreb; d.dreb += s.dreb
    d.ast += s.ast; d.stl += s.stl; d.blk += s.blk; d.tov += s.tov
    d.pf += s.pf;   d.fgm += s.fgm; d.fga += s.fga
    d.fg3m += s.fg3m; d.fg3a += s.fg3a; d.ftm += s.ftm; d.fta += s.fta
  }
  for (const [date, s] of Object.entries(dayMap)) {
    const upd = (key: string, val: number, extra?: string) => {
      if (val > (chDay[key]?.value ?? -1)) chDay[key] = { value: val, date, extra }
    }
    upd('pts', s.pts, s.fga > 0 ? `FG ${+(s.fgm / s.fga * 100).toFixed(1)}% (${s.fgm}/${s.fga})` : undefined)
    upd('reb', s.reb, `OR ${s.oreb} / DR ${s.dreb}`)
    upd('ast', s.ast)
    upd('stl', s.stl)
    upd('blk', s.blk)
    upd('fg3m', s.fg3m, s.fg3a > 0 ? `3P ${+(s.fg3m / s.fg3a * 100).toFixed(1)}% (${s.fg3m}/${s.fg3a})` : undefined)
    if (s.fga >= 5) upd('fgPct', +(s.fgm / s.fga * 100).toFixed(1), `${s.fgm}/${s.fga}`)
  }

  function gameInfo(gId: string, teamId?: string) {
    const g = gameMap[gId]
    if (!g) return null
    const isHome = g.home_team_id === teamId
    const oppId = isHome ? g.away_team_id : g.home_team_id
    const myPts = isHome ? g.home_score : g.away_score
    const oppPts = isHome ? g.away_score : g.home_score
    // 게임의 quarter override 를 우선 적용, 없으면 base team 이름 사용
    const gameQuarterId = (g as { quarter_id?: string | null }).quarter_id ?? null
    const opponent = oppId ? resolveTeamName(oppId, gameQuarterId) : '상대'
    return {
      date: g.date as string,
      opponent,
      round_num: g.round_num as number,
      result: myPts > oppPts ? 'W' : 'L',
      score: `${myPts}-${oppPts}`,
      league_name: leagueName,
    }
  }

  const careerHigh: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(chDay)) {
    if (!entry) continue
    // Career High Day: date + extra (opponent/result는 일자 기반이라 의미 모호 — 제외)
    careerHigh[key] = { value: entry.value, date: entry.date, extra: entry.extra, league_name: leagueName }
  }

  // ── Recent 5 units ─────────────────────────────────────────
  const recentGames = playedUnits
    .slice().reverse()
    .slice(0, 5)
    .map(unitKey => {
      const s = aggregateMap[unitKey]
      const firstGId = unitToFirstGame[unitKey]
      const g = firstGId ? gameMap[firstGId] : null
      const tid = teamForGame(g)
      // 승패는 그 unit(라운드)의 **모든 경기**를 합산해 판정한다. 첫 경기 하나로 정하면
      //   스탯은 하루 합산인데 승패만 첫 경기가 되어 어긋난다(2026-08-09 사고).
      //   opponent/score 는 라운드에 여러 상대가 섞이므로 아래 record 로 대체해 쓴다.
      const rec = computeUnitRecord(unitKey)
      return {
        ...gameInfo(firstGId ?? '', tid),
        result: rec.result,
        record: { wins: rec.wins, losses: rec.losses, draws: rec.draws, games: rec.games },
        pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a,
      }
    })

  // ── Full Game Log (trend chart 용) ────────────────────────
  // 오래된 → 최근 순으로 전체 unit 스탯 제공. 클라이언트가 rolling avg 를 계산.
  const gameLog = playedUnits.map(unitKey => {
    const s = aggregateMap[unitKey]
    const firstGId = unitToFirstGame[unitKey]
    const g = firstGId ? (gameMap[firstGId] as { date?: string } | undefined) : undefined
    return {
      date: g?.date ?? unitKey,
      pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk,
      fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a,
    }
  })

  // ── 순위 · 백분위 · 비슷한 선수 — 스탯 탭과 같은 computeLeagueStats 결과 한 벌 ──
  //   모집단 = 게스트를 뺀 선수(스탯 탭 표와 같다), 자격 = 열린 날의 30% 이상(STATS_MIN_ROUND_RATIO).
  //   예전엔 여기서 이벤트를 다시 세어 게스트가 섞이고 출전시간만 있는 날이 gp 에서 빠져, 스탯 탭과 순위가 갈렸다.
  const periodStats = await statsP
  const pool: PlayerStat[] = periodStats.players
  const myRow = pickPlayerRow(periodStats, playerId)
  const effectiveMinGp = rankMinRounds(periodStats.total_rounds ?? 0, pool)
  const eligibleForRank = pool.filter(p => p.gp >= effectiveMinGp)

  const getRank = (stat: 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg') => rankOf(eligibleForRank, playerId, p => p[stat])

  // ── 역할 라벨 (플레이 스타일, 2026-10-14) ── 순위와 같은 모집단·같은 기간. 배지가 아니다 — lib/stats/roleLabels.ts.
  //   모집단 밖(자격 미달·게스트)이면 라벨 없음(null). 공개 스위치가 꺼져 있으면 CEO 에게만 preview 로.
  const roleVisibility = await roleVisibilityP
  const myRole = roleVisibility === 'hidden' ? undefined : computeRoleLabels(eligibleForRank).byPlayer.get(playerId)
  const role_labels = myRole
    ? { labels: myRole.labels, preview: roleVisibility === 'preview' }
    : null

  // ── 세부 능력치 백분위 (2026-10-14) ── 레이더와 같은 자격 집단·같은 하루 평균.
  //   성공률·비율은 PCT_MIN_ATTEMPTS 미달이면 「–」 — 규칙은 lib/stats/percentileBars.ts 머리 주석.
  const toPctInput = (p: PlayerStat): PercentileInput => ({
    pid: p.player_id, gp: p.gp, pts: p.pts, reb: p.reb, oreb: p.oreb, dreb: p.dreb, ast: p.ast, stl: p.stl, blk: p.blk,
    tov: p.tov, fgm: p.fgm, fga: p.fga, fg3m: p.fg3m, fg3a: p.fg3a, ftm: p.ftm, fta: p.fta,
  })
  const percentile_bars = buildPercentileBars(eligibleForRank.map(toPctInput), myRow ? toPctInput(myRow) : null)

  // ── 비슷한 스타일 선수 (2026-10-14) ── 막대와 같은 자격 집단·같은 기간.
  //   팀 칩 = computeLeagueStats 의 표시용 소속 팀(기간 안 마지막 출전일 팀, (team_id, quarter_id) 정체성).
  const similar_players = (() => {
    const toStyleInput = (p: PlayerStat): StyleInput => ({
      pid: p.player_id, gp: p.gp, pts: p.pts, oreb: p.oreb, dreb: p.dreb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov,
      fga: p.fga, fta: p.fta,
      shotAttempts: { shot_3p: p.fg3a, shot_2p_mid: p.md_a, shot_layup: p.lu_a, shot_post: p.ds_a },
    })
    const res = findSimilarStyle(eligibleForRank.map(toStyleInput), playerId)
    const rowOf = new Map(pool.map(p => [p.player_id, p]))
    return {
      qualified: res.qualified,
      sample: res.sample,
      players: res.matches.map(m => {
        const row = rowOf.get(m.pid)
        const meta = playerMetaMap[m.pid]
        return {
          player_id: m.pid,
          name: row?.name ?? meta?.name ?? '알 수 없음',
          photo_url: row?.photo_url ?? meta?.photo_url ?? null,
          team: row?.team_name ? { name: row.team_name, color: row.team_color ?? '#9ca3af' } : null,
          score: m.score,
          reasons: m.reasons,
          reason_text: similarReasonText(m.reasons),
        }
      }),
    }
  })()

  // 승률 순위 — 모집단·출전일은 위와 같은 computeLeagueStats(출전 3일 이상), 승패는 경기 단위.
  //   선수마다 뛴 경기와 그 경기의 팀은 이벤트 team_id 로 안다(본인은 teamForGame 폴백).
  //   ⚠ 예전 구현은 경기 id 자리에 날짜를 넣어 찾느라 **아무도 승패가 잡히지 않아** 순위가 늘 0 이었다.
  const playedByPlayer: Record<string, Map<string, string | undefined>> = {}
  const markPlayed = (pid: string, gId: string, tid: string | null) => {
    if (!playedByPlayer[pid]) playedByPlayer[pid] = new Map()
    const cur = playedByPlayer[pid].get(gId)
    if (cur === undefined) playedByPlayer[pid].set(gId, tid ?? undefined)
  }
  for (const e of allEvents ?? []) {
    if (e.team_id && externalTeamIds.has(e.team_id)) continue
    if (e.league_player_id && e.type !== 'sub_in' && e.type !== 'sub_out') markPlayed(e.league_player_id, e.league_game_id, e.team_id)
    if (e.related_player_id && isAssistEvent(e.type, e.result, e.related_player_id)) markPlayed(e.related_player_id, e.league_game_id, e.team_id)
  }
  const winRateEligible = pool
    .filter(p => p.gp >= 3)
    .map(p => {
      let wins = 0, losses = 0
      for (const [gId, evTid] of playedByPlayer[p.player_id] ?? new Map<string, string | undefined>()) {
        const g = gameMap[gId]
        if (!g) continue
        const tid = evTid ?? (p.player_id === playerId ? teamForGame(g) : undefined)
        if (!tid) continue
        const isHome = g.home_team_id === tid
        const myPts = isHome ? (g.home_score as number) : (g.away_score as number)
        const oppPts = isHome ? (g.away_score as number) : (g.home_score as number)
        if (myPts > oppPts) wins++
        else if (myPts < oppPts) losses++
      }
      return { player_id: p.player_id, wins, losses, rate: wins + losses > 0 ? wins / (wins + losses) * 100 : 0 }
    })
    .filter(w => w.wins + w.losses > 0)
  const win_rate_rank = rankOf(winRateEligible, playerId, w => w.rate)

  // 추가 랭킹 (gp, fg_pct, fg3_pct, ft_pct) — 모집단 전원(gp>=1), 성공률은 시도>0
  //   { rank, total } 객체 형태로 하위호환 위해 기존 필드는 유지
  const getRankTotal = (
    stat: 'gp' | 'fg_pct' | 'fg3_pct' | 'ft_pct',
    requireAttempt?: 'fga' | 'fg3a' | 'fta',
  ): { rank: number; total: number } => {
    const base = pool.filter(p => p.gp >= 1)
    const sel = requireAttempt ? base.filter(p => p[requireAttempt] > 0) : base
    return { rank: rankOf(sel, playerId, p => p[stat]), total: sel.length }
  }

  const rankings = {
    ppg: getRank('ppg'), rpg: getRank('rpg'), apg: getRank('apg'),
    spg: getRank('spg'), bpg: getRank('bpg'),
    total: eligibleForRank.length,     // 자격 요건(min GP) 통과 인원. rank 표시 계산의 분모로 사용됨
    win_rate_rank,
    gp:      getRankTotal('gp'),
    fg_pct:  getRankTotal('fg_pct',  'fga'),
    fg3_pct: getRankTotal('fg3_pct', 'fg3a'),
    ft_pct:  getRankTotal('ft_pct',  'fta'),
  }


  // ── Win/Loss impact ──────────────────────────────────────────
  type WLS = { pts: number; reb: number; ast: number; stl: number; blk: number; gp: number }
  const winS:  WLS = { pts:0, reb:0, ast:0, stl:0, blk:0, gp:0 }
  const lossS: WLS = { pts:0, reb:0, ast:0, stl:0, blk:0, gp:0 }
  // 무승부 버킷 — 예전엔 `won ? winS : lossS` 라 **무승부가 전부 패로 셌다**
  //   (2026-08-09: 김로빈 실제 78승 37패 7무인데 78W 44L 로 표시, 승률 67.8%→63.9%).
  //   이 리그는 짧은 쿼터 경기라 동점이 실제로 나온다. 승률 순위(winRateMap)는 이미
  //   무를 분모에서 빼고 있었으므로, 표시값도 같은 기준으로 맞춘다.
  const drawS: WLS = { pts:0, reb:0, ast:0, stl:0, blk:0, gp:0 }
  let playerPtsTotal = 0, teamPtsTotal = 0

  for (const gId of playedGames) {
    const s = perGame[gId]
    const g = gameMap[gId]
    if (!g) continue
    const tid = teamForGame(g)
    if (!tid) continue
    const isHome = g.home_team_id === tid
    const myPts  = isHome ? (g.home_score as number) : (g.away_score as number)
    const oppPts = isHome ? (g.away_score as number) : (g.home_score as number)
    playerPtsTotal += s.pts
    teamPtsTotal   += myPts
    const bucket = myPts > oppPts ? winS : myPts < oppPts ? lossS : drawS
    bucket.pts += s.pts; bucket.reb += s.reb; bucket.ast += s.ast
    bucket.stl += s.stl; bucket.blk += s.blk; bucket.gp++
  }
  // 승/패 split 스탯(이길 때·질 때)은 2026-08-03 선수카드 개편에서 제거 — 전적/승률/기여도만 유지
  const winLoss = {
    wins: winS.gp, losses: lossS.gp, draws: drawS.gp,
    // 무는 분모에서 제외 — 승률 순위(winRateMap)와 같은 기준이라야 옆에 붙는 순위와 안 어긋난다.
    // (팀 순위표는 무를 분모에 넣는 다른 관행을 쓴다 — 선수와 팀은 별개 지표로 둔다.)
    win_rate: (winS.gp + lossS.gp) > 0 ? +(winS.gp / (winS.gp + lossS.gp) * 100).toFixed(1) : 0,
    pts_share:  teamPtsTotal > 0 ? +(playerPtsTotal / teamPtsTotal * 100).toFixed(1) : 0,
  }

  // ── Shot breakdown ───────────────────────────────────────────
  const totalFGA = sb.layup.a + sb.mid.a + sb.post.a + sb.three.a
  const pct = (m: number, a: number) => a > 0 ? +(m / a * 100).toFixed(1) : 0
  const dist = (a: number) => totalFGA > 0 ? +(a / totalFGA * 100).toFixed(1) : 0
  const shotBreakdown = {
    layup: { ...sb.layup, dist: dist(sb.layup.a), fg_pct: pct(sb.layup.m, sb.layup.a) },
    mid:   { ...sb.mid,   dist: dist(sb.mid.a),   fg_pct: pct(sb.mid.m,   sb.mid.a)   },
    post:  { ...sb.post,  dist: dist(sb.post.a),  fg_pct: pct(sb.post.m,  sb.post.a)  },
    three: { ...sb.three, dist: dist(sb.three.a), fg_pct: pct(sb.three.m, sb.three.a) },
    ft:    { ...sb.ft,    ft_pct: pct(sb.ft.m, sb.ft.a) },
    total_fga: totalFGA,
  }

  // player_stats — 스탯 탭 그 선수 행 그대로(computeLeagueStats). 게스트도 자기 줄은 있다.
  const player_stats = myRow ? {
    gp: myRow.gp, pts: myRow.pts, reb: myRow.reb, ast: myRow.ast, stl: myRow.stl, blk: myRow.blk, tov: myRow.tov,
    fgm: myRow.fgm, fga: myRow.fga, fg3m: myRow.fg3m, fg3a: myRow.fg3a, ftm: myRow.ftm, fta: myRow.fta,
    ppg: myRow.ppg, rpg: myRow.rpg, apg: myRow.apg, spg: myRow.spg, bpg: myRow.bpg, topg: myRow.topg,
    fg_pct: myRow.fg_pct, fg3_pct: myRow.fg3_pct, ft_pct: myRow.ft_pct,
  } : null

  // ── Monthly stats — aggregateMap 기반 단위별 → 월별 그룹 ──────────────
  const monthlyMap: Record<string, { pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; days: number }> = {}
  for (const unitKey of playedUnits) {
    const date = (gameMap[unitToFirstGame[unitKey]] as {date?:string})?.date ?? ''
    const month = date.slice(0, 7) // YYYY-MM
    if (!month) continue
    if (!monthlyMap[month]) monthlyMap[month] = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, days: 0 }
    const s = aggregateMap[unitKey]
    monthlyMap[month].pts  += s.pts;  monthlyMap[month].reb += s.reb
    monthlyMap[month].ast  += s.ast;  monthlyMap[month].stl += s.stl
    monthlyMap[month].blk  += s.blk;  monthlyMap[month].fgm += s.fgm
    monthlyMap[month].fga  += s.fga;  monthlyMap[month].days++
  }

  const monthly_stats = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, s]) => ({
      month,
      label: `${parseInt(month.slice(5))}월`,
      gp: s.days,
      ppg:     +(s.pts / s.days).toFixed(1),
      rpg:     +(s.reb / s.days).toFixed(1),
      apg:     +(s.ast / s.days).toFixed(1),
      spg:     +(s.stl / s.days).toFixed(1),
      bpg:     +(s.blk / s.days).toFixed(1),
      fg_pct:  s.fga > 0 ? +(s.fgm / s.fga * 100).toFixed(1) : 0,
    }))

  // ── Active Streaks (현재 진행 중인 연속 기록) ────────────────────
  // unit 기준(round 또는 game)으로 최신부터 역방향 walk, 조건 깨지면 stop
  const sortedUnitsDesc = [...playedUnits].reverse()
  let s10 = 0, s10Done = false
  let s20 = 0, s20Done = false
  let s3p = 0, s3pDone = false
  let sWin = 0, sWinDone = false

  for (const unitKey of sortedUnitsDesc) {
    const agg = aggregateMap[unitKey]
    if (!s10Done) {
      if (agg.pts >= 10) s10++; else s10Done = true
    }
    if (!s20Done) {
      if (agg.pts >= 20) s20++; else s20Done = true
    }
    if (!s3pDone) {
      if (agg.fg3m >= 1) s3p++; else s3pDone = true
    }
    if (!sWinDone) {
      // recentGames 카드와 **같은 판정 함수**를 쓴다. 예전엔 이 블록만 전 경기를 합산하고
      //   recentGames 는 첫 경기만 봐서, 같은 화면에 승패 정의가 둘이었다(2026-08-09 사고).
      //   무승부 라운드(승==패)는 연승을 잇지 않는다 — 이긴 날이 아니기 때문.
      if (computeUnitRecord(unitKey).result === 'W') sWin++
      else sWinDone = true
    }
    if (s10Done && s20Done && s3pDone && sWinDone) break
  }
  const active_streaks = { ten: s10, twenty: s20, three: s3p, win: sWin }

  // ── 다이나믹 듀오 (Dynamic Duo) ───────────────────────────────
  //   정의: 나와 상대 선수 사이의 "어시스트 → 득점" 합작 점수 합계 (양방향 모두 합산).
  //         pair_pts = Σ points  WHERE (scorer, assister) ∈ {(me, X), (X, me)}
  //   범위: 어워즈 BEST_DUO 와 동일하게 필드 야투(자유투/앤드원 제외) · made 만.
  //   출력: 합작 점수 상위 3조합 + 각 방향별 기여 분해.
  const dynamic_duo = (() => {
    type DuoAcc = { total: number; iScored: number; partnerScored: number; iAssists: number; partnerAssists: number }
    const acc: Record<string, DuoAcc> = {}
    const shotTypeSet = new Set<string>(FIELD_SHOT_TYPES)

    for (const e of allEvents ?? []) {
      if (e.result !== 'made') continue
      if (!shotTypeSet.has(e.type)) continue
      const scorer = e.league_player_id
      const assister = e.related_player_id
      if (!scorer || !assister || scorer === assister) continue
      if (scorer !== playerId && assister !== playerId) continue

      // 저장된 points 폴백은 6건이 틀린 것으로 확인되어 룰 계산으로 통일 (득점자 scorer 기준 plus-one 판정).
      const isPlusOneForEvent = isPlusOneFor(scorer, gamePlusOneMap[e.league_game_id], plusOneSet, (e as { quarter?: number | null }).quarter ?? null)
      const pts = scorePoints(e.type, e.result, isPlusOneForEvent, scoringRules)
      const partnerId = scorer === playerId ? assister : scorer
      if (!acc[partnerId]) acc[partnerId] = { total: 0, iScored: 0, partnerScored: 0, iAssists: 0, partnerAssists: 0 }
      const a = acc[partnerId]
      a.total += pts
      if (scorer === playerId) {
        // 파트너 어시 → 내 득점
        a.iScored += pts
        a.partnerAssists += 1
      } else {
        // 내 어시 → 파트너 득점
        a.partnerScored += pts
        a.iAssists += 1
      }
    }

    return Object.entries(acc)
      .map(([partner_id, a]) => {
        const meta = playerMetaMap[partner_id]
        return {
          partner_id,
          partner_name: meta?.name ?? '알 수 없음',
          partner_number: meta?.number ?? null,
          partner_photo_url: meta?.photo_url ?? null,
          total_pts: a.total,
          // 파트너의 어시스트로 내가 넣은 점수
          pts_from_partner: a.iScored,
          assists_from_partner: a.partnerAssists,
          // 내 어시스트로 파트너가 넣은 점수
          pts_to_partner: a.partnerScored,
          assists_to_partner: a.iAssists,
        }
      })
      .sort((x, y) => y.total_pts - x.total_pts)
      .slice(0, 3)
  })()

  // 프로필카드에 노출할 "내 베스트샷" 핀 (최대 3개)
  let pinned_event_ids: string[] = []
  {
    // 이 선수 행은 이제 팀 소유다 — 대회 화면에서 보는 선수카드도 league_id 가 아니라
    // team_id 로 소속을 확인해야 찾아진다(행 자체의 출생 league_id 는 리그일 수 있다).
    const teamId = await resolveTeamId(leagueId)
    const { data: pinRow } = await supabase
      .from('league_players')
      .select('pinned_event_ids')
      .eq('id', playerId)
      .eq('team_id', teamId)
      .maybeSingle()
    pinned_event_ids = (pinRow as { pinned_event_ids: string[] | null } | null)?.pinned_event_ids ?? []
  }

  return NextResponse.json({
    rankings, career_high: careerHigh, shot_breakdown: shotBreakdown,
    recent_games: recentGames,
    game_log: gameLog,
    win_loss: winLoss, player_stats, monthly_stats, unit,
    active_streaks,
    dynamic_duo,
    pinned_event_ids,
    last_played: await lastPlayedP,
    percentile_bars,
    similar_players,
    role_labels,
  })
}

// 분기별 기록표 — 정규 분기마다 그 분기 전원 스탯(computeLeagueStats)을 받아 이 선수 한 줄을 만든다.
//   분기 경기는 **날짜 범위**로 고른다(gameDateRange). 기간이 없는 분기만 quarter_id 로 폴백.
async function loadQuarterRows(supabase: SupabaseClient, leagueId: string, playerId: string): Promise<QuarterTableRow[]> {
  const { data } = await supabase
    .from('league_quarters')
    .select('id, year, quarter, start_date, end_date, kind')
    .eq('league_id', leagueId)
  type QRow = { id: string; year: number; quarter: number; start_date: string | null; end_date: string | null; kind: string | null }
  const quarters = ((data ?? []) as QRow[])
    .filter(q => q.kind !== 'tournament')
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)
  const rows = await Promise.all(quarters.map(async q => {
    const res = await loadPeriodStats(leagueId, quarterPeriod(q))
    return buildQuarterRow(q, res.players, res.total_rounds ?? 0, playerId, res.guests)
  }))
  return rows.filter((r): r is QuarterTableRow => r !== null)
}
