import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'

// GET /api/auth/ceo-session → { ceo: boolean }
//
// 리그 화면이 "지금 보는 사람이 CEO(온볼 운영자)인가"를 알기 위한 확인용 (2026-10-11).
// 편집 PIN 을 폐지하면서, 어드민 회원 로그인만 보던 화면이 CEO 를 편집 불가로 그리게 됐다
// (서버 canEditLeague 는 CEO 를 이미 통과시킨다). 화면도 같은 판정을 쓰게 한다.
// ⚠ 보안 경계가 아니다 — 실제 인가는 각 mutation 라우트의 canEditLeague 가 매 요청 재확인한다.
export async function GET() {
  const session = await requireCeoSession()
  return NextResponse.json({ ceo: !!session }, { headers: { 'Cache-Control': 'private, no-store' } })
}
