// POST /api/leagues/[leagueId]/auth/signup
//   body: { name: string, birthdate: string (YYMMDD · 초기 비번용) }
//   가입 요청 · 이름만 매칭 (기존 선수 정보에 생년월일 대부분 비어있어 이름 기준 · 2026-07-21 완화)
//   · 매칭되는 league_player 있어야 함 (name · 게스트 제외)
//   · 동명이인 다수 케이스: 첫 매치 (non-guest 우선 · 이후 id 순)
//   · 이미 그 선수 계정이 있으면 상태별 알림 반환
//   · 생년월일은 초기 비밀번호로만 사용 (매칭 검증에는 사용 안 함)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/password'
import { resolveTeamId } from '@/lib/league/teamScope'

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
    .select('id, name, is_guest, created_at')
    .eq('team_id', teamId)
    .eq('name', name)
    .order('created_at', { ascending: true })

  const nonGuestList = (candidates ?? []).filter(p => !p.is_guest)
  const matched = nonGuestList[0] ?? null

  if (!matched) {
    // 이름 자체가 등록 안 됨 or 게스트만 있음
    const anyGuest = (candidates ?? []).some(p => p.is_guest)
    return NextResponse.json({
      error: anyGuest
        ? '해당 이름은 게스트로 등록되어 있어 계정 생성 대상이 아닙니다.'
        : '입력한 이름으로 등록된 선수를 찾지 못했어요. 관리자에게 등록 확인을 요청해주세요.',
    }, { status: 404 })
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
        ? '이미 신청된 회원입니다. 관리자 승인 대기 중이에요.'
        : existing.status === 'approved'
          ? '이미 승인된 계정이 있어요. 로그인 화면에서 이름 · 비번으로 로그인하세요.'
          : existing.status === 'rejected'
            ? '이전 가입 요청이 반려되었습니다. 관리자에게 문의하세요.'
            : '비활성화된 계정입니다. 관리자에게 문의하세요.',
    }, { status: 409 })
  }

  // 신규 pending 계정 생성 · 비번 = 사용자가 입력한 YYMMDD
  // team_id 는 위에서 이미 구했다 — 로그인 라우트가 이제 team_id 로 계정을 찾으므로
  //   여기서 비우면 이 계정으로는 어느 경기묶음에서도 로그인이 안 되는 계정이 생긴다.
  const password_hash = hashPassword(pw6)
  const { error } = await sb.from('league_user_accounts').insert({
    league_id: leagueId,
    team_id: teamId,
    league_player_id: matched.id,
    login_id: matched.name,
    password_hash,
    status: 'pending',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    status: 'pending',
    message: '가입 요청이 접수되었습니다. 관리자 승인 후 로그인 가능해요.',
  }, { status: 201 })
}
