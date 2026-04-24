import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

// POST /api/leagues/[leagueId]/schedule-dates/auto
// start_date 기준으로 오늘까지 매주 날짜 자동 생성
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()

  // 리그 설정 조회
  const { data: league, error: leagueErr } = await supabase
    .from('leagues')
    .select('start_date, match_day')
    .eq('id', leagueId)
    .single()

  if (leagueErr || !league) return NextResponse.json({ error: '리그를 찾을 수 없습니다' }, { status: 404 })
  if (!league.start_date) return NextResponse.json({ error: '설정 탭에서 첫 경기 날짜(start_date)를 먼저 지정하세요' }, { status: 400 })

  // start_date ~ 오늘까지 7일 간격으로 날짜 생성
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  const dates: string[] = []
  const cursor = new Date(league.start_date + 'T00:00:00')

  while (cursor <= today) {
    const yyyy = cursor.getFullYear()
    const mm = String(cursor.getMonth() + 1).padStart(2, '0')
    const dd = String(cursor.getDate()).padStart(2, '0')
    dates.push(`${yyyy}-${mm}-${dd}`)
    cursor.setDate(cursor.getDate() + 7)
  }

  if (dates.length === 0) {
    return NextResponse.json({ error: 'start_date가 오늘 이후입니다. 과거 날짜로 설정하세요', inserted: 0 }, { status: 400 })
  }

  // 이미 있는 날짜 조회
  const { data: existing } = await supabase
    .from('league_schedule_dates')
    .select('date')
    .eq('league_id', leagueId)

  const existingSet = new Set((existing ?? []).map((r: { date: string }) => r.date))
  const newDates = dates.filter(d => !existingSet.has(d))

  if (newDates.length === 0) {
    return NextResponse.json({ message: '모든 날짜가 이미 등록되어 있습니다', inserted: 0, total: dates.length })
  }

  const rows = newDates.map(date => ({ league_id: leagueId, date }))
  const { error: insertErr } = await supabase
    .from('league_schedule_dates')
    .insert(rows)

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    inserted: newDates.length,
    total: dates.length,
    skipped: existingSet.size,
    from: dates[0],
    to: dates[dates.length - 1],
  })
}
