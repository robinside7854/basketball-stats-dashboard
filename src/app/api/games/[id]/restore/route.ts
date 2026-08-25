import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveTeamIdForGame, verifyTeamPinForTeam } from '@/lib/teamPinAuth'
import { logAudit } from '@/lib/audit'

// GET  /api/games/[id]/restore  — 이 경기에서 되살릴 수 있는 기록이 있는지
// POST /api/games/[id]/restore  — 아카이브에서 되살린다
//
// 왜 있는가
//   마이그레이션 088 의 DELETE 트리거가 지워진 행을 *_archive 에 그대로 남기지만,
//   되살리는 경로는 SQL 밖에 없었다. 2026-08-22 사고에서 147건을 되살리는 데
//   service role SQL 이 필요했다 — 사고 당사자가 스스로 복구할 수 없는 상태였다.
//   여기서 그 경로를 UI 로 연다.
//
// 설계
//   · 아카이브에 있고 현재 표에 없는 행만 되살린다 → 몇 번을 눌러도 결과가 같다(멱등).
//   · FK 대상(선수)이 사라진 행은 되살리지 않고 세어서 돌려준다. 억지로 넣으면
//     player_id 가 NULL 인 유령 이벤트가 생겨 스탯이 조용히 틀어진다.
//   · is_complete 는 "점수는 있는데 미마감" 인 경우에만 true 로 되돌린다.
//     그게 정확히 '마감 후 초기화' 의 지문이다. 그 외에는 손대지 않는다.

const EVENT_COLS = [
  'id', 'game_id', 'quarter', 'video_timestamp', 'type', 'player_id',
  'result', 'related_player_id', 'points', 'notes', 'created_at', 'shot_zone',
] as const

const MINUTE_COLS = [
  'id', 'game_id', 'player_id', 'quarter', 'in_time', 'out_time', 'created_at',
] as const

type Row = Record<string, unknown>

/**
 * 같은 경기를 두 번 이상 삭제하면 아카이브에 **같은 id 의 행이 여러 벌** 쌓인다
 * (트리거가 삭제될 때마다 그대로 복사하므로). 그대로 되살리면 PK 충돌로 복구 전체가
 * 실패한다 — id 당 가장 최근 것 한 벌만 남긴다.
 */
function dedupeLatest(rows: Row[]): Row[] {
  const byId = new Map<string, Row>()
  for (const r of rows) {
    const id = r.id as string
    const prev = byId.get(id)
    if (!prev || String(r.archived_at ?? '') >= String(prev.archived_at ?? '')) byId.set(id, r)
  }
  return [...byId.values()]
}

/** 아카이브 행에서 원본 컬럼만 남긴다(archived_at·archive_txid 는 원본 표에 없다). */
function pick(row: Row, cols: readonly string[]): Row {
  const out: Row = {}
  for (const c of cols) out[c] = row[c]
  return out
}

interface Pending {
  events: Row[]
  minutes: Row[]
  /** 선수가 사라져 되살릴 수 없는 행 수 */
  orphanEvents: number
  orphanMinutes: number
  /** 마지막으로 삭제된 시각 — UI 가 "8/22 23:32 에 삭제된" 이라고 말할 수 있게 */
  lastDeletedAt: string | null
}

async function collectPending(gameId: string): Promise<Pending> {
  const sb = createClient()

  const [archEv, archMin, liveEv, liveMin] = await Promise.all([
    sb.from('game_events_archive').select('*').eq('game_id', gameId),
    sb.from('player_minutes_archive').select('*').eq('game_id', gameId),
    sb.from('game_events').select('id').eq('game_id', gameId),
    sb.from('player_minutes').select('id').eq('game_id', gameId),
  ])

  const liveEvIds = new Set((liveEv.data ?? []).map(r => r.id as string))
  const liveMinIds = new Set((liveMin.data ?? []).map(r => r.id as string))

  const evRows = dedupeLatest((archEv.data ?? []) as Row[]).filter(r => !liveEvIds.has(r.id as string))
  const minRows = dedupeLatest((archMin.data ?? []) as Row[]).filter(r => !liveMinIds.has(r.id as string))

  // FK 대상 선수 존재 확인 — 한 번에 모아서 묻는다.
  const referenced = new Set<string>()
  for (const r of evRows) {
    if (r.player_id) referenced.add(r.player_id as string)
    if (r.related_player_id) referenced.add(r.related_player_id as string)
  }
  for (const r of minRows) if (r.player_id) referenced.add(r.player_id as string)

  let alive = new Set<string>()
  if (referenced.size > 0) {
    const { data } = await sb.from('players').select('id').in('id', [...referenced])
    alive = new Set((data ?? []).map(r => r.id as string))
  }

  // player_id 가 살아있어야 되살린다. related_player_id 만 사라진 경우는
  // 그 칸만 비우고 살린다 — 어시스트 준 사람이 지워졌다고 득점까지 버릴 이유는 없다.
  const okEvents = evRows.filter(r => !r.player_id || alive.has(r.player_id as string))
  const okMinutes = minRows.filter(r => alive.has(r.player_id as string))

  const events = okEvents.map(r => {
    const row = pick(r as Row, EVENT_COLS)
    if (row.related_player_id && !alive.has(row.related_player_id as string)) row.related_player_id = null
    return row
  })
  const minutes = okMinutes.map(r => pick(r as Row, MINUTE_COLS))

  const stamps = [
    ...(archEv.data ?? []).map(r => r.archived_at as string),
    ...(archMin.data ?? []).map(r => r.archived_at as string),
  ].filter(Boolean).sort()

  return {
    events,
    minutes,
    orphanEvents: evRows.length - okEvents.length,
    orphanMinutes: minRows.length - okMinutes.length,
    lastDeletedAt: stamps.length ? stamps[stamps.length - 1] : null,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGame(id)
  // 되살릴 게 있는지 자체가 "이 경기 기록이 지워졌다" 는 정보다 — 편집 권한자에게만 보인다.
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const p = await collectPending(id)
  return NextResponse.json({
    restorable: p.events.length > 0 || p.minutes.length > 0,
    events: p.events.length,
    minutes: p.minutes.length,
    orphanEvents: p.orphanEvents,
    orphanMinutes: p.orphanMinutes,
    lastDeletedAt: p.lastDeletedAt,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGame(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const p = await collectPending(id)
  if (p.events.length === 0 && p.minutes.length === 0) {
    return NextResponse.json({ error: '되살릴 기록이 없습니다' }, { status: 404 })
  }

  const sb = createClient()

  if (p.events.length > 0) {
    const { error } = await sb.from('game_events').insert(p.events)
    if (error) {
      await logAudit({
        req, action: 'game.records.restore', targetTable: 'game_events', targetId: id,
        teamId, result: 'failure', detail: { message: error.message },
      })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (p.minutes.length > 0) {
    const { error } = await sb.from('player_minutes').insert(p.minutes)
    if (error) {
      // 이벤트는 이미 들어갔다. 롤백하지 않는다 — 되살린 것을 다시 지우는 쪽이 더 위험하다.
      // 재시도하면 남은 출전기록만 채워진다(멱등).
      await logAudit({
        req, action: 'game.records.restore', targetTable: 'player_minutes', targetId: id,
        teamId, result: 'failure',
        detail: { message: error.message, restoredEvents: p.events.length },
      })
      return NextResponse.json(
        { error: `이벤트 ${p.events.length}건은 복구했지만 출전기록에서 실패했습니다: ${error.message}` },
        { status: 500 },
      )
    }
  }

  // '마감 후 초기화' 의 지문 — 점수는 남아 있는데 미마감. 이 경우에만 마감을 되돌린다.
  let reCompleted = false
  const { data: game } = await sb
    .from('games')
    .select('is_complete, our_score, opponent_score')
    .eq('id', id)
    .maybeSingle()
  if (game && !game.is_complete && ((game.our_score ?? 0) > 0 || (game.opponent_score ?? 0) > 0)) {
    const { error } = await sb.rpc('set_game_complete', { game_id: id, complete: true })
    if (!error) reCompleted = true
  }

  await logAudit({
    req, action: 'game.records.restore', targetTable: 'games', targetId: id, teamId,
    detail: {
      restoredEvents: p.events.length,
      restoredMinutes: p.minutes.length,
      orphanEvents: p.orphanEvents,
      orphanMinutes: p.orphanMinutes,
      deletedAt: p.lastDeletedAt,
      reCompleted,
    },
  })

  return NextResponse.json({
    success: true,
    events: p.events.length,
    minutes: p.minutes.length,
    orphanEvents: p.orphanEvents,
    orphanMinutes: p.orphanMinutes,
    reCompleted,
  })
}
