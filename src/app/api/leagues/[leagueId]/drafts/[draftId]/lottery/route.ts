// 드래프트 추첨 실행 — 감독관(또는 어드민/PIN)만 가능.
//
// 흐름 (2단계화 후):
//   1. status='lottery_waiting' 단계에서만 호출 가능 (대기 화면에서 감독관이 "추첨 시작" 클릭)
//      ※ 이전엔 ready_check 에서 즉시 추첨이었으나, 모두가 추첨 대기 화면을 함께 본 후
//        감독관이 추첨 시작을 누르도록 분리됨 (/lottery/open 으로 ready_check→lottery_waiting)
//   2. Fisher-Yates 완전 무작위 셔플로 draft_order 생성. lottery_odds=1/N 균등.
//   3. status='lottery_done' 으로 종료 — 아직 in_progress 아님.
//      이후 감독관이 /start-draft 를 눌러야 in_progress 로 진입.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'
import { verifySupervisorCode } from '@/lib/leagueDraftAuth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const body = await req.json().catch(() => ({})) as { force?: boolean }
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, method, ready_state')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as { id: string; quarter_id: string; status: string; method: 'snake' | 'linear'; ready_state: Record<string, boolean> }

  // 권한: 어드민 세션 OR 감독관 코드 OR 리그 편집 PIN
  const session = await auth()
  if (!session) {
    const sup = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!sup.valid && !await verifyLeaguePin(req, leagueId)) {
      return NextResponse.json({ error: '권한 없음 (어드민/감독관/PIN 전용)' }, { status: 401 })
    }
  }

  if (d.status !== 'lottery_waiting') {
    return NextResponse.json({ error: `추첨 실행 불가 — 현재 상태: ${d.status} (lottery_waiting 단계 필요)` }, { status: 409 })
  }

  // 이 리그의 팀 (참가 단장)
  const { data: teams } = await supabase
    .from('league_teams')
    .select('id')
    .eq('league_id', leagueId)
  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length === 0) return NextResponse.json({ error: '리그에 팀이 없습니다' }, { status: 400 })

  // 감독관 코드 존재 여부 → 참가자 목록에 포함
  const { data: supCode } = await supabase
    .from('league_draft_codes')
    .select('id')
    .eq('league_id', leagueId)
    .eq('quarter_id', d.quarter_id)
    .eq('role', 'supervisor')
    .eq('is_active', true)
    .maybeSingle()

  // lottery_waiting 단계는 이미 모두 준비 후 진입한 상태 — 추가 확인 불필요.
  // (ready 검사는 /lottery/open 에서 수행)
  void supCode  // 변수 unused 회피
  void body
  // ── 완전 무작위 추첨 (Fisher-Yates) ──
  // 분기마다 팀이 새로 구성되어 지난 분기 성적 가중치가 의미 없음.
  // 모든 팀 동등 확률 (1/N).
  const order = shuffleInPlace([...teamIds])
  const equalOdd = teamIds.length > 0 ? 1 / teamIds.length : 0
  const odds: Record<string, number> = Object.fromEntries(teamIds.map(tid => [tid, equalOdd]))
  const prevQuarter: { year: number; quarter: number } | null = null

  // 추첨 결과 저장 — status='lottery_done' 으로. in_progress 진입은 /start-draft 에서 별도.
  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({
      draft_order: order,
      lottery_odds: odds,
      lottery_done: true,
      status: 'lottery_done',
      current_pick_index: 0,
      current_round: 1,
      pick_deadline: null,
      extensions_used: {},
    })
    .eq('id', draftId)
    .eq('status', 'lottery_waiting')
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    draft: updated,
    draft_order: order,
    lottery_odds: odds,
    previous_quarter: prevQuarter,
  })
}
