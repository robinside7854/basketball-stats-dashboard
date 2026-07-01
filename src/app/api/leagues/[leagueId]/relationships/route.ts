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

  // 선수 메타
  const { data: players } = await supabase
    .from('league_players')
    .select('id, name, number')
    .eq('league_id', leagueId)
  const playerMap = new Map((players ?? []).map((p: { id: string; name: string; number: string | null }) => [p.id, p]))

  // ── 어시스트 쿼리 (페이지네이션): made + related_player_id 있는 슛만 ──
  // PostgREST 는 서버측 db-max-rows(=1000) 가 클라이언트 .limit() 보다 우선하기 때문에
  // .limit(200000) 만으로는 전체를 가져올 수 없음 → .range() 로 청크 반복.
  const PAGE = 1000
  const assistEvents: { league_player_id: string | null; related_player_id: string | null; type: string }[] = []
  for (let p = 0; ; p++) {
    const { data: chunk, error: eErr } = await supabase
      .from('league_game_events')
      .select('league_player_id, related_player_id, type')
      .in('league_game_id', gameIds)
      .in('type', [...FIELD_SHOT_TYPES])
      .eq('result', 'made')
      .not('related_player_id', 'is', null)
      .order('id', { ascending: true })   // 페이지 간 중복/누락 방지
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })
    if (!chunk || chunk.length === 0) break
    assistEvents.push(...chunk)
    if (chunk.length < PAGE) break
  }

  const assistMap: Record<string, Record<string, number>> = {}
  for (const e of (assistEvents ?? [])) {
    if (!e.related_player_id || !e.league_player_id) continue
    const aid = e.related_player_id   // 어시스터
    const sid = e.league_player_id    // 득점자
    if (!assistMap[aid]) assistMap[aid] = {}
    assistMap[aid][sid] = (assistMap[aid][sid] ?? 0) + 1
  }

  const assistPairs: { assisterId: string; scorerId: string; count: number }[] = []
  for (const [aid, scorers] of Object.entries(assistMap)) {
    for (const [sid, count] of Object.entries(scorers)) {
      assistPairs.push({ assisterId: aid, scorerId: sid, count })
    }
  }
  assistPairs.sort((a, b) => b.count - a.count)

  // ── 스틸-TOV 쿼리 (페이지네이션): steal + turnover 이벤트만 ──────────
  // 어시스트 쿼리와 동일 이유 — 서버측 상한 우회를 위해 청크 반복.
  const stlTovEvents: { type: string; league_player_id: string | null; related_player_id: string | null; team_id: string | null; league_game_id: string | null; video_timestamp: number | null }[] = []
  for (let p = 0; ; p++) {
    const { data: chunk, error: eErr } = await supabase
      .from('league_game_events')
      .select('type, league_player_id, related_player_id, team_id, league_game_id, video_timestamp')
      .in('league_game_id', gameIds)
      .in('type', ['steal', 'turnover'])
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })
    if (!chunk || chunk.length === 0) break
    stlTovEvents.push(...chunk)
    if (chunk.length < PAGE) break
  }

  const stlEvents  = (stlTovEvents ?? []).filter(e => e.type === 'steal')
  const tovEvents  = (stlTovEvents ?? []).filter(e => e.type === 'turnover')

  // gameId → TOV 이벤트 목록 인덱스 (타임스탬프 범위 검색용)
  const tovByGame = new Map<string, { playerId: string; teamId: string; ts: number }[]>()
  for (const t of tovEvents) {
    if (!t.league_game_id || t.video_timestamp == null || !t.league_player_id) continue
    if (!tovByGame.has(t.league_game_id)) tovByGame.set(t.league_game_id, [])
    tovByGame.get(t.league_game_id)!.push({
      playerId: t.league_player_id,
      teamId: t.team_id ?? '',
      ts: t.video_timestamp,
    })
  }

  const STL_TOV_WINDOW = 2  // 초 단위 허용 오차

  const stlMap: Record<string, Record<string, number>> = {}
  for (const s of stlEvents) {
    if (!s.league_player_id) continue
    const stealerId = s.league_player_id

    let tovPlayerId: string | null = null

    if (s.related_player_id) {
      // 신규 데이터: 명시적 링크 사용
      tovPlayerId = s.related_player_id
    } else if (s.league_game_id && s.video_timestamp != null) {
      // 기존 데이터: 같은 게임 + 2초 이내 + 상대팀 TOV 이벤트 매칭
      const candidates = tovByGame.get(s.league_game_id) ?? []
      const match = candidates.find(
        c => c.teamId !== (s.team_id ?? '') &&
             Math.abs(c.ts - s.video_timestamp!) <= STL_TOV_WINDOW
      )
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
