// 하이라이트 데이터 로더 — API route 와 Server Component 양쪽에서 재사용
// unstable_cache 는 상위 페이지에서 씌운다 (여기서는 순수 함수만 노출)

import type { SupabaseClient } from '@supabase/supabase-js'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { isHighlightShot, getClipBounds, SHOT_TYPE_LABEL, shouldShowAssist } from './clip'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
// 러닝 스코어(홈/원정 누적 점수) 계산 — 저장된 points 컬럼이 아니라 리그 채점 룰로 재계산한다.
// 이유: 클러치 판정은 게임 내 이벤트를 순서대로 훑으며 누적하는 구조라, 값 하나가 룰과
// 어긋나면 그 뒤 모든 이벤트의 margin 이 함께 틀어진다. leagueStats.ts 등 다른 화면은 이미
// scorePoints 로 채점하므로, 여기서도 저장값을 그대로 쓰면 관리자가 룰을 고친 직후
// 하이라이트 화면만 옛 값으로 클러치를 판정하는 불일치가 생긴다.
import { scorePoints, fetchScoringRules } from '@/lib/stats/scoring'
import { resolveTeamId } from '@/lib/league/teamScope'
import type {
  HighlightRound, HighlightRoundDetail, HighlightClip,
  HighlightPlayerOption, HighlightTeamOption,
  PlayerHighlightsData, HighlightQuarterOption, HighlightShotTypeOption,
} from './types'

// 클러치샷 정의 (2026-07-15 개편):
//   · 시간: 각 게임의 "마지막 이벤트" (무엇이든) 로부터 -120초 이내
//     · 이전 정의는 "마지막 득점" 기준이었으나 득점 공백 구간의 기준이 모호 → 완화
//   · 슛 직전 점수차 ≤ 6점 (2포제션 이내)
//   · 슛 직후 점수차 ≤ 3점 (이 슛으로 1포제션 이내로 좁혀진 결정타)
//     · 예: 6점차에서 2점 → 4점차는 미인정 (여전히 2포제션)
//     · 예: 6점차에서 3점(3점슛/앤드원) → 3점차는 인정 (1포제션)
// 주의: clutchStats.ts (클러치 스탯 분할) 는 별도 concept 로 기존 정의 유지.
const CLUTCH_TIME_WINDOW_SECONDS = 120
const CLUTCH_MARGIN_BEFORE_MAX = 6   // 슛 직전 (2포제션)
const CLUTCH_MARGIN_AFTER_MAX = 3    // 슛 직후 (1포제션)

// 클러치샷 종류 판정 (2026-07-18)
//   · 슛한 팀 관점의 own/opp 스코어 (before/after) 로 판정
//   · tie      · own_before < opp_before  AND own_after === opp_after
//   · reversal · own_before <= opp_before AND own_after > opp_after (지고 있거나 동점 → 앞섬)
//   · dagger   · own_before > opp_before  AND (own_after - opp_after) > (own_before - opp_before)
//   · chase    · own_before < opp_before  AND own_after < opp_after (여전히 지지만 격차 축소)
//   · winning  · reversal + 이 슛으로 스코어 확정(=이후 득점 없음) + 우리 팀 승리 — 별도 업그레이드
type ClutchKind = 'tie' | 'chase' | 'reversal' | 'dagger'
function classifyClutchKind(
  hb: number, ab: number,
  ha: number, aa: number,
  isHomeShooter: boolean,
): ClutchKind {
  const ownB = isHomeShooter ? hb : ab
  const oppB = isHomeShooter ? ab : hb
  const ownA = isHomeShooter ? ha : aa
  const oppA = isHomeShooter ? aa : ha
  const diffB = ownB - oppB
  const diffA = ownA - oppA
  if (diffB < 0 && diffA === 0) return 'tie'
  if (diffB <= 0 && diffA > 0)  return 'reversal'
  if (diffB > 0  && diffA > diffB) return 'dagger'
  return 'chase'  // 사실상 남은 케이스 = 여전히 지고 있으나 좁힘 (혹은 fallback)
}

// 게임별 "마지막 이벤트" timestamp — 이벤트 종류 무관 (득점/리바/파울/서브 등)
//   클러치 시간 창의 기준점 · 득점 공백 구간을 정확히 커버하기 위해 별도 조회
async function fetchGameMaxTs(
  supabase: SupabaseClient,
  gameIds: string[],
): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  if (gameIds.length === 0) return map
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk, error } = await supabase
      .from('league_game_events')
      .select('league_game_id, video_timestamp')
      .in('league_game_id', gameIds)
      .not('video_timestamp', 'is', null)
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    // 이 맵은 클러치 시간창(clutch_window_start) 기준점이다 — 페이지 실패를 조용히 넘기면
    // 게임의 max_timestamp 가 낮게 잡혀 실제 클러치 이벤트가 통째로 빠질 수 있다.
    if (error) throw new Error(`fetchGameMaxTs: 페이지네이션(pg=${pg}) 실패 — ${error.message}`)
    if (chunk) {
      for (const r of chunk as Array<{ league_game_id: string; video_timestamp: number }>) {
        const cur = map[r.league_game_id] ?? -1
        if (r.video_timestamp > cur) map[r.league_game_id] = r.video_timestamp
      }
    }
    if (!chunk || chunk.length < PAGE) break
  }
  return map
}

// 최근 라운드 목록 — 모든 라운드 노출 (영상/기록 여부는 status 로 구분)
// 미리 필터링 안 함 · UI 에서 상태별로 시각화
export async function loadRecentRounds(supabase: SupabaseClient, leagueId: string, limit = 24): Promise<HighlightRound[]> {
  // 1. 리그 게임 전체 (is_started=true · 시작된 경기만 · 친선 제외 안 함 · 라운드 성격상 모두 노출)
  //    identity resolver 병렬 로드 — 분기별 팀명 override 반영
  const [{ data: games, error: gErr }, resolver] = await Promise.all([
    supabase
      .from('league_games')
      .select(`
        id, date, quarter_id, youtube_url,
        home_team_id, away_team_id,
        home_team:league_teams!league_games_home_team_id_fkey(name),
        away_team:league_teams!league_games_away_team_id_fkey(name)
      `)
      .eq('league_id', leagueId)
      .eq('is_started', true)
      .not('date', 'is', null)
      .order('date', { ascending: false }),
    loadIdentityResolver(supabase, leagueId),
  ])
  // 쿼리 실패를 빈 배열로 넘기면 "라운드 없음"과 구분이 안 돼 하이라이트 목록이 조용히 텅 빈다.
  if (gErr) throw new Error(`loadRecentRounds: leagueId=${leagueId} league_games 조회 실패 — ${gErr.message}`)
  const rows = (games ?? []) as unknown as Array<{
    id: string
    date: string
    quarter_id: string | null
    youtube_url: string | null
    home_team_id: string | null
    away_team_id: string | null
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
    // 페이지 중간 실패를 빈 배열로 넘기면 이미 계산해 둔 라운드 목록까지 통째로 사라진다.
    if (eErr) throw new Error(`loadRecentRounds: leagueId=${leagueId} league_game_events 페이지네이션(pg=${pg}) 실패 — ${eErr.message}`)
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
      // 분기별 팀명 override 반영 — 없으면 base team name fallback
      const homeId = g.home_team_id ?? null
      const awayId = g.away_team_id ?? null
      const homeName = (homeId && resolver(homeId, g.quarter_id)?.display_name) || g.home_team?.name || null
      const awayName = (awayId && resolver(awayId, g.quarter_id)?.display_name) || g.away_team?.name || null
      if (homeName) teamSet.add(homeName)
      if (awayName) teamSet.add(awayName)
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

  // 1. 해당 날짜의 게임 (영상 있는 것만) + identity resolver 병렬 로드
  const [{ data: games, error: gErr }, resolver, scoringRules] = await Promise.all([
    supabase
      .from('league_games')
      .select(`
        id, quarter_id, youtube_url, youtube_start_offset,
        home_team_id, away_team_id, plus_one_player_id,
        home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
        away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
      `)
      .eq('league_id', leagueId)
      .eq('date', date)
      .not('youtube_url', 'is', null)
      .order('slot_num', { ascending: true }),
    loadIdentityResolver(supabase, leagueId),
    // 채점 룰 — 이벤트 루프 밖에서 한 번만 읽는다 (동호회마다 다른 plus_one/자유투 배점).
    fetchScoringRules(supabase, leagueId),
  ])
  // 쿼리 실패를 empty 로 넘기면 "그 날 영상 없음"과 구분이 안 돼 라운드 상세가 조용히 텅 빈다.
  if (gErr) throw new Error(`loadRoundDetail: leagueId=${leagueId} date=${date} league_games 조회 실패 — ${gErr.message}`)
  const gameRows = (games ?? []) as unknown as Array<{
    id: string
    quarter_id: string | null
    youtube_url: string
    youtube_start_offset: number | null
    home_team_id: string | null
    away_team_id: string | null
    plus_one_player_id: string | null
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
    result: string | null
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
    // 페이지 중간 실패를 empty 로 넘기면 그 날 클립이 통째로 사라진다.
    if (eErr) throw new Error(`loadRoundDetail: leagueId=${leagueId} date=${date} league_game_events 페이지네이션(pg=${pg}) 실패 — ${eErr.message}`)
    if (chunk && chunk.length > 0) eventRows.push(...(chunk as DetailEvtRow[]))
    if (!chunk || chunk.length < PAGE) break
  }

  // 3. 선수 정보 (한 방에) — 슛 선수 + 어시스트 선수 모두 포함
  const playerIds = Array.from(new Set([
    ...eventRows.map(e => e.league_player_id).filter((x): x is string => !!x),
    ...eventRows.map(e => e.related_player_id).filter((x): x is string => !!x),
  ]))
  const playerMap: Record<string, { id: string; name: string; number: number | null; photo_url: string | null; plus_one: boolean }> = {}
  if (playerIds.length > 0) {
    const { data: players, error: plErr } = await supabase
      .from('league_players')
      .select('id, name, number, photo_url, plus_one')
      .in('id', playerIds)
    // 쿼리 실패를 조용히 넘기면 plusOneSet 이 비어 모든 플러스원 선수가 일반 선수로 채점된다
    // (fetchScoringRules 와 동일한 이유로 폴백 대신 throw — 소리 없는 오채점 방지).
    if (plErr) {
      throw new Error(`loadRoundDetail: leagueId=${leagueId} league_players(plus_one) 조회 실패 — ${plErr.message}`)
    }
    for (const p of (players ?? []) as Array<{ id: string; name: string; number: number | null; photo_url: string | null; plus_one: boolean | null }>) {
      playerMap[p.id] = { ...p, plus_one: !!p.plus_one }
    }
  }
  // 플러스원 판정용 — 게임별 plus_one_player_id override 가 없으면 선수 플래그로 폴백
  // (leagueStats.ts 의 정석 패턴과 동일)
  const plusOneSet = new Set(Object.values(playerMap).filter(p => p.plus_one).map(p => p.id))

  // 4. 게임별 이벤트 그룹핑 + 시간순 정렬 → 러닝 스코어 & 클러치 판정 준비
  //    시간 창 기준은 "마지막 이벤트"(득점 무관) 로 별도 조회 (득점 공백 구간 정확도 확보)
  const gameEvents: Record<string, DetailEvtRow[]> = {}
  for (const e of eventRows) {
    ;(gameEvents[e.league_game_id] ||= []).push(e)
  }
  const gameMaxTs = await fetchGameMaxTs(supabase, Object.keys(gameEvents))
  // event_id → { is_clutch, score_home_before/after, score_away_before/after, kind }
  const evMeta: Record<string, {
    is_clutch: boolean
    hb: number; ab: number; ha: number; aa: number
    kind?: ClutchKind
  }> = {}
  // 게임별 최종 스코어 (walker 종료 시점) — 위닝샷 판정용
  const gameFinalScores: Record<string, { home: number; away: number }> = {}
  for (const gid of Object.keys(gameEvents)) {
    const evs = gameEvents[gid]
    evs.sort((a, b) => (a.video_timestamp - b.video_timestamp) || a.id.localeCompare(b.id))
    const game = gameMap[gid]
    if (!game) continue
    const maxTs = gameMaxTs[gid] ?? 0
    const clutchStart = maxTs - CLUTCH_TIME_WINDOW_SECONDS
    let home = 0, away = 0
    for (const e of evs) {
      const inClutchTime = e.video_timestamp >= clutchStart
      const marginBefore = Math.abs(home - away)
      const hb = home, ab = away
      // 스코어 반영 — 저장된 points 컬럼 대신 scorePoints 로 룰 기반 재계산 (team_id 매칭으로 홈/원정 판별)
      const isPlusOne = e.league_player_id != null && (
        game.plus_one_player_id !== null
          ? e.league_player_id === game.plus_one_player_id
          : plusOneSet.has(e.league_player_id)
      )
      const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
      if (pts > 0 && e.team_id) {
        if (e.team_id === game.home_team_id) home += pts
        else if (e.team_id === game.away_team_id) away += pts
      }
      const marginAfter = Math.abs(home - away)
      // 클러치샷 = 시간창 이내 + 슛 직전 2포제션(≤6) + 슛 직후 1포제션(≤3) 로 좁혀짐
      const isClutch = inClutchTime
        && marginBefore <= CLUTCH_MARGIN_BEFORE_MAX
        && marginAfter <= CLUTCH_MARGIN_AFTER_MAX
      let kind: ClutchKind | undefined
      if (isClutch && e.team_id && (e.team_id === game.home_team_id || e.team_id === game.away_team_id)) {
        const isHomeShooter = e.team_id === game.home_team_id
        kind = classifyClutchKind(hb, ab, home, away, isHomeShooter)
      }
      evMeta[e.id] = { is_clutch: isClutch, hb, ab, ha: home, aa: away, kind }
    }
    gameFinalScores[gid] = { home, away }
  }

  // 5. 클립 조립 (게임/팀 컨텍스트 + 분기별 팀명 override + 클러치/스코어 결합)
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

    // 분기별 팀명/색상 override — 이 슛의 소속팀 · 홈 · 원정 각각 리졸브
    const shotIdentity = resolver(team.id, game.quarter_id)
    const homeIdentity = game.home_team_id ? resolver(game.home_team_id, game.quarter_id) : null
    const awayIdentity = game.away_team_id ? resolver(game.away_team_id, game.quarter_id) : null
    const teamName = shotIdentity?.display_name ?? team.name
    const teamColor = shotIdentity?.color ?? team.color
    const homeName = homeIdentity?.display_name ?? (game.home_team?.name ?? '')
    const awayName = awayIdentity?.display_name ?? (game.away_team?.name ?? '')

    const player = ev.league_player_id ? playerMap[ev.league_player_id] : null
    const { start, end } = getClipBounds(ev.type, ev.video_timestamp)

    // 어시스트 매핑 — 야투(3점/2점)에만 유의미. 자유투/앤드원은 파울 상황이라 어시스트 개념 없음
    const assistPlayer = (shouldShowAssist(ev.type) && ev.related_player_id)
      ? playerMap[ev.related_player_id] ?? null
      : null

    const meta = evMeta[ev.id]

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
      team_name: teamName,
      team_color: teamColor,
      shot_type: ev.type,
      points: ev.points ?? 0,
      game_id: game.id,
      home_team_name: homeName,
      away_team_name: awayName,
      assist_player_id: assistPlayer?.id ?? null,
      assist_player_name: assistPlayer?.name ?? null,
      assist_player_number: assistPlayer?.number ?? null,
      is_clutch: meta?.is_clutch ?? false,
      score_home_before: meta?.hb ?? 0,
      score_away_before: meta?.ab ?? 0,
      score_home_after: meta?.ha ?? 0,
      score_away_after: meta?.aa ?? 0,
    }
    // 클러치샷 종류 · reversal 이면서 이 슛으로 스코어 확정 + 우리 팀 승리 시 → winning 업그레이드
    if (meta?.kind) {
      let kind: HighlightClip['clutch_kind'] = meta.kind
      if (kind === 'reversal') {
        const final = gameFinalScores[game.id]
        if (final && meta.ha === final.home && meta.aa === final.away) {
          const isHomeShooter = team.id === game.home_team_id
          const ownFinal = isHomeShooter ? final.home : final.away
          const oppFinal = isHomeShooter ? final.away : final.home
          if (ownFinal > oppFinal) kind = 'winning'
        }
      }
      clip.clutch_kind = kind
    }
    // opponent_name (홈 위젯 카드에서 vs 상대팀 노출)
    clip.opponent_name = team.id === game.home_team_id ? awayName : homeName
    clips.push(clip)

    if (ev.league_player_id && player) {
      const k = ev.league_player_id
      if (!playerCounts[k]) playerCounts[k] = { id: k, name: player.name, number: player.number, count: 0 }
      playerCounts[k].count++
    }
    if (team.id) {
      const tk = team.id
      // 한 라운드(date)는 보통 하나의 분기 내에 있으므로 team_id 로 그룹핑 (필터 상 c.team_id === filter.teamId 매칭)
      if (!teamCounts[tk]) teamCounts[tk] = { id: tk, name: teamName, color: teamColor, count: 0 }
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
  // 1. 선수 정보 (팀 소속 확인 — 명단은 팀 소유라 이 선수 행의 출생 league_id 가
  //    지금 보고 있는 leagueId 와 다를 수 있다. league_id 로 확인하면 대회에서 리그
  //    선수의 하이라이트 페이지를 열 때 "선수를 찾을 수 없습니다"가 뜬다.)
  const teamId = await resolveTeamId(leagueId)
  const { data: playerRow, error: pErr } = await supabase
    .from('league_players')
    .select('id, name, number, photo_url, league_id')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  // 쿼리 실패와 "그런 선수 없음"을 구분한다 — 실패를 null 로 넘기면 존재하는 선수의
  // 하이라이트 페이지가 "선수를 찾을 수 없습니다"로 잘못 보인다.
  if (pErr) throw new Error(`loadPlayerHighlights: leagueId=${leagueId} playerId=${playerId} league_players 조회 실패 — ${pErr.message}`)
  if (!playerRow) return null
  const player = {
    id: playerRow.id as string,
    name: playerRow.name as string,
    number: (playerRow.number ?? null) as number | null,
    photo_url: (playerRow.photo_url ?? null) as string | null,
  }

  // 2. 리그의 영상 있는 게임 목록 (id, date, quarter_id, home/away 팀) + identity resolver 병렬 로드
  //    + 채점 룰 · 리그 전체 plus_one 플래그 (러닝 스코어 재계산용)
  const [{ data: gamesRaw, error: gErr }, resolver, scoringRules, { data: allLeaguePlayers, error: plErr }] = await Promise.all([
    supabase
      .from('league_games')
      .select(`
        id, date, quarter_id, youtube_url, youtube_start_offset,
        home_team_id, away_team_id, plus_one_player_id,
        home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
        away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
      `)
      .eq('league_id', leagueId)
      .not('youtube_url', 'is', null)
      .not('date', 'is', null),
    loadIdentityResolver(supabase, leagueId),
    fetchScoringRules(supabase, leagueId),
    supabase.from('league_players').select('id, plus_one').eq('league_id', leagueId),
  ])
  // 쿼리 실패를 빈 결과로 넘기면 "영상 있는 경기 없음"과 구분이 안 돼 이 선수의 하이라이트가 조용히 텅 빈다.
  if (gErr) throw new Error(`loadPlayerHighlights: leagueId=${leagueId} playerId=${playerId} league_games 조회 실패 — ${gErr.message}`)
  // 쿼리 실패를 조용히 넘기면 plusOneSet 이 비어 모든 플러스원 선수가 일반 선수로 채점되고,
  // 그 뒤 이어지는 러닝 마진 전체가 틀어진다 (fetchScoringRules 와 동일한 이유로 throw).
  if (plErr) {
    throw new Error(`loadPlayerHighlights: leagueId=${leagueId} league_players(plus_one) 조회 실패 — ${plErr.message}`)
  }
  // 플러스원 판정용 — 게임별 plus_one_player_id override 가 없으면 선수 플래그로 폴백
  const plusOneSet = new Set(
    ((allLeaguePlayers ?? []) as Array<{ id: string; plus_one: boolean | null }>)
      .filter(p => p.plus_one)
      .map(p => p.id),
  )
  const gameRows = (gamesRaw ?? []) as unknown as Array<{
    id: string
    date: string
    quarter_id: string | null
    youtube_url: string
    youtube_start_offset: number | null
    home_team_id: string | null
    away_team_id: string | null
    plus_one_player_id: string | null
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
    // 페이지 중간 실패를 빈 결과로 넘기면 이 선수의 클립이 통째로 사라진다.
    if (eErr) throw new Error(`loadPlayerHighlights: leagueId=${leagueId} playerId=${playerId} league_game_events 페이지네이션(pg=${pg}) 실패 — ${eErr.message}`)
    if (chunk && chunk.length > 0) events.push(...(chunk as EvtRow[]))
    if (!chunk || chunk.length < PAGE) break
  }

  // 3-a. 클러치/스코어 계산용 — 해당 게임의 모든 made 슛 (양팀 포함) 로드
  //      선수 이벤트만으로는 상대팀 득점을 알 수 없어 러닝 스코어 계산 불가
  const gameIdsWithPlayer = Array.from(new Set(events.map(e => e.league_game_id)))
  type FullEvRow = {
    id: string; league_game_id: string; team_id: string | null; league_player_id: string | null
    type: string; result: string | null; video_timestamp: number
  }
  const fullEvents: FullEvRow[] = []
  if (gameIdsWithPlayer.length > 0) {
    for (let pg = 0; ; pg++) {
      const { data: chunk, error: feErr } = await supabase
        .from('league_game_events')
        .select('id, league_game_id, team_id, league_player_id, type, result, video_timestamp')
        .in('league_game_id', gameIdsWithPlayer)
        .eq('result', 'made')
        .not('video_timestamp', 'is', null)
        .order('id', { ascending: true })
        .range(pg * PAGE, (pg + 1) * PAGE - 1)
      // 양팀 득점 러닝스코어 재료 — 페이지 실패를 조용히 넘기면 클러치 margin 계산이 틀어진다.
      if (feErr) throw new Error(`loadPlayerHighlights: leagueId=${leagueId} playerId=${playerId} fullEvents 페이지네이션(pg=${pg}) 실패 — ${feErr.message}`)
      if (chunk && chunk.length > 0) fullEvents.push(...(chunk as FullEvRow[]))
      if (!chunk || chunk.length < PAGE) break
    }
  }
  // 게임별 group + 시간순 sort → event_id → { is_clutch, scores }
  // 시간 창 기준은 "마지막 이벤트"(득점 무관) 로 별도 조회 (득점 공백 구간 정확도 확보)
  const evMeta: Record<string, { is_clutch: boolean; hb: number; ab: number; ha: number; aa: number }> = {}
  const grouped: Record<string, FullEvRow[]> = {}
  for (const e of fullEvents) {
    ;(grouped[e.league_game_id] ||= []).push(e)
  }
  const gameMaxTs = await fetchGameMaxTs(supabase, Object.keys(grouped))
  for (const gid of Object.keys(grouped)) {
    const evs = grouped[gid]
    evs.sort((a, b) => (a.video_timestamp - b.video_timestamp) || a.id.localeCompare(b.id))
    const g = gameMap[gid]
    if (!g) continue
    const clutchStart = (gameMaxTs[gid] ?? 0) - CLUTCH_TIME_WINDOW_SECONDS
    let home = 0, away = 0
    for (const e of evs) {
      const inClutchTime = e.video_timestamp >= clutchStart
      const marginBefore = Math.abs(home - away)
      const hb = home, ab = away
      // 스코어 반영 — 저장된 points 컬럼 대신 scorePoints 로 룰 기반 재계산 (loadRoundDetail 과 동일 이유)
      const isPlusOne = e.league_player_id != null && (
        g.plus_one_player_id !== null
          ? e.league_player_id === g.plus_one_player_id
          : plusOneSet.has(e.league_player_id)
      )
      const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
      if (pts > 0 && e.team_id) {
        if (e.team_id === g.home_team_id) home += pts
        else if (e.team_id === g.away_team_id) away += pts
      }
      const marginAfter = Math.abs(home - away)
      const isClutch = inClutchTime
        && marginBefore <= CLUTCH_MARGIN_BEFORE_MAX
        && marginAfter <= CLUTCH_MARGIN_AFTER_MAX
      evMeta[e.id] = { is_clutch: isClutch, hb, ab, ha: home, aa: away }
    }
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

    // 분기별 팀명/색상 override 적용 — 홈 · 원정 · 슛 소속팀 각각 리졸브
    const shotIdentity = resolver(team.id, game.quarter_id)
    const homeIdentity = game.home_team_id ? resolver(game.home_team_id, game.quarter_id) : null
    const awayIdentity = game.away_team_id ? resolver(game.away_team_id, game.quarter_id) : null
    const teamName = shotIdentity?.display_name ?? team.name
    const teamColor = shotIdentity?.color ?? team.color
    const homeName = homeIdentity?.display_name ?? (game.home_team?.name ?? '')
    const awayName = awayIdentity?.display_name ?? (game.away_team?.name ?? '')

    // 상대팀 이름 — 선수 소속(team)이 아닌 쪽
    const opponentName = team.id === game.home_team?.id ? awayName
      : team.id === game.away_team?.id ? homeName
      : ''

    // 어시스트 매핑 (야투 성공에만 유의미, 자유투/앤드원은 항상 null)
    const assistPlayer = (shouldShowAssist(ev.type) && ev.related_player_id)
      ? assistPlayerMap[ev.related_player_id] ?? null
      : null

    const meta = evMeta[ev.id]

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
      team_name: teamName,
      team_color: teamColor,
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
      is_clutch: meta?.is_clutch ?? false,
      score_home_before: meta?.hb ?? 0,
      score_away_before: meta?.ab ?? 0,
      score_home_after: meta?.ha ?? 0,
      score_away_after: meta?.aa ?? 0,
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

// 이벤트 UUID 배열 → HighlightClip[] · 위닝샷 배지/베스트샷 핀 재생용
// 러닝 스코어(is_clutch/score_*)는 개별 이벤트만 조회하므로 계산 불가 → 기본값
// forceClutch=true 옵션으로 UI 배지 표시가 필요할 때 강제 마크
// 반환 순서는 입력 eventIds 배열 순서 (핀 재생 순서 보장)
export async function loadClipsByEventIds(
  supabase: SupabaseClient,
  leagueId: string,
  eventIds: string[],
  options?: { forceClutch?: boolean },
): Promise<HighlightClip[]> {
  if (eventIds.length === 0) return []

  const [{ data: events, error: eErr }, resolver, scoringRules, { data: allLeaguePlayers, error: plErr }] = await Promise.all([
    supabase
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, team_id, related_player_id, type, points, video_timestamp')
      .in('id', eventIds),
    loadIdentityResolver(supabase, leagueId),
    // 러닝 스코어 재계산용 채점 룰 · 리그 전체 plus_one 플래그
    fetchScoringRules(supabase, leagueId),
    supabase.from('league_players').select('id, plus_one').eq('league_id', leagueId),
  ])
  // 쿼리 실패와 "요청한 이벤트가 실제로 없음"을 구분한다 — 실패를 빈 배열로 넘기면
  // 핀한 베스트샷/특정 클립 요청이 조용히 "아무것도 없음"으로 보인다.
  if (eErr) throw new Error(`loadClipsByEventIds: leagueId=${leagueId} league_game_events 조회 실패 — ${eErr.message}`)
  if (!events || events.length === 0) return []
  // 쿼리 실패를 조용히 넘기면 plusOneSet 이 비어 모든 플러스원 선수가 일반 선수로 채점된다
  // (fetchScoringRules 와 동일한 이유로 폴백 대신 throw — 소리 없는 오채점 방지).
  if (plErr) {
    throw new Error(`loadClipsByEventIds: leagueId=${leagueId} league_players(plus_one) 조회 실패 — ${plErr.message}`)
  }
  const plusOneSet = new Set(
    ((allLeaguePlayers ?? []) as Array<{ id: string; plus_one: boolean | null }>)
      .filter(p => p.plus_one)
      .map(p => p.id),
  )
  type EvtRow = {
    id: string
    league_game_id: string
    league_player_id: string | null
    team_id: string | null
    related_player_id: string | null
    type: string
    points: number | null
    video_timestamp: number | null
  }
  const evRows = (events as unknown as EvtRow[]).filter(
    e => e.video_timestamp !== null && isHighlightShot(e.type),
  )
  if (evRows.length === 0) return []

  const gameIds = Array.from(new Set(evRows.map(e => e.league_game_id)))
  const { data: games, error: gErr } = await supabase
    .from('league_games')
    .select(`
      id, quarter_id, youtube_url, home_team_id, away_team_id, plus_one_player_id,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .in('id', gameIds)
    .eq('league_id', leagueId)
    .not('youtube_url', 'is', null)
  // gameMap 이 비면 아래 `if (!game) continue` 에서 모든 클립이 조용히 걸러진다 —
  // "핀한 클립이 하나도 재생 안 됨"이 "쿼리 실패"와 구분 없이 보이는 걸 막는다.
  if (gErr) throw new Error(`loadClipsByEventIds: leagueId=${leagueId} league_games 조회 실패 — ${gErr.message}`)
  const gameRows = (games ?? []) as unknown as Array<{
    id: string
    quarter_id: string | null
    youtube_url: string
    home_team_id: string | null
    away_team_id: string | null
    plus_one_player_id: string | null
    home_team: { id: string; name: string; color: string } | null
    away_team: { id: string; name: string; color: string } | null
  }>
  const gameMap: Record<string, typeof gameRows[number]> = {}
  for (const g of gameRows) gameMap[g.id] = g

  const playerIds = Array.from(new Set([
    ...evRows.map(e => e.league_player_id).filter((x): x is string => !!x),
    ...evRows.map(e => e.related_player_id).filter((x): x is string => !!x),
  ]))
  const playerMap: Record<string, { id: string; name: string; number: number | null; photo_url: string | null }> = {}
  if (playerIds.length > 0) {
    const { data: players, error: plErr } = await supabase
      .from('league_players')
      .select('id, name, number, photo_url')
      .in('id', playerIds)
    // 개별 선수 하나가 아니라 이 라운드 전체 선수 조회다 — 실패를 조용히 넘기면
    // 릴의 모든 클립이 "알 수 없음"으로 보여 진짜 데이터 소실처럼 읽힌다.
    if (plErr) throw new Error(`loadClipsByEventIds: leagueId=${leagueId} league_players 조회 실패 — ${plErr.message}`)
    for (const p of (players ?? []) as Array<{ id: string; name: string; number: number | null; photo_url: string | null }>) {
      playerMap[p.id] = p
    }
  }

  // 게임별 러닝 스코어 사전계산 — 각 요청 이벤트의 슛 직전/직후 스코어를 정확히 표시
  //   각 게임의 모든 성공 이벤트(result='made')를 timestamp 순으로 walk 하며 scorePoints 로
  //   재계산해 홈/원정 누적 점수를 산출한다 (저장된 points 컬럼은 쓰지 않음 — 아래 주석 참고).
  //   요청 이벤트가 아니어도 러닝 스코어에 반영해야 정확한 스코어보드가 나옴.
  type ScoreEvtRow = {
    id: string; league_game_id: string; team_id: string | null; league_player_id: string | null
    type: string; result: string | null; video_timestamp: number | null
  }
  const scoreEvents: ScoreEvtRow[] = []
  {
    const PAGE = 1000
    for (let pg = 0; ; pg++) {
      const { data: chunk, error: seErr } = await supabase
        .from('league_game_events')
        .select('id, league_game_id, team_id, league_player_id, type, result, video_timestamp')
        .in('league_game_id', gameIds)
        .eq('result', 'made')
        // ⚠ 예전엔 .gt('points', 0) 로 "결정적 슛"을 DB 단에서 걸렀지만, 저장된 points 는
        // 룰 변경 이전 값일 수 있다. 여기서 잘못 잘리면(0/NULL 로 저장된 슛이 실은 득점인 경우)
        // 그 게임의 러닝 스코어 전체가 어긋난다 — scorePoints 로 재계산한 뒤 코드에서 걸러야
        // 룰이 바뀌어도 안전하다.
        .not('video_timestamp', 'is', null)
        .range(pg * PAGE, (pg + 1) * PAGE - 1)
      // 페이지 실패를 조용히 넘기면 이 게임의 러닝 스코어(하이라이트 배지 前/後 점수)가 틀어진다.
      if (seErr) throw new Error(`loadClipsByEventIds: leagueId=${leagueId} scoreEvents 페이지네이션(pg=${pg}) 실패 — ${seErr.message}`)
      if (chunk && chunk.length > 0) scoreEvents.push(...(chunk as unknown as ScoreEvtRow[]))
      if (!chunk || chunk.length < PAGE) break
    }
  }
  // event_id → { hb, ab, ha, aa } (before/after home/away 누적점수)
  const scoreMeta: Record<string, { hb: number; ab: number; ha: number; aa: number }> = {}
  {
    const grouped: Record<string, ScoreEvtRow[]> = {}
    for (const e of scoreEvents) (grouped[e.league_game_id] ||= []).push(e)
    for (const gid of Object.keys(grouped)) {
      const g = gameMap[gid]
      if (!g) continue
      const evs = grouped[gid].sort(
        (a, b) => ((a.video_timestamp ?? 0) - (b.video_timestamp ?? 0)) || a.id.localeCompare(b.id),
      )
      let home = 0, away = 0
      for (const e of evs) {
        const hb = home, ab = away
        // 저장된 points 대신 scorePoints 재계산 — 사유는 위 scoreEvents 조회 주석과 동일
        const isPlusOne = e.league_player_id != null && (
          g.plus_one_player_id !== null
            ? e.league_player_id === g.plus_one_player_id
            : plusOneSet.has(e.league_player_id)
        )
        const pts = scorePoints(e.type, e.result, isPlusOne, scoringRules)
        if (e.team_id === g.home_team_id) home += pts
        else if (e.team_id === g.away_team_id) away += pts
        // team_id 가 홈/원정 어디도 아니면 스코어 미반영 (안전)
        scoreMeta[e.id] = { hb, ab, ha: home, aa: away }
      }
    }
  }

  // event_id → HighlightClip · 입력 배열 순서로 재정렬
  const byId: Record<string, HighlightClip> = {}
  for (const ev of evRows) {
    const game = gameMap[ev.league_game_id]
    if (!game) continue
    const videoId = extractYouTubeId(game.youtube_url)
    if (!videoId || ev.video_timestamp === null) continue

    let team = ev.team_id === game.home_team?.id ? game.home_team
      : ev.team_id === game.away_team?.id ? game.away_team
      : null
    if (!team) team = game.home_team ?? game.away_team
    if (!team) continue

    const shotIdentity = resolver(team.id, game.quarter_id)
    const homeIdentity = game.home_team_id ? resolver(game.home_team_id, game.quarter_id) : null
    const awayIdentity = game.away_team_id ? resolver(game.away_team_id, game.quarter_id) : null
    const teamName = shotIdentity?.display_name ?? team.name
    const teamColor = shotIdentity?.color ?? team.color
    const homeName = homeIdentity?.display_name ?? (game.home_team?.name ?? '')
    const awayName = awayIdentity?.display_name ?? (game.away_team?.name ?? '')

    const player = ev.league_player_id ? playerMap[ev.league_player_id] : null
    const { start, end } = getClipBounds(ev.type, ev.video_timestamp)
    const assistPlayer = (shouldShowAssist(ev.type) && ev.related_player_id)
      ? playerMap[ev.related_player_id] ?? null
      : null

    byId[ev.id] = {
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
      team_name: teamName,
      team_color: teamColor,
      shot_type: ev.type,
      points: ev.points ?? 0,
      game_id: game.id,
      home_team_name: homeName,
      away_team_name: awayName,
      assist_player_id: assistPlayer?.id ?? null,
      assist_player_name: assistPlayer?.name ?? null,
      assist_player_number: assistPlayer?.number ?? null,
      is_clutch: options?.forceClutch ?? false,
      score_home_before: scoreMeta[ev.id]?.hb ?? 0,
      score_away_before: scoreMeta[ev.id]?.ab ?? 0,
      score_home_after:  scoreMeta[ev.id]?.ha ?? 0,
      score_away_after:  scoreMeta[ev.id]?.aa ?? 0,
    }
  }

  return eventIds.map(id => byId[id]).filter((c): c is HighlightClip => !!c)
}

// ── 리그 베스트샷 릴 ─────────────────────────────────────────────
// 핀(league_players.pinned_event_ids)을 지정한 모든 선수의 클립 모음.
// 등번호 순 → 각 선수의 핀 슬롯(1→3) 순으로 정렬 · HighlightsBrowser 재사용용 detail shape.
// 이벤트 삭제 등으로 hydrate 안 되는 핀은 조용히 스킵.
export async function loadLeagueBestShots(
  supabase: SupabaseClient,
  leagueId: string,
): Promise<HighlightRoundDetail> {
  const empty: HighlightRoundDetail = { date: '', clips: [], players: [], teams: [] }

  // 핀은 팀 전체 후보에서 찾는다 — 실제로 보여줄 클립은 아래 loadClipsByEventIds 가
  // league_games.league_id 로 다시 걸러주므로(다른 경기묶음 게임이면 hydrate 안 되고
  // 스킵된다) 여기서 team_id 로 넓혀도 다른 경기묶음의 핀이 섞여 보이지 않는다.
  const teamId = await resolveTeamId(leagueId)
  const { data: pinRows, error } = await supabase
    .from('league_players')
    .select('id, name, number, pinned_event_ids')
    .eq('team_id', teamId)
    .not('pinned_event_ids', 'is', null)
  // 쿼리 실패를 empty 로 넘기면 "아무도 핀 안 함"과 구분이 안 돼 베스트샷 릴이 조용히 텅 빈다.
  if (error) throw new Error(`loadLeagueBestShots: leagueId=${leagueId} league_players(pinned_event_ids) 조회 실패 — ${error.message}`)
  const pinners = ((pinRows ?? []) as Array<{ id: string; name: string; number: number | null; pinned_event_ids: string[] | null }>)
    .filter(p => (p.pinned_event_ids?.length ?? 0) > 0)
  if (pinners.length === 0) return empty

  // 등번호 순 (없으면 뒤로) → 이름 순
  pinners.sort((a, b) => {
    const na = a.number ?? 9999
    const nb = b.number ?? 9999
    if (na !== nb) return na - nb
    return a.name.localeCompare(b.name, 'ko')
  })

  const allEventIds = pinners.flatMap(p => p.pinned_event_ids ?? [])
  const loaded = await loadClipsByEventIds(supabase, leagueId, allEventIds)
  const clipMap: Record<string, HighlightClip> = {}
  for (const c of loaded) clipMap[c.event_id] = c

  // 핀 소유 선수 기준 재조립 (슬롯 순서 유지)
  const clips: HighlightClip[] = []
  const players: HighlightPlayerOption[] = []
  for (const p of pinners) {
    let count = 0
    for (const evId of p.pinned_event_ids ?? []) {
      const c = clipMap[evId]
      if (!c) continue
      clips.push(c)
      count++
    }
    if (count > 0) players.push({ id: p.id, name: p.name, number: p.number, count })
  }

  return { date: '', clips, players, teams: [] }
}
