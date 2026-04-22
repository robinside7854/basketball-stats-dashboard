import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

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

  // 기존 일정 삭제
  await supabase.from('league_games').delete().eq('league_id', leagueId)

  const games: {
    league_id: string
    home_team_id: string
    away_team_id: string
    date: string
    round_num: number
  }[] = []
  const startDate = new Date(league.start_date)

  if (teams.length === 2) {
    for (let r = 0; r < league.total_rounds; r++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + r * 7)
      const dateStr = d.toISOString().split('T')[0]
      const isEven = r % 2 === 0
      games.push({
        league_id: leagueId,
        home_team_id: isEven ? teams[0].id : teams[1].id,
        away_team_id: isEven ? teams[1].id : teams[0].id,
        date: dateStr,
        round_num: r + 1,
      })
    }
  } else if (teams.length === 3) {
    const matchups: [number, number][] = [[0, 1], [0, 2], [1, 2]]
    for (let r = 0; r < league.total_rounds; r++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + r * 7)
      const dateStr = d.toISOString().split('T')[0]
      const [hi, ai] = matchups[r % 3]
      const flip = Math.floor(r / 3) % 2 === 1
      games.push({
        league_id: leagueId,
        home_team_id: flip ? teams[ai].id : teams[hi].id,
        away_team_id: flip ? teams[hi].id : teams[ai].id,
        date: dateStr,
        round_num: r + 1,
      })
    }
  } else {
    // 4팀 이상: 라운드로빈 알고리즘
    const n = teams.length
    const teamList = [...teams]
    if (n % 2 !== 0) teamList.push({ id: 'bye', league_id: leagueId, name: 'BYE', color: '#000000' })
    const m = teamList.length
    const rounds = m - 1
    let roundNum = 0
    for (let r = 0; r < Math.ceil(league.total_rounds / rounds); r++) {
      for (let i = 0; i < rounds; i++) {
        if (roundNum >= league.total_rounds) break
        roundNum++
        const d = new Date(startDate)
        d.setDate(d.getDate() + (roundNum - 1) * 7)
        const dateStr = d.toISOString().split('T')[0]
        for (let j = 0; j < m / 2; j++) {
          const home = teamList[j]
          const away = teamList[m - 1 - j]
          if (home.id === 'bye' || away.id === 'bye') continue
          const flip = r % 2 === 1
          games.push({
            league_id: leagueId,
            home_team_id: flip ? away.id : home.id,
            away_team_id: flip ? home.id : away.id,
            date: dateStr,
            round_num: roundNum,
          })
        }
        // rotate: fix first, rotate rest
        const last = teamList.splice(m - 1, 1)[0]
        teamList.splice(1, 0, last)
      }
    }
  }

  const { data: inserted, error } = await supabase.from('league_games').insert(games).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(inserted)
}
