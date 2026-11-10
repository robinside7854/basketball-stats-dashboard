// POST /api/leagues/[leagueId]/auth/signup
//   body: { name: string, birthdate: string (YYMMDD · 초기 비번용) }
//   가입 요청 · 이름만 매칭 (기존 선수 정보에 생년월일 대부분 비어있어 이름 기준 · 2026-07-21 완화)
//   · 매칭되는 league_player 있어야 함 (name · 게스트 제외)
//   · 동명이인 다수 케이스: 첫 매치 (non-guest 우선 · 이후 id 순)
//   · 이미 그 선수 계정이 있으면 상태별 알림 반환
//   · 생년월일은 초기 비밀번호로만 사용 (매칭 검증에는 사용 안 함)
//   2026-11-10 운영진 — 승인 규칙:
//   · 명단(활동 중 · 게스트 아님)에 이름이 **딱 한 명** 맞으면 → 바로 승인 + 그 자리에서 로그인
//   · 동명이인 · 활동 안 함 · 게스트만 있음 · 명단에 없음 → 운영진 승인 대기
//     (명단에 없는 사람은 비활성 선수로 먼저 만들어 두고, 승인 때 활동 중으로 바꾼다)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/password'
import { resolveTeamId } from '@/lib/league/teamScope'
import { signSession, buildAuthCookieHeader } from '@/lib/auth/session'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  let body: { name?: unknown; birthdate?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }) }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const bdRaw = typeof body.birthdate === 'string' ? body.birthdate.trim() : ''
  if (!name) return NextResponse.json({ error: '이름을 입력하세요' }, { status: 400 })
  if (!/^\d{6}$/.test(bdRaw)) {
    return NextResponse.json({ error: '초기 비밀번호로 사용할 생년월일 6자리 (YYMMDD) 를 입력하세요' }, { status: 400 })
  }
  const pw6 = bdRaw

  const sb = createClient()
  // team_id 를 먼저 구한다 — 명단 매칭도 계정 조회도 이제 팀 기준이다(아래 두 쿼리 모두).
  const teamId = await resolveTeamId(leagueId)

  // 이름 매칭 · 게스트는 계정 대상 아님 · 다수 매치 시 첫 non-guest
  //   팀 명단 전체에서 찾는다 — league_id 로 좁히면 대회 화면에서 가입을 시도한 회원이
  //   리그에서 만든 자기 자신을 못 찾아 "등록된 선수를 찾지 못했다"는 오안내를 받는다.
  const { data: candidates } = await sb
    .from('league_players')
    .select('id, name, is_guest, is_active, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true })

  // 2026-10-26: 띄어쓰기·자모 분리(NFD)만 다른 이름도 같은 사람으로 본다 — 비공개 리그에선 가입 화면의
  //   이름 자동완성이 401 로 막혀 있어(명단을 비회원에게 보여 줄 수 없다) 「김 로빈」처럼 쳐서 실패했다.
  const norm = (v: string) => v.normalize('NFC').replace(/\s+/g, '')
  const wanted = norm(name)
  const sameName = (candidates ?? []).filter(p => typeof p.name === 'string' && norm(p.name) === wanted)
  const nonGuestList = sameName.filter(p => !p.is_guest)
  let matched: { id: string; name: string } | null = nonGuestList[0] ?? null
  // 바로 승인은 「활동 중인 회원 한 명」과 맞을 때만 — 동명이인이면 누구인지 운영진이 정한다
  const autoApprove = nonGuestList.length === 1 && nonGuestList[0].is_active !== false

  if (!matched) {
    // 명단에 없음(또는 게스트로만 있음) → 비활성 선수로 만들어 두고 운영진 승인 대기
    const { data: created, error: pErr } = await sb.from('league_players')
      .insert({ league_id: leagueId, team_id: teamId, name: name.normalize('NFC').trim(), is_active: false })
      .select('id, name').single()
    if (pErr || !created) return NextResponse.json({ error: pErr?.message ?? '가입 요청을 만들지 못했어요' }, { status: 500 })
    matched = created as { id: string; name: string }
  }

  // 기존 계정 확인 (동명이인 방지 · 그 선수에 이미 계정 있으면 재신청 불가)
  //   계정도 팀 단위 정체성이다(Task 2, league_user_accounts_team_login_uniq) — 이 사람이
  //   리그에서 이미 가입했다면 대회 화면에서 다시 신청할 때 league_id 로는 못 찾아
  //   유니크 인덱스 충돌로 500 이 난다. team_id 로 찾아야 "이미 승인된 계정" 안내가 나간다.
  const { data: existing } = await sb
    .from('league_user_accounts')
    .select('id, status')
    .eq('team_id', teamId)
    .eq('league_player_id', matched.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      status: existing.status,
      message: existing.status === 'pending'
        ? '이미 신청된 회원입니다. 운영진 승인을 기다리는 중이에요.'
        : existing.status === 'approved'
          ? '이미 승인된 계정이 있어요. 로그인 화면에서 이름 · 비번으로 로그인하세요.'
          : existing.status === 'rejected'
            ? '이전 가입 요청이 반려되었습니다. 운영진에게 문의하세요.'
            : '비활성화된 계정입니다. 운영진에게 문의하세요.',
    }, { status: 409 })
  }

  // 신규 pending 계정 생성 · 비번 = 사용자가 입력한 YYMMDD
  // team_id 는 위에서 이미 구했다 — 로그인 라우트가 이제 team_id 로 계정을 찾으므로
  //   여기서 비우면 이 계정으로는 어느 경기묶음에서도 로그인이 안 되는 계정이 생긴다.
  const password_hash = hashPassword(pw6)
  const now = new Date().toISOString()
  const { data: acc, error } = await sb.from('league_user_accounts').insert({
    league_id: leagueId,
    team_id: teamId,
    league_player_id: matched.id,
    login_id: matched.name,
    password_hash,
    status: autoApprove ? 'approved' : 'pending',
    ...(autoApprove ? { approved_at: now, approved_by: '자동(명단 이름 일치)', last_login_at: now } : {}),
  }).select('id').single()
  if (error || !acc) return NextResponse.json({ error: error?.message ?? '가입 요청을 만들지 못했어요' }, { status: 500 })

  if (!autoApprove) {
    return NextResponse.json({
      status: 'pending',
      message: '가입 요청이 접수되었어요. 운영진이 승인하면 로그인할 수 있어요.',
    }, { status: 201 })
  }

  // 바로 승인 — 로그인 라우트와 같은 세션을 그 자리에서 발급한다
  const { token, maxAge } = signSession({ uid: acc.id, lid: leagueId, tid: teamId, pid: matched.id, loginId: matched.name })
  const res = NextResponse.json({ status: 'approved', message: '명단에서 확인됐어요. 바로 시작할게요!' }, { status: 201 })
  res.headers.append('Set-Cookie', buildAuthCookieHeader(token, maxAge))
  return res
}
