import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

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
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const supabase = createClient()

  const { data: league } = await supabase.from('leagues').select('*').eq('id', leagueId).single()
  if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: teams } = await supabase.from('league_teams').select('*').eq('league_id', leagueId)
  if (!teams || teams.length < 2) return NextResponse.json({ error: '팀이 2개 이상 필요합니다' }, { status: 400 })

  // 기간 계산: annual = 12개월, quarterly = 3개월
  const startDate = new Date(league.start_date)
  const seasonMonths = league.season_type === 'quarterly' ? 3 : 12
  const endDate = addMonths(startDate, seasonMonths)

  // 해당 요일의 모든 날짜 목록
  const matchDates = getMatchDates(startDate, endDate, league.match_day ?? 'saturday')

  // 기존 일정 삭제
  await supabase.from('league_games').delete().eq('league_id', leagueId)

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: inserted?.length ?? 0, games: inserted })
}
