// 편집 PIN 전용 조회·변경 엔드포인트 (2026-08-07, 보안 수정)
//   GET /api/leagues/[leagueId] 의 select('*') 가 edit_pin 을 공개 응답에 실어 보내던 문제를
//   여기로 분리해 고쳤다 — PIN 은 이 경로로만 오가고, 가드는 편집 권한자로 한정한다.
import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

// 팀 어드민 세션·리그 편집 PIN(canEditLeague) 또는 CEO NextAuth 세션(requireCeoSession()) 중
// 하나라도 통과하면 허용. requireCeoSession() 은 JWT 디코드라 가벼우므로 먼저 확인해 DB 조회를 아낀다.
async function isAuthorized(req: Request, leagueId: string): Promise<boolean> {
  const session = await requireCeoSession()
  if (session) return true
  return canEditLeague(req, leagueId)
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 403: 이 자리는 "로그인하면 통과되는" 표준 인증 흐름이 아니라(401 이 함의하는 것과 다름),
  // 팀 PIN·어드민 role·CEO 세션 중 하나를 이미 들고 있어야 하는 권한 확인이다.
  // 예를 들어 승인된 일반 회원은 로그인은 되어 있어도(인증 O) 편집 권한은 없다(인가 X) —
  // 이런 "인증됐지만 권한 없음" 케이스를 정확히 표현하는 코드는 401 이 아니라 403 이다.
  if (!(await isAuthorized(req, leagueId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('leagues')
    .select('edit_pin')
    .eq('id', leagueId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'PIN 조회 실패' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ edit_pin: data.edit_pin })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!(await isAuthorized(req, leagueId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const body = await req.json().catch(() => null)
  const editPin = (body as { edit_pin?: unknown } | null)?.edit_pin
  // 서버에서 반드시 재검증 — 클라이언트 검증은 우회 가능하다.
  if (typeof editPin !== 'string' || !/^\d{4}$/.test(editPin)) {
    return NextResponse.json({ error: 'PIN은 숫자 4자리여야 합니다' }, { status: 400 })
  }
  const supabase = createClient()
  // 명시 필드만 업데이트한다 (mass assignment 방지) — body 를 통째로 넘기지 않는다.
  const { data, error } = await supabase
    .from('leagues')
    .update({ edit_pin: editPin })
    .eq('id', leagueId)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'PIN 저장 실패' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  // 응답에 PIN 을 되돌려주지 않는다.
  return NextResponse.json({ success: true })
}
