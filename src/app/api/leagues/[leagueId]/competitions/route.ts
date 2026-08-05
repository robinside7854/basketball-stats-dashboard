import { NextResponse } from 'next/server'
import { canViewLeague } from '@/lib/auth/guard'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { fetchTeamCompetitions, visibleCompetitions } from '@/lib/league/competitions'

// GET /api/leagues/[leagueId]/competitions
//
// "이 팀에 어떤 경기묶음이 있는가" 는 명단·일정과 같은 공개 등급 정보다.
// canViewStats(승인 회원 전용)는 과하므로 canViewLeague 로만 막는다 —
// 비공개 동호회면 로그인 전에는 안 보이고, 공개면 누구나 본다.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }

  const all = await fetchTeamCompetitions(leagueId)
  const canEdit = await canEditLeague(req, leagueId)
  const competitions = visibleCompetitions(all, leagueId, canEdit)

  return NextResponse.json({ competitions })
}
