import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'
import { logAudit } from '@/lib/audit'

// GET /api/leagues/[leagueId]/quarters
// Returns quarters with player memberships and team leaders
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

  const { data: quarters, error } = await supabase
    .from('league_quarters')
    .select('*')
    .eq('league_id', leagueId)
    .order('year').order('quarter')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(quarters ?? [])
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

// POST /api/leagues/[leagueId]/quarters — create a quarter
//
// 두 갈래다. 요청의 `kind` 로만 갈리고, 기본값은 종전 그대로(리그형 분기)라
// 기존 호출부(분기 생성)는 한 글자도 안 바뀐다.
//
//   kind 없음 / 'quarter'  — 리그형 분기. year + quarter 를 호출부가 준다.
//   kind='tournament'      — 대회 하나. name + 기간을 받고 year/quarter/ord 는 **서버가 채번**한다.
//
// 왜 대회는 채번하는가
//   league_quarters 는 UNIQUE (league_id, year, quarter) 라 대회에도 quarter 값이 필요하다.
//   그런데 대회에서 그 숫자는 아무 의미가 없다(084 가 kind='tournament' 에 한해 1~4 CHECK 를
//   면제해 둔 이유). 화면에 "몇 번 분기냐"고 물으면 운영진이 답할 수 없는 질문이 되므로
//   서버가 조용히 다음 번호를 잡는다. 표시·정렬은 name / ord / start_date 가 맡는다.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { year, quarter, is_current, start_date, end_date } = body

  if (body?.kind === 'tournament') {
    return createTournament(leagueId, body)
  }

  if (!year || !quarter) return NextResponse.json({ error: 'year, quarter 필수' }, { status: 400 })

  const supabase = createClient()

  if (is_current) {
    await supabase.from('league_quarters').update({ is_current: false }).eq('league_id', leagueId)
  }

  const { data, error } = await supabase
    .from('league_quarters')
    .upsert({
      league_id: leagueId,
      year,
      quarter,
      is_current: is_current ?? false,
      start_date: start_date ?? null,
      end_date: end_date ?? null,
    }, {
      onConflict: 'league_id,year,quarter',
      ignoreDuplicates: false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data, { status: 201 })
}

// 대회 하나 만들기 — league_quarters(kind='tournament') 행 1개.
//   새 표를 만들지 않는 것은 076·083 이 정한 설계다(대회는 "시즌 안의 구분" 중 하나).
async function createTournament(leagueId: string, body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: '대회 이름은 필수입니다' }, { status: 400 })
  if (name.length > 60) return NextResponse.json({ error: '대회 이름은 60자까지입니다' }, { status: 400 })

  const startDate = typeof body.start_date === 'string' && body.start_date ? body.start_date : null
  const endDate   = typeof body.end_date   === 'string' && body.end_date   ? body.end_date   : null
  for (const [label, v] of [['시작일', startDate], ['종료일', endDate]] as const) {
    if (v && !YMD.test(v)) return NextResponse.json({ error: `${label}은 YYYY-MM-DD 형식이어야 합니다` }, { status: 400 })
  }
  // 뒤집힌 기간을 그냥 저장하면 대회 카드가 "9.20 ~ 9.13" 으로 뜨고, 목록 정렬(start_date)이
  //   실제 순서와 어긋난다. 되돌릴 수 있는 실수이므로 400 으로 알리고 막는다.
  if (startDate && endDate && endDate < startDate) {
    return NextResponse.json({ error: '종료일이 시작일보다 빠릅니다' }, { status: 400 })
  }

  // 'pro' | 'amateur' 만 허용(083 의 컬럼 주석). 값이 없으면 비워 둔다 — 성격을 모르는
  //   대회에 아무 값이나 박아 두면 나중에 그게 근거로 읽힌다.
  const tType = body.tournament_type
  if (tType != null && tType !== '' && tType !== 'pro' && tType !== 'amateur') {
    return NextResponse.json({ error: "tournament_type 은 'pro' 또는 'amateur' 입니다" }, { status: 400 })
  }

  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) || null : null

  // 연도는 시작일에서 뽑는다. 기간 미정이면 오늘(KST) 연도 — 대회는 등록 시점과 개최가
  //   같은 해인 경우가 압도적이고, 나중에 기간을 넣으면 그때 옮길 수 있다.
  const year = startDate
    ? Number(startDate.slice(0, 4))
    : Number(new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 4))

  const supabase = createClient()

  // 같은 이름의 대회를 두 번 만드는 사고 방지 — 연도까지 같을 때만 막는다
  //   (해마다 열리는 같은 이름의 대회는 정상이다).
  const { data: dup, error: dupErr } = await supabase
    .from('league_quarters')
    .select('id')
    .eq('league_id', leagueId)
    .eq('kind', 'tournament')
    .eq('year', year)
    .eq('name', name)
    .maybeSingle()
  if (dupErr) return NextResponse.json({ error: '기존 대회를 확인하지 못했습니다' }, { status: 500 })
  if (dup) return NextResponse.json({ error: `${year}년에 이미 "${name}" 대회가 있습니다` }, { status: 409 })

  // 채번 — 같은 (league_id, year) 안에서 다음 번호. UNIQUE 제약을 피하는 것이 유일한 목적이다.
  const { data: siblings, error: sErr } = await supabase
    .from('league_quarters')
    .select('quarter, ord')
    .eq('league_id', leagueId)
    .eq('year', year)
  if (sErr) return NextResponse.json({ error: '기존 분기를 확인하지 못했습니다' }, { status: 500 })
  const rows = (siblings ?? []) as Array<{ quarter: number | null; ord: number | null }>
  const nextQuarter = Math.max(0, ...rows.map(r => r.quarter ?? 0)) + 1
  const nextOrd     = Math.max(0, ...rows.map(r => r.ord ?? 0)) + 1

  const { data, error } = await supabase
    .from('league_quarters')
    .insert({
      league_id: leagueId,
      kind: 'tournament',
      name,
      year,
      quarter: nextQuarter,
      ord: nextOrd,
      // 대회는 "현재 분기" 개념이 없다 — 켜면 리그 쪽 화면이 이 대회를 현재 시즌으로 읽는다.
      is_current: false,
      start_date: startDate,
      end_date: endDate,
      tournament_type: (tType === 'pro' || tType === 'amateur') ? tType : null,
      description,
    })
    .select()
    .single()

  // 23505 = 동시 요청이 같은 번호를 먼저 넣었다. 조용히 넘기면 대회가 안 만들어졌는데
  //   화면은 성공으로 보인다 — 다시 누르게 한다.
  if (error?.code === '23505') {
    return NextResponse.json({ error: '방금 다른 대회가 등록됐습니다. 다시 시도해 주세요.' }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json(data, { status: 201 })
}

// PATCH /api/leagues/[leagueId]/quarters — update quarter (start_date/end_date/is_current)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { quarterId, is_current, start_date, end_date } = body
  if (!quarterId) return NextResponse.json({ error: 'quarterId 필수' }, { status: 400 })

  const supabase = createClient()

  if (is_current) {
    await supabase.from('league_quarters').update({ is_current: false }).eq('league_id', leagueId)
  }

  const update: Record<string, unknown> = {}
  if (start_date !== undefined) update.start_date = start_date || null
  if (end_date !== undefined)   update.end_date   = end_date   || null
  if (is_current !== undefined) update.is_current = is_current

  // 대회 전용 필드 — 리그형 분기에는 보내지 않으므로 undefined 로 남아 그대로 통과한다.
  //   ⚠ name 은 NOT NULL 이다. 빈 문자열을 지우기로 해석해 null 을 넣으면 트리거가
  //     '26.5Q' 같은 자동 이름으로 덮어써서, 운영진에게는 대회 이름이 "사라진" 것으로 보인다.
  if (body.name !== undefined) {
    const nm = typeof body.name === 'string' ? body.name.trim() : ''
    if (!nm) return NextResponse.json({ error: '대회 이름은 비울 수 없습니다' }, { status: 400 })
    if (nm.length > 60) return NextResponse.json({ error: '대회 이름은 60자까지입니다' }, { status: 400 })
    update.name = nm
  }
  if (body.description !== undefined) {
    update.description = typeof body.description === 'string'
      ? (body.description.trim().slice(0, 500) || null)
      : null
  }
  if (body.tournament_type !== undefined) {
    const t = body.tournament_type
    if (t != null && t !== '' && t !== 'pro' && t !== 'amateur') {
      return NextResponse.json({ error: "tournament_type 은 'pro' 또는 'amateur' 입니다" }, { status: 400 })
    }
    update.tournament_type = (t === 'pro' || t === 'amateur') ? t : null
  }

  for (const [label, key] of [['시작일', 'start_date'], ['종료일', 'end_date']] as const) {
    const v = update[key]
    if (typeof v === 'string' && !YMD.test(v)) {
      return NextResponse.json({ error: `${label}은 YYYY-MM-DD 형식이어야 합니다` }, { status: 400 })
    }
  }
  if (typeof update.start_date === 'string' && typeof update.end_date === 'string'
      && update.end_date < update.start_date) {
    return NextResponse.json({ error: '종료일이 시작일보다 빠릅니다' }, { status: 400 })
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '변경할 수 있는 항목이 없습니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('league_quarters')
    .update(update)
    .eq('id', quarterId)
    .eq('league_id', leagueId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json(data)
}

// DELETE /api/leagues/[leagueId]/quarters?quarterId=… — 대회 삭제
//
// 대회만 지운다. 리그형 분기(kind='quarter')는 여기로 지울 수 없다 —
//   분기는 선수 소속(league_player_quarters)·팀명 override·드래프트가 전부 매달려 있어
//   지우면 과거 경기의 팀 귀속 해석까지 바뀐다. 그건 화면에서 할 일이 아니다.
//
// 경기가 하나라도 붙어 있으면 막는다. quarter_id 는 ON DELETE SET NULL 이라 지워도
//   경기 자체는 남지만, 대회에서 떨어져 나온 경기는 어느 화면에도 안 잡히는 미아가 된다.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const quarterId = searchParams.get('quarterId')
  if (!quarterId) return NextResponse.json({ error: 'quarterId 필수' }, { status: 400 })

  const supabase = createClient()

  // 소속 확인 — 인가는 이 리그에 대해서만 받았다. id 하나로 지우면 남의 클럽 분기가 지워진다.
  const { data: q, error: qErr } = await supabase
    .from('league_quarters')
    .select('id, kind, name')
    .eq('id', quarterId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (qErr) return NextResponse.json({ error: '대회를 확인하지 못했습니다' }, { status: 500 })
  if (!q) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (q.kind !== 'tournament') {
    return NextResponse.json({ error: '리그 분기는 여기서 삭제할 수 없습니다' }, { status: 400 })
  }

  const { count, error: cErr } = await supabase
    .from('league_games')
    .select('id', { count: 'exact', head: true })
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
  if (cErr) return NextResponse.json({ error: '대회 경기를 확인하지 못했습니다' }, { status: 500 })
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: `경기 ${count}건이 등록된 대회입니다. 경기를 먼저 삭제하세요.`, gameCount: count },
      { status: 409 },
    )
  }

  // 성공 판정은 반환 행 수로 — PostgREST 는 RLS 에 막혀도 204 를 준다.
  const { data: removed, error: dErr } = await supabase
    .from('league_quarters')
    .delete()
    .eq('id', quarterId)
    .eq('league_id', leagueId)
    .select('id')
  if (dErr || !removed || removed.length === 0) {
    return NextResponse.json({ error: '삭제하지 못했습니다' }, { status: 500 })
  }

  await logAudit({
    req, action: 'tournament.delete', targetTable: 'league_quarters',
    targetId: quarterId, leagueId, quarterId, detail: { name: q.name },
  })

  revalidateTag(`league-${leagueId}`, 'max')
  return NextResponse.json({ success: true })
}
