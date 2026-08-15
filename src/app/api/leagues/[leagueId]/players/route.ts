import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'
import { canViewLeague } from '@/lib/auth/guard'
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
import { resolveTeamId } from '@/lib/league/teamScope'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()
  // 명단은 팀 소유다 — 리그에서 로그인한 회원이 대회로 이동해도 같은 45명이 보여야 한다
  // (league_id 로 조회하면 대회 묶음엔 자기 소유 행이 없어 0명으로 보였다 — 이번 작업의 핵심 버그).
  const teamId = await resolveTeamId(leagueId)
  const { data, error } = await supabase
    .from('league_players')
    .select('*')
    .eq('team_id', teamId)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 로그인 계정을 만들어 관리자 승인(status='approved')까지 완료한 회원 → 라커룸 인증 뱃지용 플래그.
  // 계정도 이제 팀 단위 정체성이다(Task 2) — league_id 로 찾으면 이 회원이 원래 가입한
  // 경기묶음에서만 뱃지가 붙고, 대회에서는 이미 인증된 회원인데도 뱃지가 빠진다.
  // 계정 테이블 조회 실패해도 뱃지만 빠지고 명단은 정상 반환 (best-effort).
  const { data: accounts } = await supabase
    .from('league_user_accounts')
    .select('league_player_id')
    .eq('team_id', teamId)
    .eq('status', 'approved')
  const verifiedIds = new Set((accounts ?? []).map(a => a.league_player_id))
  let enriched = (data ?? []).map(p => ({ ...p, has_account: verifiedIds.has(p.id) }))

  // 라커룸·선수카드·회원가입 대상에서 상대 선수는 보이면 안 된다.
  // 기록 화면은 상대 선수를 눌러야 하므로 ?includeExternal=1 로 옵트인한다.
  const url = new URL(req.url)
  const includeExternal = url.searchParams.get('includeExternal') === '1'
  if (!includeExternal) {
    const externalIds = await fetchExternalPlayerIds(supabase, leagueId)
    if (externalIds.size > 0) {
      enriched = enriched.filter(p => !externalIds.has(p.id))
    }
  }

  // 탈퇴 회원(is_active=false)은 "지금 팀에 있는 선수"를 묻는 화면(명단·드래프트 풀·
  // 가입 자동완성)에서만 뺀다. 스탯·하이라이트·박스스코어처럼 과거 기록을 보여주는 화면은
  // 이 엔드포인트를 그대로 쓰되 필터를 옵트인하지 않아 탈퇴 회원의 기록이 계속 보인다.
  // → 이 API 하나를 공유하는 두 종류의 소비자를 opt-in 파라미터로만 가른다(기본값=전체 유지).
  const activeOnly = url.searchParams.get('activeOnly') === '1'
  if (activeOnly) {
    enriched = enriched.filter(p => p.is_active !== false)
  }

  return NextResponse.json(enriched)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, number, position, birth_date, is_guest } = body
  if (!name?.trim()) return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 })
  // position may be an array (multi-position) → join to comma-separated string
  const positionStr = Array.isArray(position)
    ? position.join(',')
    : (position ?? null)
  const cleanName = name.trim()
  // 이름에 '게스트' 포함 시 자동 게스트 flag (명시 지정 시 그 값 우선)
  const guestFlag = typeof is_guest === 'boolean'
    ? is_guest
    : cleanName.includes('게스트')
  const supabase = createClient()
  // team_id 를 반드시 채운다 — 명단은 팀 소유이므로, 이 선수를 대회 화면에서 등록하든
  // 리그 화면에서 등록하든 같은 팀 명단 한 곳에 들어가야 한다. 비우면 이 선수는
  // 만든 그 경기묶음에서만 보이는 "숨은 중복" 이 된다.
  const teamId = await resolveTeamId(leagueId)
  const { data, error } = await supabase
    .from('league_players')
    .insert({
      league_id: leagueId,
      team_id: teamId,
      name: cleanName,
      number: number ?? null,
      position: positionStr,
      birth_date: birth_date ?? null,
      is_guest: guestFlag,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  const body = await req.json()
  const { name, position, birth_date, plus_one, is_guest } = body
  if (name !== undefined && !String(name).trim()) return NextResponse.json({ error: '이름은 필수입니다' }, { status: 400 })
  // position may be an array → join to comma-separated string
  const positionStr = Array.isArray(position)
    ? position.join(',')
    : (position ?? null)
  const updatePayload: Record<string, string | null | boolean> = {}
  if (name !== undefined) updatePayload.name = String(name).trim()
  if (position !== undefined) updatePayload.position = positionStr
  if (birth_date !== undefined) updatePayload.birth_date = birth_date ?? null
  if (plus_one !== undefined) updatePayload.plus_one = Boolean(plus_one)
  if (is_guest !== undefined) updatePayload.is_guest = Boolean(is_guest)
  if (Object.keys(updatePayload).length === 0) return NextResponse.json({ error: '수정할 값이 없습니다' }, { status: 400 })
  const supabase = createClient()
  // league_id 대신 team_id 로 소유를 확인한다 — 명단이 공유되므로 대회 화면에서
  // 편집해도(그 선수 행의 출생 league_id 는 리그일 수 있다) 같은 팀이면 통과해야 한다.
  const teamId = await resolveTeamId(leagueId)
  const { data, error } = await supabase
    .from('league_players')
    .update(updatePayload)
    .eq('id', playerId)
    .eq('team_id', teamId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  const supabase = createClient()
  // 명단이 공유되므로 이 삭제는 팀 전체에서 이 사람을 지운다(리그·대회 모두) — 의도된 동작이다.
  //   league_id 로 확인하면 대회 화면에서는 애초에 이 행을 못 찾아 삭제가 항상 실패한다.
  const teamId = await resolveTeamId(leagueId)
  const { error } = await supabase
    .from('league_players')
    .delete()
    .eq('id', playerId)
    .eq('team_id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 팀 전체 명단에서 사람을 지우는 행위다(리그·대회 모두) — 되돌리려면 재입력뿐이다.
  await logAudit({
    req, action: 'league_player.delete', targetTable: 'league_players', targetId: playerId,
    leagueId, teamId,
  })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ success: true })
}
