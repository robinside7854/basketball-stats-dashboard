// GET/POST /api/leagues/[leagueId]/players/[playerId]/pins
// 선수 프로필카드에 노출할 "내 베스트샷" 핀 관리.
// - 저장 형태: league_players.pinned_event_ids uuid[]
// - 최대 3개 · 서버측 캡 (열려있는 편집이지만 배열 폭주만 방지)
// - 이벤트 소유권 검증: 해당 이벤트가 이 선수(league_player_id) + 이 리그의 game 인지만 확인
//   (로그인 없는 오픈 편집 전제 · 남용 가능성 낮음 인정)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { resolveTeamId } from '@/lib/league/teamScope'

const MAX_PINS = 3

// 핀은 league_players.pinned_event_ids 에 저장되는 개인 속성이고, 그 행은 이제 팀 소유다.
//   league_id 로 소속을 확인하면 대회 화면에서 이 선수 카드를 열었을 때(행의 출생 league_id
//   는 리그일 수 있다) 찾지 못해 항상 404 가 난다 — team_id 로 바꾼다.
async function fetchPins(leagueId: string, playerId: string) {
  const sb = createClient()
  const teamId = await resolveTeamId(leagueId)
  const { data, error } = await sb
    .from('league_players')
    .select('id, pinned_event_ids')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { id: string; pinned_event_ids: string[] | null })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> },
) {
  const { leagueId, playerId } = await params
  const row = await fetchPins(leagueId, playerId)
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ pinned_event_ids: row.pinned_event_ids ?? [] })
}

// POST body: { action: 'add' | 'remove' | 'reorder', eventId?: string, order?: string[] }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> },
) {
  const { leagueId, playerId } = await params
  let body: { action?: unknown; eventId?: unknown; order?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }
  const action = body.action
  if (action !== 'add' && action !== 'remove' && action !== 'reorder') {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const sb = createClient()

  const row = await fetchPins(leagueId, playerId)
  if (!row) return NextResponse.json({ error: 'player not found' }, { status: 404 })
  const current = row.pinned_event_ids ?? []

  let next: string[]
  if (action === 'add') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : ''
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    // 이벤트가 실제로 이 선수의 이 리그 이벤트인지 검증 (남용 방지 최소)
    const { data: ev } = await sb
      .from('league_game_events')
      .select('id, league_player_id, league_game_id')
      .eq('id', eventId)
      .maybeSingle()
    if (!ev) return NextResponse.json({ error: 'event not found' }, { status: 404 })
    const evRow = ev as { league_player_id: string | null; league_game_id: string }
    if (evRow.league_player_id !== playerId) {
      return NextResponse.json({ error: 'event not owned by player' }, { status: 400 })
    }
    // 리그 검증 (게임 → 리그)
    const { data: game } = await sb
      .from('league_games')
      .select('league_id')
      .eq('id', evRow.league_game_id)
      .maybeSingle()
    if (!game || (game as { league_id: string }).league_id !== leagueId) {
      return NextResponse.json({ error: 'league mismatch' }, { status: 400 })
    }
    if (current.includes(eventId)) {
      next = current   // 이미 핀됨 → no-op
    } else if (current.length >= MAX_PINS) {
      return NextResponse.json({ error: `핀은 최대 ${MAX_PINS}개까지 가능합니다` }, { status: 400 })
    } else {
      next = [...current, eventId]
    }
  } else if (action === 'remove') {
    const eventId = typeof body.eventId === 'string' ? body.eventId : ''
    if (!eventId) return NextResponse.json({ error: 'eventId required' }, { status: 400 })
    next = current.filter(id => id !== eventId)
  } else {
    // reorder: 현재 배열의 순서만 재배치 (추가/제거 불가)
    const order = Array.isArray(body.order) ? body.order.filter((x): x is string => typeof x === 'string') : []
    const currentSet = new Set(current)
    const orderSet = new Set(order)
    if (order.length !== current.length || [...currentSet].some(id => !orderSet.has(id))) {
      return NextResponse.json({ error: 'reorder must contain same event ids' }, { status: 400 })
    }
    next = order
  }

  const teamId = await resolveTeamId(leagueId)
  const { error: uErr } = await sb
    .from('league_players')
    .update({ pinned_event_ids: next })
    .eq('id', playerId)
    .eq('team_id', teamId)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  revalidateTag(`league-${leagueId}-players-${playerId}`, 'max')
  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ pinned_event_ids: next })
}
