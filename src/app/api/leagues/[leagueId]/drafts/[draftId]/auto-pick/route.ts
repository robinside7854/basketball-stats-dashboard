// 자동 픽 — 픽 타이머 만료 시 자동 픽 처리.
//
// 모드 (`mode` body):
//   - 'best'   : (기존) 이전 분기 종합 스탯이 가장 우수한 선수를 선택. 데이터 없으면 랜덤.
//                만료 직후(grace 진입 전후 무관)에 호출 가능.
//   - 'random' : 풀에 남아 있는 선수 중 완전 무작위로 1명을 픽한다.
//                반드시 pick_deadline + AUTOPICK_GRACE_SECONDS 가 지난 뒤(=유예 종료 후)에만 허용한다.
//                유예가 끝나기 전 호출하면 409 로 거절.
//
// 시스템 폴백이므로 팀 단장 코드가 아니어도(감독관/다른 단장/리그 PIN) 트리거 가능.
// 동시 호출 시 UNIQUE/턴 검증으로 한 번만 반영된다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { aggregateQuarterStats, aggToScore, getPreviousQuarterId } from '@/lib/leagueStats'
import { newPickDeadline, AUTOPICK_GRACE_SECONDS } from '@/lib/draftTimer'

interface DraftRow {
  id: string; quarter_id: string; status: string
  draft_order: string[]; current_pick_index: number; current_round: number
  total_picks: number; method: 'snake' | 'linear'; pick_deadline: string | null
  pick_seconds: number
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

  // 요청 모드 파싱 (body 가 없거나 깨져도 'best' 로 fallback — 하위 호환)
  let mode: 'best' | 'random' = 'best'
  let expectedPickNumber: number | null = null
  let expectedDeadline: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    if (body && body.mode === 'random') mode = 'random'
    else if (body && body.mode === 'best') mode = 'best'
    if (body && typeof body.expected_pick_number === 'number') {
      expectedPickNumber = body.expected_pick_number
    }
    if (body && typeof body.expected_deadline === 'string') {
      expectedDeadline = body.expected_deadline
    }
  } catch { /* ignore */ }

  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, draft_order, current_pick_index, current_round, total_picks, method, pick_deadline, pick_seconds')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as DraftRow
  if (d.status !== 'in_progress') return NextResponse.json({ error: '진행 중이 아닙니다' }, { status: 409 })

  // ── Compare-and-swap: 클라이언트가 본 슬롯/마감과 서버 상태가 일치하는지 검증 ──
  // 다른 클라이언트가 이미 픽했거나 마감이 갱신된 상태라면 stale 로 거절.
  // DB UNIQUE(draft_id, pick_number) 제약이 무결성을 막아주지만, 그 전에 거절해 잘못된 slot 에 쓰지 않도록.
  if (expectedPickNumber != null && expectedPickNumber !== (d.total_picks ?? 0) + 1) {
    return NextResponse.json({ error: 'stale_pick_number', current: (d.total_picks ?? 0) + 1 }, { status: 409 })
  }
  if (expectedDeadline && d.pick_deadline && expectedDeadline !== d.pick_deadline) {
    return NextResponse.json({ error: 'stale_deadline', current: d.pick_deadline }, { status: 409 })
  }

  // 권한: 이 분기의 유효 코드(단장/감독관) 또는 리그 PIN
  const plain = req.headers.get('X-Draft-Code')?.trim()
  const codeOk = plain ? !!(await lookupDraftCode(leagueId, d.quarter_id, plain)) : false
  if (!codeOk && !(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: '권한 없음' }, { status: 401 })
  }

  // 만료 확인 — 마감 시각이 지난 경우에만
  const nowMs = Date.now()
  if (!d.pick_deadline || new Date(d.pick_deadline).getTime() > nowMs) {
    return NextResponse.json({ error: '아직 시간이 남아 있습니다' }, { status: 409 })
  }

  // random 모드는 유예(grace)까지 끝났을 때만 허용
  if (mode === 'random') {
    const graceEndMs = new Date(d.pick_deadline).getTime() + AUTOPICK_GRACE_SECONDS * 1000
    if (nowMs < graceEndMs) {
      return NextResponse.json({ error: '아직 유예 시간이 남아 있습니다', remaining_ms: graceEndMs - nowMs }, { status: 409 })
    }
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

  let chosen: string
  if (mode === 'random') {
    // 완전 무작위
    chosen = available[Math.floor(Math.random() * available.length)]
  } else {
    // 종합 스탯 우수자 선택 (이전 분기 기준). 데이터 없으면 랜덤.
    chosen = available[Math.floor(Math.random() * available.length)]
    const prevQid = await getPreviousQuarterId(supabase, leagueId, d.quarter_id)
    if (prevQid) {
      const agg = await aggregateQuarterStats(supabase, leagueId, prevQid)
      let best = -1
      for (const pid of available) {
        const score = agg[pid] ? aggToScore(agg[pid]) : 0
        if (score > best) { best = score; chosen = pid }
      }
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
        : { pick_deadline: newPickDeadline(Date.now(), d.pick_seconds) }),
    })
    .eq('id', draftId)
    .select()
    .single()
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, auto: true, mode, picked_player_id: chosen, team_id: teamId, draft: updated })
}
