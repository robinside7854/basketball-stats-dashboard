// GET /api/leagues/[leagueId]/similarity?playerId=X&topN=3&minGp=3
//
// 대상 선수와 플레이 스타일이 유사한 선수 Top-N 반환.
// 6-vector cosine similarity 기반.
//
// 벡터 성분 (모두 리그 percentile 로 [0,1] 정규화):
//   1) PPG            (득점)
//   2) RPG            (리바운드)
//   3) APG            (플레이메이킹)
//   4) SPG+BPG        (수비/허슬)
//   5) 3PAr = FG3A/FGA (외곽 지향도)
//   6) eFG%           (효율성)
//
// 응답:
//   {
//     source: { playerId, name, vector, ppg, rpg, apg, stl_blk, three_ar, efg_pct },
//     similar: [
//       { playerId, name, similarity (0-1), ppg, rpg, apg, stl_blk, three_ar, efg_pct }
//     ]
//   }

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type EventRow = {
  league_player_id: string | null
  team_id: string | null
  type: string
  result: string | null
  points: number | null
  league_game_id: string
}

type PlayerAgg = {
  playerId: string
  name: string
  gp: number
  pts: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  reb: number; ast: number; stl: number; blk: number
}

type PlayerFeatures = {
  playerId: string
  name: string
  gp: number
  ppg: number
  rpg: number
  apg: number
  stl_blk: number
  three_ar: number  // FG3A / FGA
  efg_pct: number
}

// 리그 값의 percentile rank 계산 (min-max 정규화 사용, 이상치가 적어 단순)
function normalize(values: number[]): number[] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  if (range === 0) return values.map(() => 0.5)
  return values.map(v => (v - min) / range)
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0
  return dot / denom
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const playerId = sp.get('playerId')
  const topN = Math.min(Math.max(1, Number(sp.get('topN') ?? 3)), 10)
  const minGp = Math.max(1, Number(sp.get('minGp') ?? 3))
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })

  const supabase = createClient()

  // 1) 선수 메타 + 게임 목록 병렬 페치
  const [{ data: playersRaw }, { data: gamesRaw }] = await Promise.all([
    supabase.from('league_players').select('id, name, is_guest').eq('league_id', leagueId),
    supabase.from('league_games').select('id').eq('league_id', leagueId).eq('is_started', true),
  ])
  const players = (playersRaw ?? []) as { id: string; name: string; is_guest: boolean | null }[]
  const games = (gamesRaw ?? []) as { id: string }[]
  if (players.length === 0 || games.length === 0) {
    return NextResponse.json({ source: null, similar: [] })
  }

  const gameIds = games.map(g => g.id)
  const playerMeta = new Map(players.map(p => [p.id, p]))

  // 2) 이벤트 페이지네이션
  const events: EventRow[] = []
  const PAGE = 1000
  let page = 0
  while (true) {
    const { data: chunk, error } = await supabase
      .from('league_game_events')
      .select('league_player_id, team_id, type, result, points, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (chunk && chunk.length > 0) events.push(...(chunk as EventRow[]))
    if (!chunk || chunk.length < PAGE) break
    page++
  }

  // 3) 선수별 집계
  const aggs = new Map<string, PlayerAgg>()
  const gpSet = new Map<string, Set<string>>()
  const ensure = (pid: string): PlayerAgg => {
    let a = aggs.get(pid)
    if (!a) {
      const meta = playerMeta.get(pid)
      a = {
        playerId: pid,
        name: meta?.name ?? '알 수 없음',
        gp: 0,
        pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
        reb: 0, ast: 0, stl: 0, blk: 0,
      }
      aggs.set(pid, a)
    }
    if (!gpSet.has(pid)) gpSet.set(pid, new Set())
    return a
  }

  for (const e of events) {
    if (!e.league_player_id) continue
    const a = ensure(e.league_player_id)
    gpSet.get(e.league_player_id)!.add(e.league_game_id)
    const isMade = e.result === 'MADE'
    if (e.type === 'SHOT') {
      a.fga += 1
      if (isMade) { a.fgm += 1; a.pts += e.points ?? 2 }
    } else if (e.type === 'THREE') {
      a.fga += 1; a.fg3a += 1
      if (isMade) { a.fgm += 1; a.fg3m += 1; a.pts += 3 }
    } else if (e.type === 'FT') {
      if (isMade) a.pts += 1
    } else if (e.type === 'REB' || e.type === 'OREB' || e.type === 'DREB') {
      a.reb += 1
    } else if (e.type === 'AST') a.ast += 1
    else if (e.type === 'STL') a.stl += 1
    else if (e.type === 'BLK') a.blk += 1
  }

  // 4) 자격 필터 + feature vector 계산
  const features: PlayerFeatures[] = []
  for (const [pid, a] of aggs.entries()) {
    const gp = gpSet.get(pid)?.size ?? 0
    if (gp < minGp) continue
    features.push({
      playerId: pid,
      name: a.name,
      gp,
      ppg: gp > 0 ? +(a.pts / gp).toFixed(1) : 0,
      rpg: gp > 0 ? +(a.reb / gp).toFixed(1) : 0,
      apg: gp > 0 ? +(a.ast / gp).toFixed(1) : 0,
      stl_blk: gp > 0 ? +((a.stl + a.blk) / gp).toFixed(2) : 0,
      three_ar: a.fga > 0 ? +(a.fg3a / a.fga).toFixed(3) : 0,
      efg_pct: a.fga > 0 ? +((a.fgm + 0.5 * a.fg3m) / a.fga * 100).toFixed(1) : 0,
    })
  }

  const target = features.find(f => f.playerId === playerId)
  if (!target) {
    return NextResponse.json({
      source: null,
      similar: [],
      error: `Player ${playerId} has fewer than ${minGp} games or no events.`,
    })
  }

  // 5) 각 성분을 리그 percentile 로 정규화
  const ppgArr = features.map(f => f.ppg)
  const rpgArr = features.map(f => f.rpg)
  const apgArr = features.map(f => f.apg)
  const sbArr  = features.map(f => f.stl_blk)
  const arArr  = features.map(f => f.three_ar)
  const efgArr = features.map(f => f.efg_pct)

  const ppgN = normalize(ppgArr)
  const rpgN = normalize(rpgArr)
  const apgN = normalize(apgArr)
  const sbN  = normalize(sbArr)
  const arN  = normalize(arArr)
  const efgN = normalize(efgArr)

  const vectors = features.map((_, i) => [ppgN[i], rpgN[i], apgN[i], sbN[i], arN[i], efgN[i]])
  const targetIdx = features.findIndex(f => f.playerId === playerId)
  const targetVec = vectors[targetIdx]

  // 6) similarity 계산 + 정렬 (self 제외)
  const scored = features.map((f, i) => {
    if (f.playerId === playerId) return null
    // 게스트 선수는 유사도 결과에서 제외 (표본 신뢰도 낮음)
    if (playerMeta.get(f.playerId)?.is_guest) return null
    return {
      playerId: f.playerId,
      name: f.name,
      gp: f.gp,
      similarity: +cosineSimilarity(targetVec, vectors[i]).toFixed(3),
      ppg: f.ppg,
      rpg: f.rpg,
      apg: f.apg,
      stl_blk: f.stl_blk,
      three_ar: f.three_ar,
      efg_pct: f.efg_pct,
    }
  }).filter((x): x is NonNullable<typeof x> => x !== null)

  scored.sort((a, b) => b.similarity - a.similarity)
  const top = scored.slice(0, topN)

  return NextResponse.json({
    source: {
      playerId: target.playerId,
      name: target.name,
      gp: target.gp,
      ppg: target.ppg,
      rpg: target.rpg,
      apg: target.apg,
      stl_blk: target.stl_blk,
      three_ar: target.three_ar,
      efg_pct: target.efg_pct,
    },
    similar: top,
    league_size: features.length,
    min_gp: minGp,
  })
}
