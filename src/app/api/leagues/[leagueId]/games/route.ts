import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  const supabase = createClient()

  let q = supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)

  if (date) {
    q = q.eq('date', date).order('slot_num', { ascending: true })
  } else {
    q = q.order('date', { ascending: true }).order('slot_num', { ascending: true })
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// 날짜에 대한 게임 슬랏 초기화 (games_per_round 개수만큼 생성)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { date } = await req.json()
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const supabase = createClient()

  // 리그 설정에서 games_per_round 가져오기
  const { data: league } = await supabase.from('leagues').select('games_per_round').eq('id', leagueId).single()
  const slotCount = league?.games_per_round ?? 9

  // 이미 있는 슬랏 확인
  const { data: existing } = await supabase
    .from('league_games')
    .select('slot_num')
    .eq('league_id', leagueId)
    .eq('date', date)

  const existingSlots = new Set((existing ?? []).map(g => g.slot_num))

  // 없는 슬랏만 생성
  const toInsert = []
  for (let i = 1; i <= slotCount; i++) {
    if (!existingSlots.has(i)) {
      toInsert.push({
        league_id: leagueId,
        date,
        slot_num: i,
        round_num: i,
        home_score: 0,
        away_score: 0,
        is_complete: false,
        is_started: false,
      })
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('league_games').insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 생성 후 전체 슬랏 반환
  const { data: slots, error: fetchErr } = await supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('slot_num', { ascending: true })

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  return NextResponse.json(slots ?? [])
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_games')
    .update(body)
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
