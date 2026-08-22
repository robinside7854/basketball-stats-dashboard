import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')
  // 친선전 전용 임시팀 조회 — `?exhibitionDate=YYYY-MM-DD` 면 그 날짜 임시팀만 돌려준다.
  //   파라미터가 없으면 상시팀만(exhibition_date IS NULL). 이 기본값이 중요하다 —
  //   팀 순위·명단·드래프트·어드민 관리가 전부 이 엔드포인트를 그대로 쓰고 있어서,
  //   기본 응답에 임시팀이 섞이는 순간 그 화면들에 "8/23 A팀" 같은 유령 팀이 등장한다.
  const exhibitionDate = searchParams.get('exhibitionDate')
  if (exhibitionDate && !/^\d{4}-\d{2}-\d{2}$/.test(exhibitionDate)) {
    return NextResponse.json({ error: 'exhibitionDate 는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 })
  }
  const supabase = createClient()

  let teamQuery = supabase
    .from('league_teams')
    .select('*')
    .eq('league_id', leagueId)
    .order('name')
  teamQuery = exhibitionDate
    ? teamQuery.eq('exhibition_date', exhibitionDate)
    : teamQuery.is('exhibition_date', null)

  const { data: teams, error } = await teamQuery

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!teams || teams.length === 0) return NextResponse.json([])

  // 분기별 팀명·색상 override 적용 — quarterId 가 주어지면 해당 분기 override 우선
  let overrideMap: Record<string, { name: string | null; color: string | null }> = {}
  if (quarterId) {
    const { data: overrides } = await supabase
      .from('league_team_quarter_overrides')
      .select('team_id, name, color')
      .eq('league_id', leagueId)
      .eq('quarter_id', quarterId)
    overrideMap = Object.fromEntries((overrides ?? []).map(o => [o.team_id, { name: o.name, color: o.color }]))
  }

  const { data: assignments } = await supabase
    .from('league_team_players')
    .select('league_team_id, league_player_id, league_players(id, name, number, position)')
    .in('league_team_id', teams.map(t => t.id))

  const teamsWithPlayers = teams.map(team => {
    const ov = overrideMap[team.id]
    return {
      ...team,
      name: ov?.name ?? team.name,
      color: ov?.color ?? team.color,
      players: (assignments ?? [])
        .filter(a => a.league_team_id === team.id)
        .map(a => {
          const p = (Array.isArray(a.league_players) ? a.league_players[0] : a.league_players) as { id: string; name: string; number: number | null; position: string | null } | null
          return {
            league_player_id: a.league_player_id,
            player_name: p?.name ?? '',
            player_number: p?.number ?? null,
            position: p?.position ?? null,
          }
        }),
    }
  })

  return NextResponse.json(teamsWithPlayers)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, color } = body
  if (!name) return NextResponse.json({ error: '팀 이름은 필수입니다' }, { status: 400 })

  // 대회형에서 상대팀은 is_external=true 로 만든다.
  // 이 플래그 하나가 통계·어워즈·라커룸 노출 전체를 가른다 — 실수로 true 가 되면
  // 우리 팀 기록이 통계에서 사라지므로 명시적으로만 켜지게 한다(기본 false).
  const isExternal = body.is_external === true || body.is_external === 'true'

  // 친선전 전용 임시팀 — 이 날짜의 친선 경기에서만 고를 수 있고, 팀 목록/순위/드래프트에는
  //   등장하지 않는다. 값이 없으면 지금까지처럼 상시팀으로 만든다.
  let exhibitionDate: string | null = null
  if (body.exhibition_date != null && body.exhibition_date !== '') {
    if (typeof body.exhibition_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.exhibition_date)) {
      return NextResponse.json({ error: 'exhibition_date 는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 })
    }
    exhibitionDate = body.exhibition_date
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_teams')
    .insert({ league_id: leagueId, name, color: color ?? '#3b82f6', is_external: isExternal, exhibition_date: exhibitionDate })
    .select()
    .single()
  // 23505 = 같은 날짜에 같은 이름의 임시팀(109 부분 UNIQUE). 기록원이 같은 이름을 두 번
  //   만든 것이므로 DB 원문 대신 무엇이 문제인지 알려준다.
  if (error?.code === '23505' && exhibitionDate) {
    return NextResponse.json({ error: `${exhibitionDate} 에 이미 "${name}" 팀이 있습니다` }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data, { status: 201 })
}
