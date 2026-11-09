// 주간 참가신청 — 회원 (마이그레이션 124, 2026-11-09 운영진)
//   GET            → { enabled, window, capacity, me, entries, isAdmin, teams, unanswered? }
//                    window = 지금 열린 주(월 00:00 ~ 금 23:59 신청, 토 마감 결과) — 일요일은 null.
//                    어드민은 ?date=YYYY-MM-DD 로 다른 주도 본다.
//   POST { answer: 'yes'|'no' } → 내 참/불(신청 기간에만). 정규는 「참」이면 이번 달 팀으로 자동 배치, 「불」이면 자동 배치를 푼다.
//                                 티켓을 쓴 배치(비정규)·어드민이 옮긴 배치 뒤에는 어드민에게.
//   POST { action:'guest', name, age, position, height_cm } → 게스트 신청(2026-11-09 운영진 — 게스트를 부르는 회원이 직접).
//                                 게스트 선수(is_guest)를 만들거나(같은 이름 게스트가 있으면 다시 씀) 「참」으로 넣고 대기명단에 둔다.
//                                 팀 배치는 어드민이 한다. 나이는 「올해 − 나이」년 1월 1일 생년월일로 저장(선수 표에 나이 칸이 없다).
//   회원은 「참」 명단(이름·구분·배치 팀)을 본다 — 불참 명단·미응답은 어드민만.
//   캐시 없음(ISR Reads 0) — 홈 카드가 매번 최신을 본다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { getApprovedSession } from '@/lib/auth/guard'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { currentWindow, loadRsvpRules, loadRsvpBoard, autoPlaceRegular, autoPlaceAtClose, AUTO_LABEL } from '@/lib/rsvp/weekly'

type Ctx = { params: Promise<{ leagueId: string }> }
const NO_STORE = { headers: { 'Cache-Control': 'no-store' } }
const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const sb = createClient()
  const rules = await loadRsvpRules(sb, leagueId)
  if (!rules) return NextResponse.json({ enabled: false }, NO_STORE)

  const [session, isAdmin] = await Promise.all([getApprovedSession(leagueId), canEditLeague(req, leagueId)])
  if (!session && !isAdmin) return NextResponse.json({ enabled: true, window: null, me: null }, NO_STORE)

  const asked = new URL(req.url).searchParams.get('date')
  const win = currentWindow(rules)
  const gameDate = isAdmin && asked && YMD.test(asked) ? asked : win?.gameDate
  if (!gameDate) return NextResponse.json({ enabled: true, window: null, capacity: rules.capacity, me: null, isAdmin }, NO_STORE)

  let board = await loadRsvpBoard(sb, leagueId, gameDate)
  // 마감(토요일) 뒤 처음 열릴 때 아직 팀 없는 정규만 이번 달 팀으로(autoPlaceAtClose). 비정규·게스트는 대기명단 — 어드민이 배치.
  if (win?.phase === 'closed' && win.gameDate === gameDate && board.entries.some(e => e.answer === 'yes' && !e.placed_team_id)) {
    if (await autoPlaceAtClose(sb, leagueId, gameDate) > 0) board = await loadRsvpBoard(sb, leagueId, gameDate)
  }
  // 이 기능 전에 「참」을 눌러 둔 정규 — 열어 볼 때 이번 달 팀으로 맞춘다(본인 줄만).
  const pending = session && board.entries.find(e => e.player_id === session.pid && e.answer === 'yes' && e.kind === 'regular' && !e.placed_team_id && e.suggested_team_id)
  if (pending && win?.gameDate === gameDate) {
    await autoPlaceRegular(sb, leagueId, gameDate, session!.pid)
    board = await loadRsvpBoard(sb, leagueId, gameDate)
  }
  const mine = session ? board.entries.find(e => e.player_id === session.pid) ?? null : null
  // 내 구분·티켓은 답하기 전에도 보여야 한다(「비정규 티켓이 없어요」 안내)
  let meKind: string | null = mine?.kind ?? null
  let meTickets = mine?.tickets_left ?? 0
  if (session && !mine) {
    const probe = await loadRsvpBoardProbe(sb, leagueId, gameDate, session.pid)
    meKind = probe.kind; meTickets = probe.tickets
  }

  return NextResponse.json({
    enabled: true,
    window: win && win.gameDate === gameDate ? win : { gameDate, opensAt: null, closesAt: null, phase: 'closed' },
    capacity: rules.capacity,
    isAdmin,
    me: session ? {
      answer: mine?.answer ?? null, approved: mine?.approved ?? false, placed_team_id: mine?.placed_team_id ?? null, kind: meKind, tickets_left: meTickets,
      // 이번 달 팀이 정해진 사람(정규권 유무와 무관) — 「팀은 있는데 정규권이 없어요」 안내용
      month_team_id: mine?.suggested_team_id ?? board.unanswered.find(u => u.player_id === session.pid)?.suggested_team_id ?? null,
    } : null,
    entries: isAdmin ? board.entries : board.entries.filter(e => e.answer === 'yes'),
    teams: board.teams,
    unanswered: isAdmin ? board.unanswered : undefined,
  }, NO_STORE)
}

// 아직 답하지 않은 회원의 구분·티켓 — 보드와 같은 규칙(정규권 · 게스트 · 남은 비정규 티켓)
async function loadRsvpBoardProbe(sb: ReturnType<typeof createClient>, leagueId: string, gameDate: string, pid: string) {
  const month = `${gameDate.slice(0, 7)}-01`
  const [p, pass, tk] = await Promise.all([
    sb.from('league_players').select('is_guest, team_id').eq('id', pid).maybeSingle(),
    sb.from('wallet_tickets').select('id').eq('league_player_id', pid).eq('kind', 'regular_pass').eq('month', month).in('status', ['active', 'used']).limit(1),
    sb.from('wallet_tickets').select('id').eq('league_player_id', pid).eq('kind', 'non_regular').eq('status', 'active'),
  ])
  const guest = !!(p.data as { is_guest?: boolean } | null)?.is_guest
  return { kind: guest ? 'guest' : (pass.data ?? []).length > 0 ? 'regular' : 'non_regular', tickets: (tk.data ?? []).length }
}

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '로그인이 필요해요' }, { status: 401 })
  const sb = createClient()
  const rules = await loadRsvpRules(sb, leagueId)
  if (!rules) return NextResponse.json({ error: '참가신청을 쓰지 않는 리그예요' }, { status: 404 })
  const win = currentWindow(rules)
  if (!win || win.phase !== 'open') return NextResponse.json({ error: '지금은 신청 기간이 아니에요 (월요일 0시 ~ 금요일 밤)' }, { status: 409 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  if (body.action === 'guest') return addGuest(sb, leagueId, win.gameDate, session.pid, body)

  if (body.answer !== 'yes' && body.answer !== 'no') return NextResponse.json({ error: '참 또는 불을 골라 주세요' }, { status: 400 })

  const { data: prev } = await sb.from('weekly_rsvp').select('placed_team_id, ticket_id, placed_by_label')
    .eq('league_id', leagueId).eq('game_date', win.gameDate).eq('league_player_id', session.pid).maybeSingle()
  const pr = prev as { placed_team_id: string | null; ticket_id: string | null; placed_by_label: string | null } | null
  // 자동 배치(정규)는 본인이 바꿀 수 있다. 티켓을 쓴 배치·어드민이 정한 배치는 어드민에게.
  if (pr?.placed_team_id && (pr.ticket_id || pr.placed_by_label !== AUTO_LABEL)) {
    return NextResponse.json({ error: '어드민이 팀에 배치했어요 — 바꾸려면 어드민에게 말해 주세요' }, { status: 409 })
  }
  const { error } = await sb.from('weekly_rsvp').upsert({
    league_id: leagueId, game_date: win.gameDate, league_player_id: session.pid,
    answer: body.answer, answered_by_label: '본인', answered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'league_id,game_date,league_player_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const placed = await autoPlaceRegular(sb, leagueId, win.gameDate, session.pid)
  return NextResponse.json({ ok: true, placed_team_id: placed })
}

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']

async function addGuest(sb: ReturnType<typeof createClient>, leagueId: string, gameDate: string, inviterId: string, body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ').slice(0, 30) : ''
  const age = Number(body.age)
  const height = body.height_cm == null || body.height_cm === '' ? null : Number(body.height_cm)
  const pos = (Array.isArray(body.position) ? body.position : String(body.position ?? '').split(','))
    .map(p => String(p).trim().toUpperCase()).filter(p => POSITIONS.includes(p))
  if (!name) return NextResponse.json({ error: '게스트 이름을 적어 주세요' }, { status: 400 })
  if (!Number.isInteger(age) || age < 10 || age > 80) return NextResponse.json({ error: '나이를 숫자로 적어 주세요 (10~80)' }, { status: 400 })
  if (height != null && (!Number.isInteger(height) || height < 140 || height > 230)) return NextResponse.json({ error: '키는 cm 숫자로 적어 주세요 (140~230)' }, { status: 400 })
  if (pos.length === 0) return NextResponse.json({ error: '포지션을 하나 이상 골라 주세요' }, { status: 400 })

  const teamId = await resolveTeamId(leagueId)
  const year = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).slice(0, 4))
  const fields = { position: [...new Set(pos)].join(','), height_cm: height, birth_date: `${year - age}-01-01` }
  const [{ data: inviter }, { data: same }] = await Promise.all([
    sb.from('league_players').select('name').eq('id', inviterId).maybeSingle(),
    sb.from('league_players').select('id, is_guest').eq('team_id', teamId).eq('name', name).limit(1),
  ])
  const existing = (same ?? [])[0] as { id: string; is_guest: boolean } | undefined
  if (existing && !existing.is_guest) return NextResponse.json({ error: '같은 이름의 회원이 있어요 — 이름 뒤에 표시를 붙여 주세요(예: 홍길동G)' }, { status: 409 })

  let guestId = existing?.id
  if (guestId) {
    const { error } = await sb.from('league_players').update({ ...fields, is_active: true }).eq('id', guestId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { data, error } = await sb.from('league_players')
      .insert({ league_id: leagueId, team_id: teamId, name, is_guest: true, ...fields }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    guestId = (data as { id: string }).id
  }
  const { data: prev } = await sb.from('weekly_rsvp').select('id').eq('league_id', leagueId).eq('game_date', gameDate).eq('league_player_id', guestId).maybeSingle()
  if (prev) return NextResponse.json({ error: '이 게스트는 이번 주에 이미 신청돼 있어요' }, { status: 409 })
  const now = new Date().toISOString()
  const { error } = await sb.from('weekly_rsvp').insert({
    league_id: leagueId, game_date: gameDate, league_player_id: guestId, answer: 'yes',
    answered_by_label: `${(inviter as { name?: string } | null)?.name ?? '회원'} 초대`, answered_at: now, updated_at: now,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, guest_id: guestId }, { status: 201 })
}
