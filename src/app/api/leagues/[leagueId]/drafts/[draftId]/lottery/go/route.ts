// 추첨 레이스 「출발」 — 총무(또는 어드민/PIN)만 가능.
//
// /lottery 는 순서를 정하고 status='lottery_done' 으로 끝난다. 그 순간 모든 화면에
// 마블 레이스가 **팁오프 대기** 상태로 뜬다. 여기서 총무가 출발을 눌러야 레이스가 달린다.
// 이 라우트는 race_started_at 을 딱 한 번 찍는다 — 조건부 UPDATE 라 두 번 눌러도, 두 사람이
// 동시에 눌러도 시각은 하나다(두 번째 호출은 200 { already: true }).
//
// ⚠ 이 시각은 "언제 시작했는지"의 기록일 뿐, 클라이언트의 심 시계는 **자기가 관측한 순간**
//    부터 돈다. 기기 간 1~2초 시차는 허용한다(같은 시드라 궤적은 어차피 같다).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { verifySupervisorCode } from '@/lib/leagueDraftAuth'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, race_started_at')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; race_started_at: string | null }

  // 권한: /lottery 와 동일 — 어드민 세션 OR 감독관 코드 OR 리그 편집 PIN
  const session = await requireCeoSession()
  if (!session) {
    const sup = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!sup.valid && !await canEditLeague(req, leagueId)) {
      return NextResponse.json({ error: '권한 없음 (어드민/감독관/PIN 전용)' }, { status: 401 })
    }
  }

  if (d.status !== 'lottery_done') {
    return NextResponse.json({ error: `출발 불가 — 현재 상태: ${d.status} (lottery_done 단계 필요)` }, { status: 409 })
  }
  if (d.race_started_at) {
    return NextResponse.json({ ok: true, already: true, race_started_at: d.race_started_at })
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({ race_started_at: now })
    .eq('id', draftId)
    .eq('status', 'lottery_done')
    .is('race_started_at', null)
    .select('race_started_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!updated || updated.length === 0) {
    // 경합에서 졌다 — 이미 다른 요청이 찍었다. 그 값을 그대로 돌려준다.
    const { data: cur } = await supabase
      .from('league_drafts')
      .select('race_started_at')
      .eq('id', draftId)
      .maybeSingle()
    return NextResponse.json({
      ok: true, already: true,
      race_started_at: (cur as { race_started_at: string | null } | null)?.race_started_at ?? null,
    })
  }

  return NextResponse.json({
    ok: true, already: false,
    race_started_at: (updated[0] as { race_started_at: string | null }).race_started_at,
  })
}
