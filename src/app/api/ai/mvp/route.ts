import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/client'
import { createClient as createAdmin } from '@/lib/supabase/admin'
import { calculateBoxScore } from '@/lib/stats/calculator'
import type { PlayerBoxScore } from '@/types/database'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface AwardEntry {
  player_id: string
  player_name: string
  reason: string
}

export interface MvpResult {
  mvp: AwardEntry
  x_factor: AwardEntry | null
}

// ── MVP Score ────────────────────────────────────────────────────
// 핵심 철학: 높은 야투 효율 + 다득점이 MVP의 1순위 경로
// pts 기본 가중치 상향 + 효율 연동 보너스로 "효율적 다득점" 강력 우대
function calcMvpScore(s: PlayerBoxScore): number {
  const efgPct = s.efg_pct / 100
  const tsPct = s.ts_pct / 100

  // 효율적 득점 보너스: FGA 6회 이상 + eFG% 45% 이상인 선수에게 pts의 40% 추가
  // → 22pts 54%eFG 선수가 5pts 허슬 선수보다 명확히 우위를 갖게 함
  const efficientScoringBonus =
    s.fga >= 6 && s.efg_pct >= 45 ? s.pts * 0.4 : 0

  // 비효율 슈터 페널티: 10회 이상 쏘고 FG% 30% 미만
  const chuckerPenalty =
    s.fga >= 10 && s.fg_pct < 30 ? (s.fga - s.fgm) * 0.3 : 0

  return (
    s.pts * 1.5 +               // 1.0 → 1.5 상향
    efficientScoringBonus +     // 효율 다득점 보너스 (최대 ~+10)
    efgPct * 12 +               // 효율 자체 가치 (20 → 12, 보너스로 이동)
    tsPct * 8 +                 // TS% (15 → 8)
    s.ast * 1.5 +
    s.reb * 0.8 +
    s.oreb * 0.5 +
    s.stl * 1.5 +
    s.blk * 1.2 +
    s.fg3m * 0.5 +
    (s.double_double ? 3.0 : 0) +
    (s.triple_double ? 5.0 : 0) -
    s.tov * 1.5 -
    s.pf * 0.3 -
    chuckerPenalty
  )
}

// ── X-FACTOR Score ───────────────────────────────────────────────
// 허슬·조력 중심, 고득점자 억제 유지
function calcXfactorScore(s: PlayerBoxScore, teamHighPts: number): number {
  const highScorerPenalty = s.pts >= teamHighPts * 0.8 ? s.pts * 0.5 : 0
  const burstBonus =
    s.pts >= 6 && s.pts <= 12 && (s.stl >= 2 || s.oreb >= 2 || s.ast >= 3)
      ? 2.0
      : 0

  return (
    s.ast * 2.5 +
    s.oreb * 3.0 +
    s.dreb * 1.0 +
    s.stl * 2.5 +
    s.blk * 2.5 +
    s.pts * 0.3 +
    s.fg3m * 0.3 +
    s.ftm * 0.2 -
    s.tov * 1.0 -
    highScorerPenalty +
    burstBonus
  )
}

// ── 스탯 텍스트 (AI 코멘트용) ────────────────────────────────────
function statsLine(s: PlayerBoxScore): string {
  const fg = s.fga > 0 ? `${s.fgm}/${s.fga} FG(${s.fg_pct.toFixed(0)}%)` : '0/0 FG'
  const tp = s.fg3a > 0 ? ` ${s.fg3m}/${s.fg3a} 3P` : ''
  const ft = s.fta > 0 ? ` ${s.ftm}/${s.fta} FT` : ''
  const efg = s.fga > 0 ? ` eFG:${s.efg_pct.toFixed(0)}%` : ''
  return (
    `#${s.player_number} ${s.player_name}: ` +
    `${s.pts}pts ${fg}${tp}${ft}${efg} | ` +
    `${s.reb}reb(OR${s.oreb}/DR${s.dreb}) ${s.ast}ast ` +
    `${s.stl}stl ${s.blk}blk ${s.tov}tov`
  )
}

// GET: 캐시된 결과만 반환 (AI 실행 없음)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  const supabase = createClient()
  const { data: gameRow } = await supabase
    .from('games')
    .select('ai_mvp')
    .eq('id', gameId)
    .single()

  if (!gameRow) return NextResponse.json({ error: '경기를 찾을 수 없습니다' }, { status: 404 })
  if (!gameRow.ai_mvp) return new Response(null, { status: 204 })

  return NextResponse.json(gameRow.ai_mvp as MvpResult)
}

// POST: AI 분석 실행 + DB 저장 (버튼 클릭 시 호출)
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const mvpHintId: string | undefined = body.mvpHintId || undefined
  const xfactorHintId: string | undefined = body.xfactorHintId || undefined
  const gameMemo: string | undefined = body.gameMemo?.trim() || undefined

  // ── 1. API 키 확인 ───────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' }, { status: 503 })
  }

  const supabase = createClient()

  // ── 2. 기존 저장 결과 재확인 (중복 실행 방지) ─────────────────
  const { data: gameRow } = await supabase
    .from('games')
    .select('ai_mvp, date, opponent, our_score, opponent_score, tournament_id, tournament:tournaments(name, year)')
    .eq('id', gameId)
    .single()

  if (!gameRow) return NextResponse.json({ error: '경기를 찾을 수 없습니다' }, { status: 404 })

  if (gameRow.ai_mvp) {
    return NextResponse.json(gameRow.ai_mvp as MvpResult)
  }

  // ── 3. 이 경기 스탯 수집 ────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameInfo = gameRow as unknown as {
    date: string; opponent: string; our_score: number; opponent_score: number;
    tournament_id?: string
    tournament?: { name: string; year: number } | null
  }

  const [eventsRes, minutesRes, playersRes] = await Promise.all([
    supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at'),
    supabase.from('player_minutes').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('is_active', true).order('number'),
  ])

  if (eventsRes.error || minutesRes.error || playersRes.error) {
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 })
  }

  const allBoxScores = calculateBoxScore(eventsRes.data, minutesRes.data, playersRes.data)

  const activePlayerIds = new Set(
    (eventsRes.data ?? []).map((e: { player_id?: string }) => e.player_id).filter(Boolean)
  )
  const participants = allBoxScores.filter(
    s => activePlayerIds.has(s.player_id) || s.pts > 0 || s.reb > 0 || s.ast > 0 || s.stl > 0 || s.blk > 0
  )

  if (participants.length < 2) {
    return NextResponse.json({ error: '기록된 선수가 부족합니다 (최소 2명 필요)' }, { status: 400 })
  }

  // ── 4. 통계 수집 ────────────────────────────────────────────────
  type SeasonAvg = {
    pts_avg: number; reb_avg: number; ast_avg: number; stl_avg: number
    blk_avg: number; fg_pct_avg: number; fg3_pct_avg: number
    efg_pct_avg: number; ts_pct_avg: number
    pts_high: number; reb_high: number; ast_high: number
    stl_high: number; blk_high: number; games_played: number
  }
  // 대회 평균: 이번 대회 내 이전 경기 (스코어링 보너스 + 대회 평균 코멘트용)
  const seasonMap = new Map<string, SeasonAvg>()
  // 시즌 평균: 이번 연도 전체 대회 경기 (시즌 평균 코멘트용)
  const yearSeasonMap = new Map<string, SeasonAvg>()

  const participantIds = participants.map(p => p.player_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournamentYear = (gameInfo.tournament as any)?.year as number | undefined

  // 4a. 이번 대회 이전 경기 ID
  const { data: tournamentGames } = gameInfo.tournament_id
    ? await supabase
        .from('games')
        .select('id')
        .eq('tournament_id', gameInfo.tournament_id)
        .neq('id', gameId)
    : { data: [] }
  const prevGameIds = (tournamentGames ?? []).map((g: { id: string }) => g.id)

  // 4b. 이번 연도 전체 대회 경기 ID (다른 대회 포함)
  let yearGameIds: string[] = []
  if (tournamentYear) {
    const { data: yearTournaments } = await supabase
      .from('tournaments')
      .select('id')
      .eq('year', tournamentYear)
    const yearTIds = (yearTournaments ?? []).map((t: { id: string }) => t.id)
    if (yearTIds.length > 0) {
      const { data: yearGames } = await supabase
        .from('games')
        .select('id')
        .in('tournament_id', yearTIds)
        .neq('id', gameId)
      yearGameIds = (yearGames ?? []).map((g: { id: string }) => g.id)
    }
  }

  // 공통: 게임 ID 목록으로 per-player 평균 맵 빌드
  async function buildAvgMap(gameIds: string[]): Promise<Map<string, SeasonAvg>> {
    const map = new Map<string, SeasonAvg>()
    if (gameIds.length === 0) return map
    const [evRes, mnRes] = await Promise.all([
      supabase.from('game_events').select('*').in('game_id', gameIds)
        .in('player_id', participantIds).limit(8000),
      supabase.from('player_minutes').select('*').in('game_id', gameIds)
        .in('player_id', participantIds).limit(8000),
    ])
    const allPlayers = playersRes.data ?? []
    const cumBoxes = calculateBoxScore(evRes.data ?? [], mnRes.data ?? [], allPlayers)
    for (const pid of participantIds) {
      const perGame: PlayerBoxScore[] = []
      for (const gid of gameIds) {
        const gEv = (evRes.data ?? []).filter((e: { game_id: string }) => e.game_id === gid)
        const gMn = (mnRes.data ?? []).filter((m: { game_id: string }) => m.game_id === gid)
        const active = gEv.some((e: { player_id?: string }) => e.player_id === pid)
          || gMn.some((m: { player_id: string }) => m.player_id === pid)
        if (!active) continue
        const stat = calculateBoxScore(gEv, gMn, allPlayers).find(s => s.player_id === pid)
        if (stat) perGame.push(stat)
      }
      if (perGame.length === 0) continue
      const gp = perGame.length
      const avg = (key: keyof PlayerBoxScore) =>
        Math.round((perGame.reduce((s, g) => s + (g[key] as number), 0) / gp) * 10) / 10
      const high = (key: keyof PlayerBoxScore) => Math.max(...perGame.map(g => g[key] as number))
      const cum = cumBoxes.find(s => s.player_id === pid)
      map.set(pid, {
        pts_avg: avg('pts'), reb_avg: avg('reb'), ast_avg: avg('ast'),
        stl_avg: avg('stl'), blk_avg: avg('blk'),
        fg_pct_avg: cum?.fg_pct ?? 0, fg3_pct_avg: cum?.fg3_pct ?? 0,
        efg_pct_avg: cum?.efg_pct ?? 0, ts_pct_avg: cum?.ts_pct ?? 0,
        pts_high: high('pts'), reb_high: high('reb'), ast_high: high('ast'),
        stl_high: high('stl'), blk_high: high('blk'), games_played: gp,
      })
    }
    return map
  }

  const [builtTournamentMap, builtYearMap] = await Promise.all([
    buildAvgMap(prevGameIds),
    buildAvgMap(yearGameIds),
  ])
  builtTournamentMap.forEach((v, k) => seasonMap.set(k, v))
  builtYearMap.forEach((v, k) => yearSeasonMap.set(k, v))

  // ── 5. MVP 선정 ──────────────────────────────────────────────
  // 시즌하이 보너스 포함한 최종 점수
  function mvpScoreWithBonus(s: PlayerBoxScore): number {
    const base = calcMvpScore(s)
    const season = seasonMap.get(s.player_id)
    let bonus = 0
    if (season && season.games_played >= 1) {
      if (s.pts > season.pts_high) bonus += 2.0        // 시즌 득점 하이
      if (s.reb > season.reb_high) bonus += 1.0        // 시즌 리바운드 하이
      if (s.ast > season.ast_high) bonus += 1.0        // 시즌 어시스트 하이
      if (s.pts > season.pts_avg * 1.4) bonus += 1.0   // 기대 초과 득점
      if (s.efg_pct > season.efg_pct_avg + 10) bonus += 1.5 // 효율 대폭 향상
    }
    if (mvpHintId && s.player_id === mvpHintId) bonus += 30.0  // 감독 추천 보너스
    return base + bonus
  }

  const mvpCandidates = participants.filter(s => {
    const isStruggling = s.pts < 4 && s.fg_pct < 25 && (s.ast + s.reb + s.stl + s.blk) < 3
    // 힌트 선수는 필터에서 제외하지 않음
    if (isStruggling && s.player_id !== mvpHintId) return false
    return s.fga >= 2 || (s.ast + s.reb) >= 4 || s.player_id === mvpHintId
  })

  const mvpPool = mvpCandidates.length > 0 ? mvpCandidates : participants
  const mvpSorted = [...mvpPool].sort((a, b) => {
    const sa = mvpScoreWithBonus(a), sb = mvpScoreWithBonus(b)
    if (sb !== sa) return sb - sa
    if (b.efg_pct !== a.efg_pct) return b.efg_pct - a.efg_pct
    return b.ast - a.ast
  })
  const mvpPlayer = mvpSorted[0]

  // ── 6. X-FACTOR 선정 ─────────────────────────────────────────
  const teamHighPts = Math.max(...participants.map(s => s.pts))
  const topScorerIds = new Set(participants.filter(s => s.pts === teamHighPts).map(s => s.player_id))

  function xfScoreWithBonus(s: PlayerBoxScore): number {
    const base = calcXfactorScore(s, teamHighPts)
    const season = seasonMap.get(s.player_id)
    let bonus = 0
    if (season && season.games_played >= 1) {
      if (s.stl > season.stl_high) bonus += 2.0
      if (s.reb > season.reb_high) bonus += 1.5
      if (s.ast > season.ast_high) bonus += 1.5
    }
    if (xfactorHintId && s.player_id === xfactorHintId) bonus += 25.0  // 감독 추천 보너스
    return base + bonus
  }

  const xfCandidates = participants.filter(s => {
    if (s.player_id === mvpPlayer.player_id) return false
    if (topScorerIds.has(s.player_id) && s.player_id !== xfactorHintId) return false
    return (s.ast + s.reb + s.stl + s.blk) >= 2 || s.player_id === xfactorHintId
  })

  const xfSorted = [...xfCandidates].sort((a, b) => {
    const sa = xfScoreWithBonus(a), sb = xfScoreWithBonus(b)
    if (sb !== sa) return sb - sa
    return (b.stl + b.blk) - (a.stl + a.blk)
  })
  const xfPlayer = xfSorted[0] ?? null

  // ── 7. 컨텍스트 분석 (AI 코멘트용) ──────────────────────────
  // 대회 평균: 이번 대회 기준
  function buildTournamentContext(s: PlayerBoxScore): string {
    const d = seasonMap.get(s.player_id)
    if (!d || d.games_played < 1) return ''
    const lines: string[] = [`대회 평균 (${d.games_played}경기): ${d.pts_avg}pts / ${d.reb_avg}reb / ${d.ast_avg}ast / ${d.stl_avg}stl`]
    lines.push(`대회 효율: FG% ${d.fg_pct_avg.toFixed(1)} / eFG% ${d.efg_pct_avg.toFixed(1)} / TS% ${d.ts_pct_avg.toFixed(1)}`)
    lines.push(`대회 단일 경기 최고: ${d.pts_high}pts / ${d.reb_high}reb / ${d.ast_high}ast / ${d.stl_high}stl`)
    const highs: string[] = []
    if (s.pts > d.pts_high) highs.push(`득점 대회최고(기존 ${d.pts_high}pts → ${s.pts}pts)`)
    if (s.reb > d.reb_high) highs.push(`리바운드 대회최고(기존 ${d.reb_high} → ${s.reb})`)
    if (s.ast > d.ast_high) highs.push(`어시스트 대회최고(기존 ${d.ast_high} → ${s.ast})`)
    if (s.stl > d.stl_high) highs.push(`스틸 대회최고(기존 ${d.stl_high} → ${s.stl})`)
    if (highs.length > 0) lines.push(`★ 대회 개인 기록 경신: ${highs.join(', ')}`)
    const exceeded: string[] = []
    if (s.pts > d.pts_avg * 1.4) exceeded.push(`득점(대회평균 ${d.pts_avg}pts → 이날 ${s.pts}pts)`)
    if (s.efg_pct > d.efg_pct_avg + 8) exceeded.push(`eFG% 급등(대회평균 ${d.efg_pct_avg.toFixed(1)}% → 이날 ${s.efg_pct.toFixed(1)}%)`)
    if (exceeded.length > 0) lines.push(`↑ 대회 평균 대비 기대 초과: ${exceeded.join(', ')}`)
    return lines.join('\n')
  }

  // 시즌 평균: 이번 연도 전체 대회 기준
  function buildYearSeasonContext(s: PlayerBoxScore): string {
    const d = yearSeasonMap.get(s.player_id)
    if (!d || d.games_played < 1) return ''
    const lines: string[] = [`시즌 평균 (${tournamentYear}년 전체 ${d.games_played}경기): ${d.pts_avg}pts / ${d.reb_avg}reb / ${d.ast_avg}ast / ${d.stl_avg}stl`]
    lines.push(`시즌 효율: FG% ${d.fg_pct_avg.toFixed(1)} / eFG% ${d.efg_pct_avg.toFixed(1)} / TS% ${d.ts_pct_avg.toFixed(1)}`)
    lines.push(`시즌 단일 경기 최고: ${d.pts_high}pts / ${d.reb_high}reb / ${d.ast_high}ast / ${d.stl_high}stl`)
    const highs: string[] = []
    if (s.pts > d.pts_high) highs.push(`득점 시즌하이(기존 ${d.pts_high}pts → ${s.pts}pts)`)
    if (s.reb > d.reb_high) highs.push(`리바운드 시즌하이(기존 ${d.reb_high} → ${s.reb})`)
    if (s.ast > d.ast_high) highs.push(`어시스트 시즌하이(기존 ${d.ast_high} → ${s.ast})`)
    if (s.stl > d.stl_high) highs.push(`스틸 시즌하이(기존 ${d.stl_high} → ${s.stl})`)
    if (highs.length > 0) lines.push(`★ 시즌하이 달성: ${highs.join(', ')}`)
    const exceeded: string[] = []
    if (s.pts > d.pts_avg * 1.4) exceeded.push(`득점(시즌평균 ${d.pts_avg}pts → 이날 ${s.pts}pts)`)
    if (s.efg_pct > d.efg_pct_avg + 8) exceeded.push(`eFG% 급등(시즌평균 ${d.efg_pct_avg.toFixed(1)}% → 이날 ${s.efg_pct.toFixed(1)}%)`)
    if (exceeded.length > 0) lines.push(`↑ 시즌 평균 대비 기대 초과: ${exceeded.join(', ')}`)
    return lines.join('\n')
  }

  function buildTeamCarryContext(s: PlayerBoxScore): string {
    const others = participants.filter(p => p.player_id !== s.player_id)
    const carry: string[] = []
    const teamReb = others.reduce((sum, p) => sum + p.reb, 0)
    const teamAst = others.reduce((sum, p) => sum + p.ast, 0)
    const teamStl = others.reduce((sum, p) => sum + p.stl, 0)
    const teamBlk = others.reduce((sum, p) => sum + p.blk, 0)
    if (teamReb > 0 && s.reb >= teamReb * 0.5) carry.push(`리바운드 팀 전체 합산의 ${Math.round(s.reb / (s.reb + teamReb) * 100)}% 차지`)
    if (teamAst > 0 && s.ast >= teamAst * 0.5) carry.push(`어시스트 팀의 ${Math.round(s.ast / (s.ast + teamAst) * 100)}%`)
    if (teamStl > 0 && s.stl >= teamStl * 0.5) carry.push(`스틸 팀의 ${Math.round(s.stl / (s.stl + teamStl) * 100)}%`)
    if (teamBlk > 0 && s.blk >= teamBlk * 0.5) carry.push(`블락 팀의 ${Math.round(s.blk / (s.blk + teamBlk) * 100)}%`)
    return carry.length > 0 ? `팀 내 독보적 기여: ${carry.join(', ')}` : ''
  }

  // ── 8. AI 코멘트 생성 ────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournament = (gameInfo.tournament as any)
  const tournamentStr = tournament ? `${tournament.name} ${tournament.year}년` : '대회'
  const resultStr = gameInfo.our_score > gameInfo.opponent_score ? '승' : gameInfo.our_score < gameInfo.opponent_score ? '패' : '무'

  const mvpTournCtx = buildTournamentContext(mvpPlayer)
  const mvpYearCtx  = buildYearSeasonContext(mvpPlayer)
  const mvpCarryCtx = buildTeamCarryContext(mvpPlayer)
  const xfTournCtx  = xfPlayer ? buildTournamentContext(xfPlayer) : ''
  const xfYearCtx   = xfPlayer ? buildYearSeasonContext(xfPlayer) : ''
  const xfCarryCtx  = xfPlayer ? buildTeamCarryContext(xfPlayer) : ''

  const prompt = `당신은 NBA 수준의 농구 통계 분석관입니다. 아마추어 농구팀 "파란날개"의 공식 경기 시상 코멘트를 작성합니다.
수상자는 이미 통계 공식으로 선정되었으므로, 당신의 역할은 **정성스럽고 구체적인 수상 코멘트**를 작성하는 것입니다.
이 코멘트는 팀 기록으로 영구 보관됩니다.

━━━ 경기 정보 ━━━
${tournamentStr} vs ${gameInfo.opponent} (${gameInfo.date}) — 파란날개 ${gameInfo.our_score}:${gameInfo.opponent_score} ${resultStr}

━━━ 전체 박스스코어 ━━━
${participants.map(s => statsLine(s)).join('\n')}

━━━ MVP 선정: ${mvpPlayer.player_name} ━━━
이번 경기 스탯: ${statsLine(mvpPlayer)}
${mvpTournCtx ? mvpTournCtx + '\n' : ''}${mvpYearCtx ? mvpYearCtx + '\n' : ''}${mvpCarryCtx}

━━━ X-FACTOR 선정: ${xfPlayer ? xfPlayer.player_name : '해당 없음'} ━━━
${xfPlayer ? `이번 경기 스탯: ${statsLine(xfPlayer)}
${xfTournCtx ? xfTournCtx + '\n' : ''}${xfYearCtx ? xfYearCtx + '\n' : ''}${xfCarryCtx}` : '(조건 충족 선수 없음)'}

${gameMemo ? `━━━ 경기 관찰 메모 (코멘트 작성 시 참고) ━━━
${gameMemo}
※ 위 메모는 코멘트의 방향과 뉘앙스를 잡는 데 활용하세요. 메모 내용을 그대로 인용하거나 "메모에 따르면" 같은 표현은 사용하지 마세요.

` : ''}━━━ 코멘트 작성 지침 ━━━
[공통]
- 한국어로 작성. NBA 시상식처럼 진지하고 품격 있는 톤
- 반드시 구체적인 수치 포함 (야투율, 득점, 특정 지표 등)
- 공식·계산 방식 언급 금지. "선정 공식에 의해" 같은 표현 금지
- +/- 수치 언급 절대 금지 (측정 신뢰도가 낮음)
- 문장은 3~5문장 사이로 작성 (짧으면 안 됨)

[용어 구분 — 반드시 준수]
- "시즌 평균"은 이번 연도 전체 대회를 통틀어 계산한 평균을 말합니다
- "대회 평균"은 이번 대회(현재 진행 중인 대회)에서의 평균을 말합니다
- 위 두 용어를 혼용하지 말고 데이터 출처에 맞게 정확히 구분해서 사용하세요
- 시즌하이는 연도 전체 기준, 대회 최고 기록은 이번 대회 기준입니다

[MVP 코멘트에 반드시 포함할 내용 — 해당되는 경우]
- 야투 효율이 우수했다면 eFG% 또는 TS%를 문장에 녹여 언급
- 특정 스탯을 팀 내에서 홀로 캐리했다면 그 사실을 강조
- 시즌하이 달성 항목이 있다면 "이번 시즌 최고 기록을 경신했다" 식으로 반드시 언급
- 시즌 평균 대비 기대 이상의 성적이면 "평소 X점 평균에서 이날은 Y점" 식으로 비교
- 승리 경기라면 기여도, 패배 경기라면 "팀이 어려운 상황에서도 분전했다" 톤 유지

[X-FACTOR 코멘트에 반드시 포함할 내용 — 해당되는 경우]
- 허슬 스탯(리바운드, 스틸, 어시스트, 블락)을 중심으로 서술
- "득점판에는 잘 드러나지 않지만" 또는 "화려하진 않았지만" 같은 표현 활용
- 시즌하이나 팀 내 캐리 내용 있으면 언급
- 팀을 위한 희생과 헌신의 가치를 강조

[절대 금지 — 아래 내용은 어떠한 경우에도 작성 금지]
- 상대팀 야투율, 상대 수비 효율, 상대 FG% 관련 내용 일절 금지 (해당 데이터 없음)
- 블락·스틸을 설명할 때는 "상대의 슛을 막았다", "볼을 빼앗았다", "림을 지켰다" 수준으로만 서술
- 수비 효율 지표(수비 레이팅 등) 언급 금지

[출력 형식 — JSON만 출력, 앞뒤 다른 텍스트 없음]
${xfPlayer ? `{
  "mvp_reason": "MVP 코멘트 3~5문장",
  "xf_reason": "X-FACTOR 코멘트 3~5문장"
}` : `{
  "mvp_reason": "MVP 코멘트 3~5문장",
  "xf_reason": null
}`}`

  let mvpReason = `${mvpPlayer.pts}pts ${mvpPlayer.fgm}/${mvpPlayer.fga} FG로 이번 경기 MVP에 선정되었습니다.`
  let xfReason = xfPlayer
    ? `${xfPlayer.ast}ast ${xfPlayer.reb}reb ${xfPlayer.stl}stl 의 궂은 일로 팀에 기여했습니다.`
    : null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 900,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(json)
    if (parsed.mvp_reason) mvpReason = parsed.mvp_reason
    if (parsed.xf_reason !== undefined) xfReason = parsed.xf_reason
  } catch (err) {
    console.warn('AI comment generation failed, using fallback:', err)
  }

  // ── 7. 결과 조립 ────────────────────────────────────────────
  const result: MvpResult = {
    mvp: {
      player_id: mvpPlayer.player_id,
      player_name: mvpPlayer.player_name,
      reason: mvpReason,
    },
    x_factor: xfPlayer
      ? {
          player_id: xfPlayer.player_id,
          player_name: xfPlayer.player_name,
          reason: xfReason ?? '',
        }
      : null,
  }

  // ── 8. DB 저장 (admin client — RLS 우회) ────────────────────
  try {
    const admin = createAdmin()
    await admin.from('games').update({ ai_mvp: result }).eq('id', gameId)
  } catch (err) {
    console.error('Failed to save ai_mvp to DB:', err)
  }

  return NextResponse.json(result)
}

// ── 재선정: 기존 결과 삭제 후 재분석 ────────────────────────────
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  const admin = createAdmin()
  await admin.from('games').update({ ai_mvp: null }).eq('id', gameId)
  return NextResponse.json({ ok: true })
}
