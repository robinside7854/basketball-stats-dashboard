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
  const supabase = createClient()

  const { data: teams, error } = await supabase
    .from('league_teams')
    .select('*')
    .eq('league_id', leagueId)
    .order('name')

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

  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_teams')
    .insert({ league_id: leagueId, name, color: color ?? '#3b82f6', is_external: isExternal })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data, { status: 201 })
}
