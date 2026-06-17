// 픽 시간 추가 — 현재 차례 단장이 15초 연장 (드래프트당 팀별 최대 3회)
//
// POST body: { team_id }
//   - X-Draft-Code 로 해당 팀 단장 인증
//   - 본인 팀 차례 + in_progress + 잔여 추가 횟수 확인
//   - pick_deadline += 15초, extensions_used[team_id] += 1

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyDraftCode } from '@/lib/leagueDraftAuth'
import { EXTENSION_SECONDS, MAX_EXTENSIONS } from '@/lib/draftTimer'

interface DraftRow {
  id: string
  quarter_id: string
  status: string
  draft_order: string[]
  current_pick_index: number
  current_round: number
  method: 'snake' | 'linear'
  pick_deadline: string | null
  extensions_used: Record<string, number>
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
  const body = await req.json().catch(() => null) as { team_id?: string } | null
  if (!body?.team_id) return NextResponse.json({ error: 'team_id 필요' }, { status: 400 })

  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id, status, draft_order, current_pick_index, current_round, method, pick_deadline, extensions_used')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
  const d = draft as DraftRow
  if (d.status !== 'in_progress') return NextResponse.json({ error: '진행 중이 아닙니다' }, { status: 409 })

  const auth = await verifyDraftCode(req, leagueId, d.quarter_id, body.team_id)
  if (!auth.valid) return NextResponse.json({ error: '단장 코드 인증 실패' }, { status: 401 })

  if (teamOnTurn(d) !== body.team_id) {
    return NextResponse.json({ error: '본인 차례에만 추가 시간을 쓸 수 있습니다' }, { status: 403 })
  }

  const used = (d.extensions_used ?? {})[body.team_id] ?? 0
  if (used >= MAX_EXTENSIONS) {
    return NextResponse.json({ error: `추가 시간을 모두 사용했습니다 (최대 ${MAX_EXTENSIONS}회)` }, { status: 409 })
  }

  const now = Date.now()
  const base = d.pick_deadline ? Math.max(new Date(d.pick_deadline).getTime(), now) : now
  const nextDeadline = new Date(base + EXTENSION_SECONDS * 1000).toISOString()
  const nextExt = { ...(d.extensions_used ?? {}), [body.team_id]: used + 1 }

  const { data: updated, error } = await supabase
    .from('league_drafts')
    .update({ pick_deadline: nextDeadline, extensions_used: nextExt })
    .eq('id', draftId)
    .eq('status', 'in_progress')
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, pick_deadline: nextDeadline, extensions_used: nextExt, remaining: MAX_EXTENSIONS - (used + 1), draft: updated })
}
