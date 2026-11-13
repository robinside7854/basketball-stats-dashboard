// 미라클 후프스 — 능력치 밖의 「특성」 재료(2026-11-13 운영진 선택: 클러치 · 요즘 흐름 · 다이나믹 듀오 · 바깥 수비).
// 집계 숫자(득점·리바 등)는 computeLeagueStats 정본에서만 받고, 여기서는 정본에 **없는** 것만 이벤트에서 읽는다:
//   · 클러치 = 기존 computeClutchStats(대시보드 클러치 탭과 같은 정의)
//   · 듀오   = 어시스트 이벤트의 (넣은 사람, 어시스트한 사람) 짝 — 정본엔 짝 정보가 없다
//   · 바깥 수비 = 블록을 상대가 놓친 슛과 짝지어 위치를 본다 — 선수 카드 플레이스타일(pairBlockedShots)과 같은 방법
// 캐시: 리그 경기 태그와 함께 풀린다(경기·이벤트 수정 → 자동 무효화). 리그 전체 이벤트를 읽으므로 요청마다 돌리면 안 된다.
import { unstable_cache } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { fetchAllPaged } from '@/lib/supabase/paged'
import { computeClutchStats, type StatBlock } from '@/lib/stats/clutchStats'
import { pairBlockedShots } from '@/lib/stats/playStyle'
import { FIELD_SHOT_TYPES, isAssistEvent } from '@/lib/stats/boxLine'

export interface GameExtrasRaw {
  /** 클러치 재료 — 접전 경기 수 · 접전 득점 · 접전 야투 */
  clutch: Record<string, { gp: number; pts: number; fgm: number; fga: number; fg3m: number }>
  /** 선수 → (동료 → 서로 주고받은 어시스트 수) */
  assists: Record<string, Record<string, number>>
  /** 블록 중 미드·3점 위치로 짝지어진 수 */
  outsideBlocks: Record<string, number>
}

type Ev = { id: string; league_game_id: string; league_player_id: string | null; related_player_id: string | null; type: string; result: string | null; quarter: number | null; video_timestamp: number | null; team_id: string | null }

async function load(leagueId: string): Promise<GameExtrasRaw> {
  const sb = createClient()
  const clutchRows = await computeClutchStats(sb, leagueId)
  const clutch: GameExtrasRaw['clutch'] = {}
  for (const r of clutchRows) {
    const c: StatBlock = r.clutch
    clutch[r.player_id] = { gp: c.gp, pts: c.pts, fgm: c.fgm, fga: c.fga, fg3m: c.fg3m }
  }

  const { data: games, error } = await sb.from('league_games').select('id')
    .eq('league_id', leagueId).eq('is_started', true).eq('is_exhibition', false)
  if (error) throw new Error(error.message)
  const ids = (games ?? []).map(g => g.id as string)
  const evs = ids.length === 0 ? [] : await fetchAllPaged<Ev>((from, to) => sb.from('league_game_events')
    .select('id, league_game_id, league_player_id, related_player_id, type, result, quarter, video_timestamp, team_id')
    .in('league_game_id', ids).in('type', [...FIELD_SHOT_TYPES, 'block'])
    .order('id').range(from, to))

  const assists: GameExtrasRaw['assists'] = {}
  const add = (a: string, b: string) => { (assists[a] ??= {})[b] = (assists[a][b] ?? 0) + 1 }
  const missed: Parameters<typeof pairBlockedShots>[1][number][] = []
  const blocksBy: Record<string, Parameters<typeof pairBlockedShots>[0][number][]> = {}
  for (const e of evs) {
    if (e.league_player_id && isAssistEvent(e.type, e.result, e.related_player_id) && e.related_player_id !== e.league_player_id) {
      add(e.league_player_id, e.related_player_id!); add(e.related_player_id!, e.league_player_id)
    }
    if (e.video_timestamp == null) continue
    const base = { game: e.league_game_id, quarter: e.quarter, t: Number(e.video_timestamp), team: e.team_id }
    if (e.type === 'block' && e.league_player_id) (blocksBy[e.league_player_id] ??= []).push(base)
    else if (e.result === 'missed') missed.push({ ...base, type: e.type })
  }
  // 경기별로 묶어 짝짓기 비용을 줄인다
  const missedByGame: Record<string, typeof missed> = {}
  for (const m of missed) (missedByGame[m.game] ??= []).push(m)
  const outsideBlocks: Record<string, number> = {}
  for (const [pid, bl] of Object.entries(blocksBy)) {
    const ms = [...new Set(bl.map(b => b.game))].flatMap(g => missedByGame[g] ?? [])
    const z = pairBlockedShots(bl, ms).zones
    outsideBlocks[pid] = z.mid + z.three
  }
  return { clutch, assists, outsideBlocks }
}

export function getGameExtras(leagueId: string): Promise<GameExtrasRaw> {
  return unstable_cache(() => load(leagueId), ['game-extras', 'v1', leagueId], {
    tags: [`league-${leagueId}`, `league-${leagueId}-games`], revalidate: 3600,
  })()
}
