import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const FIELD_SHOT_TYPES = new Set([
  'shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive',
])

// GET /api/leagues/[leagueId]/relationships?quarterId=xxx
// 어시스트 듀오 & 스틸-턴오버 관계 집계
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')

  const supabase = createClient()

  // 대상 게임 ID 추출 (stats API와 동일 기준: is_started=true)
  let gQuery = supabase
    .from('league_games')
    .select('id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
  if (quarterId && quarterId !== 'all') {
    gQuery = gQuery.eq('quarter_id', quarterId)
  }
  const { data: games } = await gQuery
  const gameIds = (games ?? []).map((g: { id: string }) => g.id)
  if (gameIds.length === 0) {
    return NextResponse.json({ assistPairs: [], stlTovPairs: [] })
  }

  // 어시스트용: related_player_id 있는 슛 이벤트
  // 스틸용: steal + turnover 이벤트 전체 (기존 데이터는 video_timestamp 매칭으로 복원)
  const { data: events } = await supabase
    .from('league_game_events')
    .select('id, type, league_player_id, related_player_id, result, team_id, league_game_id, video_timestamp')
    .in('league_game_id', gameIds)
    .in('type', [...FIELD_SHOT_TYPES, 'steal', 'turnover'])

  if (!events || events.length === 0) {
    return NextResponse.json({ assistPairs: [], stlTovPairs: [] })
  }

  // 선수 메타
  const { data: players } = await supabase
    .from('league_players')
    .select('id, name, number')
    .eq('league_id', leagueId)
  const playerMap = new Map((players ?? []).map((p: { id: string; name: string; number: string | null }) => [p.id, p]))

  // ── 어시스트 관계 집계 ────────────────────────────────────────
  const assistMap: Record<string, Record<string, number>> = {}
  for (const e of events) {
    if (
      FIELD_SHOT_TYPES.has(e.type) &&
      e.result === 'made' &&
      e.related_player_id &&
      e.league_player_id
    ) {
      const aid = e.related_player_id   // 어시스터
      const sid = e.league_player_id    // 득점자
      if (!assistMap[aid]) assistMap[aid] = {}
      assistMap[aid][sid] = (assistMap[aid][sid] ?? 0) + 1
    }
  }

  const assistPairs: { assisterId: string; scorerId: string; count: number }[] = []
  for (const [aid, scorers] of Object.entries(assistMap)) {
    for (const [sid, count] of Object.entries(scorers)) {
      assistPairs.push({ assisterId: aid, scorerId: sid, count })
    }
  }
  assistPairs.sort((a, b) => b.count - a.count)

  // ── 스틸-턴오버 관계 집계 ─────────────────────────────────────
  // 신규: STL.related_player_id 직접 사용
  // 기존: 같은 game + 같은 video_timestamp 의 STL↔TOV 이벤트 매칭
  const stlEvents  = events.filter(e => e.type === 'steal')
  const tovEvents  = events.filter(e => e.type === 'turnover')

  // (gameId, timestamp) → { [teamId]: tov_player_id[] } 인덱스
  type TovKey = string
  const tovIndex = new Map<TovKey, { playerId: string; teamId: string }[]>()
  for (const t of tovEvents) {
    if (!t.league_game_id || t.video_timestamp == null || !t.league_player_id) continue
    const key: TovKey = `${t.league_game_id}:${t.video_timestamp}`
    if (!tovIndex.has(key)) tovIndex.set(key, [])
    tovIndex.get(key)!.push({ playerId: t.league_player_id, teamId: t.team_id ?? '' })
  }

  const stlMap: Record<string, Record<string, number>> = {}
  for (const s of stlEvents) {
    if (!s.league_player_id) continue
    const stealerId = s.league_player_id

    let tovPlayerId: string | null = null

    if (s.related_player_id) {
      // 신규 데이터: 명시적 링크 사용
      tovPlayerId = s.related_player_id
    } else if (s.league_game_id && s.video_timestamp != null) {
      // 기존 데이터: 같은 타임스탬프의 상대팀 TOV 이벤트 매칭
      const key: TovKey = `${s.league_game_id}:${s.video_timestamp}`
      const candidates = tovIndex.get(key) ?? []
      const match = candidates.find(c => c.teamId !== (s.team_id ?? ''))
      if (match) tovPlayerId = match.playerId
    }

    if (!tovPlayerId) continue
    if (!stlMap[stealerId]) stlMap[stealerId] = {}
    stlMap[stealerId][tovPlayerId] = (stlMap[stealerId][tovPlayerId] ?? 0) + 1
  }

  const stlTovPairs: { stealerId: string; tovId: string; count: number }[] = []
  for (const [sid, tovs] of Object.entries(stlMap)) {
    for (const [tovId, count] of Object.entries(tovs)) {
      stlTovPairs.push({ stealerId: sid, tovId, count })
    }
  }
  stlTovPairs.sort((a, b) => b.count - a.count)

  // 이름 해석 후 응답
  function resolvePair(idA: string, idB: string, count: number, aLabel: string, bLabel: string) {
    const a = playerMap.get(idA)
    const b = playerMap.get(idB)
    return {
      [aLabel]: { id: idA, name: a?.name ?? idA.slice(0, 6), number: a?.number ?? null },
      [bLabel]: { id: idB, name: b?.name ?? idB.slice(0, 6), number: b?.number ?? null },
      count,
    }
  }

  return NextResponse.json({
    assistPairs: assistPairs.slice(0, 10).map(p =>
      resolvePair(p.assisterId, p.scorerId, p.count, 'assister', 'scorer')
    ),
    stlTovPairs: stlTovPairs.slice(0, 10).map(p =>
      resolvePair(p.stealerId, p.tovId, p.count, 'stealer', 'tovPlayer')
    ),
  })
}
