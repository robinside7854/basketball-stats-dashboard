import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewStats } from '@/lib/auth/guard'
import { fetchTeamCompetitions } from '@/lib/league/competitions'
import { resolveTeamId } from '@/lib/league/teamScope'
import { playerPeriodLine, sumLines, type CountingLine } from '@/lib/stats/playerTotals'

// GET /api/leagues/[leagueId]/players/[playerId]/career
//
// 선수 카드 아래쪽 「리그 통산」·「대회 기록」 — 「선수 숫자는 한 벌」(2026-10-14).
//
//   · 묶음마다 숫자는 **playerPeriodLine(그 묶음, 'all')** 하나에서 나온다 = 그 묶음 스탯 탭의 그 선수 행.
//     (친선 제외 · 하루 단위 gp · 출전시간만 있는 날 포함 · 외부 팀 이벤트 제외 · scorePoints/isPlusOneFor)
//     예전 자체 루프(summarizeInCompetition)는 친선을 포함하고 gp 를 경기 슬롯으로 세어 위쪽 누적과 숫자가 갈렸다.
//   · 리그 통산 = mode='league' 묶음만 더한다. **대회는 절대 더하지 않는다** — 대회는 일시적인 이벤트이고
//     리그 기록을 희석하면 안 된다(운영진 결정). 대회는 `tournaments[]` 로 따로 돌려주고 화면이 「통산 미포함」으로 보인다.
//   · 명단은 팀 소유라 league_players.id 하나가 팀 전체에서 같은 사람이다 — 묶음을 건너도 playerId 로 찾는다.

type CompetitionLine = CountingLine & {
  leagueId: string; slug: string; name: string; mode: 'league' | 'tournament'; seasonYear: number
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  // 개인 스탯이므로 승인 회원 전용 — 이 코드베이스의 스탯 게이팅 정책(2026-07-28)을 그대로 따른다.
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }

  const sb = createClient()

  // 명단은 팀 소유다 — league_id 로 확인하면 이 선수 행의 출생 league_id 가 지금 보는
  // leagueId 와 다를 때(예: 대회에서 리그 선수의 카드를 열 때) 항상 404 가 난다.
  const teamId = await resolveTeamId(leagueId)
  const { data: self, error: selfErr } = await sb
    .from('league_players')
    .select('id')
    .eq('id', playerId)
    .eq('team_id', teamId)
    .maybeSingle()
  if (selfErr) throw new Error(`league_players: playerId=${playerId} 조회 실패 — ${selfErr.message}`)
  if (!self) return NextResponse.json({ error: 'player_not_found' }, { status: 404 })

  // 이 팀의 묶음 목록(리그 시즌·대회). ⚠ 스탯을 묶음끼리 더하는 데 쓰지 말 것 — 리그끼리만 더한다(아래).
  const competitions = await fetchTeamCompetitions(leagueId)

  const lines = await Promise.all(
    competitions.map(async (c): Promise<CompetitionLine | null> => {
      const { line } = await playerPeriodLine(c.id, playerId, 'all')
      if (!line || line.gp === 0) return null // 이 묶음엔 기록이 없다
      return {
        leagueId: c.id, slug: c.slug, name: c.name, mode: c.mode, seasonYear: c.season_year,
        gp: line.gp, pts: line.pts, reb: line.reb, ast: line.ast, stl: line.stl, blk: line.blk,
      }
    }),
  )
  const present = lines.filter((c): c is CompetitionLine => c !== null)
  const leagues = present.filter(c => c.mode === 'league')
  const tournaments = present.filter(c => c.mode === 'tournament')

  return NextResponse.json({
    leagues,
    // 리그 시즌이 둘 이상일 때만 의미가 있다(하나면 위쪽 누적과 같은 숫자) — 화면이 그 조건으로 보인다.
    league_career: sumLines(leagues),
    tournaments,
  })
}
