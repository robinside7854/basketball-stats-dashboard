import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'
import { syncBadgesForGame } from '@/lib/badges/computeBadges'
import { syncYoutubeForLeague } from '@/lib/youtube/syncYoutubeForLeague'
import { logAudit } from '@/lib/audit'
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
  const { searchParams } = new URL(req.url)
  const date       = searchParams.get('date')
  const quarterId  = searchParams.get('quarterId')
  const complete   = searchParams.get('complete')
  const supabase = createClient()

  let q = supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color, is_external),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color, is_external)
    `)
    .eq('league_id', leagueId)

  if (date)      q = q.eq('date', date).order('slot_num', { ascending: true })
  if (quarterId) q = q.eq('quarter_id', quarterId)
  if (complete === 'true') q = q.eq('is_complete', true)
  if (!date)     q = q.order('date', { ascending: true }).order('slot_num', { ascending: true })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const games = data ?? []

  // 분기별 팀명/색상 override 자동 적용 — home_team / away_team 의 name/color 를 그 게임의 quarter_id 기반 override 로 치환
  type TeamLite = { id: string; name: string | null; color: string | null } | null
  type GameRow = { quarter_id: string | null; home_team: TeamLite; away_team: TeamLite }
  const rows = games as unknown as GameRow[]
  const qids = Array.from(new Set(rows.map(g => g.quarter_id).filter(Boolean) as string[]))
  const tids = Array.from(new Set(rows.flatMap(g => [g.home_team?.id, g.away_team?.id]).filter(Boolean) as string[]))
  if (qids.length > 0 && tids.length > 0) {
    const { data: overrides } = await supabase
      .from('league_team_quarter_overrides')
      .select('quarter_id, team_id, name, color')
      .in('quarter_id', qids)
      .in('team_id', tids)
    const ovMap: Record<string, Record<string, { name: string | null; color: string | null }>> = {}
    for (const o of (overrides ?? []) as { quarter_id: string; team_id: string; name: string | null; color: string | null }[]) {
      (ovMap[o.quarter_id] ||= {})[o.team_id] = { name: o.name, color: o.color }
    }
    for (const g of rows) {
      const ov = g.quarter_id ? ovMap[g.quarter_id] : null
      if (g.home_team && ov?.[g.home_team.id]) {
        if (ov[g.home_team.id].name) g.home_team.name = ov[g.home_team.id].name
        if (ov[g.home_team.id].color) g.home_team.color = ov[g.home_team.id].color
      }
      if (g.away_team && ov?.[g.away_team.id]) {
        if (ov[g.away_team.id].name) g.away_team.name = ov[g.away_team.id].name
        if (ov[g.away_team.id].color) g.away_team.color = ov[g.away_team.id].color
      }
    }
  }

  // `?withVideos=1` — 각 경기에 붙은 **쿼터 영상 번호**를 함께 준다.
  //   대회 관리 화면이 경기마다 "영상 3/4" 를 보여줘야 하는데, 경기 수만큼 조회를 돌리면
  //   대회 하나 펼칠 때마다 왕복이 그만큼 늘어난다. 한 번에 읽어 붙인다.
  if (searchParams.get('withVideos') === '1' && games.length > 0) {
    const ids = games.map(g => (g as { id: string }).id)
    const { data: vids, error: vErr } = await supabase
      .from('league_game_videos')
      .select('league_game_id, quarter')
      .in('league_game_id', ids)
    // 조용히 빈 배열로 넘기면 "영상 0개" 로 보여 기록원이 이미 붙인 영상을 다시 붙인다.
    if (vErr) return NextResponse.json({ error: `쿼터 영상 조회 실패 — ${vErr.message}` }, { status: 500 })
    const byGame = new Map<string, number[]>()
    for (const v of (vids ?? []) as Array<{ league_game_id: string; quarter: number }>) {
      const arr = byGame.get(v.league_game_id) ?? []
      arr.push(v.quarter)
      byGame.set(v.league_game_id, arr)
    }
    for (const g of games as Array<{ id: string; video_quarters?: number[] }>) {
      g.video_quarters = (byGame.get(g.id) ?? []).sort((a, b) => a - b)
    }
  }

  return NextResponse.json(games)
}

// 하루에 만들 수 있는 슬롯 상한. 실수로 버튼을 연타했을 때의 방어선일 뿐 의미 있는 규칙은 아니다.
const MAX_SLOTS_PER_DATE = 30

// 날짜에 대한 게임 슬랏 초기화 (games_per_round 개수만큼 생성)
//   `addSlot: true` 면 초기화 대신 **슬롯 한 칸만** 뒤에 덧붙인다 (2026-08-23).
//   games_per_round 는 시즌 설정이라 특정 날짜만 늘릴 수단이 없었다 — 8/22 친선전처럼
//   쿼터별로 쪼갠 영상이 10개인 날은 기본 9칸으로는 한 칸이 모자란다. 설정값을 건드리면
//   모든 날짜가 같이 바뀌므로 그 날짜에만 붙이는 경로를 따로 둔다.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { date, addSlot } = body

  // 대회 경기 등록 — 리그의 "그날 9칸 일괄 생성"과는 만드는 것이 완전히 다르다.
  //   대회 경기는 ① 어느 대회(quarter_id)에 속하고 ② 상대가 외부 팀이며 ③ 8강·결승 같은
  //   라운드 표기를 단다. 슬롯 초기화 경로에 조건을 얹으면 두 의미가 한 함수 안에서 싸우므로
  //   입구에서 갈라 놓는다.
  if (body?.mode === 'tournament') {
    return createTournamentGame(req, leagueId, body)
  }

  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const supabase = createClient()

  if (addSlot === true) {
    const { data: rows, error: exErr } = await supabase
      .from('league_games')
      .select('slot_num, is_exhibition')
      .eq('league_id', leagueId)
      .eq('date', date)
    if (exErr) return NextResponse.json({ error: '기존 슬롯을 확인하지 못했습니다' }, { status: 500 })

    const current = rows ?? []
    if (current.length >= MAX_SLOTS_PER_DATE) {
      return NextResponse.json(
        { error: `하루 슬롯은 ${MAX_SLOTS_PER_DATE}개까지입니다 (현재 ${current.length}개)` },
        { status: 409 },
      )
    }

    const nextSlot = Math.max(0, ...current.map(g => g.slot_num ?? 0)) + 1
    // 그 날짜의 성격을 따라간다 — 친선전 날에 정규전 슬롯이 끼면 거기 기록한 게 순위·개인
    //   스탯에 섞인다. YouTube 자동 매핑이 슬롯을 만들던 시절에 실제로 그렇게 됐다(8/22 4경기).
    const isExhibition = current.some(g => g.is_exhibition === true)

    const { error: insErr } = await supabase.from('league_games').insert({
      league_id: leagueId,
      date,
      slot_num: nextSlot,
      round_num: nextSlot,
      home_score: 0,
      away_score: 0,
      is_complete: false,
      is_started: false,
      is_exhibition: isExhibition,
    })
    // 23505 = 동시 요청이 같은 slot_num 을 먼저 넣은 경우(league_games_slot_unique).
    //   버튼 연타로 충분히 난다. 실패로 알리고 다시 누르게 하는 편이 조용히 넘기는 것보다 낫다.
    if (insErr) {
      const msg = insErr.code === '23505'
        ? '같은 번호의 슬롯이 방금 생성됐습니다. 목록을 확인하고 다시 시도하세요.'
        : insErr.message
      return NextResponse.json({ error: msg }, { status: insErr.code === '23505' ? 409 : 500 })
    }

    const { data: after, error: afterErr } = await supabase
      .from('league_games')
      .select(`
        *,
        home_team:league_teams!league_games_home_team_id_fkey(id, name, color, is_external),
        away_team:league_teams!league_games_away_team_id_fkey(id, name, color, is_external)
      `)
      .eq('league_id', leagueId)
      .eq('date', date)
      .order('slot_num', { ascending: true })
    if (afterErr) return NextResponse.json({ error: afterErr.message }, { status: 500 })

    revalidateTag(`league-${leagueId}`, 'max')
    revalidateTag(`league-${leagueId}-games`, 'max')

    return NextResponse.json({ added_slot: nextSlot, is_exhibition: isExhibition, slots: after ?? [] })
  }

  // 리그 설정에서 games_per_round 가져오기
  const { data: league } = await supabase.from('leagues').select('games_per_round').eq('id', leagueId).single()
  const slotCount = league?.games_per_round ?? 9

  // 이미 있는 슬랏 확인
  const { data: existing } = await supabase
    .from('league_games')
    .select('slot_num, is_exhibition')
    .eq('league_id', leagueId)
    .eq('date', date)

  // 친선전 슬롯이 하나라도 있으면 추가 생성하지 않음
  // (exhibition/init API가 8개 슬롯을 일괄 생성하므로 정규전 슬롯 채우기 금지)
  const hasExhibition = (existing ?? []).some(g => g.is_exhibition)

  if (!hasExhibition) {
    const existingSlots = new Set((existing ?? []).map(g => g.slot_num))
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
      // 23505 = unique_violation — 동시 요청 race condition으로 다른 인스턴스가 먼저 insert한 경우.
      // UNIQUE INDEX league_games_slot_unique 가 적용되어 있으면 중복은 방지되므로 안전하게 무시.
      if (error && error.code !== '23505') {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // 생성 후 전체 슬랏 반환
  const { data: slots, error: fetchErr } = await supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color, is_external),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color, is_external)
    `)
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('slot_num', { ascending: true })

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(slots ?? [])
}

// 대회 라운드 표기 — TournamentBoard 의 성적 판정(ROUND_ORDER)이 아는 값만 받는다.
//   여기서 자유 입력을 허용하면 "8강전" 같은 변형이 들어와 성적이 '탈락 라운드 미상'으로 빠진다.
const ROUND_LABELS = ['조별예선', '16강', '8강', '4강', '준결승', '결승'] as const

type Sb = ReturnType<typeof createClient>

/**
 * 그 날짜를 일정에 등록한다.
 *
 * 기록 화면의 날짜 목록이 league_schedule_dates 에서 오므로, 여기에 없으면 경기를 등록해도
 * **기록할 날짜가 화면에 안 뜬다**("등록은 됐는데 기록을 못 하는" 상태).
 * ⚠ is_skipped=false 로 되살린다 — 대회 묶음에는 리그용 주간 일정 자동생성이 남긴 '미실시'
 *   날짜가 섞여 있는데, 그 날 실제로 대회 경기를 치르면 그건 더 이상 미실시가 아니다.
 */
async function ensureScheduleDate(supabase: Sb, leagueId: string, date: string) {
  const { error } = await supabase
    .from('league_schedule_dates')
    .upsert({ league_id: leagueId, date, is_skipped: false }, { onConflict: 'league_id,date' })
  // 경기가 진짜다 — 여기서 실패해도 되돌리지 않고 기록만 남긴다.
  if (error) console.error(`[tournament] 일정 날짜 등록 실패 date=${date}:`, error.message)
}

/** 이 날짜의 다음 슬롯 번호. UNIQUE (league_id, date, slot_num) 와 목록 정렬이 이 값을 쓴다. */
async function nextSlotNum(supabase: Sb, leagueId: string, date: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('league_games')
    .select('slot_num')
    .eq('league_id', leagueId)
    .eq('date', date)
  if (error) return null
  return Math.max(0, ...(data ?? []).map(g => g.slot_num ?? 0)) + 1
}

/**
 * 상대(외부)팀을 이름으로 확보한다 — 있으면 재사용, 없으면 만든다.
 *
 * ⚠ 매번 새로 만들면 같은 상대와의 전적이 **이름만 같은 여러 팀으로 흩어진다.**
 * ⚠ is_external 플래그 하나가 통계·어워즈·명단 노출 전체를 가른다(teams POST 주석).
 */
async function ensureOpponentTeam(supabase: Sb, leagueId: string, name: string): Promise<string | null> {
  const { data: rows } = await supabase
    .from('league_teams')
    .select('id, name, is_external')
    .eq('league_id', leagueId)
    .is('exhibition_date', null)
  const hit = (rows ?? []).find(t => t.is_external === true && t.name === name)
  if (hit) return hit.id
  const { data: created } = await supabase
    .from('league_teams')
    .insert({ league_id: leagueId, name, color: '#ef4444', is_external: true })
    .select('id')
    .single()
  return created?.id ?? null
}

/**
 * 대회 경기 한 건 등록.
 *
 * 만드는 것: 우리 팀(is_external=false) 1행 · 상대 팀(is_external=true) 1행 · 경기 1행.
 *   팀 두 행은 **이미 있으면 재사용**한다. 같은 상대와 두 번 붙을 때마다 새 팀을 만들면
 *   그 상대의 전적이 이름만 같은 여러 팀으로 흩어진다.
 *
 * ⚠ is_external 플래그 하나가 통계·어워즈·라커룸 노출 전체를 가른다(teams POST 주석).
 *   상대팀이 실수로 false 로 만들어지면 상대 선수가 우리 팀 명단에 섞이고, 반대로 우리 팀이
 *   true 가 되면 우리 기록이 통계에서 통째로 사라진다.
 */
async function createTournamentGame(req: Request, leagueId: string, body: Record<string, unknown>) {
  const date = typeof body.date === 'string' ? body.date : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '경기 날짜(YYYY-MM-DD)는 필수입니다' }, { status: 400 })
  }
  const quarterId = typeof body.quarter_id === 'string' ? body.quarter_id : ''
  if (!quarterId) return NextResponse.json({ error: '어느 대회의 경기인지 지정해야 합니다' }, { status: 400 })

  const opponent = typeof body.opponent_name === 'string' ? body.opponent_name.trim() : ''
  if (!opponent) return NextResponse.json({ error: '상대팀 이름은 필수입니다' }, { status: 400 })
  if (opponent.length > 40) return NextResponse.json({ error: '상대팀 이름은 40자까지입니다' }, { status: 400 })

  const roundLabel = typeof body.round_label === 'string' && body.round_label ? body.round_label : null
  if (roundLabel && !ROUND_LABELS.includes(roundLabel as typeof ROUND_LABELS[number])) {
    return NextResponse.json(
      { error: `라운드는 ${ROUND_LABELS.join(' · ')} 중 하나여야 합니다` },
      { status: 400 },
    )
  }
  const venue = typeof body.venue === 'string' ? body.venue.trim().slice(0, 60) || null : null
  // 홈/원정 — 대회는 코트 배치가 주최측 편성이라 우리가 어느 쪽인지 그때그때 다르다.
  //   기본은 홈(우리가 왼쪽). 박스스코어·쿼터표가 이 기준으로 그려진다.
  const weAreAway = body.we_are_away === true

  const supabase = createClient()

  // 이 대회가 이 리그의 것인지 확인 — id 만 믿으면 남의 클럽 대회에 경기가 붙는다.
  const { data: q, error: qErr } = await supabase
    .from('league_quarters')
    .select('id, kind, name')
    .eq('id', quarterId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (qErr) return NextResponse.json({ error: '대회를 확인하지 못했습니다' }, { status: 500 })
  if (!q) return NextResponse.json({ error: '대회를 찾을 수 없습니다' }, { status: 404 })
  if (q.kind !== 'tournament') {
    return NextResponse.json({ error: '대회가 아닌 분기에는 이 방식으로 경기를 만들 수 없습니다' }, { status: 400 })
  }

  // ── 팀 두 행 확보 ────────────────────────────────────────────────
  //   상시팀만 본다(exhibition_date IS NULL). 친선 임시팀이 후보에 섞이면 대회 경기에
  //   그날짜 전용 팀이 붙어 순위표에 유령 팀이 생긴다(109 의 노출 경계).
  const { data: teamRows, error: tErr } = await supabase
    .from('league_teams')
    .select('id, name, is_external')
    .eq('league_id', leagueId)
    .is('exhibition_date', null)
  if (tErr) return NextResponse.json({ error: '팀 목록을 확인하지 못했습니다' }, { status: 500 })
  const teams = (teamRows ?? []) as Array<{ id: string; name: string; is_external: boolean | null }>

  let ourTeamId = teams.find(t => t.is_external === false)?.id ?? null
  if (!ourTeamId) {
    // 이름은 **실제 팀명**을 쓴다. '우리 팀' 같은 자리표시자를 넣으면 박스스코어·전적·공유
    //   이미지에 그대로 노출된다(상대는 진짜 이름인데 우리만 '우리 팀'으로 뜬다).
    const { data: team } = await supabase
      .from('teams')
      .select('name')
      .eq('id', await resolveTeamId(leagueId))
      .maybeSingle()
    const { data: created, error: cErr } = await supabase
      .from('league_teams')
      .insert({ league_id: leagueId, name: team?.name || '우리 팀', color: '#3b82f6', is_external: false })
      .select('id')
      .single()
    if (cErr || !created) return NextResponse.json({ error: '참가팀을 만들지 못했습니다' }, { status: 500 })
    ourTeamId = created.id
  }

  const oppTeamId = await ensureOpponentTeam(supabase, leagueId, opponent)
  if (!oppTeamId) return NextResponse.json({ error: '상대팀을 만들지 못했습니다' }, { status: 500 })

  const nextSlot = await nextSlotNum(supabase, leagueId, date)
  if (nextSlot == null) return NextResponse.json({ error: '그날 경기를 확인하지 못했습니다' }, { status: 500 })

  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .insert({
      league_id: leagueId,
      quarter_id: quarterId,
      date,
      slot_num: nextSlot,
      round_num: nextSlot,
      round_label: roundLabel,
      venue,
      home_team_id: weAreAway ? oppTeamId : ourTeamId,
      away_team_id: weAreAway ? ourTeamId : oppTeamId,
      home_score: 0,
      away_score: 0,
      is_complete: false,
      is_started: false,
      // ⚠ 대회 경기는 친선전이 아니다. is_exhibition 을 켜면 이 대회 묶음 안에서도
      //   집계 15곳이 통째로 걸러내 대회 스탯이 비어 버린다.
      is_exhibition: false,
    })
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color, is_external),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color, is_external)
    `)
    .single()

  if (gErr?.code === '23505') {
    return NextResponse.json({ error: '같은 번호의 경기가 방금 등록됐습니다. 다시 시도해 주세요.' }, { status: 409 })
  }
  if (gErr || !game) return NextResponse.json({ error: gErr?.message ?? '경기를 만들지 못했습니다' }, { status: 500 })

  await ensureScheduleDate(supabase, leagueId, date)

  await logAudit({
    req, action: 'tournament_game.create', targetTable: 'league_games',
    targetId: (game as { id: string }).id, leagueId, quarterId,
    detail: { date, opponent, roundLabel, tournament: q.name },
  })

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(game, { status: 201 })
}

/**
 * 대회 경기 수정 — 날짜 · 상대팀 · 라운드 · 장소 · 좌우.
 *
 * 기록이 시작된 뒤에는 **라운드·장소만** 고칠 수 있다.
 *   날짜를 옮기면 slot_num 을 다시 잡아야 하고, 상대·좌우를 바꾸면 league_game_events.team_id 가
 *   이 경기와 무관한 팀을 가리켜 **그 선수들이 박스스코어에서 통째로 사라진다**(화면은 멀쩡하고
 *   점수만 빈다 — 2026-08-23 에 실제로 당했다). 그 이관은 이미 전용 경로가 있다:
 *   `POST /games/[gameId]/reassign-teams`.
 */
async function updateTournamentGame(
  leagueId: string, gameId: string, body: Record<string, unknown>,
) {
  const supabase = createClient()

  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('id, date, slot_num, is_started, is_complete, home_team_id, away_team_id')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (gErr) return NextResponse.json({ error: '경기를 확인하지 못했습니다' }, { status: 500 })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count: evCount, error: cErr } = await supabase
    .from('league_game_events')
    .select('id', { count: 'exact', head: true })
    .eq('league_game_id', gameId)
  if (cErr) return NextResponse.json({ error: '경기 기록을 확인하지 못했습니다' }, { status: 500 })
  const locked = (evCount ?? 0) > 0 || game.is_started === true || game.is_complete === true

  const patch: Record<string, unknown> = {}

  // ── 언제든 고칠 수 있는 것 ──────────────────────────────
  if (body.round_label !== undefined) {
    const r = body.round_label
    if (r != null && r !== '' && !ROUND_LABELS.includes(r as typeof ROUND_LABELS[number])) {
      return NextResponse.json({ error: `라운드는 ${ROUND_LABELS.join(' · ')} 중 하나여야 합니다` }, { status: 400 })
    }
    patch.round_label = (r === '' || r == null) ? null : r
  }
  if (body.venue !== undefined) {
    patch.venue = typeof body.venue === 'string' ? (body.venue.trim().slice(0, 60) || null) : null
  }

  // ── 기록 시작 전에만 고칠 수 있는 것 ────────────────────
  const wantsDate = typeof body.date === 'string' && body.date && body.date !== game.date
  const opponentName = typeof body.opponent_name === 'string' ? body.opponent_name.trim() : ''
  const wantsAwayFlag = body.we_are_away !== undefined

  if ((wantsDate || opponentName || wantsAwayFlag) && locked) {
    // 라운드·장소만 바꾸려던 요청이 여기 걸리면 안 되므로, 실제로 바뀌는 게 있을 때만 막는다.
    const changingTeams = !!opponentName || wantsAwayFlag
    if (wantsDate || changingTeams) {
      return NextResponse.json(
        {
          error: '기록이 시작된 경기는 날짜·상대팀을 여기서 바꿀 수 없습니다. 라운드와 장소만 수정됩니다.',
          hint: '팀을 바로잡아야 하면 기록 화면의 팀 교체를 쓰세요(기록의 소속 팀도 함께 옮깁니다).',
        },
        { status: 409 },
      )
    }
  }

  if (!locked) {
    if (wantsDate) {
      const date = body.date as string
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: '경기 날짜는 YYYY-MM-DD 형식이어야 합니다' }, { status: 400 })
      }
      // 날짜가 바뀌면 슬롯 번호를 그 날짜 기준으로 다시 잡는다 —
      //   안 잡으면 UNIQUE (league_id, date, slot_num) 에 걸려 23505 로 실패한다.
      const slot = await nextSlotNum(supabase, leagueId, date)
      if (slot == null) return NextResponse.json({ error: '그날 경기를 확인하지 못했습니다' }, { status: 500 })
      patch.date = date
      patch.slot_num = slot
      patch.round_num = slot
    }

    if (opponentName || wantsAwayFlag) {
      // 지금 우리 팀이 어느 쪽인지 먼저 판정한다(좌우가 이미 뒤집혀 있을 수 있다).
      const ids = [game.home_team_id, game.away_team_id].filter(Boolean) as string[]
      const { data: cur } = await supabase
        .from('league_teams').select('id, is_external').eq('league_id', leagueId).in('id', ids)
      const ourId = (cur ?? []).find(t => t.is_external === false)?.id ?? null
      if (!ourId) return NextResponse.json({ error: '이 경기의 우리 팀을 찾지 못했습니다' }, { status: 400 })

      let oppId = (cur ?? []).find(t => t.is_external === true)?.id ?? null
      if (opponentName) {
        if (opponentName.length > 40) {
          return NextResponse.json({ error: '상대팀 이름은 40자까지입니다' }, { status: 400 })
        }
        oppId = await ensureOpponentTeam(supabase, leagueId, opponentName)
        if (!oppId) return NextResponse.json({ error: '상대팀을 만들지 못했습니다' }, { status: 500 })
      }
      if (!oppId) return NextResponse.json({ error: '이 경기의 상대팀을 찾지 못했습니다' }, { status: 400 })

      const away = wantsAwayFlag ? body.we_are_away === true : game.away_team_id === ourId
      patch.home_team_id = away ? oppId : ourId
      patch.away_team_id = away ? ourId : oppId
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 수 있는 항목이 없습니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('league_games')
    .update(patch)
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color, is_external),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color, is_external)
    `)
    .single()
  if (error?.code === '23505') {
    return NextResponse.json({ error: '그 날짜에 같은 번호의 경기가 방금 생겼습니다. 다시 시도해 주세요.' }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (typeof patch.date === 'string') await ensureScheduleDate(supabase, leagueId, patch.date)

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')
  return NextResponse.json(data)
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  const body = await req.json()

  // 대회 경기 수정은 만드는 것과 마찬가지로 성격이 다르다(날짜 이동 시 슬롯 재배정 ·
  //   상대팀 이름 확보). 아래 일반 PATCH 에 조건을 얹으면 두 의미가 한 함수 안에서 싸운다.
  if (body?.mode === 'tournament') {
    return updateTournamentGame(leagueId, gameId, body)
  }

  // 허용 컬럼만 통과시킨다. 받은 객체를 그대로 update 에 넘기면 요청 하나로 league_id 를
  // 바꿔 경기를 통째로 다른 리그로 옮길 수 있다(대량 할당) — 아래 league_id 스코프도
  // 그때는 소용이 없다. 화면이 그런 요청을 안 보낼 뿐, 막혀 있진 않았다.
  const ALLOWED = new Set([
    'home_team_id', 'away_team_id', 'home_score', 'away_score',
    'is_complete', 'is_started', 'is_exhibition', 'plus_one_player_id', 'plus_one_extra_ids',
    'youtube_url', 'youtube_start_offset',
    // 대회 경기 편집 — 라운드 표기와 경기장. 리그 경기에는 화면이 보내지 않는다.
    'round_label', 'venue',
  ])
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body ?? {})) {
    if (ALLOWED.has(k)) patch[k] = v
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 수 있는 항목이 없습니다' }, { status: 400 })
  }

  // 경기 한정 +1 명단(110) — UUID 배열만 받는다. 배열이 아니거나 형식이 틀리면 거절한다.
  //   이 값은 득점 계산에 그대로 들어가므로 쓰레기가 섞이면 그 경기 점수가 조용히 어긋난다.
  if ('plus_one_extra_ids' in patch) {
    const v = patch.plus_one_extra_ids
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (v === null) {
      patch.plus_one_extra_ids = []
    } else if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !UUID.test(x))) {
      return NextResponse.json({ error: 'plus_one_extra_ids 는 선수 UUID 배열이어야 합니다' }, { status: 400 })
    } else {
      patch.plus_one_extra_ids = Array.from(new Set(v as string[]))
    }
  }

  const supabase = createClient()

  // ── 임시팀 불변식 ────────────────────────────────────────────────
  //   league_teams.exhibition_date 가 있는 팀(=그날 친선전 전용 임시팀)은
  //     ① 친선전 경기에만,  ② 자기 날짜 경기에만  붙을 수 있다.
  //   이걸 안 막으면 임시팀이 정규전에 들어가 순위표에 유령 팀이 생기고, 그 경기의
  //   승패가 실제로 존재하지 않는 팀에 쌓인다. 화면이 그런 요청을 안 보낼 뿐 막혀 있진 않다 —
  //   특히 "친선전 해제"(is_exhibition=false)는 팀을 건드리지 않고도 같은 결과를 만든다.
  if ('home_team_id' in patch || 'away_team_id' in patch || 'is_exhibition' in patch) {
    const { data: game, error: gErr } = await supabase
      .from('league_games')
      .select('date, is_exhibition, home_team_id, away_team_id')
      .eq('id', gameId)
      .eq('league_id', leagueId)
      .maybeSingle()
    if (gErr) return NextResponse.json({ error: '경기를 확인하지 못했습니다' }, { status: 500 })
    if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const nextHome = ('home_team_id' in patch ? patch.home_team_id : game.home_team_id) as string | null
    const nextAway = ('away_team_id' in patch ? patch.away_team_id : game.away_team_id) as string | null
    const nextExhibition = 'is_exhibition' in patch ? patch.is_exhibition === true : game.is_exhibition === true
    const ids = [nextHome, nextAway].filter(Boolean) as string[]

    if (ids.length > 0) {
      const { data: teamRows, error: tErr } = await supabase
        .from('league_teams')
        .select('id, name, exhibition_date')
        .eq('league_id', leagueId)
        .in('id', ids)
      if (tErr) return NextResponse.json({ error: '팀을 확인하지 못했습니다' }, { status: 500 })

      // 이 리그 팀이 아니면 거절 — 지금까지는 다른 클럽 팀 id 를 그대로 저장할 수 있었다.
      const known = new Set((teamRows ?? []).map(t => t.id))
      if (ids.some(id => !known.has(id))) {
        return NextResponse.json({ error: '이 리그의 팀이 아닙니다' }, { status: 400 })
      }

      const adhoc = (teamRows ?? []).filter(t => t.exhibition_date)
      if (adhoc.length > 0) {
        if (!nextExhibition) {
          return NextResponse.json(
            { error: `임시팀(${adhoc.map(t => t.name).join(', ')})이 배정된 경기는 정규전이 될 수 없습니다. 팀을 상시팀으로 먼저 바꾸세요.` },
            { status: 409 },
          )
        }
        const wrongDate = adhoc.filter(t => t.exhibition_date !== game.date)
        if (wrongDate.length > 0) {
          return NextResponse.json(
            { error: `임시팀 "${wrongDate[0].name}" 은 ${wrongDate[0].exhibition_date} 전용입니다 (이 경기는 ${game.date})` },
            { status: 400 },
          )
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('league_games')
    .update(patch)
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  // 자동 배지 재계산 훅 —
  //   경기 마감(is_complete=true) 순간 즉시 배지 재계산.
  //   실패해도 경기 마감 자체는 성공하도록 try/catch 로 격리 (fire-and-forget 계열).
  //   sync 함수는 idempotent 이므로 중복 호출/실패 재시도에 안전.
  if (body?.is_complete === true) {
    try {
      const r = await syncBadgesForGame(supabase, gameId)
      console.log(`[badges/auto-sync] gameId=${gameId} created=${r.created} removed=${r.removed}`)
    } catch (err) {
      console.error(`[badges/auto-sync] gameId=${gameId} failed:`, err)
    }
  }

  // YouTube 자동 연동 훅 (Option A) —
  //   is_started=true 로 전이할 때 backgroud sync 시도. 실패하면 조용히 스킵.
  //   대부분의 경우 게임 시작 시점엔 영상이 아직 업로드되지 않음 → 실패 정상.
  //   진짜 안전망은 매주 토 22:00 KST cron (/api/cron/youtube-sync).
  //   조건: league 에 youtube_channel 설정 + 게임 날짜 <= 오늘(KST) + youtube_url 아직 없음.
  if (body?.is_started === true && data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = data as any
    const apiKey = process.env.YOUTUBE_API_KEY
    if (apiKey && game.date && !game.youtube_url) {
      // KST 오늘
      const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (game.date <= kstToday) {
        supabase
          .from('leagues')
          .select('youtube_channel')
          .eq('id', leagueId)
          .single()
          .then(({ data: lg }) => {
            const handle = (lg as { youtube_channel: string | null } | null)?.youtube_channel
            if (!handle) return
            syncYoutubeForLeague(supabase, leagueId, handle, game.date, apiKey)
              .then((r) => {
                if (r.ok) console.log(`[youtube/auto-sync] gameId=${gameId} mapped=${r.mapped}`)
                else console.log(`[youtube/auto-sync] gameId=${gameId} skip: ${r.reason}`)
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err)
                console.error(`[youtube/auto-sync] gameId=${gameId} failed:`, msg)
              })
          })
      }
    }
  }

  return NextResponse.json(data)
}

/**
 * DELETE /api/leagues/[leagueId]/games?gameId=…  — 경기 슬랏 삭제
 *
 * 왜 새로 만드는가 (2026-08-15)
 *   일정 화면의 "날짜 삭제" 가 그날의 경기를 지우려고 PATCH 에 `{ _delete: true }` 를
 *   보내고 있었는데, PATCH 에 그런 처리가 없어 **그동안 계속 조용히 실패했다.**
 *   화면은 응답을 안 보고 성공 토스트를 띄웠기 때문에 아무도 눈치채지 못했고,
 *   날짜만 사라지고 경기 슬랏은 리그에 그대로 남았다.
 *
 * 기록이 붙은 경기는 지우지 않는다
 *   league_games 삭제는 league_game_events 로 캐스케이드된다(021). 리그 스탯은 그
 *   이벤트 재집계로만 만들어지므로, 여기서 지우면 그 경기 기록이 영구 소멸한다 —
 *   일정 재생성(schedule/route.ts)을 막은 것과 정확히 같은 이유다. 빈 슬랏만 지운다.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })

  const supabase = createClient()

  // 소속 확인 — 인가는 이 리그에 대해 받았을 뿐이다. id 하나로 지우면 다른 클럽의
  // 경기가 지워진다(감사 02). 없거나 남의 것이면 존재 여부를 알리지 않도록 404.
  const { data: game, error: findError } = await supabase
    .from('league_games')
    .select('id, date, is_started, is_complete')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (findError) {
    return NextResponse.json({ error: '경기를 확인하지 못했습니다' }, { status: 500 })
  }
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count, error: eventError } = await supabase
    .from('league_game_events')
    .select('id', { count: 'exact', head: true })
    .eq('league_game_id', gameId)
  if (eventError) {
    return NextResponse.json({ error: '경기 기록을 확인하지 못했습니다' }, { status: 500 })
  }
  const eventCount = count ?? 0

  if (game.is_started || game.is_complete || eventCount > 0) {
    await logAudit({
      req, action: 'game.delete', targetTable: 'league_games', targetId: gameId,
      leagueId, result: 'denied', detail: { eventCount, date: game.date },
    })
    return NextResponse.json(
      { error: `기록이 있는 경기입니다(이벤트 ${eventCount}건). 삭제하면 기록도 함께 사라지므로 막았습니다.`, eventCount },
      { status: 409 }
    )
  }

  // 성공 판정은 반환 행 수로 — PostgREST 는 RLS 에 막혀도 204 를 준다(감사 04 ②).
  const { data: removed, error: deleteError } = await supabase
    .from('league_games')
    .delete()
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .select('id')
  if (deleteError || !removed || removed.length === 0) {
    return NextResponse.json({ error: '삭제하지 못했습니다' }, { status: 500 })
  }

  await logAudit({
    req, action: 'game.delete', targetTable: 'league_games', targetId: gameId,
    leagueId, detail: { date: game.date },
  })

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ success: true })
}
