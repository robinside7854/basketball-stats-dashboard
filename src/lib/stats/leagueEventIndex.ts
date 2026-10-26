// 선수 카드(detail 라우트)용 리그 전체 이벤트 색인 — 캐시 한 벌 (2026-10-16).
//
// 왜: 선수 카드를 열 때마다 detail 라우트가 **리그 전체 이벤트**(수만 줄)를 1,000줄씩 순서대로 다시 읽었다
//   (승률 순위 · 다이나믹 듀오용). 페이지가 수십 번 왕복이라 카드가 3초쯤 걸린 주범이었다.
//   두 계산에 필요한 것만 줄여 리그 단위로 캐시한다 — 보는 사람과 무관한 리그 전체 값(개인 정보 없음).
//
// 담는 것 (정규전 = 기록 시작 · 친선 제외 경기만, 이벤트 id 순)
//   · played — 선수마다 「뛴 경기 → 그 경기에서 이벤트에 남은 팀(처음 본 값)」. 외부 팀 이벤트 제외,
//              교체(sub_in/out)는 출전으로 안 침, 어시스트(isAssistEvent)로 이름이 남은 경기도 출전.
//   · duo    — 어시스트가 붙은 야투 성공(득점자 ≠ 어시스트). 점수는 라우트가 scorePoints/isPlusOneFor 로 계산한다
//              (+1 판정은 경기·쿼터 단위라 여기서 굳히지 않는다).
// 기간(분기) 거름은 라우트가 자기 경기 집합(gameMap)으로 한다 — 그래서 키에는 리그 id 만 들어간다.
//
// 저장: unstable_cache 는 JSON 으로 저장하고 항목당 크기 제한이 있어 id 를 번호 표로 바꿔 담는다.
// 무효화: `league-{id}-games` 태그(경기·이벤트 mutation API 의 기존 revalidateTag) + 1시간(2026-10-26: 주 1회 리그라 60초면 토요일 저녁 첫 방문자마다 다시 셌다 — 수정은 태그로 바로 반영).

import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'
import { isAssistEvent, FIELD_SHOT_TYPES } from './boxLine'

type Packed = {
  games: string[]
  players: string[]
  teams: string[]
  types: string[]
  /** pid → [gameIdx, teamIdx(-1 = 없음), …] */
  played: Record<string, number[]>
  /** [gameIdx, scorerIdx, assisterIdx, typeIdx, quarter(-1 = 없음), …] */
  duo: number[]
}

export type DuoShot = { gameId: string; scorer: string; assister: string; type: string; quarter: number | null }

export interface LeagueEventIndex {
  /** 선수 → 경기 id → 이벤트에 남은 팀(없으면 undefined) */
  playedBy(pid: string): Map<string, string | undefined>
  /** 이 선수가 득점자 또는 어시스트인 야투 성공 */
  duoShotsOf(pid: string): DuoShot[]
}

const CHUNK = 1000

async function buildPacked(leagueId: string): Promise<Packed> {
  const sb = createClient()
  const [externalTeamIds, gameIds] = await Promise.all([
    fetchExternalTeamIds(sb, leagueId),
    (async () => {
      const ids: string[] = []
      for (let p = 0; ; p++) {
        const { data, error } = await sb
          .from('league_games')
          .select('id')
          .eq('league_id', leagueId)
          .eq('is_started', true)
          .eq('is_exhibition', false)
          .order('id', { ascending: true })
          .range(p * CHUNK, (p + 1) * CHUNK - 1)
        if (error) throw new Error(`leagueEventIndex: league_games 조회 실패 — ${error.message}`)
        if (!data || data.length === 0) break
        for (const g of data as { id: string }[]) ids.push(g.id)
        if (data.length < CHUNK) break
      }
      return ids
    })(),
  ])

  const packed: Packed = { games: gameIds, players: [], teams: [], types: [], played: {}, duo: [] }
  if (gameIds.length === 0) return packed

  const gIdx = new Map(gameIds.map((id, i) => [id, i]))
  const pIdx = new Map<string, number>()
  const tIdx = new Map<string, number>()
  const tyIdx = new Map<string, number>()
  const idxOf = (m: Map<string, number>, arr: string[], v: string) => {
    let i = m.get(v)
    if (i === undefined) { i = arr.length; arr.push(v); m.set(v, i) }
    return i
  }
  // pid → 경기 번호 → played 배열 안 팀 칸 위치. 종전 라우트처럼 「처음 본 팀」을 쓰되, 팀이 비어 있던 경기는
  //   나중 이벤트의 팀으로 채운다(종전 Map 의 `cur === undefined` 판정과 같은 결과).
  const slot: Record<string, Map<number, number>> = {}
  const markPlayed = (pid: string, g: number, tid: string | null) => {
    const m = (slot[pid] ??= new Map())
    const arr = (packed.played[pid] ??= [])
    const at = m.get(g)
    if (at === undefined) {
      m.set(g, arr.length + 1)
      arr.push(g, tid ? idxOf(tIdx, packed.teams, tid) : -1)
    } else if (arr[at] < 0 && tid) {
      arr[at] = idxOf(tIdx, packed.teams, tid)
    }
  }
  const shotTypes = new Set<string>(FIELD_SHOT_TYPES)

  type Row = { league_player_id: string | null; league_game_id: string; related_player_id: string | null; type: string; result: string | null; team_id: string | null; quarter: number | null }
  for (let p = 0; ; p++) {
    const { data, error } = await sb
      .from('league_game_events')
      .select('league_player_id, league_game_id, related_player_id, type, result, team_id, quarter')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      // ⚠ 정렬 없이 나눠 읽으면 페이지 사이에서 줄이 빠지거나 겹친다
      .order('id', { ascending: true })
      .range(p * CHUNK, (p + 1) * CHUNK - 1)
    // 중간 실패를 「끝」으로 보면 뒷부분 경기가 통째로 빠진 채 캐시된다 — 실패는 던진다
    if (error) throw new Error(`leagueEventIndex: league_game_events(p=${p}) 실패 — ${error.message}`)
    if (!data || data.length === 0) break
    for (const e of data as Row[]) {
      const g = gIdx.get(e.league_game_id)
      if (g === undefined) continue
      // 다이나믹 듀오 — 종전 라우트와 같이 외부 팀 거름 없이 야투 성공 + 어시스트
      if (e.result === 'made' && shotTypes.has(e.type) && e.league_player_id && e.related_player_id
        && e.league_player_id !== e.related_player_id) {
        packed.duo.push(
          g,
          idxOf(pIdx, packed.players, e.league_player_id),
          idxOf(pIdx, packed.players, e.related_player_id),
          idxOf(tyIdx, packed.types, e.type),
          e.quarter ?? -1,
        )
      }
      if (e.team_id && externalTeamIds.has(e.team_id)) continue
      if (e.league_player_id && e.type !== 'sub_in' && e.type !== 'sub_out') markPlayed(e.league_player_id, g, e.team_id)
      if (e.related_player_id && isAssistEvent(e.type, e.result, e.related_player_id)) markPlayed(e.related_player_id, g, e.team_id)
    }
    if (data.length < CHUNK) break
  }
  return packed
}

function unpack(p: Packed): LeagueEventIndex {
  return {
    playedBy(pid) {
      const out = new Map<string, string | undefined>()
      const arr = p.played[pid] ?? []
      for (let i = 0; i < arr.length; i += 2) out.set(p.games[arr[i]], arr[i + 1] >= 0 ? p.teams[arr[i + 1]] : undefined)
      return out
    },
    duoShotsOf(pid) {
      const out: DuoShot[] = []
      for (let i = 0; i < p.duo.length; i += 5) {
        const scorer = p.players[p.duo[i + 1]]
        const assister = p.players[p.duo[i + 2]]
        if (scorer !== pid && assister !== pid) continue
        out.push({
          gameId: p.games[p.duo[i]], scorer, assister,
          type: p.types[p.duo[i + 3]], quarter: p.duo[i + 4] >= 0 ? p.duo[i + 4] : null,
        })
      }
      return out
    },
  }
}

/** 리그 전체 이벤트 색인(캐시). ⚠ 키·콜백은 이 파일 한 곳에만 — 다른 곳에 같은 캐시를 또 만들지 말 것 */
export async function getCachedLeagueEventIndex(leagueId: string): Promise<LeagueEventIndex> {
  const packed = await unstable_cache(
    () => buildPacked(leagueId),
    ['player-card-event-index-v1', leagueId],
    { tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600 },
  )()
  return unpack(packed)
}
