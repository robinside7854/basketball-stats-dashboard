// 주간 참가신청 — 팀 어드민(누구나) · CEO (마이그레이션 124, 2026-11-09 운영진)
//   POST { action:'set_answer', date, playerId, answer:'yes'|'no' }   — 대신 눌러 주기(회원만 · 게스트는 「불」 = 그 주 신청 지우기)
//   POST { action:'approve', date, playerId, approved:boolean }        — 비정규·게스트 승인
//   POST { action:'place', date, playerId, teamId|null, returnTicket? } — 팀 배치(비정규면 이때 티켓 1장 사용)
//   POST { action:'place_suggested', date }                            — 정규를 이번 달 소속 팀으로 한 번에
//   POST { action:'guest_paid', date, playerId, paid:boolean }          — 게스트비 받음 표시(통장 입금)
//   정원(18)은 안내만 — 넘쳐도 막지 않는다(팀장·총무 회의로 정함).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { resolveAuditActor } from '@/lib/audit'
import { loadRsvpRules, loadRsvpBoard, placeEntry, autoPlaceRegular, AUTO_LABEL } from '@/lib/rsvp/weekly'

type Ctx = { params: Promise<{ leagueId: string }> }
const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createClient()
  if (!(await loadRsvpRules(sb, leagueId))) return NextResponse.json({ error: '참가신청을 쓰지 않는 리그예요' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const date = typeof body.date === 'string' && YMD.test(body.date) ? body.date : null
  if (!date) return NextResponse.json({ error: 'date 필수' }, { status: 400 })
  const actor = (await resolveAuditActor(req, { leagueId })).label
  const teamId = await resolveTeamId(leagueId)
  const now = new Date().toISOString()
  const key = (pid: string) => sb.from('weekly_rsvp').select('*').eq('league_id', leagueId).eq('game_date', date).eq('league_player_id', pid)

  if (body.action === 'place_suggested') {
    const board = await loadRsvpBoard(sb, leagueId, date)
    const targets = board.entries.filter(e => e.answer === 'yes' && e.kind === 'regular' && !e.placed_team_id && e.suggested_team_id)
    for (const e of targets) {
      await sb.from('weekly_rsvp').update({ placed_team_id: e.suggested_team_id, approved: true, placed_by_label: AUTO_LABEL, updated_at: now })
        .eq('league_id', leagueId).eq('game_date', date).eq('league_player_id', e.player_id)
    }
    return NextResponse.json({ ok: true, placed: targets.length })
  }

  const playerId = typeof body.playerId === 'string' ? body.playerId : null
  if (!playerId) return NextResponse.json({ error: 'playerId 필수' }, { status: 400 })
  const { data: p } = await sb.from('league_players').select('id').eq('id', playerId).eq('team_id', teamId).maybeSingle()
  if (!p) return NextResponse.json({ error: '이 팀 회원이 아니에요' }, { status: 404 })

  if (body.action === 'set_answer') {
    if (body.answer !== 'yes' && body.answer !== 'no') return NextResponse.json({ error: 'answer 는 yes · no' }, { status: 400 })
    const { data: who } = await sb.from('league_players').select('is_guest').eq('id', playerId).maybeSingle()
    const isGuest = !!(who as { is_guest?: boolean } | null)?.is_guest
    // 게스트는 「게스트 신청」으로만 들어온다 — 대신 참으로 넣지 않는다. 불참으로 바꾸면 그 주 신청을 지운다.
    if (isGuest && body.answer === 'yes') return NextResponse.json({ error: '게스트는 회원이 「게스트 신청」으로 넣어요' }, { status: 409 })
    if (isGuest) {
      const { error } = await sb.from('weekly_rsvp').delete().eq('league_id', leagueId).eq('game_date', date).eq('league_player_id', playerId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, removed: true })
    }
    const { data: prev } = await key(playerId).maybeSingle()
    const pv = prev as { placed_team_id?: string | null; ticket_id?: string | null } | null
    // 「불」로 바꿀 때: 티켓을 쓴 배치(비정규)는 먼저 배치를 풀어야 한다(티켓 돌려줄지 정해야 해서).
    //   티켓 없는 배치(정규 자동 배치 등)는 같이 푼다 — V/X 원클릭(2026-11-09 운영진).
    if (body.answer === 'no' && pv?.placed_team_id && pv.ticket_id) {
      return NextResponse.json({ error: '비정규 티켓을 쓴 배치예요 — 먼저 대기명단으로 옮겨 티켓을 정리해 주세요' }, { status: 409 })
    }
    const { error } = await sb.from('weekly_rsvp').upsert({
      league_id: leagueId, game_date: date, league_player_id: playerId, answer: body.answer,
      answered_by_label: actor, ...(prev ? {} : { answered_at: now }), updated_at: now,
      ...(body.answer === 'no' ? { placed_team_id: null } : {}),
    }, { onConflict: 'league_id,game_date,league_player_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // 정규면 「참」 = 이번 달 팀으로 바로 배치(회원이 직접 누를 때와 같은 규칙)
    if (body.answer === 'yes') await autoPlaceRegular(sb, leagueId, date, playerId)
    return NextResponse.json({ ok: true })
  }

  const { data: row } = await key(playerId).maybeSingle()
  const r = row as { answer: string; ticket_id: string | null; placed_team_id: string | null } | null
  if (!r) return NextResponse.json({ error: '신청 기록이 없어요' }, { status: 404 })

  if (body.action === 'approve') {
    const { error } = await sb.from('weekly_rsvp').update({ approved: body.approved === true, updated_at: now })
      .eq('league_id', leagueId).eq('game_date', date).eq('league_player_id', playerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'guest_paid') {
    const { error } = await sb.from('weekly_rsvp').update({ guest_paid: body.paid === true, updated_at: now })
      .eq('league_id', leagueId).eq('game_date', date).eq('league_player_id', playerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'place') {
    const target = typeof body.teamId === 'string' && body.teamId ? body.teamId : null
    const res = await placeEntry(sb, leagueId, date, playerId, target, actor, { returnTicket: body.returnTicket === true })
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json({ ok: true, ticket: res.ticket })
  }

  return NextResponse.json({ error: 'action 은 set_answer · approve · place · place_suggested · guest_paid' }, { status: 400 })
}
