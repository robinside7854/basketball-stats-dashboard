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
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_schedule_dates')
    .select('*')
    .eq('league_id', leagueId)
    .order('date', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { date } = await req.json()
  if (!date) return NextResponse.json({ error: '날짜를 입력하세요' }, { status: 400 })
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_schedule_dates')
    .upsert({ league_id: leagueId, date }, { onConflict: 'league_id,date' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(data, { status: 201 })
}

// PATCH — 한 날짜의 시간·장소·정원을 고친다.
//
// 왜 POST(upsert) 로 겸하지 않는가: POST 는 "날짜를 만든다"는 뜻이고, 여기서 필요한 건
//   "이미 있는 날짜에 정보를 붙인다"이다. upsert 로 겸하면 오타 난 날짜가 조용히 새 행이 된다.
//
// 빈 문자열은 null 로 눕힌다 — 총무가 입력칸을 비우는 동작은 "지운다"는 뜻이지
//   "빈 문자열을 넣는다"가 아니다. 그대로 저장하면 화면에 빈 줄이 남는다.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    date?: string
    start_time?: string | null
    place?: string | null
    capacity?: number | string | null
  }
  if (!body.date) return NextResponse.json({ error: '날짜를 지정하세요' }, { status: 400 })

  const patch: Record<string, unknown> = {}

  if ('start_time' in body) {
    const t = (body.start_time ?? '').trim()
    if (t && !/^\d{2}:\d{2}$/.test(t)) {
      return NextResponse.json({ error: '시간은 HH:MM 형식으로 입력하세요' }, { status: 400 })
    }
    patch.start_time = t || null
  }
  if ('place' in body) {
    patch.place = (body.place ?? '').trim() || null
  }
  if ('capacity' in body) {
    const raw = body.capacity
    if (raw === null || raw === '' || raw === undefined) patch.capacity = null
    else {
      const n = Number(raw)
      // 0·음수·소수는 입력 실수다. 무제한은 빈칸(null)으로 표현한다.
      if (!Number.isInteger(n) || n <= 0) {
        return NextResponse.json({ error: '정원은 1 이상의 숫자이거나 비워 두세요' }, { status: 400 })
      }
      patch.capacity = n
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다' }, { status: 400 })
  }

  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_schedule_dates')
    .update(patch)
    .eq('league_id', leagueId)
    .eq('date', body.date)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '해당 날짜가 없습니다' }, { status: 404 })

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(data)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date')
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })
  const supabase = createClient()
  await supabase.from('league_schedule_dates').delete().eq('league_id', leagueId).eq('date', date)

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ success: true })
}
