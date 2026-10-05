import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { resolveTeamIdForGameEvent, resolveTeamIdForPlayer, verifyTeamPinForTeam } from '@/lib/teamPinAuth'
import { inferShotZone, zonesFor, type EventType } from '@/types/database'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGameEvent(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { error } = await supabase.from('game_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// 기록 중 로그 수정 (2026-10-05) — 선수·종류·성공여부·어시스트·쿼터만 고친다.
//   종전엔 지우고 다시 넣어야 했는데, 그러면 영상 시각(video_timestamp)이 '지금' 으로 바뀌어
//   하이라이트 클립이 엉뚱한 지점을 가리켰다. 수정은 시각을 그대로 둔다.
//   교체(sub_in/out)·상대 득점은 출전시간·스코어와 얽혀 있어 여기서 다루지 않는다(삭제만).
const EDITABLE_TYPES = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'free_throw', 'oreb', 'dreb', 'steal', 'block', 'turnover', 'foul'])
const SHOT_TYPES = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'free_throw'])
const FIELD_GOALS = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'])

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const teamId = await resolveTeamIdForGameEvent(id)
  if (!(await verifyTeamPinForTeam(req, teamId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const raw: unknown = await req.json().catch(() => null)
  if (!raw || typeof raw !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  const body = raw as {
    player_id?: string; type?: string; result?: 'made' | 'missed' | null; related_player_id?: string | null; quarter?: number
  }
  if (body.player_id === '') delete body.player_id
  if (body.related_player_id === '') body.related_player_id = null
  if (body.result !== undefined && body.result !== null && body.result !== 'made' && body.result !== 'missed') {
    return NextResponse.json({ error: 'invalid result' }, { status: 400 })
  }
  const supabase = createClient()
  const { data: cur, error: curErr } = await supabase
    .from('game_events').select('id, type, player_id, result, related_player_id, quarter, shot_zone').eq('id', id).single()
  if (curErr || !cur) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (!EDITABLE_TYPES.has(cur.type)) return NextResponse.json({ error: '이 기록은 수정할 수 없습니다 — 삭제 후 다시 기록하세요' }, { status: 400 })

  const type = body.type ?? cur.type
  if (!EDITABLE_TYPES.has(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  const playerId = body.player_id ?? cur.player_id
  const quarter = body.quarter ?? cur.quarter
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 6) return NextResponse.json({ error: 'invalid quarter' }, { status: 400 })

  // 다른 팀 선수를 끼워 넣지 못하게 — 선수·어시스트 모두 이 경기 팀 소속이어야 한다
  for (const pid of [body.player_id, body.related_player_id]) {
    if (pid && (await resolveTeamIdForPlayer(pid)) !== teamId) {
      return NextResponse.json({ error: 'invalid player' }, { status: 400 })
    }
  }

  const isShot = SHOT_TYPES.has(type)
  const result = isShot ? (body.result !== undefined ? body.result : cur.result) ?? 'missed' : null
  // 어시스트는 성공한 야투에만 붙는다 — 실패로 바꾸거나 자유투로 바꾸면 떼어 낸다
  let related = body.related_player_id !== undefined ? body.related_player_id : cur.related_player_id
  if (!FIELD_GOALS.has(type) || result !== 'made' || related === playerId) related = null

  // 종류가 바뀌면 슛 구역도 맞춰야 한다(3점 구역에 찍힌 2점슛이 생기지 않게)
  let shotZone = cur.shot_zone
  if (type !== cur.type) shotZone = zonesFor(type as EventType).includes(shotZone) ? shotZone : inferShotZone(type as EventType)

  // points 계산은 POST 와 같아야 한다
  let points = 0
  if (result === 'made') {
    if (type === 'shot_3p') points = 3
    else if (type === 'free_throw') points = 1
    else if (FIELD_GOALS.has(type)) points = 2
  }

  const { data, error } = await supabase
    .from('game_events')
    .update({ type, player_id: playerId, result, related_player_id: related, quarter, shot_zone: shotZone, points })
    .eq('id', id)
    .select('*, player:players!game_events_player_id_fkey(*), related_player:players!game_events_related_player_id_fkey(*)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
