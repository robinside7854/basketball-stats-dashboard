// GET /api/leagues/[leagueId]/personal-highs
//
// 각 선수의 "분기별 개인 최고 기록" (per-quarter personal high) 반환.
// 단일 시즌 데이터에서 bbref 스타일 italic 을 흉내내기 위한 API.
// 여러 분기 중 그 선수가 자신의 최고 성적을 낸 분기를 찾아 표시.
//
// 응답:
//   {
//     highs: {
//       [playerId]: {
//         ppg?:   { value, quarterId, gp }
//         rpg?:   { value, quarterId, gp }
//         apg?:   { value, quarterId, gp }
//         spg?:   { value, quarterId, gp }
//         bpg?:   { value, quarterId, gp }
//         fg_pct?:  { value, quarterId, gp }
//         fg3_pct?: { value, quarterId, gp }
//       }
//     },
//     minGp: number  // 각 분기의 최소 출전 경기 (표본 신뢰도 필터)
//   }
//
// 사용:
//   - 클라이언트에서 특정 분기 stats 렌더 시 highs[playerId][stat].quarterId 와 현재 quarterId 비교
//   - 일치 시 그 셀에 italic 처리 → "이 분기가 이 선수의 최고 시즌"

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type EventRow = {
  league_player_id: string | null
  related_player_id: string | null
  team_id: string | null
  type: string
  result: string | null
  points: number | null
  league_game_id: string
}

type StatKey = 'ppg' | 'rpg' | 'apg' | 'spg' | 'bpg' | 'fg_pct' | 'fg3_pct'
type PersonalHigh = { value: number; quarterId: string; gp: number }
export type PlayerHighs = Partial<Record<StatKey, PersonalHigh>>

// 표본 신뢰도 최소치 — 1경기 outlier 를 개인 최고로 잡지 않도록
const MIN_GP_FOR_HIGH = 2

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const supabase = createClient()

  // 1) 분기 + 게임 + 이벤트 병렬 페치
  const [{ data: quartersRaw }, { data: gamesRaw }] = await Promise.all([
    supabase.from('league_quarters').select('id').eq('league_id', leagueId),
    supabase.from('league_games')
      .select('id, quarter_id')
      .eq('league_id', leagueId)
      .eq('is_started', true),
  ])
  const quarters = (quartersRaw ?? []).map(q => q.id as string)
  const games = (gamesRaw ?? []) as { id: string; quarter_id: string | null }[]
  if (quarters.length === 0 || games.length === 0) {
    return NextResponse.json({ highs: {}, minGp: MIN_GP_FOR_HIGH })
  }

  const gameToQuarter: Record<string, string> = {}
  const gamesByQuarter: Record<string, string[]> = {}
  for (const g of games) {
    if (!g.quarter_id) continue
    gameToQuarter[g.id] = g.quarter_id
    if (!gamesByQuarter[g.quarter_id]) gamesByQuarter[g.quarter_id] = []
    gamesByQuarter[g.quarter_id].push(g.id)
  }

  // 2) 이벤트 페이지네이션 (1000+)
  const gameIds = games.map(g => g.id)
  const events: EventRow[] = []
  const PAGE = 1000
  let page = 0
  while (true) {
    const { data: chunk, error } = await supabase
      .from('league_game_events')
      .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (chunk && chunk.length > 0) events.push(...(chunk as EventRow[]))
    if (!chunk || chunk.length < PAGE) break
    page++
  }

  // 3) (player, quarter) 별 카운팅
  type QStats = {
    pts: number
    fgm: number; fga: number
    fg3m: number; fg3a: number
    reb: number; ast: number; stl: number; blk: number
    games: Set<string>
  }
  const bucket: Record<string, Record<string, QStats>> = {}  // playerId → quarterId → QStats
  const ensure = (pid: string, qid: string): QStats => {
    if (!bucket[pid]) bucket[pid] = {}
    if (!bucket[pid][qid]) bucket[pid][qid] = {
      pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
      reb: 0, ast: 0, stl: 0, blk: 0, games: new Set(),
    }
    return bucket[pid][qid]
  }

  // DB 실제 event type 매핑 (소문자):
  //   shot_2p_mid / shot_layup / shot_2p_drive / shot_post / shot_3p — 필드골
  //   ft_2pt / ft_3pt_1 / ft_3pt_2 / free_throw — 자유투 (points 필드 참조)
  //   and_one — 앤드원 보너스 1점
  //   oreb / dreb — 리바운드
  //   steal / block / turnover — 개별
  //   어시스트는 별도 type 이 없고 made field shot 의 related_player_id 로 크레딧
  const FIELD_SHOTS = new Set(['shot_2p_mid', 'shot_layup', 'shot_2p_drive', 'shot_post', 'shot_3p'])
  const FT_TYPES = new Set(['ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw'])

  for (const e of events) {
    const qid = gameToQuarter[e.league_game_id]
    if (!qid) continue
    const t = e.type
    const isMade = e.result === 'made'
    const pid = e.league_player_id

    // 필드골 shooter 스탯
    if (pid && FIELD_SHOTS.has(t)) {
      const s = ensure(pid, qid)
      s.games.add(e.league_game_id)
      s.fga += 1
      if (t === 'shot_3p') s.fg3a += 1
      if (isMade) {
        s.fgm += 1
        if (t === 'shot_3p') s.fg3m += 1
        s.pts += (e.points ?? (t === 'shot_3p' ? 3 : 2))
      }
    } else if (pid && FT_TYPES.has(t)) {
      const s = ensure(pid, qid)
      s.games.add(e.league_game_id)
      if (isMade) s.pts += (e.points ?? 1)
    } else if (pid && t === 'and_one') {
      const s = ensure(pid, qid)
      s.games.add(e.league_game_id)
      if (isMade) s.pts += 1
    } else if (pid && (t === 'oreb' || t === 'dreb')) {
      const s = ensure(pid, qid)
      s.games.add(e.league_game_id)
      s.reb += 1
    } else if (pid && t === 'steal') {
      const s = ensure(pid, qid)
      s.games.add(e.league_game_id)
      s.stl += 1
    } else if (pid && t === 'block') {
      const s = ensure(pid, qid)
      s.games.add(e.league_game_id)
      s.blk += 1
    }

    // 어시스트: made field shot 의 related_player_id 에게 크레딧
    if (FIELD_SHOTS.has(t) && isMade && e.related_player_id) {
      const aPid = e.related_player_id
      const s = ensure(aPid, qid)
      s.games.add(e.league_game_id)
      s.ast += 1
    }
  }

  // 4) (player) 별 각 stat 의 최고 분기 계산
  const highs: Record<string, PlayerHighs> = {}
  for (const pid of Object.keys(bucket)) {
    const perQ = bucket[pid]
    const eligibleQs = Object.entries(perQ).filter(([, s]) => s.games.size >= MIN_GP_FOR_HIGH)
    if (eligibleQs.length === 0) continue  // 표본 부족

    const trackMax = (statKey: StatKey, valueOf: (s: QStats) => number | null) => {
      let best: { value: number; quarterId: string; gp: number } | null = null
      for (const [qid, s] of eligibleQs) {
        const v = valueOf(s)
        if (v === null || v === 0) continue
        if (!best || v > best.value) {
          best = { value: v, quarterId: qid, gp: s.games.size }
        }
      }
      if (best) {
        if (!highs[pid]) highs[pid] = {}
        highs[pid][statKey] = best
      }
    }

    trackMax('ppg', s => +(s.pts / s.games.size).toFixed(1))
    trackMax('rpg', s => +(s.reb / s.games.size).toFixed(1))
    trackMax('apg', s => +(s.ast / s.games.size).toFixed(1))
    trackMax('spg', s => +(s.stl / s.games.size).toFixed(1))
    trackMax('bpg', s => +(s.blk / s.games.size).toFixed(1))
    // 슈팅률 — 시도수 최소 필터 (분기별 5회 이상)
    trackMax('fg_pct', s => s.fga >= 5 ? +(s.fgm / s.fga * 100).toFixed(1) : null)
    trackMax('fg3_pct', s => s.fg3a >= 3 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : null)
  }

  return NextResponse.json({ highs, minGp: MIN_GP_FOR_HIGH })
}
