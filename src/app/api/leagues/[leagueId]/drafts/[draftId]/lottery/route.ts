// 드래프트 추첨 — 어드민(NextAuth) 또는 감독관 코드
//
// 흐름:
//   1. status='ready_check' + 모든 참가자(단장들 + 감독관) 준비 완료 확인 (force 로 우회 가능)
//   2. 지난 분기 승률 계산 → 가중치(하위 팀 1픽 확률↑) → 비복원 추첨으로 draft_order 생성
//   3. lottery_odds 기록 + status='in_progress' + started_at
//
// body (optional): { force?: boolean }  — 준비 미완료 상태에서도 강제 추첨

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'
import { verifySupervisorCode } from '@/lib/leagueDraftAuth'
import { recordsToWeights, computeOdds, weightedOrder, type TeamRecord } from '@/lib/draftLottery'

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

  // 권한: 어드민 세션 OR 감독관 코드
  const session = await auth()
  if (!session) {
    const sup = await verifySupervisorCode(req, leagueId, d.quarter_id)
    if (!sup.valid) return NextResponse.json({ error: '권한 없음 (어드민/감독관 전용)' }, { status: 401 })
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

  // ── 지난 분기 승률 계산 ──
  const { data: quarters } = await supabase
    .from('league_quarters')
    .select('id, year, quarter')
    .eq('league_id', leagueId)
    .order('year', { ascending: true })
    .order('quarter', { ascending: true })
  const ordered = (quarters ?? []) as { id: string; year: number; quarter: number }[]
  const curIdx = ordered.findIndex(q => q.id === d.quarter_id)
  const prevQuarter = curIdx > 0 ? ordered[curIdx - 1] : null

  const records: TeamRecord[] = teamIds.map(tid => ({ teamId: tid, played: 0, wins: 0 }))
  const recMap = Object.fromEntries(records.map(r => [r.teamId, r]))

  if (prevQuarter) {
    const { data: games } = await supabase
      .from('league_games')
      .select('home_team_id, away_team_id, home_score, away_score')
      .eq('league_id', leagueId)
      .eq('quarter_id', prevQuarter.id)
      .eq('is_complete', true)
      .eq('is_exhibition', false)
    for (const g of (games ?? []) as { home_team_id: string | null; away_team_id: string | null; home_score: number; away_score: number }[]) {
      if (!g.home_team_id || !g.away_team_id) continue
      const h = recMap[g.home_team_id]
      const a = recMap[g.away_team_id]
      if (!h || !a) continue
      h.played++; a.played++
      if (g.home_score > g.away_score) h.wins++
      else if (g.away_score > g.home_score) a.wins++
    }
  }

  // ── 가중 추첨 ──
  const weights = recordsToWeights(records)
  const odds = computeOdds(weights)
  const order = weightedOrder(weights)

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
    previous_quarter: prevQuarter ? { year: prevQuarter.year, quarter: prevQuarter.quarter } : null,
  })
}
