// 단장이 평문 코드를 입력했을 때 어느 팀의 단장인지 식별.
//
// POST body: { quarter_id, plain_code }
// 응답:
//   matched: { team_id, label, code_id } | null
//
// 평문 코드는 bcrypt 해시와 비교 (bcrypt.compare).
// 코드를 찾은 경우 — 응답에 codeId를 포함하므로 클라이언트가 X-Draft-Code 헤더로 픽 요청 가능.

import { NextResponse } from 'next/server'
import { lookupDraftCode } from '@/lib/leagueDraftAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const body = await req.json().catch(() => null) as
    | { quarter_id?: string; plain_code?: string }
    | null
  if (!body?.quarter_id || !body?.plain_code) {
    return NextResponse.json({ error: 'quarter_id, plain_code 필요' }, { status: 400 })
  }

  const result = await lookupDraftCode(leagueId, body.quarter_id, body.plain_code.trim())
  if (!result) {
    return NextResponse.json({ matched: null })
  }
  return NextResponse.json({
    matched: {
      team_id: result.teamId,
      label: result.label,
      code_id: result.codeId,
      role: result.role,
    },
  })
}
