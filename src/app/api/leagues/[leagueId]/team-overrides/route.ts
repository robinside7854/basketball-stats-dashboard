// 리그의 모든 분기 팀 override 목록 반환.
// 클라이언트가 여러 분기의 팀 표시를 동시에 그릴 때 사용 (roster 페이지 등).
//
// GET /api/leagues/[id]/team-overrides
//   → Array<{ quarter_id, team_id, name, color }>

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewLeague } from '@/lib/auth/guard'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_team_quarter_overrides')
    .select('quarter_id, team_id, name, color')
    .eq('league_id', leagueId)
    .limit(10000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
