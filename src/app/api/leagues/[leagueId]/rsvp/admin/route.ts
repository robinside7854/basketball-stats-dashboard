// 주간 참가신청 — 팀 어드민(누구나) · CEO (마이그레이션 124, 2026-11-09 운영진)
//   POST { action:'set_answer', date, playerId, answer:'yes'|'no' }   — 대신 눌러 주기 · 게스트 추가(언제든)
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
import { walletErrorMessage } from '@/lib/wallet/wallet'
import { loadRsvpRules, loadRsvpBoard, AUTO_LABEL } from '@/lib/rsvp/weekly'

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
    const { data: prev } = await key(playerId).maybeSingle()
    if (body.answer === 'no' && (prev as { placed_team_id?: string | null } | null)?.placed_team_id) {
      return NextResponse.json({ error: '먼저 팀 배치를 취소해 주세요' }, { status: 409 })
    }
    const { error } = await sb.from('weekly_rsvp').upsert({
      league_id: leagueId, game_date: date, league_player_id: playerId, answer: body.answer,
      answered_by_label: actor, ...(prev ? {} : { answered_at: now }), updated_at: now,
    }, { onConflict: 'league_id,game_date,league_player_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
    if (target && r.answer !== 'yes') return NextResponse.json({ error: '「참」인 사람만 배치할 수 있어요' }, { status: 409 })
    let ticketId = r.ticket_id
    let ticketNote: string | null = null

    if (target && !ticketId) {
      // 비정규(정규권 없음 · 게스트 아님)면 이때 티켓 한 장 — 판정은 보드와 같은 한 벌
      const board = await loadRsvpBoard(sb, leagueId, date)
      const e = board.entries.find(x => x.player_id === playerId)
      if (e?.kind === 'non_regular') {
        const { data, error } = await sb.rpc('wallet_use_ticket', {
          p_team_id: teamId, p_player_id: playerId, p_date: date, p_note: '참가 배치', p_actor: actor,
        })
        if (error) {
          const msg = walletErrorMessage(error.message)
          return NextResponse.json({ error: msg ? `${msg} — 회원이 비정규 티켓을 사야 배치할 수 있어요` : error.message }, { status: msg ? 409 : 500 })
        }
        ticketId = (data as { id: string }).id
        ticketNote = '비정규 티켓 1장 사용'
      }
    }
    if (!target && ticketId && body.returnTicket === true) {
      const { error } = await sb.rpc('wallet_return_ticket', { p_team_id: teamId, p_ticket_id: ticketId, p_note: `${date} 배치 취소`, p_actor: actor })
      if (error) return NextResponse.json({ error: walletErrorMessage(error.message) ?? error.message }, { status: 409 })
      ticketId = null
      ticketNote = '비정규 티켓 돌려줌'
    }
    const { error } = await sb.from('weekly_rsvp').update({
      placed_team_id: target, ticket_id: ticketId, approved: target ? true : undefined, placed_by_label: actor, updated_at: now,
    }).eq('league_id', leagueId).eq('game_date', date).eq('league_player_id', playerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ticket: ticketNote })
  }

  return NextResponse.json({ error: 'action 은 set_answer · approve · place · place_suggested · guest_paid' }, { status: 400 })
}
