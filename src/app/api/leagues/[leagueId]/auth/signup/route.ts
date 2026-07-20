// POST /api/leagues/[leagueId]/auth/signup
//   body: { name: string, birthdate: string (YYMMDD 또는 YYYY-MM-DD) }
//   유저가 이름 + 생년월일로 가입 요청
//   · 매칭되는 league_player 있어야 함 (name + birth_date 정확 일치 · 게스트 제외)
//   · 이미 계정 있으면 status 반환 (pending/approved/rejected/disabled)
//   · 신규 요청은 status='pending' + 비번=YYMMDD 로 저장 (승인 후 로그인 가능)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/auth/password'

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
  if (!/^(\d{6}|\d{4}-\d{2}-\d{2})$/.test(bdRaw)) {
    return NextResponse.json({ error: '생년월일 6자리 (YYMMDD) 또는 YYYY-MM-DD 로 입력하세요' }, { status: 400 })
  }

  // YYMMDD → YYYY-MM-DD (19xx or 20xx 추정: 25 이하는 20xx, 그 이상은 19xx)
  let bd: string
  if (bdRaw.length === 6) {
    const yy = parseInt(bdRaw.slice(0, 2), 10)
    const mm = bdRaw.slice(2, 4)
    const dd = bdRaw.slice(4, 6)
    const yyyy = yy <= 25 ? 2000 + yy : 1900 + yy
    bd = `${yyyy}-${mm}-${dd}`
  } else {
    bd = bdRaw
  }
  const pw6 = bdRaw.length === 6 ? bdRaw : `${bd.slice(2, 4)}${bd.slice(5, 7)}${bd.slice(8, 10)}`

  const sb = createClient()

  // 매칭 선수 조회
  const { data: matched } = await sb
    .from('league_players')
    .select('id, name, birth_date, is_guest')
    .eq('league_id', leagueId)
    .eq('name', name)
    .eq('birth_date', bd)
    .limit(1)
    .maybeSingle()

  if (!matched) {
    return NextResponse.json({
      error: '입력한 이름과 생년월일로 등록된 선수를 찾지 못했어요. 관리자에게 등록 확인을 요청해주세요.',
    }, { status: 404 })
  }
  if (matched.is_guest) {
    return NextResponse.json({ error: '게스트 선수는 계정 생성 대상이 아닙니다.' }, { status: 400 })
  }

  // 기존 계정 확인
  const { data: existing } = await sb
    .from('league_user_accounts')
    .select('id, status')
    .eq('league_id', leagueId)
    .eq('league_player_id', matched.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({
      status: existing.status,
      message: existing.status === 'pending'
        ? '이미 가입 요청이 접수되어 승인 대기 중입니다.'
        : existing.status === 'approved'
          ? '이미 승인된 계정이 있어요. 로그인 화면에서 이름 · 비번으로 로그인하세요.'
          : existing.status === 'rejected'
            ? '가입 요청이 반려되었습니다. 관리자에게 문의하세요.'
            : '비활성화된 계정입니다. 관리자에게 문의하세요.',
    }, { status: 409 })
  }

  // 신규 pending 계정 생성 · 비번 = YYMMDD
  const password_hash = hashPassword(pw6)
  const { error } = await sb.from('league_user_accounts').insert({
    league_id: leagueId,
    league_player_id: matched.id,
    login_id: matched.name,   // 초기값 · 로그인 후 변경 가능
    password_hash,
    status: 'pending',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    status: 'pending',
    message: '가입 요청이 접수되었습니다. 관리자 승인 후 로그인 가능해요.',
  }, { status: 201 })
}
