// 하이라이트 데이터 로더 — API route 와 Server Component 양쪽에서 재사용
// unstable_cache 는 상위 페이지에서 씌운다 (여기서는 순수 함수만 노출)

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { isHighlightShot, getClipBounds, SHOT_TYPE_LABEL, shouldShowAssist } from './clip'
import type {
  HighlightRound, HighlightRoundDetail, HighlightClip,
  HighlightPlayerOption, HighlightTeamOption,
  PlayerHighlightsData, HighlightQuarterOption, HighlightShotTypeOption,
} from './types'

// 최근 라운드 목록 — 모든 라운드 노출 (영상/기록 여부는 status 로 구분)
// 미리 필터링 안 함 · UI 에서 상태별로 시각화
export async function loadRecentRounds(supabase: SupabaseClient, leagueId: string, limit = 24): Promise<HighlightRound[]> {
  // 1. 리그 게임 전체 (is_started=true · 시작된 경기만 · 친선 제외 안 함 · 라운드 성격상 모두 노출)
  const { data: games, error: gErr } = await supabase
    .from('league_games')
    .select(`
      id, date, youtube_url,
      home_team:league_teams!league_games_home_team_id_fkey(name),
      away_team:league_teams!league_games_away_team_id_fkey(name)
    `)
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .not('date', 'is', null)
    .order('date', { ascending: false })
  if (gErr) return []
  const rows = (games ?? []) as unknown as Array<{
    id: string
    date: string
    youtube_url: string | null
    home_team: { name: string } | null
    away_team: { name: string } | null
  }>
  if (rows.length === 0) return []

  const dateToGames: Record<string, typeof rows> = {}
  for (const g of rows) {
    if (!g.date) continue
    ;(dateToGames[g.date] ||= []).push(g)
  }
  const dates = Object.keys(dateToGames).sort((a, b) => b.localeCompare(a)).slice(0, limit)
  if (dates.length === 0) return []

  const gameIds = dates.flatMap(d => dateToGames[d].map(g => g.id))
  // 2. 각 게임의 성공 슛 카운트 — video_timestamp 필수 (재생 가능 클립)
  // ⚠ Supabase JS 기본 1000행 캡 → 페이지네이션 필수
  //    24 라운드 x ~9게임 x ~13클립 ≈ 3000+ · 반드시 chunk 로 조회
  type EvtRow = { league_game_id: string; type: string; video_timestamp: number | null }
  const events: EvtRow[] = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk, error: eErr } = await supabase
      .from('league_game_events')
      .select('league_game_id, type, result, video_timestamp')
      .in('league_game_id', gameIds)
      .eq('result', 'made')
      .not('video_timestamp', 'is', null)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (eErr) return []
    if (chunk && chunk.length > 0) events.push(...(chunk as EvtRow[]))
    if (!chunk || chunk.length < PAGE) break
  }

  const gameToClipCount: Record<string, number> = {}
  for (const e of events) {
    if (!isHighlightShot(e.type)) continue
    gameToClipCount[e.league_game_id] = (gameToClipCount[e.league_game_id] ?? 0) + 1
  }

  const result: HighlightRound[] = dates.map(date => {
    const gamesOfDate = dateToGames[date]
    const teamSet = new Set<string>()
    let clipsSum = 0
    let videoCount = 0
    for (const g of gamesOfDate) {
      if (g.home_team?.name) teamSet.add(g.home_team.name)
      if (g.away_team?.name) teamSet.add(g.away_team.name)
      if (g.youtube_url) videoCount++
      clipsSum += gameToClipCount[g.id] ?? 0
    }
    const status: HighlightRound['status'] =
      clipsSum > 0 ? 'ready'
      : videoCount > 0 ? 'pending_record'
      : 'pending_video'
    return {
      date,
      games_count: gamesOfDate.length,
      games_with_video: videoCount,
      clips_count: clipsSum,
      team_names: Array.from(teamSet),
      status,
    }
  })
  // 모든 라운드 노출 (재생 안 되는 라운드도 상태 배지와 함께 표시)
  return result
}

// 라운드 상세 — 해당 날짜의 모든 하이라이트 클립 + 필터 옵션 (선수/팀)
export async function loadRoundDetail(supabase: SupabaseClient, leagueId: string, date: string): Promise<HighlightRoundDetail> {
  const empty: HighlightRoundDetail = { date, clips: [], players: [], teams: [] }

  // 1. 해당 날짜의 게임 (영상 있는 것만)
  const { data: games, error: gErr } = await supabase
    .from('league_games')
    .select(`
      id, youtube_url, youtube_start_offset,
      home_team_id, away_team_id,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)
    .eq('date', date)
    .not('youtube_url', 'is', null)
    .order('slot_num', { ascending: true })
  if (gErr) return empty
  const gameRows = (games ?? []) as unknown as Array<{
    id: string
    youtube_url: string
    youtube_start_offset: number | null
    home_team_id: string | null
    away_team_id: string | null
    home_team: { id: string; name: string; color: string } | null
    away_team: { id: string; name: string; color: string } | null
  }>
  if (gameRows.length === 0) return empty

  const gameMap: Record<string, typeof gameRows[number]> = {}
  for (const g of gameRows) gameMap[g.id] = g
  const gameIds = gameRows.map(g => g.id)

  // 2. 이벤트 (성공 + 하이라이트 슛 유형만, timestamp 있음)
  // 페이지네이션 (Supabase 기본 1000행 캡 대비 · 한 라운드 클립이 많을 수 있음)
  type DetailEvtRow = {
    id: string
    league_game_id: string
    league_player_id: string | null
    team_id: string | null
    related_player_id: string | null
    type: string
    points: number | null
    video_timestamp: number
  }
  const eventRows: DetailEvtRow[] = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk, error: eErr } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, team_id, related_player_id, type, result, points, video_timestamp, created_at')
      .in('league_game_id', gameIds)
      .eq('result', 'made')
      .not('video_timestamp', 'is', null)
      .order('created_at', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (eErr) return empty
    if (chunk && chunk.length > 0) eventRows.push(...(chunk as DetailEvtRow[]))
    if (!chunk || chunk.length < PAGE) break
  }

  // 3. 선수 정보 (한 방에) — 슛 선수 + 어시스트 선수 모두 포함
  const playerIds = Array.from(new Set([
    ...eventRows.map(e => e.league_player_id).filter((x): x is string => !!x),
    ...eventRows.map(e => e.related_player_id).filter((x): x is string => !!x),
  ]))
  const playerMap: Record<string, { id: string; name: string; number: number | null; photo_url: string | null }> = {}
  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from('league_players')
      .select('id, name, number, photo_url')
      .in('id', playerIds)
    for (const p of (players ?? []) as Array<{ id: string; name: string; number: number | null; photo_url: string | null }>) {
      playerMap[p.id] = p
    }
  }

  // 4. 팀 정보 (team_id null 인 경우 대비 — game 의 홈/어웨이 중 매칭)
  const clips: HighlightClip[] = []
  const playerCounts: Record<string, HighlightPlayerOption> = {}
  const teamCounts: Record<string, HighlightTeamOption> = {}

  for (const ev of eventRows) {
    if (!isHighlightShot(ev.type)) continue
    const game = gameMap[ev.league_game_id]
    if (!game) continue
    const videoId = extractYouTubeId(game.youtube_url)
    if (!videoId) continue

    // 팀 정보: event 에 저장된 team_id 우선, 없으면 홈/어웨이 미상은 홈으로
    let team = ev.team_id === game.home_team?.id ? game.home_team
      : ev.team_id === game.away_team?.id ? game.away_team
      : null
    if (!team) team = game.home_team ?? game.away_team
    if (!team) continue

    const player = ev.league_player_id ? playerMap[ev.league_player_id] : null
    const { start, end } = getClipBounds(ev.type, ev.video_timestamp)

    // 어시스트 매핑 — 야투(3점/2점)에만 유의미. 자유투/앤드원은 파울 상황이라 어시스트 개념 없음
    const assistPlayer = (shouldShowAssist(ev.type) && ev.related_player_id)
      ? playerMap[ev.related_player_id] ?? null
      : null

    const clip: HighlightClip = {
      event_id: ev.id,
      video_url: game.youtube_url,
      video_id: videoId,
      video_timestamp: ev.video_timestamp,
      clip_start: start,
      clip_end: end,
      player_id: ev.league_player_id,
      player_name: player?.name ?? '알 수 없음',
      player_number: player?.number ?? null,
      player_photo: player?.photo_url ?? null,
      team_id: team.id,
      team_name: team.name,
      team_color: team.color,
      shot_type: ev.type,
      points: ev.points ?? 0,
      game_id: game.id,
      home_team_name: game.home_team?.name ?? '',
      away_team_name: game.away_team?.name ?? '',
      assist_player_id: assistPlayer?.id ?? null,
      assist_player_name: assistPlayer?.name ?? null,
      assist_player_number: assistPlayer?.number ?? null,
    }
    clips.push(clip)

    if (ev.league_player_id && player) {
      const k = ev.league_player_id
      if (!playerCounts[k]) playerCounts[k] = { id: k, name: player.name, number: player.number, count: 0 }
      playerCounts[k].count++
    }
    if (team.id) {
      const tk = team.id
      if (!teamCounts[tk]) teamCounts[tk] = { id: tk, name: team.name, color: team.color, count: 0 }
      teamCounts[tk].count++
    }
  }

  // 정렬: 게임 순서 → 타임스탬프 순
  clips.sort((a, b) => {
    if (a.game_id !== b.game_id) return a.game_id.localeCompare(b.game_id)
    return a.video_timestamp - b.video_timestamp
  })

  return {
    date,
    clips,
    players: Object.values(playerCounts).sort((a, b) => b.count - a.count),
    teams: Object.values(teamCounts).sort((a, b) => b.count - a.count),
  }
}

// ── 선수별 하이라이트 ────────────────────────────────────────────
// 한 선수의 전체 성공 슛 클립 (라운드 무관) + 분기/유형별 카운트
export async function loadPlayerHighlights(
  supabase: SupabaseClient,
  leagueId: string,
  playerId: string,
): Promise<PlayerHighlightsData | null> {
  // 1. 선수 정보 (league scope 확인)
  const { data: playerRow, error: pErr } = await supabase
    .from('league_players')
    .select('id, name, number, photo_url, league_id')
    .eq('id', playerId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (pErr || !playerRow) return null
  const player = {
    id: playerRow.id as string,
    name: playerRow.name as string,
    number: (playerRow.number ?? null) as number | null,
    photo_url: (playerRow.photo_url ?? null) as string | null,
  }

  // 2. 리그의 영상 있는 게임 목록 (id, date, quarter_id, home/away 팀)
  const { data: gamesRaw, error: gErr } = await supabase
    .from('league_games')
    .select(`
      id, date, quarter_id, youtube_url, youtube_start_offset,
      home_team_id, away_team_id,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)
    .not('youtube_url', 'is', null)
    .not('date', 'is', null)
  if (gErr) return { player, clips: [], quarters: [], shotTypes: [] }
  const gameRows = (gamesRaw ?? []) as unknown as Array<{
    id: string
    date: string
    quarter_id: string | null
    youtube_url: string
    youtube_start_offset: number | null
    home_team_id: string | null
    away_team_id: string | null
    home_team: { id: string; name: string; color: string } | null
    away_team: { id: string; name: string; color: string } | null
  }>
  if (gameRows.length === 0) return { player, clips: [], quarters: [], shotTypes: [] }

  const gameMap: Record<string, typeof gameRows[number]> = {}
  for (const g of gameRows) gameMap[g.id] = g
  const gameIds = gameRows.map(g => g.id)

  // 3. 해당 선수의 성공 슛 이벤트 (video_timestamp 필수) — 페이지네이션 필수
  type EvtRow = {
    id: string
    league_game_id: string
    team_id: string | null
    related_player_id: string | null
    type: string
    points: number | null
    video_timestamp: number
  }
  const events: EvtRow[] = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk, error: eErr } = await supabase
      .from('league_game_events')
      .select('id, league_game_id, team_id, related_player_id, type, result, points, video_timestamp, created_at')
      .eq('league_player_id', playerId)
      .in('league_game_id', gameIds)
      .eq('result', 'made')
      .not('video_timestamp', 'is', null)
      .order('created_at', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (eErr) return { player, clips: [], quarters: [], shotTypes: [] }
    if (chunk && chunk.length > 0) events.push(...(chunk as EvtRow[]))
    if (!chunk || chunk.length < PAGE) break
  }

  // 3-b. 어시스트 선수 정보 (related_player_id 매핑) — 야투에만 유의미
  const assistPlayerIds = Array.from(new Set(
    events
      .filter(e => shouldShowAssist(e.type))
      .map(e => e.related_player_id)
      .filter((x): x is string => !!x),
  ))
  const assistPlayerMap: Record<string, { id: string; name: string; number: number | null }> = {}
  if (assistPlayerIds.length > 0) {
    const { data: assistPlayers } = await supabase
      .from('league_players')
      .select('id, name, number')
      .in('id', assistPlayerIds)
    for (const p of (assistPlayers ?? []) as Array<{ id: string; name: string; number: number | null }>) {
      assistPlayerMap[p.id] = p
    }
  }

  // 4. league_quarters (분기 옵션 라벨용)
  const { data: quartersRaw } = await supabase
    .from('league_quarters')
    .select('id, year, quarter')
    .eq('league_id', leagueId)
    .order('year', { ascending: false })
    .order('quarter', { ascending: false })
  type QRow = { id: string; year: number; quarter: number }
  const quarterMap: Record<string, QRow> = {}
  for (const q of (quartersRaw ?? []) as QRow[]) quarterMap[q.id] = q

  // 5. 클립 생성 (게임/팀 컨텍스트 결합)
  const clips: HighlightClip[] = []
  const quarterCount: Record<string, number> = {}
  const shotTypeCount: Record<string, number> = {}

  for (const ev of events) {
    if (!isHighlightShot(ev.type)) continue
    const game = gameMap[ev.league_game_id]
    if (!game) continue
    const videoId = extractYouTubeId(game.youtube_url)
    if (!videoId) continue

    // 팀 결정: event.team_id 우선 → 매칭 실패 시 홈/어웨이 중 아무거나 (라벨용)
    let team = ev.team_id === game.home_team?.id ? game.home_team
      : ev.team_id === game.away_team?.id ? game.away_team
      : null
    if (!team) team = game.home_team ?? game.away_team
    if (!team) continue

    const { start, end } = getClipBounds(ev.type, ev.video_timestamp)

    // 상대팀 이름 — 선수 소속(team)이 아닌 쪽
    const homeName = game.home_team?.name ?? ''
    const awayName = game.away_team?.name ?? ''
    const opponentName = team.id === game.home_team?.id ? awayName
      : team.id === game.away_team?.id ? homeName
      : ''

    // 어시스트 매핑 (야투 성공에만 유의미, 자유투/앤드원은 항상 null)
    const assistPlayer = (shouldShowAssist(ev.type) && ev.related_player_id)
      ? assistPlayerMap[ev.related_player_id] ?? null
      : null

    clips.push({
      event_id: ev.id,
      video_url: game.youtube_url,
      video_id: videoId,
      video_timestamp: ev.video_timestamp,
      clip_start: start,
      clip_end: end,
      player_id: player.id,
      player_name: player.name,
      player_number: player.number,
      player_photo: player.photo_url,
      team_id: team.id,
      team_name: team.name,
      team_color: team.color,
      shot_type: ev.type,
      points: ev.points ?? 0,
      game_id: game.id,
      home_team_name: homeName,
      away_team_name: awayName,
      game_date: game.date,
      quarter_id: game.quarter_id,
      opponent_name: opponentName,
      assist_player_id: assistPlayer?.id ?? null,
      assist_player_name: assistPlayer?.name ?? null,
      assist_player_number: assistPlayer?.number ?? null,
    })

    if (game.quarter_id && quarterMap[game.quarter_id]) {
      quarterCount[game.quarter_id] = (quarterCount[game.quarter_id] ?? 0) + 1
    }
    shotTypeCount[ev.type] = (shotTypeCount[ev.type] ?? 0) + 1
  }

  // 정렬: game_date desc → 같은 경기 내 timestamp asc
  clips.sort((a, b) => {
    const da = a.game_date ?? ''
    const db = b.game_date ?? ''
    if (da !== db) return db.localeCompare(da)
    if (a.game_id !== b.game_id) return a.game_id.localeCompare(b.game_id)
    return a.video_timestamp - b.video_timestamp
  })

  // 필터 옵션 (카운트 > 0 만)
  const quarters: HighlightQuarterOption[] = Object.entries(quarterCount)
    .map(([id, count]) => {
      const q = quarterMap[id]
      return { id, year: q.year, quarter: q.quarter, label: `${String(q.year).slice(2)}.${q.quarter}Q`, count }
    })
    .sort((a, b) => (b.year - a.year) || (b.quarter - a.quarter))

  const shotTypes: HighlightShotTypeOption[] = Object.entries(shotTypeCount)
    .map(([type, count]) => ({ type, label: SHOT_TYPE_LABEL[type] ?? type, count }))
    .sort((a, b) => b.count - a.count)

  return { player, clips, quarters, shotTypes }
}
