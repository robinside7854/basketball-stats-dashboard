// 파란날개(팀 대시보드) 하이라이트 로더 — tournaments / games / game_events 기반
// 리그 로더(loader.ts)와 동일한 HighlightClip shape 로 매핑해 플레이어·플레이리스트·필터 UI 전체 재사용
// 그룹핑 단위: 리그의 "라운드(날짜)" ↔ 팀의 "대회(tournament)"

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { isHighlightShot, getClipBounds, SHOT_TYPE_LABEL, shouldShowAssist } from './clip'
import type {
  HighlightClip, HighlightRoundDetail, HighlightPlayerOption,
  PlayerHighlightsData, HighlightQuarterOption, HighlightShotTypeOption,
} from './types'

export type TeamTournamentHighlight = {
  id: string
  name: string
  year: number
  games_count: number
  games_with_video: number
  clips_count: number
  status: 'ready' | 'pending_record' | 'pending_video'
}

export type TournamentHighlightDetail = {
  tournament: { id: string; name: string; year: number }
  detail: HighlightRoundDetail
}

const PAGE = 1000

// 대회 클러치 정의 (2026-07-18 개편) — 4쿼터 이상(연장 포함) · 경기 종료 300초 이내 · 최종 점수차 2포제션(6점) 이내
// 상대팀 선수 이벤트는 미기록이라 러닝 마진 산출 불가 → 최종 점수(games.our_score/opponent_score) 프록시로 근사
//
// 창(window)이 120 → 300초로 늘어난 이유:
//   video_timestamp 는 "영상 시간"이라 게임 클록과 다르다. 작전타임·자유투·데드볼로 시계가 멈추는 동안에도
//   영상 시간은 흐르므로, 실측 결과 Q4 한 쿼터가 영상으로 6~33분(중앙값 ~11분)이었다.
//   기존 120초는 Q4의 10~20%만 덮어 실질 "마지막 30~60초"에 불과했고, 통과 슛이 15개뿐이었다.
//   300초로 확장 시 26개 (파란날개 전 대회 기준).
// 연장(OT)을 포함하는 이유: 기존 quarter===4 조건이 OT 성공슛 7개(2경기)를 전부 탈락시켰다.
const TOURNAMENT_CLUTCH_MIN_QUARTER = 4
const TOURNAMENT_CLUTCH_TIME_WINDOW = 300
const TOURNAMENT_CLUTCH_MARGIN_MAX = 6

type TeamEvtRow = {
  id: string
  game_id: string
  player_id: string | null
  related_player_id: string | null
  type: string
  quarter: number | null
  points: number | null
  video_timestamp: number
}

// 성공 슛 이벤트 페이지네이션 조회 (Supabase 1000행 캡 대비)
// 대회 event_type enum 에는 'and_one' 자체가 없음 (리그와 스키마 다름) — 별도 필터 불필요
async function fetchMadeEvents(
  supabase: SupabaseClient,
  gameIds: string[],
  playerId?: string,
): Promise<TeamEvtRow[] | null> {
  const events: TeamEvtRow[] = []
  for (let pg = 0; ; pg++) {
    let q = supabase
      .from('game_events')
      .select('id, game_id, player_id, related_player_id, type, quarter, result, points, video_timestamp, created_at')
      .in('game_id', gameIds)
      .eq('result', 'made')
      .not('video_timestamp', 'is', null)
      .order('created_at', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (playerId) q = q.eq('player_id', playerId)
    const { data: chunk, error } = await q
    if (error) return null
    if (chunk && chunk.length > 0) events.push(...(chunk as unknown as TeamEvtRow[]))
    if (!chunk || chunk.length < PAGE) break
  }
  return events
}

// 게임별 "최종 쿼터(4쿼터 또는 연장)"의 마지막 성공슛 timestamp — 경기 종료 근사 기준점
// (실제 게임 클록은 미기록이라 마지막 득점 시각으로 근사)
// 연장 경기는 OT 종료가 기준이 된다 — 클러치는 "경기 종료 직전"이 핵심이므로.
function buildGameEndMap(events: TeamEvtRow[]): Record<string, number> {
  // 1) 게임별 최종 쿼터 (4쿼터 이상만 대상 — 연장 포함)
  const lastQuarter: Record<string, number> = {}
  for (const e of events) {
    if (e.quarter === null || e.quarter < TOURNAMENT_CLUTCH_MIN_QUARTER) continue
    const prev = lastQuarter[e.game_id]
    if (prev === undefined || e.quarter > prev) lastQuarter[e.game_id] = e.quarter
  }
  // 2) 그 최종 쿼터 안에서 가장 늦은 timestamp
  const map: Record<string, number> = {}
  for (const e of events) {
    if (e.quarter === null || e.quarter !== lastQuarter[e.game_id]) continue
    const prev = map[e.game_id]
    if (prev === undefined || e.video_timestamp > prev) map[e.game_id] = e.video_timestamp
  }
  return map
}

// 이벤트 → 대회 클러치 판정 (Q4 이상 · 경기 종료 300초 이내 · 최종 점수차 ≤ 6)
function isTournamentClutch(
  ev: TeamEvtRow,
  gameEndTs: number | undefined,
  finalMargin: number | null,
): boolean {
  if (ev.quarter === null || ev.quarter < TOURNAMENT_CLUTCH_MIN_QUARTER) return false
  if (gameEndTs === undefined) return false
  if (gameEndTs - ev.video_timestamp > TOURNAMENT_CLUTCH_TIME_WINDOW) return false
  if (finalMargin === null) return false
  return finalMargin <= TOURNAMENT_CLUTCH_MARGIN_MAX
}

// 대회 목록 — 대회별 클립/영상 상태 요약 (팀 스코프)
export async function loadTeamTournamentHighlights(
  supabase: SupabaseClient,
  teamId: string,
): Promise<TeamTournamentHighlight[]> {
  const { data: tournaments, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, year, created_at')
    .eq('team_id', teamId)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false })
  if (tErr || !tournaments || tournaments.length === 0) return []
  const tRows = tournaments as Array<{ id: string; name: string; year: number }>

  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id, tournament_id, youtube_url')
    .in('tournament_id', tRows.map(t => t.id))
  if (gErr) return []
  const gameRows = (games ?? []) as Array<{ id: string; tournament_id: string; youtube_url: string | null }>

  const events = gameRows.length > 0 ? await fetchMadeEvents(supabase, gameRows.map(g => g.id)) : []
  const gameToClips: Record<string, number> = {}
  for (const e of events ?? []) {
    if (!isHighlightShot(e.type)) continue
    gameToClips[e.game_id] = (gameToClips[e.game_id] ?? 0) + 1
  }

  return tRows.map(t => {
    const gs = gameRows.filter(g => g.tournament_id === t.id)
    const videoCount = gs.filter(g => !!g.youtube_url).length
    const clipsSum = gs.reduce((acc, g) => acc + (gameToClips[g.id] ?? 0), 0)
    const status: TeamTournamentHighlight['status'] =
      clipsSum > 0 ? 'ready'
      : videoCount > 0 ? 'pending_record'
      : 'pending_video'
    return {
      id: t.id,
      name: t.name,
      year: t.year,
      games_count: gs.length,
      games_with_video: videoCount,
      clips_count: clipsSum,
      status,
    }
  })
}

// 대회 상세 — 해당 대회 모든 경기의 클립 + 선수 필터 옵션
// teamLabel/teamColor: 우리 팀 표기 (청년부/장년부 · 팀 액센트 색)
export async function loadTournamentHighlightDetail(
  supabase: SupabaseClient,
  teamId: string,
  tournamentId: string,
  teamLabel: string,
  teamColor: string,
): Promise<TournamentHighlightDetail | null> {
  // 1. 대회 (팀 스코프 검증)
  const { data: tournament, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, year, team_id')
    .eq('id', tournamentId)
    .eq('team_id', teamId)
    .maybeSingle()
  if (tErr || !tournament) return null
  const t = tournament as { id: string; name: string; year: number }
  const empty: TournamentHighlightDetail = {
    tournament: { id: t.id, name: t.name, year: t.year },
    detail: { date: '', clips: [], players: [], teams: [] },
  }

  // 2. 영상 있는 경기만 (our/opponent_score 로 최종 마진 → 클러치 프록시)
  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id, date, opponent, youtube_url, our_score, opponent_score')
    .eq('tournament_id', tournamentId)
    .not('youtube_url', 'is', null)
    .order('date', { ascending: true })
  if (gErr) return empty
  const gameRows = (games ?? []) as Array<{ id: string; date: string; opponent: string; youtube_url: string; our_score: number | null; opponent_score: number | null }>
  if (gameRows.length === 0) return empty
  const gameMap: Record<string, typeof gameRows[number]> = {}
  for (const g of gameRows) gameMap[g.id] = g

  // 3. 성공 슛 이벤트
  const events = await fetchMadeEvents(supabase, gameRows.map(g => g.id))
  if (!events) return empty

  // 3-b. 게임별 최종 쿼터(OT 포함) 마지막 timestamp + 최종 마진 사전계산 (클러치 판정)
  const gameEndMap = buildGameEndMap(events)
  const gameFinalMargin: Record<string, number | null> = {}
  for (const g of gameRows) {
    gameFinalMargin[g.id] = (g.our_score !== null && g.opponent_score !== null)
      ? Math.abs(g.our_score - g.opponent_score)
      : null
  }

  // 4. 선수 정보 (슛 + 어시스트)
  const playerIds = Array.from(new Set([
    ...events.map(e => e.player_id).filter((x): x is string => !!x),
    ...events.map(e => e.related_player_id).filter((x): x is string => !!x),
  ]))
  const playerMap: Record<string, { id: string; name: string; number: number | null; photo_url: string | null }> = {}
  if (playerIds.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('id, name, number, photo_url')
      .in('id', playerIds)
    for (const p of (players ?? []) as Array<{ id: string; name: string; number: number | null; photo_url: string | null }>) {
      playerMap[p.id] = p
    }
  }

  // 5. 클립 조립
  const clips: HighlightClip[] = []
  const playerCounts: Record<string, HighlightPlayerOption> = {}
  for (const ev of events) {
    if (!isHighlightShot(ev.type)) continue
    const game = gameMap[ev.game_id]
    if (!game) continue
    const videoId = extractYouTubeId(game.youtube_url)
    if (!videoId) continue

    const player = ev.player_id ? playerMap[ev.player_id] : null
    const { start, end } = getClipBounds(ev.type, ev.video_timestamp)
    const assistPlayer = (shouldShowAssist(ev.type) && ev.related_player_id)
      ? playerMap[ev.related_player_id] ?? null
      : null

    clips.push({
      event_id: ev.id,
      video_url: game.youtube_url,
      video_id: videoId,
      video_timestamp: ev.video_timestamp,
      clip_start: start,
      clip_end: end,
      player_id: ev.player_id,
      player_name: player?.name ?? '알 수 없음',
      player_number: player?.number ?? null,
      player_photo: player?.photo_url ?? null,
      team_id: game.opponent,   // 상대 필터 키 — "vs 상대명" 칩 (같은 상대와 복수 경기면 합산)
      team_name: teamLabel,
      team_color: teamColor,
      shot_type: ev.type,
      points: ev.points ?? 0,
      game_id: game.id,
      home_team_name: teamLabel,
      away_team_name: game.opponent,
      game_date: game.date,
      opponent_name: game.opponent,
      assist_player_id: assistPlayer?.id ?? null,
      assist_player_name: assistPlayer?.name ?? null,
      assist_player_number: assistPlayer?.number ?? null,
      is_clutch: isTournamentClutch(ev, gameEndMap[ev.game_id], gameFinalMargin[ev.game_id] ?? null),
    })

    if (ev.player_id && player) {
      const k = ev.player_id
      if (!playerCounts[k]) playerCounts[k] = { id: k, name: player.name, number: player.number, count: 0 }
      playerCounts[k].count++
    }
  }

  // 경기 날짜 → 경기 → 타임스탬프 순 (대회 내 경기 순서대로 연속재생)
  clips.sort((a, b) => {
    const da = a.game_date ?? ''
    const db = b.game_date ?? ''
    if (da !== db) return da.localeCompare(db)
    if (a.game_id !== b.game_id) return a.game_id.localeCompare(b.game_id)
    return a.video_timestamp - b.video_timestamp
  })

  // 상대별 필터 옵션 — 경기 날짜 순 유지 (color 빈 값 → 필터바에서 색 점 미표시)
  const opponentCounts: Record<string, number> = {}
  for (const c of clips) {
    if (c.team_id) opponentCounts[c.team_id] = (opponentCounts[c.team_id] ?? 0) + 1
  }
  const seenOpponents = new Set<string>()
  const opponents = gameRows
    .filter(g => {
      if (seenOpponents.has(g.opponent) || !(opponentCounts[g.opponent] > 0)) return false
      seenOpponents.add(g.opponent)
      return true
    })
    .map(g => ({ id: g.opponent, name: `vs ${g.opponent}`, color: '', count: opponentCounts[g.opponent] }))

  return {
    tournament: { id: t.id, name: t.name, year: t.year },
    detail: {
      date: '',
      clips,
      players: Object.values(playerCounts).sort((a, b) => b.count - a.count),
      teams: opponents,   // "vs 상대명" 칩 (상대가 1팀뿐이어도 노출 — 대회 맥락 표시)
    },
  }
}

// 선수별 하이라이트 — 전체 대회 통틀어 성공 슛 클립 + 대회/유형 필터 옵션
// quarter_id 필드에 tournament_id 를 담아 PlayerHighlightsBrowser 의 그룹 필터 재사용
export async function loadTeamPlayerHighlights(
  supabase: SupabaseClient,
  teamId: string,
  playerId: string,
  teamLabel: string,
  teamColor: string,
): Promise<PlayerHighlightsData | null> {
  // 1. 선수 (팀 스코프 검증)
  const { data: playerRow, error: pErr } = await supabase
    .from('players')
    .select('id, name, number, photo_url, team_id')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  if (pErr || !playerRow) return null
  const player = {
    id: playerRow.id as string,
    name: playerRow.name as string,
    number: (playerRow.number ?? null) as number | null,
    photo_url: (playerRow.photo_url ?? null) as string | null,
  }
  const emptyData: PlayerHighlightsData = { player, clips: [], quarters: [], shotTypes: [] }

  // 2. 팀의 대회 + 영상 있는 경기
  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('id, name, year')
    .eq('team_id', teamId)
  const tRows = (tournaments ?? []) as Array<{ id: string; name: string; year: number }>
  if (tRows.length === 0) return emptyData
  const tournamentMap: Record<string, typeof tRows[number]> = {}
  for (const t of tRows) tournamentMap[t.id] = t

  const { data: games, error: gErr } = await supabase
    .from('games')
    .select('id, tournament_id, date, opponent, youtube_url, our_score, opponent_score')
    .in('tournament_id', tRows.map(t => t.id))
    .not('youtube_url', 'is', null)
  if (gErr) return emptyData
  const gameRows = (games ?? []) as Array<{ id: string; tournament_id: string; date: string; opponent: string; youtube_url: string; our_score: number | null; opponent_score: number | null }>
  if (gameRows.length === 0) return emptyData
  const gameMap: Record<string, typeof gameRows[number]> = {}
  for (const g of gameRows) gameMap[g.id] = g

  // 3. 해당 선수의 성공 슛 이벤트
  const events = await fetchMadeEvents(supabase, gameRows.map(g => g.id), playerId)
  if (!events) return emptyData

  // 3-a. 클러치 판정용 사전계산 — 선수 필터된 events 만으로는 종료 timestamp 근사가 부정확할 수 있으니
  //      해당 게임들의 "모든" 이벤트로 최종 쿼터 종료 timestamp 를 잡아 정확도 확보
  const allEvents = await fetchMadeEvents(supabase, gameRows.map(g => g.id))
  const gameEndMap = buildGameEndMap(allEvents ?? events)
  const gameFinalMargin: Record<string, number | null> = {}
  for (const g of gameRows) {
    gameFinalMargin[g.id] = (g.our_score !== null && g.opponent_score !== null)
      ? Math.abs(g.our_score - g.opponent_score)
      : null
  }

  // 3-b. 어시스트 선수 정보
  const assistPlayerIds = Array.from(new Set(
    events
      .filter(e => shouldShowAssist(e.type))
      .map(e => e.related_player_id)
      .filter((x): x is string => !!x),
  ))
  const assistPlayerMap: Record<string, { id: string; name: string; number: number | null }> = {}
  if (assistPlayerIds.length > 0) {
    const { data: assistPlayers } = await supabase
      .from('players')
      .select('id, name, number')
      .in('id', assistPlayerIds)
    for (const p of (assistPlayers ?? []) as Array<{ id: string; name: string; number: number | null }>) {
      assistPlayerMap[p.id] = p
    }
  }

  // 4. 클립 조립
  const clips: HighlightClip[] = []
  const tournamentCount: Record<string, number> = {}
  const shotTypeCount: Record<string, number> = {}

  for (const ev of events) {
    if (!isHighlightShot(ev.type)) continue
    const game = gameMap[ev.game_id]
    if (!game) continue
    const videoId = extractYouTubeId(game.youtube_url)
    if (!videoId) continue

    const { start, end } = getClipBounds(ev.type, ev.video_timestamp)
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
      team_id: null,
      team_name: teamLabel,
      team_color: teamColor,
      shot_type: ev.type,
      points: ev.points ?? 0,
      game_id: game.id,
      home_team_name: teamLabel,
      away_team_name: game.opponent,
      game_date: game.date,
      quarter_id: game.tournament_id,   // 대회 필터 키 (분기 대신 대회)
      opponent_name: game.opponent,
      assist_player_id: assistPlayer?.id ?? null,
      assist_player_name: assistPlayer?.name ?? null,
      assist_player_number: assistPlayer?.number ?? null,
      is_clutch: isTournamentClutch(ev, gameEndMap[ev.game_id], gameFinalMargin[ev.game_id] ?? null),
    })

    tournamentCount[game.tournament_id] = (tournamentCount[game.tournament_id] ?? 0) + 1
    shotTypeCount[ev.type] = (shotTypeCount[ev.type] ?? 0) + 1
  }

  // 최근 경기 우선 → 같은 경기 내 타임스탬프 순 (리그 선수별 페이지와 동일)
  clips.sort((a, b) => {
    const da = a.game_date ?? ''
    const db = b.game_date ?? ''
    if (da !== db) return db.localeCompare(da)
    if (a.game_id !== b.game_id) return a.game_id.localeCompare(b.game_id)
    return a.video_timestamp - b.video_timestamp
  })

  // 대회 필터 옵션 (HighlightQuarterOption shape 재사용 — label 에 대회명)
  const quarters: HighlightQuarterOption[] = Object.entries(tournamentCount)
    .map(([id, count]) => {
      const t = tournamentMap[id]
      return { id, year: t?.year ?? 0, quarter: 0, label: t?.name ?? '대회', count }
    })
    .sort((a, b) => (b.year - a.year) || b.count - a.count)

  const shotTypes: HighlightShotTypeOption[] = Object.entries(shotTypeCount)
    .map(([type, count]) => ({ type, label: SHOT_TYPE_LABEL[type] ?? type, count }))
    .sort((a, b) => b.count - a.count)

  return { player, clips, quarters, shotTypes }
}
