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
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'
import { loadNextDate, loadVenueDefaults, applyVenueDefaults, loadQuarterMembership, resolveQuarterForDate, resolveAssignments, todayYmd, type UpcomingDate } from '@/lib/rsvp/nextGame'

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

  // ── 명단을 먼저 세우고, 그 위에 응답을 얹는다 ─────────────────────────────
  //
  // 응답한 사람만 보여주면 **아직 안 누른 사람이 화면에서 사라진다.** 그게 총무가 가장
  // 알고 싶은 정보다("누구를 찔러야 하나"). 그래서 정규회원 전원을 팀별로 깔고,
  // 응답은 표시(체크/물음표/X)로만 바꾼다. 미응답은 빈 동그라미로 남는다.
  const [membership, resolve, { data: accounts }, { data: playersRaw }] = await Promise.all([
    loadQuarterMembership(sb, leagueId, quarter?.id ?? null),
    loadIdentityResolver(sb, leagueId),
    sb.from('league_user_accounts').select('id, league_player_id, status').eq('league_id', leagueId),
    sb.from('league_players').select('id, name, is_guest').eq('league_id', leagueId),
  ])

  const nameByPlayer = new Map((playersRaw ?? []).map(p => [p.id as string, p.name as string]))
  const guestIds = new Set((playersRaw ?? []).filter(p => p.is_guest).map(p => p.id as string))

  // 선수 → 계정. 승인된 계정만 신청할 수 있으므로 그것만 센다.
  const accountByPlayer = new Map<string, string>()
  for (const a of accounts ?? []) {
    if (a.status !== 'approved') continue
    if (a.league_player_id) accountByPlayer.set(a.league_player_id as string, a.id as string)
  }

  const rsvpByAccount = new Map(all.map(r => [r.account_id as string, r]))

  interface Row { playerId: string; name: string; status: Status | null; hasAccount: boolean; isMe: boolean }
  const rowOf = (playerId: string): Row => {
    const accId = accountByPlayer.get(playerId)
    const r = accId ? rsvpByAccount.get(accId) : undefined
    return {
      playerId,
      name: nameByPlayer.get(playerId) ?? '이름 미상',
      status: (r?.status as Status | undefined) ?? null,
      hasAccount: !!accId,
      isMe: playerId === session.pid,
    }
  }

  // 팀 배정 — 운영진이 직접 배치한 값(assigned_team_id)이 분기 소속을 덮는다.
  const manualTeamByPlayer = new Map<string, string>()
  for (const r of all) {
    if (!r.assigned_team_id) continue
    const acc = (accounts ?? []).find(a => a.id === r.account_id)
    if (acc?.league_player_id) manualTeamByPlayer.set(acc.league_player_id as string, r.assigned_team_id as string)
  }

  const byTeam = new Map<string, { teamId: string; teamName: string; members: Row[] }>()
  const waiting: Row[] = []
  const push = (teamId: string | null, row: Row) => {
    if (!teamId) { waiting.push(row); return }
    if (!byTeam.has(teamId)) {
      byTeam.set(teamId, {
        teamId,
        // ⚠ 팀 이름은 (team_id, quarter_id) 로 푼다 — 분기마다 팀이 새로 짜인다.
        teamName: resolve(teamId, quarter?.id ?? null)?.display_name ?? '팀',
        members: [],
      })
    }
    byTeam.get(teamId)!.members.push(row)
  }

  // 1) 정규회원 전원 — 응답 여부와 무관하게 자기 팀에 깔린다.
  for (const [playerId, teamId] of membership) {
    if (!teamId || guestIds.has(playerId)) continue
    push(manualTeamByPlayer.get(playerId) ?? teamId, rowOf(playerId))
  }

  // 2) 비정규회원 — **응답한 사람만** 올린다. 18명 전원을 깔면 카드가 명단이 아니라
  //    전화번호부가 된다. 참석 의사를 밝힌 사람만 배정 대상이다.
  for (const [accountId, r] of rsvpByAccount) {
    if (r.status === 'not_going') continue
    const acc = (accounts ?? []).find(a => a.id === accountId)
    const pid = acc?.league_player_id as string | undefined
    if (!pid || guestIds.has(pid)) continue
    if (membership.get(pid)) continue          // 정규회원은 위에서 이미 넣었다
    push(manualTeamByPlayer.get(pid) ?? null, rowOf(pid))
  }

  // 참석 → 미정 → 미응답 → 불참 순. 나오는 사람이 위에 있어야 인원 계산이 눈으로 된다.
  const order = (s: Status | null) => (s === 'going' ? 0 : s === 'maybe' ? 1 : s === null ? 2 : 3)
  const sortRows = (a: Row, b: Row) => order(a.status) - order(b.status) || a.name.localeCompare(b.name, 'ko')
  for (const t of byTeam.values()) t.members.sort(sortRows)
  waiting.sort(sortRows)

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
