// GET /api/leagues/[leagueId]/auth/signup-rate
//   라커룸 · 회원 가입율 집계
//   · 모수 = 게스트 제외 등록 선수 전원 (is_guest=true 및 이름에 '게스트' 포함 폴백 제외)
//   · approved = 관리자 승인까지 끝난 인증회원 (= 라커룸 '인증' 뱃지 기준)
//   · pending  = 신청은 했으나 승인 대기
//   · none     = 계정 자체가 없음 (rejected/disabled 는 별도 집계 · 미가입으로 보지 않음)
//   · 집계 수치는 공개, 개별 명단(미가입·대기)은 리그 PIN 확인 시에만 반환
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

type AccountStatus = 'pending' | 'approved' | 'rejected' | 'disabled'

// 게스트 판정 — is_guest flag 우선, flag 없던 이전 데이터는 이름 폴백 (로스터 페이지와 동일 규칙)
function isGuest(p: { name: string; is_guest: boolean | null }): boolean {
  return Boolean(p.is_guest) || p.name.includes('게스트')
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sb = createClient()

  const [{ data: playerRows, error: pErr }, { data: accountRows }] = await Promise.all([
    sb.from('league_players')
      .select('id, name, is_guest')
      .eq('league_id', leagueId)
      .order('name', { ascending: true }),
    // 계정 테이블 조회 실패해도 0건으로 처리 (best-effort — 명단 집계는 항상 반환)
    sb.from('league_user_accounts')
      .select('league_player_id, status')
      .eq('league_id', leagueId),
  ])
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const players = (playerRows ?? []) as Array<{ id: string; name: string; is_guest: boolean | null }>
  const statusOf = new Map(
    ((accountRows ?? []) as Array<{ league_player_id: string; status: AccountStatus }>)
      .map(a => [a.league_player_id, a.status]),
  )

  const members = players.filter(p => !isGuest(p))
  const guestCount = players.length - members.length

  const buckets: Record<'approved' | 'pending' | 'rejected' | 'disabled' | 'none', string[]> = {
    approved: [], pending: [], rejected: [], disabled: [], none: [],
  }
  for (const m of members) {
    buckets[statusOf.get(m.id) ?? 'none'].push(m.name)
  }

  const eligible = members.length
  const approved = buckets.approved.length
  const pending = buckets.pending.length
  const pct = (n: number) => (eligible > 0 ? +((n / eligible) * 100).toFixed(1) : 0)

  const canSeeNames = await verifyLeaguePin(req, leagueId)

  return NextResponse.json({
    eligible,                       // 모수 · 게스트 제외 등록 회원 수
    guestCount,                     // 참고용 · 집계에서 빠진 게스트 수
    approved,                       // 가입 완료 (승인)
    pending,                        // 승인 대기
    rejected: buckets.rejected.length,
    disabled: buckets.disabled.length,
    notSignedUp: buckets.none.length,
    rate: pct(approved),            // 가입율 = 승인 완료 / 모수
    requestedRate: pct(approved + pending),  // 신청률 = (승인 + 대기) / 모수
    // 명단은 편집(PIN) 권한자만 — 미가입 회원 독려용
    names: canSeeNames
      ? { pending: buckets.pending, notSignedUp: buckets.none, rejected: buckets.rejected, disabled: buckets.disabled }
      : null,
  })
}
