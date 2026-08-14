// 참여신청(RSVP)
//
// GET  — 다음 경기 + 내 응답 + 집계. 비로그인도 경기 정보까지는 본다(가입 유도 목적).
// PUT  — 내 응답 저장. 승인 회원만.
//
// 왜 '다음 경기' 하나만 다루는가: 홈 카드가 묻는 건 언제나 "이번 주 나오나"이다.
//   여러 날짜를 한 번에 받아 봤자 화면이 못 쓰고, 응답률만 떨어진다.
//   특정 날짜가 필요하면 ?date= 로 지정한다(일정 화면용).

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canViewLeague, getApprovedSession } from '@/lib/auth/guard'
import { loadNextDate, loadVenueDefaults, applyVenueDefaults, resolveQuarterForDate, resolveAssignments, todayYmd, type UpcomingDate } from '@/lib/rsvp/nextGame'

const STATUSES = ['going', 'not_going', 'maybe'] as const
type Status = (typeof STATUSES)[number]

async function loadDate(sb: ReturnType<typeof createClient>, leagueId: string, date: string | null): Promise<UpcomingDate | null> {
  if (!date) return loadNextDate(sb, leagueId)
  const [{ data }, defaults] = await Promise.all([
    sb
      .from('league_schedule_dates')
      .select('id, date, start_time, place, capacity, is_skipped')
      .eq('league_id', leagueId)
      .eq('date', date)
      .maybeSingle(),
    loadVenueDefaults(sb, leagueId),
  ])
  // 대관 없는 주는 신청 대상이 아니다 — 날짜를 직접 지정해도 마찬가지다.
  if (!data || data.is_skipped) return null
  return { id: data.id, date: data.date, ...applyVenueDefaults(data, defaults) }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }

  const sb = createClient()
  const { searchParams } = new URL(req.url)
  const target = await loadDate(sb, leagueId, searchParams.get('date'))
  if (!target) return NextResponse.json({ date: null, me: null, summary: null })

  // 내 세션 — 승인 회원만 응답을 가진다. 비로그인/미승인은 경기 정보만 본다.
  const session = await getApprovedSession(leagueId)

  const { data: rows } = await sb
    .from('league_rsvp')
    .select('account_id, status, assigned_team_id')
    .eq('schedule_date_id', target.id)

  const all = rows ?? []
  const summary = {
    going: all.filter(r => r.status === 'going').length,
    maybe: all.filter(r => r.status === 'maybe').length,
    not_going: all.filter(r => r.status === 'not_going').length,
  }

  // 비로그인·미승인에게는 숫자까지만 준다. 누가 나오는지는 명단이라 회원 전용이다.
  if (!session) return NextResponse.json({ date: target, me: null, summary, teams: null })

  const quarter = await resolveQuarterForDate(sb, leagueId, target.date)

  // 참석·미정만 배정 대상이다. 불참은 어느 팀에도 세우지 않는다.
  const attending = all.filter(r => r.status === 'going' || r.status === 'maybe')

  // 이름은 계정이 아니라 선수에 있다. 계정 → 선수 → 이름 순으로 이어 붙인다.
  const accountIds = attending.map(r => r.account_id as string)
  const { data: accounts } = accountIds.length
    ? await sb
      .from('league_user_accounts')
      .select('id, league_player_id')
      .in('id', accountIds)
    : { data: [] as Array<{ id: string; league_player_id: string | null }> }

  const playerIdByAccount = new Map((accounts ?? []).map(a => [a.id as string, (a.league_player_id as string | null) ?? null]))
  const playerIds = [...playerIdByAccount.values()].filter((v): v is string => !!v)
  const { data: players } = playerIds.length
    ? await sb.from('league_players').select('id, name').in('id', playerIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const nameByPlayer = new Map((players ?? []).map(p => [p.id as string, p.name as string]))

  const assignments = await resolveAssignments(
    sb, leagueId, quarter?.id ?? null,
    attending.map(r => ({
      playerId: playerIdByAccount.get(r.account_id as string) ?? null,
      assignedTeamId: (r.assigned_team_id as string | null) ?? null,
    })),
  )

  // 팀별로 묶는다. 배정이 없는 사람은 waiting 으로 따로 뺀다 — 명단에 섞어 두면
  // 팀 인원이 실제보다 많아 보이고, 운영진이 누굴 배치해야 하는지 못 찾는다.
  const byTeam = new Map<string, { teamId: string; teamName: string; members: Array<{ name: string; status: Status }> }>()
  const waiting: Array<{ name: string; status: Status }> = []

  attending.forEach((r, i) => {
    const a = assignments[i]
    const name = nameByPlayer.get(playerIdByAccount.get(r.account_id as string) ?? '') ?? '이름 미상'
    const entry = { name, status: r.status as Status }
    if (a.waiting || !a.teamId) { waiting.push(entry); return }
    const key = a.teamId
    if (!byTeam.has(key)) byTeam.set(key, { teamId: key, teamName: a.teamName ?? '팀', members: [] })
    byTeam.get(key)!.members.push(entry)
  })

  // 참석이 먼저, 그다음 미정. 이름순은 그 안에서만 — 나오는 사람이 위에 있어야 읽힌다.
  const order = (s: Status) => (s === 'going' ? 0 : 1)
  for (const t of byTeam.values()) {
    t.members.sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name, 'ko'))
  }
  waiting.sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name, 'ko'))

  const mine = all.find(r => r.account_id === session.uid)
  const [myAssignment] = await resolveAssignments(sb, leagueId, quarter?.id ?? null, [
    { playerId: session.pid, assignedTeamId: (mine?.assigned_team_id as string | null) ?? null },
  ])
  const me = {
    status: (mine?.status as Status | undefined) ?? null,
    teamName: myAssignment.teamName,
    // 대기 표시는 '참석'일 때만 의미가 있다. 불참인데 "배정 대기"라고 뜨면 혼란스럽다.
    waiting: myAssignment.waiting && mine?.status === 'going',
  }

  return NextResponse.json({
    date: target,
    me,
    summary,
    teams: {
      // 팀 이름순 고정 — 새로고침마다 순서가 바뀌면 어느 팀이 어디 있었는지 매번 다시 찾는다.
      list: [...byTeam.values()].sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko')),
      waiting,
    },
  })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const session = await getApprovedSession(leagueId)
  if (!session) return NextResponse.json({ error: '가입 승인된 회원만 신청할 수 있습니다' }, { status: 401 })

  const body = await req.json() as { date?: string; status?: string }
  if (!body.status || !STATUSES.includes(body.status as Status)) {
    return NextResponse.json({ error: '알 수 없는 응답입니다' }, { status: 400 })
  }

  const sb = createClient()
  const target = await loadDate(sb, leagueId, body.date ?? null)
  if (!target) return NextResponse.json({ error: '신청할 수 있는 일정이 없습니다' }, { status: 404 })

  // 지난 경기에는 응답할 수 없다. 사후에 명단을 바꾸면 그날 실제로 누가 왔는지가 흐려진다.
  if (target.date < todayYmd()) {
    return NextResponse.json({ error: '이미 지난 일정입니다' }, { status: 400 })
  }

  // 정원은 '참석'에만 건다. 불참·미정은 자리를 차지하지 않는다.
  if (body.status === 'going' && target.capacity) {
    const { data: existing } = await sb
      .from('league_rsvp')
      .select('account_id, status')
      .eq('schedule_date_id', target.id)
    const going = (existing ?? []).filter(r => r.status === 'going')
    const alreadyIn = going.some(r => r.account_id === session.uid)
    // 이미 참석인 사람이 다시 눌러도 막지 않는다 — 그 사람 자리는 이미 세어져 있다.
    if (!alreadyIn && going.length >= target.capacity) {
      return NextResponse.json({ error: `정원 ${target.capacity}명이 모두 찼습니다` }, { status: 409 })
    }
  }

  const { error } = await sb
    .from('league_rsvp')
    .upsert({
      league_id: leagueId,
      schedule_date_id: target.id,
      account_id: session.uid,
      status: body.status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'schedule_date_id,account_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
