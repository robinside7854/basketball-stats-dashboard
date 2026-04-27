import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET /api/leagues/[leagueId]/stats
// 쿼리 파라미터: quarterId, teamId, playerId, from, to
// 분기별/팀별/선수별 시즌 누적 스탯 반환
export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const quarterId = sp.get('quarterId')
  const teamId    = sp.get('teamId')
  const playerId  = sp.get('playerId')
  const from      = sp.get('from')
  const to        = sp.get('to')

  const supabase = createClient()

  // 1. 선수 메타 + plus_one 플래그를 이벤트 루프 전에 미리 조회
  const { data: allLeaguePlayers } = await supabase
    .from('league_players')
    .select('id, name, number, position, plus_one')
    .eq('league_id', leagueId)

  const plusOneSet = new Set((allLeaguePlayers ?? []).filter(p => p.plus_one).map(p => p.id))
  const metaMap = Object.fromEntries((allLeaguePlayers ?? []).map(p => [p.id, p]))

  // 2. 대상 완료 게임 ID 추출
  let gQuery = supabase
    .from('league_games')
    .select('id')
    .eq('league_id', leagueId)
    .eq('is_complete', true)

  if (quarterId) gQuery = gQuery.eq('quarter_id', quarterId)
  if (from)      gQuery = gQuery.gte('date', from)
  if (to)        gQuery = gQuery.lte('date', to)

  const { data: games, error: gErr } = await gQuery
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  const gameIds = (games ?? []).map(g => g.id)
  if (gameIds.length === 0) return NextResponse.json({ players: [] })

  // 3. 이벤트 조회
  let eQuery = supabase
    .from('league_game_events')
    .select('league_player_id, related_player_id, team_id, type, result, points, league_game_id')
    .in('league_game_id', gameIds)
    .not('league_player_id', 'is', null)

  if (teamId)   eQuery = eQuery.eq('team_id', teamId)
  if (playerId) eQuery = eQuery.eq('league_player_id', playerId)

  const { data: events, error: eErr } = await eQuery
  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 })

  // 4. 선수별 스탯 집계
  type PlayerStats = {
    player_id: string
    gp: number
    pts: number
    fgm: number; fga: number
    fg3m: number; fg3a: number
    ftm: number;  fta: number
    oreb: number; dreb: number; reb: number
    ast: number; stl: number; blk: number
    tov: number; pf: number
  }

  const statsMap: Record<string, PlayerStats> = {}
  const gpMap: Record<string, Set<string>> = {}  // player_id → game_ids set

  const ensure = (pid: string): PlayerStats => {
    if (!statsMap[pid]) {
      statsMap[pid] = {
        player_id: pid, gp: 0,
        pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
        oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
      }
    }
    return statsMap[pid]
  }

  for (const e of events ?? []) {
    if (!e.league_player_id) continue
    const pid = e.league_player_id
    const s = ensure(pid)
    const gId = e.league_game_id

    // 출전 경기 수 집계
    if (!gpMap[pid]) gpMap[pid] = new Set()
    gpMap[pid].add(gId)

    const made = e.result === 'made'
    // 필드골 득점은 현재 plus_one 플래그 기준으로 동적 계산 (과거 기록 보정 포함)
    const isPlusOne = plusOneSet.has(pid)

    switch (e.type) {
      case 'shot_3p':
        s.fg3a++; s.fga++
        if (made) { s.fg3m++; s.fgm++; s.pts += isPlusOne ? 4 : 3 }
        break
      case 'shot_2p_mid':
      case 'shot_layup':
      case 'shot_post':
      case 'shot_2p_drive':
        s.fga++
        if (made) { s.fgm++; s.pts += isPlusOne ? 3 : 2 }
        break
      // 자유투: +1 미적용, 저장된 points 값 사용 (ft_2pt=2, ft_3pt_1=2, ft_3pt_2=1, free_throw=1)
      case 'free_throw':
      case 'ft_2pt':
      case 'ft_3pt_1':
      case 'ft_3pt_2':
        s.fta++
        if (made) { s.ftm++; s.pts += e.points ?? 1 }
        break
      case 'oreb': s.oreb++; s.reb++; break
      case 'dreb': s.dreb++; s.reb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
      case 'foul': s.pf++; break
    }

    // 어시스트: 슛 성공 + related_player_id → 어시스터에게 ast 추가
    if (made &&
        ['shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive'].includes(e.type) &&
        e.related_player_id) {
      const as = ensure(e.related_player_id)
      as.ast++
      if (!gpMap[e.related_player_id]) gpMap[e.related_player_id] = new Set()
      gpMap[e.related_player_id].add(gId)
    }
  }

  // gp 채우기
  for (const pid of Object.keys(statsMap)) {
    statsMap[pid].gp = gpMap[pid]?.size ?? 0
  }

  // 5. 평균/퍼센트 계산 후 반환
  if (Object.keys(statsMap).length === 0) return NextResponse.json({ players: [] })
  const result = Object.values(statsMap)
    .filter(s => s.gp > 0)
    .map(s => {
      const meta = metaMap[s.player_id] ?? {}
      return {
        ...s,
        name:     (meta as Record<string,unknown>).name     ?? '알 수 없음',
        number:   (meta as Record<string,unknown>).number   ?? null,
        position: (meta as Record<string,unknown>).position ?? null,
        // 평균
        ppg:  s.gp > 0 ? +(s.pts  / s.gp).toFixed(1) : 0,
        rpg:  s.gp > 0 ? +(s.reb  / s.gp).toFixed(1) : 0,
        apg:  s.gp > 0 ? +(s.ast  / s.gp).toFixed(1) : 0,
        spg:  s.gp > 0 ? +(s.stl  / s.gp).toFixed(1) : 0,
        bpg:  s.gp > 0 ? +(s.blk  / s.gp).toFixed(1) : 0,
        topg: s.gp > 0 ? +(s.tov  / s.gp).toFixed(1) : 0,
        // 슈팅 퍼센트
        fg_pct:  s.fga  > 0 ? +(s.fgm  / s.fga  * 100).toFixed(1) : 0,
        fg3_pct: s.fg3a > 0 ? +(s.fg3m / s.fg3a * 100).toFixed(1) : 0,
        ft_pct:  s.fta  > 0 ? +(s.ftm  / s.fta  * 100).toFixed(1) : 0,
        // eFG% = (FGM + 0.5 * FG3M) / FGA
        efg_pct: s.fga  > 0 ? +((s.fgm + 0.5 * s.fg3m) / s.fga * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.pts - a.pts) // 득점 순 정렬

  return NextResponse.json({ players: result, games_count: gameIds.length })
}
