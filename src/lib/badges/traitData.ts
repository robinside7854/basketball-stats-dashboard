// 개인특성 배지용 커리어 집계 — 리그 이벤트를 훑어 선수별 입력값을 만든다.
//
// leagueStats.ts 와 나눠 둔 이유: 저쪽은 화면에 뿌릴 박스스코어를 만들고, 여기는 배지 판정에만
// 필요한 값(슛 유형별 시도/성공, 어시스트 연결 유형, 팀 득점 대비 비율)을 만든다. 한 함수로
// 합치면 어느 화면이 어떤 필드에 의존하는지 알 수 없게 되고, 배지 규칙을 바꿀 때마다
// 스탯 화면 전체가 회귀 대상이 된다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'
import type { TraitInput } from './traitBadges'
import { resolveTeamId } from '@/lib/league/teamScope'

const FIELD_SHOTS = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'])

export interface TraitPlayerMeta {
  id: string
  name: string
  number: number | null
  photo_url: string | null
}

export interface TraitDataset {
  players: TraitPlayerMeta[]
  inputs: TraitInput[]
}

/**
 * 리그 전원의 배지 입력값을 만든다.
 * 게스트·비활성 선수는 제외한다 — 리더보드에서 뺀 것과 같은 규칙(2026-08-10 결정).
 */
export async function fetchTraitDataset(
  supabase: SupabaseClient | null,
  leagueId: string,
): Promise<TraitDataset> {
  const sb = supabase ?? createClient()

  const { data: playerRows, error: pErr } = await sb
    .from('league_players')
    .select('id, name, number, photo_url, is_guest, is_active')
    // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 **대회 묶음에서 0명**이 나와
    //   이름이 '알 수 없음' 으로, plus_one 이 꺼진 것으로 조용히 계산된다(2026-08-31 실측).
    .eq('team_id', await resolveTeamId(leagueId))
  if (pErr) throw new Error(`fetchTraitDataset: leagueId=${leagueId} league_players 조회 실패 — ${pErr.message}`)

  const players = (playerRows ?? [])
    .filter(p => !p.is_guest && p.is_active !== false)
    .map(p => ({ id: p.id as string, name: p.name as string, number: p.number as number | null, photo_url: p.photo_url as string | null }))
  const allowed = new Set(players.map(p => p.id))
  if (allowed.size === 0) return { players: [], inputs: [] }

  const { data: gameRows, error: gErr } = await sb
    .from('league_games')
    .select('id, date')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    // 친선전(비공식 라운드)은 집계에서 제외한다. 개인특성 배지는 모집단 안 상위 백분율로 판정하므로 표본이 섞이면 순위가 흔들린다.
    .eq('is_exhibition', false)
  if (gErr) throw new Error(`fetchTraitDataset: leagueId=${leagueId} league_games 조회 실패 — ${gErr.message}`)
  const gameDate = new Map<string, string>((gameRows ?? []).map(g => [g.id as string, g.date as string]))
  const gameIds = [...gameDate.keys()]
  if (gameIds.length === 0) return { players, inputs: [] }

  const externalTeamIds = await fetchExternalTeamIds(sb, leagueId)

  // ⚠ PostgREST 는 1000행에서 잘린다 — 리그 이벤트는 그보다 훨씬 많다
  type Row = {
    league_player_id: string | null
    related_player_id: string | null
    team_id: string | null
    type: string
    result: string | null
    points: number | null
    league_game_id: string
  }
  const events: Row[] = []
  const PAGE = 1000
  for (let page = 0; ; page++) {
    const { data: chunk, error } = await sb
      .from('league_game_events')
      .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw new Error(`fetchTraitDataset: 이벤트 조회 실패 — ${error.message}`)
    if (chunk?.length) events.push(...(chunk as Row[]))
    if (!chunk || chunk.length < PAGE) break
  }

  const blank = (id: string): TraitInput => ({
    playerId: id, rounds: 0,
    fga: 0, fgm: 0, threeA: 0,
    postA: 0, postM: 0, layA: 0, layM: 0, midA: 0, midM: 0,
    oreb: 0, dreb: 0, stl: 0, blk: 0, tov: 0,
    ast: 0, ast3: 0, astPaint: 0,
    myPoints: 0, teamPoints: 0,
  })
  const acc = new Map<string, TraitInput>(players.map(p => [p.id, blank(p.id)]))
  const roundsOf = new Map<string, Set<string>>(players.map(p => [p.id, new Set()]))
  /** (게임, 팀) 총득점 — 득점기계의 분모 */
  const teamPtsByGame = new Map<string, number>()
  /** 선수가 그 게임에서 어느 팀이었나 (이벤트에 찍힌 team_id 다수결) */
  const playerTeamInGame = new Map<string, Map<string, number>>()

  for (const e of events) {
    // 팀 득점 합계는 외부 팀도 포함해 계산해야 상대 점수까지 맞지만, 여기 쓰임은
    // "본인 팀 총득점"뿐이라 우리 팀만 모으면 된다.
    if (e.team_id && !externalTeamIds.has(e.team_id) && (e.points ?? 0) > 0) {
      const key = `${e.league_game_id}|${e.team_id}`
      teamPtsByGame.set(key, (teamPtsByGame.get(key) ?? 0) + (e.points ?? 0))
    }

    const pid = e.league_player_id
    if (pid && allowed.has(pid) && !(e.team_id && externalTeamIds.has(e.team_id))) {
      const a = acc.get(pid)!
      const date = gameDate.get(e.league_game_id)
      if (date) roundsOf.get(pid)!.add(date)
      if (e.team_id) {
        if (!playerTeamInGame.has(pid)) playerTeamInGame.set(pid, new Map())
        const key = `${e.league_game_id}|${e.team_id}`
        const m = playerTeamInGame.get(pid)!
        m.set(key, (m.get(key) ?? 0) + 1)
      }
      a.myPoints += e.points ?? 0

      const made = e.result === 'made'
      if (FIELD_SHOTS.has(e.type)) {
        a.fga++
        if (made) a.fgm++
        if (e.type === 'shot_3p')      { a.threeA++ }
        if (e.type === 'shot_post')    { a.postA++; if (made) a.postM++ }
        if (e.type === 'shot_layup')   { a.layA++;  if (made) a.layM++ }
        if (e.type === 'shot_2p_mid')  { a.midA++;  if (made) a.midM++ }
      }
      if (e.type === 'oreb') a.oreb++
      if (e.type === 'dreb') a.dreb++
      if (e.type === 'steal') a.stl++
      if (e.type === 'block') a.blk++
      if (e.type === 'turnover') a.tov++
    }

    // 어시스트는 related_player_id 쪽에 쌓인다
    const aid = e.related_player_id
    if (aid && allowed.has(aid) && e.result === 'made' && FIELD_SHOTS.has(e.type)) {
      const a = acc.get(aid)!
      a.ast++
      if (e.type === 'shot_3p') a.ast3++
      if (e.type === 'shot_post' || e.type === 'shot_layup') a.astPaint++
    }
  }

  for (const [pid, input] of acc) {
    input.rounds = roundsOf.get(pid)?.size ?? 0
    // 본인이 뛴 (게임, 팀) 조합의 팀 득점을 합친다 — 한 게임에서 팀이 여럿으로 찍혔다면
    // 이벤트가 가장 많은 쪽을 그 경기의 소속으로 본다(비정규 출전 보정과 같은 규칙).
    const games = new Map<string, { key: string; count: number }>()
    for (const [key, count] of playerTeamInGame.get(pid) ?? []) {
      const gameId = key.split('|')[0]
      const cur = games.get(gameId)
      if (!cur || count > cur.count) games.set(gameId, { key, count })
    }
    let team = 0
    for (const { key } of games.values()) team += teamPtsByGame.get(key) ?? 0
    input.teamPoints = team
  }

  return { players, inputs: [...acc.values()] }
}
