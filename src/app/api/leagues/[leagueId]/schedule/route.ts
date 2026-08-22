import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { logAudit } from '@/lib/audit'

const DOW_MAP: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
}

function getMatchDates(startDate: Date, endDate: Date, matchDay: string): Date[] {
  const targetDow = DOW_MAP[matchDay] ?? 6
  const dates: Date[] = []
  const cur = new Date(startDate)
  // 첫 번째 해당 요일로 이동
  const diff = (targetDow - cur.getDay() + 7) % 7
  cur.setDate(cur.getDate() + diff)
  // 시작일 자체가 해당 요일이면 그대로 포함
  while (cur <= endDate) {
    dates.push(new Date(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return dates
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const supabase = createClient()

  const { data: league } = await supabase.from('leagues').select('*').eq('id', leagueId).single()
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 임시팀(친선전 전용)은 일정 편성 대상이 아니다 — 섞이면 정규 라운드 대진에 그날짜 팀이 들어간다
  const { data: teams } = await supabase.from('league_teams').select('*').eq('league_id', leagueId).is('exhibition_date', null)
  if (!teams || teams.length < 2) return NextResponse.json({ error: '팀이 2개 이상 필요합니다' }, { status: 400 })

  // 기간 계산: annual = 12개월, quarterly = 3개월
  const startDate = new Date(league.start_date)
  const seasonMonths = league.season_type === 'quarterly' ? 3 : 12
  const endDate = addMonths(startDate, seasonMonths)

  // 해당 요일의 모든 날짜 목록
  const matchDates = getMatchDates(startDate, endDate, league.match_day ?? 'saturday')

  // 파괴 전 확인 — league_games 삭제는 league_game_events 로 캐스케이드되고(021),
  // 리그 스탯은 이벤트 재집계로만 만들어진다. 즉 여기서 지우면 시즌 기록 전체가 소멸한다.
  // 기록이 하나라도 붙어 있으면 재생성을 거절한다.
  const { data: existingGames, error: existingError } = await supabase
    .from('league_games')
    .select('id, is_started, is_complete')
    .eq('league_id', leagueId)

  if (existingError) {
    // 조회 실패를 "기존 일정 없음"으로 넘기면 그대로 파괴로 이어진다 — 반드시 중단.
    return NextResponse.json(
      { error: '기존 일정을 확인하지 못해 중단했습니다. 잠시 후 다시 시도해주세요' },
      { status: 500 }
    )
  }

  const gameIds = (existingGames ?? []).map(g => g.id)
  const recordedCount = (existingGames ?? []).filter(g => g.is_started || g.is_complete).length

  // is_started 플래그가 없더라도 이벤트가 남아 있으면 실기록이다.
  let eventCount = 0
  if (gameIds.length > 0) {
    const { count, error: eventError } = await supabase
      .from('league_game_events')
      .select('id', { count: 'exact', head: true })
      .in('league_game_id', gameIds)
    if (eventError) {
      return NextResponse.json(
        { error: '기존 경기 기록을 확인하지 못해 중단했습니다. 잠시 후 다시 시도해주세요' },
        { status: 500 }
      )
    }
    eventCount = count ?? 0
  }

  if (recordedCount > 0 || eventCount > 0) {
    // 막힌 시도도 남긴다 — "기록이 있는데 재생성을 누른 사람" 은 그 자체로 신호다.
    await logAudit({
      req, action: 'schedule.regenerate', targetTable: 'league_games', targetId: leagueId,
      leagueId, result: 'denied', detail: { recordedCount, eventCount },
    })
    return NextResponse.json(
      {
        error: `이미 기록이 있는 경기 ${recordedCount}건(이벤트 ${eventCount}건)이 있어 일정을 재생성할 수 없습니다. 재생성하면 해당 경기의 기록까지 함께 사라집니다.`,
        recordedCount,
        eventCount,
      },
      { status: 409 }
    )
  }

  // 기존 일정 삭제 — 위 가드를 통과한, 기록이 전혀 없는 일정만 남아 있는 상태
  const { error: deleteError } = await supabase
    .from('league_games')
    .delete()
    .eq('league_id', leagueId)
    .select('id')
  if (deleteError) {
    return NextResponse.json({ error: '기존 일정 삭제에 실패했습니다' }, { status: 500 })
  }

  const games: {
    league_id: string
    home_team_id: string
    away_team_id: string
    date: string
    round_num: number
  }[] = []

  const teamCount = teams.length

  if (teamCount === 2) {
    matchDates.forEach((d, i) => {
      const dateStr = d.toISOString().split('T')[0]
      const isEven = i % 2 === 0
      games.push({
        league_id: leagueId,
        home_team_id: isEven ? teams[0].id : teams[1].id,
        away_team_id: isEven ? teams[1].id : teams[0].id,
        date: dateStr,
        round_num: i + 1,
      })
    })
  } else if (teamCount === 3) {
    // 3팀 로테이션: A-B, A-C, B-C 순환
    const matchups: [number, number][] = [[0, 1], [0, 2], [1, 2]]
    matchDates.forEach((d, i) => {
      const dateStr = d.toISOString().split('T')[0]
      const [hi, ai] = matchups[i % 3]
      const flip = Math.floor(i / 3) % 2 === 1
      games.push({
        league_id: leagueId,
        home_team_id: flip ? teams[ai].id : teams[hi].id,
        away_team_id: flip ? teams[hi].id : teams[ai].id,
        date: dateStr,
        round_num: i + 1,
      })
    })
  } else {
    // 4팀 이상: 라운드로빈 (짝수 보정)
    const teamList = [...teams]
    if (teamCount % 2 !== 0) teamList.push({ id: 'bye', league_id: leagueId, name: 'BYE', color: '#000000' })
    const m = teamList.length
    const roundsPerCycle = m - 1
    let dateIdx = 0

    for (let cycle = 0; dateIdx < matchDates.length; cycle++) {
      const savedTeamList = [...teamList]
      for (let r = 0; r < roundsPerCycle && dateIdx < matchDates.length; r++) {
        const dateStr = matchDates[dateIdx].toISOString().split('T')[0]
        const flip = cycle % 2 === 1
        for (let j = 0; j < m / 2; j++) {
          const home = teamList[j]
          const away = teamList[m - 1 - j]
          if (home.id === 'bye' || away.id === 'bye') continue
          games.push({
            league_id: leagueId,
            home_team_id: flip ? away.id : home.id,
            away_team_id: flip ? home.id : away.id,
            date: dateStr,
            round_num: dateIdx + 1,
          })
        }
        // rotate
        const last = teamList.splice(m - 1, 1)[0]
        teamList.splice(1, 0, last)
        dateIdx++
      }
      // 다음 사이클 전 원래 순서 복원 후 재회전
      teamList.splice(0, m, ...savedTeamList)
    }
  }

  const { data: inserted, error } = await supabase.from('league_games').insert(games).select()
  if (error) {
    await logAudit({
      req, action: 'schedule.regenerate', targetTable: 'league_games', targetId: leagueId,
      leagueId, result: 'failure', detail: { deletedGames: gameIds.length },
    })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await logAudit({
    req, action: 'schedule.regenerate', targetTable: 'league_games', targetId: leagueId,
    leagueId, detail: { deletedGames: gameIds.length, createdGames: inserted?.length ?? 0 },
  })
  return NextResponse.json({ count: inserted?.length ?? 0, games: inserted })
}
