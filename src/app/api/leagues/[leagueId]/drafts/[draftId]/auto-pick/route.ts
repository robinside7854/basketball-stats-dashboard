// 자동 픽 — 픽 타이머 만료 시 남은 선수 중 종합 스탯 우수자를 자동 선택
//
// 시스템 폴백이므로 팀 단장 코드가 아니어도(감독관/다른 단장/리그 PIN) 트리거 가능.
// 단, pick_deadline 이 지난(만료) 경우 + in_progress 일 때만 동작한다.
// 동시 호출 시 UNIQUE/턴 검증으로 한 번만 반영된다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { aggregateQuarterStats, aggToScore, getPreviousQuarterId } from '@/lib/leagueStats'
import { newPickDeadline } from '@/lib/draftTimer'

interface DraftRow {
  id: string; quarter_id: string; status: string
  draft_order: string[]; current_pick_index: number; current_round: number
  total_picks: number; method: 'snake' | 'linear'; pick_deadline: string | null
}

function teamOnTurn(d: DraftRow): string | null {
  const o = d.draft_order
  if (!o || o.length === 0) return null
  const i = d.current_pick_index
  if (i < 0 || i >= o.length) return null
  if (d.method === 'snake' && d.current_round % 2 === 0) return o[o.length - 1 - i]
  return o[i]
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const supabase = createClient()

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, draft_order, current_pick_index, current_round, total_picks, method, pick_deadline')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as DraftRow
  if (d.status !== 'in_progress') return NextResponse.json({ error: '진행 중이 아닙니다' }, { status: 409 })

  // 권한: 이 분기의 유효 코드(단장/감독관) 또는 리그 PIN
  const plain = req.headers.get('X-Draft-Code')?.trim()
  const codeOk = plain ? !!(await lookupDraftCode(leagueId, d.quarter_id, plain)) : false
  if (!codeOk && !(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  }

  // 만료 확인 — 마감 시각이 지난 경우에만
  if (!d.pick_deadline || new Date(d.pick_deadline).getTime() > Date.now()) {
    return NextResponse.json({ error: '아직 시간이 남아 있습니다' }, { status: 409 })
  }

  const teamId = teamOnTurn(d)
  if (!teamId) return NextResponse.json({ error: '현재 차례 팀을 찾을 수 없습니다' }, { status: 409 })

  // 남은 선수 = 풀 - 픽됨
  const [{ data: poolRows }, { data: pickRows }] = await Promise.all([
    supabase.from('league_draft_pool').select('league_player_id').eq('draft_id', draftId),
    supabase.from('league_draft_picks').select('league_player_id').eq('draft_id', draftId),
  ])
  const picked = new Set((pickRows ?? []).map(p => p.league_player_id))
  const available = (poolRows ?? []).map(p => p.league_player_id).filter(id => !picked.has(id))
  if (available.length === 0) return NextResponse.json({ error: '남은 선수가 없습니다' }, { status: 409 })

  // 종합 스탯 우수자 선택 (이전 분기 기준). 데이터 없으면 랜덤.
  const prevQid = await getPreviousQuarterId(supabase, leagueId, d.quarter_id)
  let chosen = available[Math.floor(Math.random() * available.length)]
  if (prevQid) {
    const agg = await aggregateQuarterStats(supabase, leagueId, prevQid)
    let best = -1
    for (const pid of available) {
      const score = agg[pid] ? aggToScore(agg[pid]) : 0
      if (score > best) { best = score; chosen = pid }
    }
  }

  // 픽 적용 (pick 라우트와 동일 흐름)
  const pickNumber = d.total_picks + 1
  const { error: pickErr } = await supabase.from('league_draft_picks').insert({
    draft_id: draftId, pick_number: pickNumber, round_number: d.current_round,
    team_id: teamId, league_player_id: chosen, picked_by_code_id: null,
  })
  if (pickErr) {
    if (pickErr.code === '23505') return NextResponse.json({ error: '이미 처리됨' }, { status: 409 })
    return NextResponse.json({ error: pickErr.message }, { status: 500 })
  }
  await supabase.from('league_player_quarters').upsert(
    { league_id: leagueId, quarter_id: d.quarter_id, league_player_id: chosen, team_id: teamId, is_regular: true },
    { onConflict: 'quarter_id,league_player_id' },
  )

  let nextIndex = d.current_pick_index + 1
  let nextRound = d.current_round
  if (nextIndex >= d.draft_order.length) { nextRound++; nextIndex = 0 }

  const { count: poolCount } = await supabase
    .from('league_draft_pool').select('league_player_id', { count: 'exact', head: true }).eq('draft_id', draftId)
  const isComplete = typeof poolCount === 'number' && pickNumber >= poolCount

  const { data: updated, error: updErr } = await supabase
    .from('league_drafts')
    .update({
      current_pick_index: nextIndex, current_round: nextRound, total_picks: pickNumber,
      ...(isComplete
        ? { status: 'completed', completed_at: new Date().toISOString(), pick_deadline: null }
        : { pick_deadline: newPickDeadline() }),
    })
    .eq('id', draftId)
    .select()
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, auto: true, picked_player_id: chosen, team_id: teamId, draft: updated })
}
