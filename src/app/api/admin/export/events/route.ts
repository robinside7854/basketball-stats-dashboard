// GET /api/admin/export/events?source=league|team&format=csv|jsonl
//   온볼에서 기록한 **모든 이벤트 로그**를 한 파일로 내려받는다 — 기록 자동화 모델 학습용(2026-10-16 사용자 요청).
//   · source=league : 리그 시스템(미라클 리그 · 미라클 대회 묶음 등) — league_game_events
//   · source=team   : 팀 시스템(파란날개 청년부·장년부 대회 기록) — game_events
//   인가: CEO 세션만(/api/admin/** 공통). 선수 이름이 들어가므로 회원·어드민에게 열지 않는다.
//
// 한 줄 = 이벤트 하나. 학습에 바로 쓰도록 경기·영상·선수·팀 정보를 옆에 풀어 둔다(조인 불필요).
//   · video_url / video_id / video_timestamp(영상 안의 초) — 그 장면이 담긴 유튜브 영상과 시각.
//     리그는 쿼터별 영상이 있으면 그것(resolveGameVideo 정본), 없으면 경기 대표 영상.
//   · 친선전·진행 중 경기·미마감 경기도 **빼지 않는다**(라벨 데이터로는 모두 유효) — is_exhibition·is_complete 열로 거른다.
//   · points 는 기록 시점에 저장된 값 그대로다(+1 규칙 재계산 아님). 득점 집계에는 쓰지 말 것.
//
// 응답은 스트리밍 — 이벤트가 수만 건이라 한 번에 만들면 서버 응답 크기 한도를 넘는다. 리그(또는 팀) 하나씩 써 내려간다.
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { fetchQuarterVideos, resolveGameVideo } from '@/lib/youtube/gameVideo'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { extractYouTubeId } from '@/lib/youtube/utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Sb = ReturnType<typeof createClient>
type Row = Record<string, unknown>

/** 출력 열 — 두 시스템 공통. 순서 = CSV 열 순서 */
const COLUMNS = [
  'system', 'org_slug', 'group_id', 'group_name', 'group_mode',
  'competition_id', 'competition_name',
  'game_id', 'game_date', 'slot_num', 'round_label', 'is_exhibition', 'is_started', 'is_complete',
  'home_team', 'away_team', 'home_score', 'away_score', 'opponent', 'our_score', 'opponent_score',
  'event_id', 'seq_in_game', 'quarter', 'video_timestamp', 'video_url', 'video_id', 'video_start_offset',
  'type', 'result', 'points',
  'player_id', 'player_name', 'player_number', 'team_id', 'team_name',
  'related_player_id', 'related_player_name',
  'extra', 'created_at',
] as const
type Col = typeof COLUMNS[number]
type OutRow = Partial<Record<Col, unknown>>

const PAGE = 1000

/** 표 전체를 id 순으로 나눠 읽는다(정렬 없이 나눠 읽으면 페이지 사이 줄이 빠지거나 겹친다) */
async function fetchAll(sb: Sb, table: string, select: string, filter?: (q: any) => any): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = []
  for (let p = 0; ; p++) {
    let q = sb.from(table).select(select).order('id', { ascending: true }).range(p * PAGE, (p + 1) * PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    const rows = (data ?? []) as unknown as Row[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** id 목록을 잘라 in 조회(긴 URL 방지) */
async function fetchIn(sb: Sb, table: string, select: string, col: string, ids: string[], extra?: (q: any) => any): Promise<Row[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out: Row[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    out.push(...await fetchAll(sb, table, select, q => {
      const r = q.in(col, chunk)
      return extra ? extra(r) : r
    }))
  }
  return out
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** 이벤트 행에서 공통 열로 옮기지 않은 나머지(슛 위치 등) — 스키마가 늘어도 버리지 않는다 */
function extraOf(ev: Row, used: Set<string>): string | null {
  const rest: Row = {}
  for (const [k, v] of Object.entries(ev)) if (!used.has(k) && v !== null && v !== undefined) rest[k] = v
  return Object.keys(rest).length ? JSON.stringify(rest) : null
}

/** 경기 안 순서 — 쿼터 → 영상 시각 → 입력 시각 */
function sortInGame(a: Row, b: Row): number {
  const qa = num(a.quarter) ?? 0, qb = num(b.quarter) ?? 0
  if (qa !== qb) return qa - qb
  const ta = num(a.video_timestamp), tb = num(b.video_timestamp)
  if (ta != null && tb != null && ta !== tb) return ta - tb
  return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
}

// ── 리그 시스템 ───────────────────────────────────────────────
const LEAGUE_EVENT_USED = new Set(['id', 'league_game_id', 'league_player_id', 'related_player_id', 'team_id', 'type', 'result', 'points', 'quarter', 'video_timestamp', 'created_at'])

async function* leagueRows(sb: Sb): AsyncGenerator<OutRow[]> {
  const leagues = await fetchAll(sb, 'leagues', 'id, name, org_slug, mode')
  for (const lg of leagues) {
    const leagueId = String(lg.id)
    const games = await fetchAll(sb, 'league_games', '*', q => q.eq('league_id', leagueId))
    if (games.length === 0) continue
    const gameIds = games.map(g => String(g.id))
    const [events, quarters, resolver, quarterVideos] = await Promise.all([
      fetchIn(sb, 'league_game_events', '*', 'league_game_id', gameIds),
      fetchAll(sb, 'league_quarters', '*', q => q.eq('league_id', leagueId)),
      loadIdentityResolver(sb, leagueId),
      fetchQuarterVideos(sb, gameIds),
    ])
    // 선수는 팀 소유(087) — league_id 로 찾으면 대회 묶음에서 0명이 나온다. 이벤트에 나온 id 로 직접 읽는다.
    const playerIds = [...new Set(events.flatMap(e => [str(e.league_player_id), str(e.related_player_id)]).filter((x): x is string => !!x))]
    const players = await fetchIn(sb, 'league_players', 'id, name, number', 'id', playerIds)
    const pName = new Map(players.map(p => [String(p.id), p]))
    const qName = new Map(quarters.map(q => [String(q.id), str(q.name) ?? str(q.label) ?? (q.year != null && q.quarter != null ? `${String(q.year).slice(2)}.${q.quarter}Q` : null)]))

    const byGame = new Map<string, Row[]>()
    for (const e of events) {
      const k = String(e.league_game_id)
      const arr = byGame.get(k) ?? []
      arr.push(e)
      byGame.set(k, arr)
    }
    const orderedGames = [...games].sort((a, b) =>
      String(a.date ?? '').localeCompare(String(b.date ?? '')) || (num(a.slot_num) ?? 0) - (num(b.slot_num) ?? 0))

    for (const g of orderedGames) {
      const evs = (byGame.get(String(g.id)) ?? []).sort(sortInGame)
      if (evs.length === 0) continue
      const quarterId = str(g.quarter_id)
      const teamName = (tid: string | null) => (tid ? resolver(tid, quarterId)?.display_name ?? null : null)
      const out: OutRow[] = evs.map((e, i) => {
        const video = resolveGameVideo(quarterVideos, String(g.id), num(e.quarter), {
          youtube_url: str(g.youtube_url), youtube_start_offset: num(g.youtube_start_offset),
        })
        const pid = str(e.league_player_id), rid = str(e.related_player_id)
        return {
          system: 'league', org_slug: lg.org_slug, group_id: leagueId, group_name: lg.name, group_mode: lg.mode ?? 'league',
          competition_id: quarterId, competition_name: quarterId ? qName.get(quarterId) ?? null : null,
          game_id: g.id, game_date: g.date, slot_num: g.slot_num, round_label: g.round_label ?? null,
          is_exhibition: g.is_exhibition ?? false, is_started: g.is_started ?? null, is_complete: g.is_complete ?? null,
          home_team: teamName(str(g.home_team_id)), away_team: teamName(str(g.away_team_id)),
          home_score: g.home_score, away_score: g.away_score,
          event_id: e.id, seq_in_game: i + 1, quarter: e.quarter, video_timestamp: e.video_timestamp,
          video_url: video?.url ?? null, video_id: video?.url ? extractYouTubeId(video.url) : null, video_start_offset: video?.startOffset ?? null,
          type: e.type, result: e.result, points: e.points,
          player_id: pid, player_name: pid ? pName.get(pid)?.name ?? null : null, player_number: pid ? pName.get(pid)?.number ?? null : null,
          team_id: e.team_id, team_name: teamName(str(e.team_id)),
          related_player_id: rid, related_player_name: rid ? pName.get(rid)?.name ?? null : null,
          extra: extraOf(e, LEAGUE_EVENT_USED), created_at: e.created_at,
        }
      })
      yield out
    }
  }
}

// ── 팀 시스템(파란날개) ───────────────────────────────────────
const TEAM_EVENT_USED = new Set(['id', 'game_id', 'player_id', 'related_player_id', 'type', 'result', 'points', 'quarter', 'video_timestamp', 'created_at'])

async function* teamRows(sb: Sb): AsyncGenerator<OutRow[]> {
  const teams = await fetchAll(sb, 'teams', 'id, org_slug, sub_slug, name')
  for (const t of teams) {
    const teamId = String(t.id)
    const tournaments = await fetchAll(sb, 'tournaments', '*', q => q.eq('team_id', teamId))
    if (tournaments.length === 0) continue
    const tName = new Map(tournaments.map(x => [String(x.id), str(x.name)]))
    const games = await fetchIn(sb, 'games', '*', 'tournament_id', tournaments.map(x => String(x.id)))
    if (games.length === 0) continue
    const events = await fetchIn(sb, 'game_events', '*', 'game_id', games.map(g => String(g.id)))
    const playerIds = [...new Set(events.flatMap(e => [str(e.player_id), str(e.related_player_id)]).filter((x): x is string => !!x))]
    const players = await fetchIn(sb, 'players', 'id, name, number', 'id', playerIds)
    const pName = new Map(players.map(p => [String(p.id), p]))

    const byGame = new Map<string, Row[]>()
    for (const e of events) {
      const k = String(e.game_id)
      const arr = byGame.get(k) ?? []
      arr.push(e)
      byGame.set(k, arr)
    }
    const orderedGames = [...games].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
    for (const g of orderedGames) {
      const evs = (byGame.get(String(g.id)) ?? []).sort(sortInGame)
      if (evs.length === 0) continue
      const url = str(g.youtube_url)
      yield evs.map((e, i) => {
        const pid = str(e.player_id), rid = str(e.related_player_id)
        return {
          system: 'team', org_slug: t.org_slug, group_id: teamId, group_name: t.name, group_mode: str(t.sub_slug),
          competition_id: g.tournament_id, competition_name: tName.get(String(g.tournament_id)) ?? null,
          game_id: g.id, game_date: g.date, round_label: g.round ?? null,
          opponent: g.opponent, our_score: g.our_score, opponent_score: g.opponent_score,
          event_id: e.id, seq_in_game: i + 1, quarter: e.quarter, video_timestamp: e.video_timestamp,
          video_url: url, video_id: url ? extractYouTubeId(url) : null, video_start_offset: num(g.youtube_start_offset),
          type: e.type, result: e.result, points: e.points,
          // 팀 시스템 이벤트는 「우리 팀」 선수만 남는다(상대 기록은 경기 점수로만)
          player_id: pid, player_name: pid ? pName.get(pid)?.name ?? null : null, player_number: pid ? pName.get(pid)?.number ?? null : null,
          team_id: teamId, team_name: t.name,
          related_player_id: rid, related_player_name: rid ? pName.get(rid)?.name ?? null : null,
          extra: extraOf(e, TEAM_EVENT_USED), created_at: e.created_at,
        }
      })
    }
  }
}

// ── 출력 ─────────────────────────────────────────────────────
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: Request) {
  const session = await requireCeoSession()
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } })

  const url = new URL(req.url)
  const source = url.searchParams.get('source')
  const format = url.searchParams.get('format') === 'jsonl' ? 'jsonl' : 'csv'
  if (source !== 'league' && source !== 'team') {
    return new Response(JSON.stringify({ error: 'source=league|team 이 필요합니다' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  const sb = createClient()
  const gen = source === 'league' ? leagueRows(sb) : teamRows(sb)
  const enc = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 엑셀에서 한글이 깨지지 않게 BOM
        if (format === 'csv') controller.enqueue(enc.encode('﻿' + COLUMNS.join(',') + '\n'))
        for await (const rows of gen) {
          const text = format === 'csv'
            ? rows.map(r => COLUMNS.map(c => csvCell(r[c])).join(',')).join('\n') + '\n'
            : rows.map(r => JSON.stringify(Object.fromEntries(COLUMNS.map(c => [c, r[c] ?? null])))).join('\n') + '\n'
          controller.enqueue(enc.encode(text))
        }
        controller.close()
      } catch (e) {
        // 헤더는 이미 나갔다 — 파일 끝에 오류 줄을 남겨 「다 받은 줄 알았는데 잘린」 파일을 알아보게 한다
        controller.enqueue(enc.encode(`\n#EXPORT_ERROR ${e instanceof Error ? e.message : String(e)}\n`))
        controller.close()
      }
    },
  })

  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const name = `onball-events-${source === 'league' ? 'league' : 'paranalgae'}-${day}.${format}`
  return new Response(stream, {
    headers: {
      'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
    },
  })
}
