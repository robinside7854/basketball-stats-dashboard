import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

type EventRow = {
  league_player_id: string | null
  type: string
  result: string | null
  points: number
  related_player_id: string | null
}

type MinRow = {
  league_player_id: string
  in_time: number | null
  out_time: number | null
}

type PlayerStat = {
  player_id: string
  pts: number
  fgm: number; fga: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  min: number
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> }
) {
  const { leagueId, gameId } = await params
  const supabase = createClient()

  const [{ data: events }, { data: mins }, { data: leaguePlayers }] = await Promise.all([
    supabase.from('league_game_events').select('league_player_id,type,result,points,related_player_id').eq('league_game_id', gameId),
    supabase.from('league_player_minutes').select('league_player_id,in_time,out_time').eq('league_game_id', gameId),
    supabase.from('league_players').select('id,plus_one').eq('league_id', leagueId),
  ])

  const plusOneSet = new Set((leaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))

  const statsMap: Record<string, PlayerStat> = {}
  function getOrCreate(pid: string): PlayerStat {
    if (!statsMap[pid]) statsMap[pid] = { player_id: pid, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, min: 0 }
    return statsMap[pid]
  }

  for (const e of (events as EventRow[]) ?? []) {
    if (!e.league_player_id) continue
    const s = getOrCreate(e.league_player_id)
    const made = e.result === 'made'
    // 필드골 득점: 현재 plus_one 플래그 기준 동적 계산
    const isPlusOne = plusOneSet.has(e.league_player_id)

    if (e.type === 'shot_3p') { s.fg3a++; s.fga++; if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3 } }
    else if (e.type === 'shot_2p_mid' || e.type === 'shot_layup' || e.type === 'shot_post' || e.type === 'shot_2p_drive') { s.fga++; if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2 } }
    // 자유투: 저장된 points 사용 (ft_2pt=2, ft_3pt_1=2, ft_3pt_2=1, free_throw=1)
    else if (e.type === 'free_throw') { s.fta++; if (made) { s.ftm++; s.pts += e.points ?? 1 } }
    else if (e.type === 'ft_2pt') { s.fta++; if (made) { s.ftm++; s.pts += e.points ?? 2 } }
    else if (e.type === 'ft_3pt_1') { s.fta++; if (made) { s.ftm++; s.pts += e.points ?? 2 } }
    else if (e.type === 'ft_3pt_2') { s.fta++; if (made) { s.ftm++; s.pts += e.points ?? 1 } }
    else if (e.type === 'oreb') { s.oreb++; s.reb++ }
    else if (e.type === 'dreb') { s.dreb++; s.reb++ }
    else if (e.type === 'steal') s.stl++
    else if (e.type === 'block') s.blk++
    else if (e.type === 'turnover') s.tov++
    else if (e.type === 'foul') s.pf++

    // assist on made shots (shot_2p_drive 포함)
    if (e.related_player_id && made && ['shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive'].includes(e.type)) {
      getOrCreate(e.related_player_id).ast++
    }
  }

  // compute minutes from intervals
  for (const m of (mins as MinRow[]) ?? []) {
    if (!m.league_player_id) continue
    const s = getOrCreate(m.league_player_id)
    const elapsed = (m.out_time ?? m.in_time ?? 0) - (m.in_time ?? 0)
    if (elapsed > 0) s.min += Math.round(elapsed / 60)
  }

  const boxScores = Object.values(statsMap)
  const teamTotals = boxScores.reduce<Partial<PlayerStat>>((acc, s) => ({
    pts: (acc.pts ?? 0) + s.pts,
    fgm: (acc.fgm ?? 0) + s.fgm,
    fga: (acc.fga ?? 0) + s.fga,
    fg3m: (acc.fg3m ?? 0) + s.fg3m,
    fg3a: (acc.fg3a ?? 0) + s.fg3a,
    ftm: (acc.ftm ?? 0) + s.ftm,
    fta: (acc.fta ?? 0) + s.fta,
    oreb: (acc.oreb ?? 0) + s.oreb,
    dreb: (acc.dreb ?? 0) + s.dreb,
    reb: (acc.reb ?? 0) + s.reb,
    ast: (acc.ast ?? 0) + s.ast,
    stl: (acc.stl ?? 0) + s.stl,
    blk: (acc.blk ?? 0) + s.blk,
    tov: (acc.tov ?? 0) + s.tov,
    pf: (acc.pf ?? 0) + s.pf,
  }), {})

  return NextResponse.json({ boxScores, teamTotals })
}
