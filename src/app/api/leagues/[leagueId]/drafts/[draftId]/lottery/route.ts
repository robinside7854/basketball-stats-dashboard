// 드래프트 추첨 — 어드민(NextAuth) 또는 감독관 코드
//
// 흐름:
//   1. status='ready_check' + 모든 참가자(단장들 + 감독관) 준비 완료 확인 (force 로 우회 가능)
//   2. 모든 팀 동등 가중치 → Fisher-Yates 완전 무작위 셔플로 draft_order 생성
//      (새 분기마다 팀이 새로 만들어지므로 지난 분기 성적과 무관)
//   3. lottery_odds 는 1/N 균등으로 기록 (표시용) + status='in_progress' + started_at
//
// body (optional): { force?: boolean }  — 준비 미완료 상태에서도 강제 추첨

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

  if (d.status !== 'ready_check') {
    return NextResponse.json({ error: `추첨 불가 — 현재 상태: ${d.status}` }, { status: 409 })
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

  // 준비 완료 확인 (force 아니면)
  if (!body.force) {
    const ready = d.ready_state ?? {}
    const notReady = teamIds.filter(tid => !ready[tid])
    const supMissing = supCode && !ready['supervisor']
    if (notReady.length > 0 || supMissing) {
      return NextResponse.json(
        { error: '아직 모든 참가자가 준비되지 않았습니다', not_ready_teams: notReady, supervisor_missing: !!supMissing },
        { status: 409 },
      )
    }
  }

  // ── 완전 무작위 추첨 (Fisher-Yates) ──
  // 분기마다 팀이 새로 구성되어 지난 분기 성적 가중치가 의미 없음.
  // 모든 팀 동등 확률 (1/N).
  const order = shuffleInPlace([...teamIds])
  const equalOdd = teamIds.length > 0 ? 1 / teamIds.length : 0
  const odds: Record<string, number> = Object.fromEntries(teamIds.map(tid => [tid, equalOdd]))
  const prevQuarter: { year: number; quarter: number } | null = null

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({
      draft_order: order,
      lottery_odds: odds,
      lottery_done: true,
      status: 'in_progress',
      current_pick_index: 0,
      current_round: 1,
      started_at: new Date().toISOString(),
      pick_deadline: null,   // 첫 픽 타이머는 추첨 연출 종료 후 start-clock 에서 시작
      extensions_used: {},
    })
    .eq('id', draftId)
    .eq('status', 'ready_check')
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
