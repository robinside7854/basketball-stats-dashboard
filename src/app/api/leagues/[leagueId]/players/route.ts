import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_players')
    .select('*')
    .eq('league_id', leagueId)
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 로그인 계정을 만들어 관리자 승인(status='approved')까지 완료한 회원 → 라커룸 인증 뱃지용 플래그.
  // 계정 테이블(league_user_accounts)이 없거나 조회 실패해도 뱃지만 빠지고 명단은 정상 반환 (best-effort).
  const { data: accounts } = await supabase
    .from('league_user_accounts')
    .select('league_player_id')
    .eq('league_id', leagueId)
    .eq('status', 'approved')
  const verifiedIds = new Set((accounts ?? []).map(a => a.league_player_id))
  const enriched = (data ?? []).map(p => ({ ...p, has_account: verifiedIds.has(p.id) }))
  return NextResponse.json(enriched)
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const { data, error } = await supabase
    .from('league_players')
    .insert({
      league_id: leagueId,
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
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const { data, error } = await supabase
    .from('league_players')
    .update(updatePayload)
    .eq('id', playerId)
    .eq('league_id', leagueId)
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
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const playerId = searchParams.get('playerId')
  if (!playerId) return NextResponse.json({ error: 'playerId is required' }, { status: 400 })
  const supabase = createClient()
  const { error } = await supabase
    .from('league_players')
    .delete()
    .eq('id', playerId)
    .eq('league_id', leagueId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({ success: true })
}
