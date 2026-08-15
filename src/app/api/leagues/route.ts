import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'

export async function GET(req: Request) {
  // 목록 조회는 CEO 콘솔(/admin)만 쓴다 — 실측 호출자 3곳 모두 NextAuth 세션 화면.
  // 공개 소비자가 없으므로 가드를 붙여도 안전하고, 가드가 없으면 익명 방문자가
  // 전 리그의 edit_pin 을 한 번에 받아간다 (단건 GET 보다 더 심각한 노출).
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const org_slug = searchParams.get('org_slug')
  // team_id 는 org_slug 와 달리 팀을 유일하게 특정한다 — 파란날개처럼 org_slug 를
  // 공유하는 팀이 있으면 org_slug 필터는 여러 팀의 대회를 한데 섞어 돌려준다.
  // 팀 상세 화면(하나의 팀만 보여줘야 하는 곳)은 반드시 이 필터를 쓴다.
  const team_id = searchParams.get('team_id')
  const supabase = createClient()
  // 어드민 목록은 팀 기준으로 묶어서 보여준다 — 팀이 명단·회원의 주인이 된 이후로는
  // "리그"가 조직의 대표 이름이 아니라 팀이 굴리는 여러 대회 중 하나일 뿐이다.
  // teams(...) 는 leagues.team_id → teams.id 의 다대일 관계라 PostgREST 가 배열이 아니라
  // 단일 객체로 내려준다 (isLeaguePublic 의 teams(is_public) 패턴과 동일).
  // select('*') 금지 — edit_pin 은 이 목록 응답에 실으면 안 된다(전용 GET .../edit-pin 으로 분리).
  let q = supabase
    .from('leagues')
    .select(
      'id, org_slug, name, season_year, start_date, match_day, total_rounds, status, created_at, season_type, games_per_round, youtube_channel, plus_one_age, slug, team_id, mode, rules, teams(id, name, org_slug, sub_slug, accent_color, is_public)'
    )
    .order('created_at', { ascending: false })
  if (team_id) q = q.eq('team_id', team_id)
  else if (org_slug) q = q.eq('org_slug', org_slug)
  const { data, error } = await q
  // DB 원문 메시지는 노출하지 않는다.
  if (error) return NextResponse.json({ error: '리그 목록 조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// 리그(시즌·대회) 생성 — 2026-08-15, 오래 501 이던 자리를 실제 구현으로 교체했다.
//
// 왜 501 이었나: 시즌은 조직이 아니라 **팀**에 매달리는데(leagues.team_id NOT NULL)
// 이 API 가 org_slug 만 받아서 어느 팀의 시즌인지 알 수 없었다. 이제 team_id 를 받는다.
// teams.org_id 와는 무관하므로 마이그레이션 108 없이도 지금 바로 동작한다.
//
// 무엇을 하는가: scripts/onboard-club.mjs 의 "시즌 생성" 단계와 같은 일이다.
//   · leagues.org_slug 는 **팀에서 파생**한다(입력을 안 받는다). 미들웨어가
//     `/league/<org_slug>/<slug>` 를 `org_slug=eq.&slug=eq.` 로 푸는데(src/middleware.ts:34),
//     팀의 org_slug 와 어긋나면 주소가 그냥 404 가 된다 — 손으로 맞출 값이 아니다.
//   · season_year / total_rounds / mode / rules 등은 DB 기본값(표준 아마추어 농구 룰)을
//     그대로 쓰고, 필요하면 본문으로 덮어쓴다.
//   · start_date 만 NOT NULL 인데 기본값이 없다 — 안 주면 오늘로 채운다(나중에 수정 가능).
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const MODES = new Set(['league', 'tournament'])

export async function POST(req: Request) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  // 대량 할당 방지 — 받은 객체를 통째로 insert 하지 않고 여기 적힌 값만 조립한다
  // (PATCH 의 ALLOWED 화이트리스트와 같은 이유). 특히 id·org_slug 는 입력에서 받지 않는다.
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  // slug: 이 리그의 URL 조각. 구 화면은 이 값을 org_slug 라는 이름으로 보낸다 — 둘 다 받는다.
  const rawSlug = typeof b.slug === 'string' && b.slug.trim()
    ? b.slug
    : (typeof b.org_slug === 'string' ? b.org_slug : '')
  const slug = rawSlug.trim().toLowerCase()
  const editPin = b.edit_pin === undefined || b.edit_pin === null ? '' : String(b.edit_pin).trim()
  const teamId = typeof b.team_id === 'string' ? b.team_id.trim() : ''
  const mode = typeof b.mode === 'string' && b.mode.trim() ? b.mode.trim() : 'league'
  const startDate = typeof b.start_date === 'string' && b.start_date.trim()
    ? b.start_date.trim()
    : new Date().toISOString().slice(0, 10)

  const errors: string[] = []
  if (!name) errors.push('리그 이름을 입력하세요')
  if (!slug) errors.push('URL 슬러그를 입력하세요')
  else if (!SLUG_RE.test(slug)) errors.push('URL 슬러그는 영문 소문자·숫자·하이픈만 쓸 수 있습니다')
  if (!/^\d{4}$/.test(editPin)) errors.push('편집 PIN 은 숫자 4자리여야 합니다')
  if (!MODES.has(mode)) errors.push("mode 는 'league' 또는 'tournament' 여야 합니다")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.push('시작일은 YYYY-MM-DD 형식이어야 합니다')
  if (!teamId) {
    // 여기서 멈추는 것이 맞다. 팀을 못 정하면 어느 동호회의 시즌인지 정할 수 없고,
    // 아무 팀에나 붙이면 나중에 발견되는 조용한 오배치가 된다.
    errors.push('어느 팀의 리그인지 선택하세요 (team_id)')
  }
  if (errors.length > 0) return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })

  const supabase = createClient()

  const { data: team, error: teamErr } = await supabase
    .from('teams')
    .select('id, org_slug, name')
    .eq('id', teamId)
    .maybeSingle()
  if (teamErr) return NextResponse.json({ error: '팀 조회 실패' }, { status: 500 })
  if (!team) return NextResponse.json({ error: '해당 팀을 찾을 수 없습니다' }, { status: 404 })

  const seasonYear = Number.isInteger(b.season_year)
    ? (b.season_year as number)
    : new Date().getFullYear()

  // 중복은 DB 제약(leagues_org_slug_unique · leagues_team_season_unique)이 최종 방어선이지만,
  // 먼저 조회해 운영자가 알아볼 수 있는 문구로 돌려준다.
  const { data: dup, error: dupErr } = await supabase
    .from('leagues')
    .select('id, name')
    .eq('org_slug', team.org_slug)
    .eq('slug', slug)
    .maybeSingle()
  if (dupErr) return NextResponse.json({ error: '중복 확인 실패' }, { status: 500 })
  if (dup) {
    return NextResponse.json({
      error: `이미 사용 중인 주소입니다 — /league/${team.org_slug}/${slug} (${dup.name}). 슬러그를 바꾸세요`,
    }, { status: 409 })
  }

  // 선택 항목은 준 것만 넣는다 — 생략하면 DB 기본값(표준 룰·8라운드·upcoming 등)이 적용된다.
  const row: Record<string, unknown> = {
    team_id: team.id,
    org_slug: team.org_slug,   // 팀에서 파생 — 입력값을 쓰지 않는다(위 주석 참고)
    slug,
    name,
    edit_pin: editPin,
    season_year: seasonYear,
    start_date: startDate,
    mode,
  }
  if (typeof b.match_day === 'string') row.match_day = b.match_day
  if (Number.isInteger(b.total_rounds)) row.total_rounds = b.total_rounds
  if (Number.isInteger(b.games_per_round)) row.games_per_round = b.games_per_round
  if (typeof b.season_type === 'string') row.season_type = b.season_type
  if (typeof b.status === 'string') row.status = b.status

  const { data, error } = await supabase
    .from('leagues')
    .insert(row)
    // select('*') 금지 — edit_pin 은 이 응답에 실으면 안 된다(전용 GET .../edit-pin 으로 분리).
    .select('id, org_slug, name, season_year, start_date, match_day, total_rounds, status, created_at, season_type, games_per_round, slug, team_id, mode')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({
        error: `이미 존재하는 시즌입니다 — ${team.name} ${seasonYear} ${slug}`,
      }, { status: 409 })
    }
    // DB 원문 메시지는 노출하지 않는다.
    return NextResponse.json({ error: '리그 생성 실패' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
