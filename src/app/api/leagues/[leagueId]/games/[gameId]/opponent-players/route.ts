import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'

// POST /api/leagues/[leagueId]/games/[gameId]/opponent-players
// body: { team_id, number, name? }
//
// 경기 기록 도중 상대 선수를 즉석 등록한다.
//   · 상대 명단은 미리 알 수 없다 — 선발 5명은 파악해도 벤치는 교체로 들어와야 특정된다.
//   · 이름은 선택이다. 모르면 등번호만으로 만들고 나중에 채운다.
//     league_players.name 이 NOT NULL 이라 빈 문자열 대신 '#12' 형태로 저장한다.
//   · 선수 생성과 게임 배정을 함께 처리한다 — 배정이 없으면 그 선수가 어느 팀인지
//     알 수 없고, 외부 여부 판정(league_game_players 기반)이 성립하지 않는다.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> }
) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const teamId = body.team_id as string | undefined
  const number = Number(body.number)
  const rawName = typeof body.name === 'string' ? body.name.trim() : ''

  if (!teamId) return NextResponse.json({ error: 'team_id 가 필요합니다' }, { status: 400 })
  if (!Number.isInteger(number) || number < 0 || number > 99) {
    return NextResponse.json({ error: '등번호는 0~99 사이 정수여야 합니다' }, { status: 400 })
  }

  const supabase = createClient()

  // 지정된 팀이 이 리그의 외부 팀인지 확인한다.
  // 우리 팀에 이 엔드포인트로 선수를 넣으면 로스터 관리 경로를 우회하게 되므로 막는다.
  const externalTeamIds = await fetchExternalTeamIds(supabase, leagueId)
  if (!externalTeamIds.has(teamId)) {
    return NextResponse.json({ error: '상대(외부) 팀에만 등록할 수 있습니다' }, { status: 400 })
  }

  // 같은 경기·같은 팀에 같은 등번호가 이미 있으면 그 선수를 재사용한다.
  // 기록 중 같은 번호를 여러 번 누르는 건 정상이므로(더블탭, 통신 재시도) 중복 생성이 나면 안 된다.
  const { data: existing, error: exErr } = await supabase
    .from('league_game_players')
    .select('league_player_id, league_players(id, name, number)')
    .eq('league_id', leagueId)
    .eq('league_game_id', gameId)
    .eq('team_id', teamId)
  if (exErr) {
    throw new Error(`league_game_players: gameId=${gameId} 조회 실패 — ${exErr.message}`)
  }
  for (const row of (existing ?? []) as unknown as Array<{ league_players: { id: string; name: string; number: number | null } | null }>) {
    const p = row.league_players
    if (p && p.number === number) {
      return NextResponse.json({ id: p.id, name: p.name, number: p.number, team_id: teamId }, { status: 200 })
    }
  }

  // 이름을 모르면 등번호를 이름으로 쓴다. 나중에 실명을 알게 되면 이 행의 name 만 고치면
  // 기록은 league_player_id 로 묶여 있으므로 소급 반영된다.
  const name = rawName || `#${number}`

  const { data: player, error: pErr } = await supabase
    .from('league_players')
    .insert({ league_id: leagueId, name, number, is_guest: false })
    .select('id, name, number')
    .single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const { error: apErr } = await supabase
    .from('league_game_players')
    .insert({ league_id: leagueId, league_game_id: gameId, league_player_id: player.id, team_id: teamId })
  if (apErr) {
    // 배정이 실패하면 선수만 붕 뜬다 — 소속을 알 수 없어 외부 판정이 안 되므로 되돌린다.
    await supabase.from('league_players').delete().eq('id', player.id)
    return NextResponse.json({ error: `배정 실패: ${apErr.message}` }, { status: 500 })
  }

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ ...player, team_id: teamId }, { status: 201 })
}
