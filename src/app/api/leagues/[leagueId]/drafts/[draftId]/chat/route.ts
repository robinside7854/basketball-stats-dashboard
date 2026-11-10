// 드래프트 실시간 채팅 — 코드 보유자(단장/감독관) 전용
//
// GET  ?after=<ISO>  — after 이후 메시지 (없으면 최근 100개). X-Draft-Code 필요.
// POST { message }   — 메시지 전송. X-Draft-Code 로 발신자(역할·팀·레이블) 식별.
//
// 인증: X-Draft-Code 헤더가 이 분기의 활성 코드(단장 또는 감독관)와 일치해야 함.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'

const MAX_LEN = 500

async function resolveSender(req: Request, leagueId: string, draftId: string) {
  const supabase = createClient()
  const { data: draft } = await supabase
    .from('league_drafts')
    .select('id, quarter_id')
    .eq('id', draftId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!draft) return { error: '세션을 찾을 수 없습니다', status: 404 as const }

  const plain = req.headers.get('X-Draft-Code')?.trim()
  if (!plain) return { error: '코드 인증 필요', status: 401 as const }

  const match = await lookupDraftCode(leagueId, (draft as { quarter_id: string }).quarter_id, plain)
  if (!match) return { error: '코드 인증 실패', status: 401 as const }

  return { sender: match, supabase }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const r = await resolveSender(req, leagueId, draftId)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  const { searchParams } = new URL(req.url)
  const after = searchParams.get('after')

  const base = r.supabase
    .from('league_draft_chat')
    .select('id, sender_role, team_id, sender_label, message, created_at')
    .eq('draft_id', draftId)
  // 처음 열 때는 **최근** 100개(2026-11-10 리뷰 — 종전엔 가장 오래된 100개라 100개가 넘으면 새 글이 안 보였다)
  const { data, error } = after
    ? await base.gt('created_at', after).order('created_at', { ascending: true })
    : await base.order('created_at', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(after ? (data ?? []) : [...(data ?? [])].reverse())
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; draftId: string }> },
) {
  const { leagueId, draftId } = await params
  const body = await req.json().catch(() => null) as { message?: string } | null
  const message = body?.message?.trim()
  if (!message) return NextResponse.json({ error: '메시지를 입력하세요' }, { status: 400 })
  if (message.length > MAX_LEN) return NextResponse.json({ error: `메시지는 ${MAX_LEN}자 이하` }, { status: 400 })

  const r = await resolveSender(req, leagueId, draftId)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })

  const { data, error } = await r.supabase
    .from('league_draft_chat')
    .insert({
      draft_id: draftId,
      sender_role: r.sender.role,
      team_id: r.sender.teamId,
      sender_label: r.sender.label,
      message,
    })
    .select('id, sender_role, team_id, sender_label, message, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
