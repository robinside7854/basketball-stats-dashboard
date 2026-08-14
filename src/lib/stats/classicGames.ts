// 월별 명경기 — "그 달에 가장 볼 만했던 경기 하나".
//
// ## 기준을 왜 이렇게 잡았나 (실측 근거, 2026-08-13)
// 완료 경기 261개의 분포를 먼저 재고 정했다. **평균 총득점 28.1점 · 평균 점수차 6.2점**이다.
// 하루에 짧은 경기를 여러 판 치르는 형식이라, NBA 감각(5점차 접전)을 그대로 옮기면 안 된다.
// 28점짜리 경기에서 3점차는 한 번의 공격으로 뒤집히는 차이다.
//
// 단일 기준은 전부 실패했다:
//   · 3점차 이하 → 97경기(37%). "명경기"가 셋 중 하나면 의미가 없다.
//   · 점수차만 보면 0-2 로 끝난 저득점 경기까지 "2점차"로 걸린다. 접전이 아니라 그냥 심심한 경기다.
// 그래서 **네 신호의 조합**으로 간다. 넷 다 지금 데이터로 계산된다.
//
// ## 신호와 가중치 (사용자 지정 우선순위: 위닝샷 > 역전 > 점수차 > 총득점)
// 가중치를 8/4/2/1 로 둔 건 우연이 아니다. 8 > 4+2+1 이라 **위닝샷은 나머지를 다 합쳐도 못 이긴다** —
// "우선순위"라는 말을 그대로 옮기면 이 형태가 된다. 아래 단계도 마찬가지로 2배씩 벌어진다.
//
// ## 왜 DB 에 저장하지 않는가
// 기준을 바꾸면 과거 목록이 통째로 달라진다. 저장해 두면 그때마다 마이그레이션과 재계산이 필요하고,
// 무엇보다 "예전 기준으로 뽑힌 경기"와 "지금 기준"이 섞여 설명할 수 없는 목록이 된다.
// 조회 시점에 계산하면 기준 변경이 상수 몇 개 수정으로 끝난다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'

/** 점수차 이하면 '마지막 공격이 승부를 갈랐다'로 본다 (평균 6.2점차 대비) */
const CLOSE_MARGIN = 2
/** 이 횟수 이상 리드가 뒤집히면 '주고받은 경기'. 평균 1.0회 · 최대 7회라 3이면 상위권이다 */
const LEAD_CHANGES = 3
/** 총득점이 이 이상이면 화력전 (평균 28.1점 대비) */
const HIGH_TOTAL = 38

/** 사용자 지정 우선순위. 합이 아래 단계 전체보다 크도록 2배씩 벌린다 */
const W_WINNING_SHOT = 8
const W_LEAD_CHANGES = 4
const W_CLOSE_MARGIN = 2
const W_HIGH_TOTAL = 1

/** 1차 기준. 이만큼 충족한 경기가 그 달에 없으면 FALLBACK_HITS 로 완화한다 */
const PRIMARY_HITS = 3
const FALLBACK_HITS = 2

export interface ClassicGame {
  gameId: string
  date: string
  month: string            // YYYY-MM
  homeName: string; awayName: string
  homeScore: number; awayScore: number
  margin: number
  total: number
  leadChanges: number
  winningShotPlayer: string | null
  topScorer: { name: string; pts: number } | null
  hits: number
  score: number
  /** 선정 사유 태그 — 화면에 그대로 칩으로 뿌린다 */
  reasons: string[]
  /** 짧은 칼럼. 무슨 일이 있었는지 한 문단 */
  column: string
  /** 이 달에 1차 기준을 못 채워 완화했는가 */
  relaxed: boolean
}

const PAGE = 1000

export async function computeClassicGames(
  supabase: SupabaseClient | null,
  leagueId: string,
): Promise<ClassicGame[]> {
  const sb = supabase ?? createClient()

  const { data: games, error: gErr } = await sb
    .from('league_games')
    .select('id, date, home_team_id, away_team_id, home_score, away_score')
    .eq('league_id', leagueId)
    .eq('is_complete', true)
    .eq('is_exhibition', false)
  if (gErr) throw new Error(`classicGames: 경기 조회 실패 — ${gErr.message}`)
  const gameRows = (games ?? []) as Array<{
    id: string; date: string; home_team_id: string | null; away_team_id: string | null
    home_score: number | null; away_score: number | null
  }>
  if (gameRows.length === 0) return []

  const gameIds = gameRows.map(g => g.id)

  // 팀 이름 — 분기별 override 는 여기서 보지 않는다(명경기 칼럼은 '그때 그 팀'이 아니라
  // 지금 부르는 이름으로 읽는 게 자연스럽다). 필요해지면 teamIdentity 를 붙인다.
  const { data: teams } = await sb.from('league_teams').select('id, name').eq('league_id', leagueId)
  const teamName = new Map((teams ?? []).map((t: { id: string; name: string }) => [t.id, t.name]))

  // 득점 이벤트 — 역전 횟수와 최다 득점자를 같은 스캔에서 뽑는다.
  // ⚠ 1000행 페이지네이션 필수. 조용히 잘리면 역전 횟수가 과소 집계돼 명경기가 바뀐다.
  type Ev = { id: number; league_game_id: string; team_id: string | null; league_player_id: string | null; points: number | null }
  const events: Ev[] = []
  for (let page = 0; ; page++) {
    const { data, error } = await sb
      .from('league_game_events')
      .select('id, league_game_id, team_id, league_player_id, points')
      .in('league_game_id', gameIds)
      .gt('points', 0)
      // ⚠ ORDER BY 없이 range 를 쓰면 페이지 경계에서 중복·누락된다. id 는 기록 순서다.
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw new Error(`classicGames: 이벤트 조회 실패 — ${error.message}`)
    const rows = (data ?? []) as Ev[]
    events.push(...rows)
    if (rows.length < PAGE) break
  }

  const { data: playerRows } = await sb.from('league_players').select('id, name').eq('league_id', leagueId)
  const playerName = new Map((playerRows ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))

  // 위닝샷 배지 — 이미 계산된 판정을 재사용한다. 같은 판정을 두 곳에서 하면 언젠가 어긋난다.
  const { data: wsRows } = await sb
    .from('player_badges')
    .select('game_id, player_id')
    .eq('league_id', leagueId)
    .eq('badge_type', 'winning_shot')
    .not('game_id', 'is', null)
  const winningShot = new Map(
    ((wsRows ?? []) as Array<{ game_id: string; player_id: string }>).map(r => [r.game_id, r.player_id]),
  )

  // 경기별 집계
  const byGame = new Map<string, Ev[]>()
  for (const e of events) {
    const arr = byGame.get(e.league_game_id)
    if (arr) arr.push(e); else byGame.set(e.league_game_id, [e])
  }

  const scored = gameRows.map(g => {
    const hs = g.home_score ?? 0
    const as_ = g.away_score ?? 0
    const evs = byGame.get(g.id) ?? []

    // 역전 횟수 — 리드 부호가 바뀐 횟수. 동점(0)은 전환으로 세지 않는다.
    // 동점을 세면 시소 한 번이 두 번으로 잡혀 값이 부풀려진다.
    let runH = 0, runA = 0, prevSign = 0, leadChanges = 0
    const ptsByPlayer = new Map<string, number>()
    for (const e of evs) {
      const p = e.points ?? 0
      if (e.team_id && e.team_id === g.home_team_id) runH += p
      else if (e.team_id && e.team_id === g.away_team_id) runA += p
      const s = Math.sign(runH - runA)
      if (s !== 0 && prevSign !== 0 && s !== prevSign) leadChanges++
      if (s !== 0) prevSign = s
      if (e.league_player_id) ptsByPlayer.set(e.league_player_id, (ptsByPlayer.get(e.league_player_id) ?? 0) + p)
    }

    let topScorer: { name: string; pts: number } | null = null
    for (const [pid, pts] of ptsByPlayer) {
      if (!topScorer || pts > topScorer.pts) topScorer = { name: playerName.get(pid) ?? '알 수 없음', pts }
    }

    const margin = Math.abs(hs - as_)
    const total = hs + as_
    const wsPlayerId = winningShot.get(g.id) ?? null

    const hasWS = wsPlayerId !== null
    const hasLead = leadChanges >= LEAD_CHANGES
    const hasClose = margin <= CLOSE_MARGIN
    const hasHigh = total >= HIGH_TOTAL

    const reasons: string[] = []
    if (hasWS) reasons.push('위닝샷')
    if (hasLead) reasons.push(`역전 ${leadChanges}회`)
    if (hasClose) reasons.push(margin === 0 ? '무승부' : `${margin}점 차`)
    if (hasHigh) reasons.push(`총 ${total}점`)

    return {
      gameId: g.id,
      date: g.date,
      month: g.date.slice(0, 7),
      homeName: teamName.get(g.home_team_id ?? '') ?? '홈',
      awayName: teamName.get(g.away_team_id ?? '') ?? '어웨이',
      homeScore: hs, awayScore: as_,
      margin, total, leadChanges,
      winningShotPlayer: wsPlayerId ? (playerName.get(wsPlayerId) ?? null) : null,
      topScorer,
      hits: (hasWS ? 1 : 0) + (hasLead ? 1 : 0) + (hasClose ? 1 : 0) + (hasHigh ? 1 : 0),
      score: (hasWS ? W_WINNING_SHOT : 0) + (hasLead ? W_LEAD_CHANGES : 0)
           + (hasClose ? W_CLOSE_MARGIN : 0) + (hasHigh ? W_HIGH_TOTAL : 0),
      reasons,
      column: '',
      relaxed: false,
    } satisfies ClassicGame
  })

  // 월별로 하나씩 뽑는다.
  const months = new Map<string, ClassicGame[]>()
  for (const g of scored) {
    const arr = months.get(g.month)
    if (arr) arr.push(g); else months.set(g.month, [g])
  }

  const picked: ClassicGame[] = []
  for (const [, list] of months) {
    // 1차: 3개 이상. 없으면 2개로 완화한다(그 달을 통째로 비우지 않기 위해).
    let pool = list.filter(g => g.hits >= PRIMARY_HITS)
    let relaxed = false
    if (pool.length === 0) {
      pool = list.filter(g => g.hits >= FALLBACK_HITS)
      relaxed = true
    }
    if (pool.length === 0) continue   // 2개도 없으면 그 달은 명경기 없음 — 억지로 채우지 않는다

    pool.sort((a, b) =>
      b.score - a.score ||                 // 우선순위 가중합
      b.leadChanges - a.leadChanges ||     // 같으면 더 많이 뒤집힌 경기
      a.margin - b.margin ||               // 그래도 같으면 더 접전
      b.total - a.total ||                 // 그래도 같으면 화력전
      a.date.localeCompare(b.date),        // 완전 동률이면 먼저 열린 경기 (결과 고정용)
    )
    const best = pool[0]
    picked.push({ ...best, relaxed, column: buildColumn(best, relaxed) })
  }

  return picked.sort((a, b) => b.month.localeCompare(a.month))
}

/**
 * 선정 칼럼 — 무슨 일이 있었는지 한 문단.
 *
 * AI 를 쓰지 않는다. 매번 같은 경기에 같은 문장이 나와야 하고(재계산 때마다 말이 바뀌면
 * 기록이 아니라 인상이 된다), 비용도 들지 않는다. 대신 데이터가 말해 주는 것만 적는다.
 */
function buildColumn(g: ClassicGame, relaxed: boolean): string {
  const parts: string[] = []
  const winner = g.homeScore > g.awayScore ? g.homeName : g.awayScore > g.homeScore ? g.awayName : null

  parts.push(`${g.homeName} ${g.homeScore} : ${g.awayScore} ${g.awayName}.`)

  if (g.leadChanges >= LEAD_CHANGES) {
    parts.push(`리드가 ${g.leadChanges}번 뒤집혔다.`)
  } else if (g.leadChanges > 0) {
    parts.push(`리드가 ${g.leadChanges}번 바뀌었다.`)
  }

  if (g.winningShotPlayer) {
    parts.push(`${g.winningShotPlayer}의 마지막 득점이 그대로 승부가 됐다.`)
  } else if (g.margin === 0) {
    parts.push('끝내 승부가 갈리지 않았다.')
  } else if (g.margin <= CLOSE_MARGIN && winner) {
    parts.push(`${winner}이(가) ${g.margin}점을 지켜냈다.`)
  }

  if (g.total >= HIGH_TOTAL) parts.push(`양 팀 합계 ${g.total}점의 화력전.`)
  if (g.topScorer && g.topScorer.pts > 0) parts.push(`최다 득점은 ${g.topScorer.name} ${g.topScorer.pts}점.`)

  // 완화된 달은 그 사실을 숨기지 않는다. "이 달은 기준을 낮춰 뽑았다"를 알아야
  // 목록 전체의 신뢰가 유지된다.
  if (relaxed) parts.push('※ 이 달은 3개 조건을 채운 경기가 없어 2개 기준으로 골랐다.')

  return parts.join(' ')
}
