import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

// POST /api/leagues/[leagueId]/exhibition/init
// body: { date: 'YYYY-MM-DD' }
//
// 친선 4쿼터·2경기 모드 초기화:
//   1) 미라클(#ef4444) / 모닝(#3b82f6) 팀이 league_teams 에 없으면 생성
//   2) league_schedule_dates 에 해당 날짜 등록 (없으면)
//   3) 8개 game 슬롯 생성 (Game 1: slot 1-4 / Game 2: slot 5-8, 각 1쿼터~4쿼터)
//      home_team_id = 미라클, away_team_id = 모닝, is_exhibition = true
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { date } = await req.json()
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const supabase = createClient()

  // 1) 미라클 / 모닝 팀 확보
  const { data: existingTeams } = await supabase
    .from('league_teams')
    .select('id, name, color')
    .eq('league_id', leagueId)
    .in('name', ['미라클', '모닝'])

  const teamMap = new Map((existingTeams ?? []).map(t => [t.name, t]))
  const toCreate: { league_id: string; name: string; color: string }[] = []
  if (!teamMap.has('미라클')) toCreate.push({ league_id: leagueId, name: '미라클', color: '#ef4444' })
  if (!teamMap.has('모닝'))   toCreate.push({ league_id: leagueId, name: '모닝',   color: '#3b82f6' })

  if (toCreate.length > 0) {
    const { data: created, error: tErr } = await supabase
      .from('league_teams')
      .insert(toCreate)
      .select('id, name, color')
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })
    for (const t of created ?? []) teamMap.set(t.name, t)
  }

  const miracleTeam = teamMap.get('미라클')
  const morningTeam = teamMap.get('모닝')
  if (!miracleTeam || !morningTeam) {
    return NextResponse.json({ error: '팀 생성 실패' }, { status: 500 })
  }

  // 2) 스케줄 날짜 등록 (없으면)
  const { data: dateRow } = await supabase
    .from('league_schedule_dates')
    .select('id')
    .eq('league_id', leagueId)
    .eq('date', date)
    .maybeSingle()
  if (!dateRow) {
    await supabase.from('league_schedule_dates').insert({ league_id: leagueId, date })
  }

  // 3) 이미 해당 날짜에 슬롯이 있는 경우 처리
  //    - 모두 빈 슬롯(is_started=false, is_complete=false, 이벤트 0개)이면 자동 삭제 후 재구성
  //    - 기록·시작된 슬롯이 하나라도 있으면 차단
  const { data: existing } = await supabase
    .from('league_games')
    .select('id, slot_num, is_exhibition, is_started, is_complete')
    .eq('league_id', leagueId)
    .eq('date', date)

  const existingRows = existing ?? []
  if (existingRows.length > 0) {
    const existingIds = existingRows.map(g => g.id)
    const allEmpty = existingRows.every(g => !g.is_started && !g.is_complete)

    // 빈 슬롯이라도 이벤트가 남아있는지 확인 (안전 가드)
    let eventCount = 0
    if (allEmpty && existingIds.length > 0) {
      const { count } = await supabase
        .from('league_game_events')
        .select('id', { count: 'exact', head: true })
        .in('league_game_id', existingIds)
      eventCount = count ?? 0
    }

    if (!allEmpty || eventCount > 0) {
      return NextResponse.json({
        error: '이 날짜에 이미 기록된 경기가 있습니다. 개별 경기는 record 페이지의 친선전 토글을 사용하세요.',
        existing: existingRows,
      }, { status: 400 })
    }

    // 자동 삭제 — 완전히 빈 슬롯만
    const { error: delErr } = await supabase
      .from('league_games')
      .delete()
      .in('id', existingIds)
    if (delErr) {
      return NextResponse.json({ error: `기존 빈 슬롯 정리 실패: ${delErr.message}` }, { status: 500 })
    }
  }

  // 4) 8개 슬롯 생성
  //    Game 1: slot 1(1Q)/2(2Q)/3(3Q)/4(4Q)
  //    Game 2: slot 5(1Q)/6(2Q)/7(3Q)/8(4Q)
  const slots = []
  for (let i = 1; i <= 8; i++) {
    const gameIdx = i <= 4 ? 1 : 2          // 1차전 / 2차전
    slots.push({
      league_id: leagueId,
      date,
      slot_num: i,
      round_num: gameIdx,
      home_team_id: miracleTeam.id,
      away_team_id: morningTeam.id,
      home_score: 0,
      away_score: 0,
      is_complete: false,
      is_started: false,
      is_exhibition: true,
    })
  }

  const { data: inserted, error: insErr } = await supabase
    .from('league_games')
    .insert(slots)
    .select('id, slot_num, round_num, home_team_id, away_team_id, is_exhibition')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({
    teams: { home: miracleTeam, away: morningTeam },
    slots: inserted ?? [],
  })
}
