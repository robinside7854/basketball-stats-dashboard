import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

const SHOT_LABELS: Record<string, string> = {
  shot_post: '골밑슛',
  shot_layup: '레이업',
  shot_2p_mid: '미드레인지',
  shot_3p: '3점슛',
}

// 라운드 우선순위 (높을수록 나중 라운드)
const ROUND_KEYWORDS: [string, number][] = [
  ['결승', 100], ['final', 100],
  ['3위', 90], ['3-4위', 90],
  ['준결승', 80], ['4강', 80], ['semi', 80],
  ['8강', 70], ['준준결승', 70], ['quarter', 70],
  ['16강', 60],
  ['조별', 20], ['예선', 10], ['group', 10],
]
function roundPriority(round?: string | null): number {
  if (!round) return 50
  const lower = round.toLowerCase()
  for (const [key, val] of ROUND_KEYWORDS) {
    if (lower.includes(key.toLowerCase())) return val
  }
  return 50
}

// 출전 시간 합산 (in_time/out_time은 숫자 초 단위)
function totalMinutes(minutes: { in_time: number; out_time: number | null }[]): number {
  return minutes.reduce((sum, m) => {
    const diff = (m.out_time ?? m.in_time) - m.in_time
    return sum + (diff > 0 ? diff / 60 : 0)
  }, 0)
}

type RawEvent = { game_id: string; type: string; result: string; points?: number }
type RawMinute = { game_id: string; in_time: number; out_time: number | null }

// 선수 이벤트만으로 박스스코어 직접 집계
function calcStats(
  events: RawEvent[],
  assistEvents: { game_id: string }[],
  minutes: RawMinute[],
  gameIds?: string[],
) {
  const evts = gameIds ? events.filter(e => gameIds.includes(e.game_id)) : events
  const assts = gameIds ? assistEvents.filter(e => gameIds.includes(e.game_id)) : assistEvents
  const mins = gameIds ? minutes.filter(m => gameIds.includes(m.game_id)) : minutes

  let pts = 0, fgm = 0, fga = 0, fg3m = 0, fg3a = 0, ftm = 0, fta = 0
  let reb = 0, ast = 0, stl = 0, blk = 0, tov = 0

  for (const e of evts) {
    switch (e.type) {
      case 'shot_post':
      case 'shot_layup':
      case 'shot_2p_mid':
      case 'shot_2p_drive':
        fga++
        if (e.result === 'made') { fgm++; pts += 2 }
        break
      case 'shot_3p':
        fga++; fg3a++
        if (e.result === 'made') { fgm++; fg3m++; pts += 3 }
        break
      case 'free_throw':
        fta++
        if (e.result === 'made') { ftm++; pts += 1 }
        break
      case 'oreb':
      case 'dreb':
        reb++
        break
      case 'steal':
        stl++
        break
      case 'block':
        blk++
        break
      case 'turnover':
        tov++
        break
    }
  }

  ast = assts.length
  const min = totalMinutes(mins)
  const fg_pct = fga > 0 ? Math.round((fgm / fga) * 1000) / 10 : 0
  const fg3_pct = fg3a > 0 ? Math.round((fg3m / fg3a) * 1000) / 10 : 0

  return { pts, fgm, fga, fg_pct, fg3m, fg3a, fg3_pct, ftm, fta, reb, ast, stl, blk, tov, min: Math.round(min * 10) / 10 }
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient()

  // 1. 선수 정보
  const playerRes = await supabase.from('players').select('*').eq('id', id).single()
  if (playerRes.error) return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  const player = playerRes.data

  // 2. 팀 전체 경기 (round 포함)
  const { data: allTeamGames } = await supabase
    .from('games')
    .select('id, date, opponent, our_score, opponent_score, tournament_id, round, tournament:tournaments(id, name, year)')
    .order('date', { ascending: false })

  const allTeamGameIds = (allTeamGames || []).map((g: Record<string, unknown>) => g.id as string)

  if (allTeamGameIds.length === 0) {
    return NextResponse.json({ player, recentGames: [], shotBreakdown: {}, totalShotAttempts: 0, freeThrow: null, tournamentStats: [] })
  }

  // 3. 이 선수의 이벤트만 조회 (전체 팀 이벤트 대신 → 1,000행 한도 문제 해결)
  const [playerEventsRes, assistEventsRes, playerMinutesRes] = await Promise.all([
    supabase
      .from('game_events')
      .select('game_id, type, result, points')
      .eq('player_id', id)
      .in('game_id', allTeamGameIds)
      .limit(10000),
    supabase
      .from('game_events')
      .select('game_id')
      .eq('related_player_id', id)
      .in('game_id', allTeamGameIds)
      .limit(10000),
    supabase
      .from('player_minutes')
      .select('game_id, in_time, out_time')
      .eq('player_id', id)
      .in('game_id', allTeamGameIds)
      .limit(10000),
  ])

  const playerEvents: RawEvent[] = playerEventsRes.data || []
  const assistEvents: { game_id: string }[] = assistEventsRes.data || []
  const playerMinutes: RawMinute[] = playerMinutesRes.data || []

  // 4. 이 선수가 참여한 경기 ID 집합
  const playerEventGameIds = new Set(playerEvents.map(e => e.game_id))
  const playerMinuteGameIds = new Set(playerMinutes.map(m => m.game_id))
  const playerGameIdSet = new Set([...playerEventGameIds, ...playerMinuteGameIds])

  // 같은 날짜면 round 우선순위 높은 순 (4강 > 8강)
  const playerGames = (allTeamGames || [])
    .filter((g: Record<string, unknown>) => playerGameIdSet.has(g.id as string))
    .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const dateDiff = (b.date as string).localeCompare(a.date as string)
      if (dateDiff !== 0) return dateDiff
      return roundPriority(b.round as string) - roundPriority(a.round as string)
    })

  // ── 최근 5경기 ──────────────────────────────────────────────
  const recentGames = playerGames.slice(0, 5).map((game: Record<string, unknown>) => {
    const gid = game.id as string
    const stats = calcStats(playerEvents, assistEvents, playerMinutes, [gid])
    const t = game.tournament as Record<string, unknown> | null
    return {
      game_id: gid,
      date: game.date,
      opponent: game.opponent,
      round: game.round ?? null,
      our_score: game.our_score,
      opponent_score: game.opponent_score,
      tournament_name: t?.name ?? null,
      stats: { player_id: id, ...stats },
    }
  })

  // ── 슛 구역 분석 ──────────────────────────────────────────────
  const shotBreakdown = Object.fromEntries(
    Object.keys(SHOT_LABELS).map(type => {
      const shots = playerEvents.filter(e => e.type === type)
      const attempted = shots.length
      const made = shots.filter(e => e.result === 'made').length
      return [type, { label: SHOT_LABELS[type], made, attempted, pct: attempted > 0 ? Math.round((made / attempted) * 1000) / 10 : 0 }]
    })
  )
  const totalShotAttempts = Object.values(shotBreakdown).reduce((sum, v) => sum + (v as { attempted: number }).attempted, 0)

  const ftShots = playerEvents.filter(e => e.type === 'free_throw')
  const freeThrow = {
    label: '자유투',
    attempted: ftShots.length,
    made: ftShots.filter(e => e.result === 'made').length,
    pct: ftShots.length > 0 ? Math.round((ftShots.filter(e => e.result === 'made').length / ftShots.length) * 1000) / 10 : 0,
  }

  // ── 대회별 성적 ──────────────────────────────────────────────
  const { data: allTournaments } = await supabase
    .from('tournaments').select('*').order('year', { ascending: false })

  const tournamentStats = (allTournaments || []).map((t: Record<string, unknown>) => {
    const teamGamesInT = (allTeamGames || []).filter((g: Record<string, unknown>) => {
      const tObj = g.tournament as { id: string } | null
      return tObj?.id === (t.id as string) || g.tournament_id === t.id
    })
    if (teamGamesInT.length === 0) return null

    const tGameIds = teamGamesInT.map((g: Record<string, unknown>) => g.id as string)
    const playerGamesInT = tGameIds.filter(gid => playerGameIdSet.has(gid))
    const gp = playerGamesInT.length

    if (gp === 0) return { tournament: t, games_played: 0, stats: null, games: [] }

    const playerStats = calcStats(playerEvents, assistEvents, playerMinutes, tGameIds)

    // 대회 내 경기별 상세 (round 우선순위 기준 정렬)
    const gamesDetail = teamGamesInT
      .filter((g: Record<string, unknown>) => playerGameIdSet.has(g.id as string))
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const dateDiff = (b.date as string).localeCompare(a.date as string)
        if (dateDiff !== 0) return dateDiff
        return roundPriority(b.round as string) - roundPriority(a.round as string)
      })
      .map((g: Record<string, unknown>) => {
        const gid = g.id as string
        const gs = calcStats(playerEvents, assistEvents, playerMinutes, [gid])
        return {
          game_id: gid,
          date: g.date,
          opponent: g.opponent,
          round: g.round ?? null,
          our_score: g.our_score,
          opponent_score: g.opponent_score,
          stats: { player_id: id, ...gs },
        }
      })

    return {
      tournament: t,
      games_played: gp,
      stats: {
        player_id: id,
        ...playerStats,
        pts_avg: Math.round((playerStats.pts / gp) * 10) / 10,
        reb_avg: Math.round((playerStats.reb / gp) * 10) / 10,
        ast_avg: Math.round((playerStats.ast / gp) * 10) / 10,
        stl_avg: Math.round((playerStats.stl / gp) * 10) / 10,
        blk_avg: Math.round((playerStats.blk / gp) * 10) / 10,
        tov_avg: Math.round((playerStats.tov / gp) * 10) / 10,
      },
      games: gamesDetail,
    }
  }).filter(Boolean)

  return NextResponse.json({ player, recentGames, shotBreakdown, totalShotAttempts, freeThrow, tournamentStats })
}
