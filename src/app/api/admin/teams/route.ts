import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'

// 전체 팀 목록 — /admin/leagues 가 "대회가 없는 팀"도 빠짐없이 보여주기 위해 쓴다.
// 예전엔 /api/leagues 응답에서 팀을 역으로 추출했는데, 그 방식은 대회가 하나도 없는
// 팀(파란날개 청년부·장년부처럼)을 통째로 누락시켰다.
export async function GET() {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const teams = data ?? []

  // 파란날개는 대회 12개를 옛 트리(tournaments 테이블)에 갖고 있는데, 어드민이 leagues 만
  // 보고 있어서 "대회 없음"으로 떴다. CEO 콘솔은 플랫폼의 실제 상태를 보여야 하므로
  // 옛 트리 대회도 함께 내려준다. 읽기 전용이다 — 이 대회들에는 leagues 행이 없어서
  // /admin/leagues/[leagueId] 관리 화면이 존재하지 않는다.
  const { data: legacy, error: lErr } = await supabase
    .from('tournaments')
    .select('id, name, year, type, team_id')
    .order('year', { ascending: false })
  if (lErr) return NextResponse.json({ error: `옛 트리 대회 조회 실패 — ${lErr.message}` }, { status: 500 })

  const byTeam = new Map<string, typeof legacy>()
  for (const t of legacy ?? []) {
    if (!t.team_id) continue
    const arr = byTeam.get(t.team_id) ?? []
    arr.push(t)
    byTeam.set(t.team_id, arr)
  }

  return NextResponse.json(
    teams.map(t => ({ ...t, legacy_tournaments: byTeam.get(t.id) ?? [] })),
  )
}

// 팀 생성 — 2026-08-15, 오래 501 이던 자리를 실제 구현으로 교체했다.
//
// 왜 501 이었나: teams.org_id 가 NOT NULL 이라 팀 한 줄을 만들려면 먼저 orgs 한 줄이
// 있어야 했는데, 조직(org) 개념은 2026-08-06 에 폐기돼(팀이 최상위 단위) 화면에서 물어볼
// 값이 아니었다. 마이그레이션 108 이 그 NOT NULL 을 풀어 이 매듭을 끊는다 —
// 이제 org_id 를 아예 넣지 않는다(죽은 orgs 행을 더 만들지 않는다).
//
// 무엇을 하는가: scripts/onboard-club.mjs 의 "팀 생성" 단계와 정확히 같은 일을 한다.
//   · org_slug/sub_slug 복합 URL 키 — 스크립트의 deriveSlugs() 규칙을 그대로 따른다.
//     club_slug 를 안 주는 = 이 팀이 클럽 전체인 경우 sub_slug 는 관례적으로 'main'
//     (미라클과 같은 패턴). 형제 팀(파란날개 청년부/장년부)을 만들 때만 sub_slug 를 준다.
//   · edit_pin 4자리, is_active=true, is_public 기본 공개
//     (막 만든 동호회가 자기 회원에게조차 안 보이는 쪽이 더 나쁘다 — 스크립트와 같은 판단)
//
// 이 API 가 하지 않는 것: 시즌(leagues)·경기팀·선수 생성. 그건 POST /api/leagues 와
// 로스터 화면의 몫이다. 리그형 클럽을 한 번에 세팅하려면 온보딩 스크립트가 여전히 편하다.
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

export async function POST(req: Request) {
  const session = await requireCeoSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다' }, { status: 400 })
  }

  // 대량 할당 방지 — 받은 객체를 그대로 insert 에 넘기지 않고 여기 적힌 값만 조립한다.
  // (leagues PATCH 의 ALLOWED 화이트리스트와 같은 이유: 화면이 안 보낼 뿐 막혀 있진 않다.
  //  그대로 넘기면 요청 하나로 id 를 지정하거나 다른 팀 값을 흉내낼 수 있다.)
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const orgSlug = typeof b.org_slug === 'string' ? b.org_slug.trim().toLowerCase() : ''
  // sub_slug 를 안 주면 'main' — 이 팀이 클럽 전체라는 뜻이다(onboard-club.mjs 와 동일 규칙).
  const subSlug = typeof b.sub_slug === 'string' && b.sub_slug.trim()
    ? b.sub_slug.trim().toLowerCase()
    : 'main'
  const editPin = b.edit_pin === undefined || b.edit_pin === null ? '' : String(b.edit_pin).trim()
  const accentColor = typeof b.accent_color === 'string' && b.accent_color.trim()
    ? b.accent_color.trim()
    : '#3b82f6'
  const isPublic = typeof b.is_public === 'boolean' ? b.is_public : true

  const errors: string[] = []
  if (!name) errors.push('팀 이름을 입력하세요')
  if (!orgSlug) errors.push('URL 슬러그를 입력하세요')
  else if (!SLUG_RE.test(orgSlug)) errors.push('URL 슬러그는 영문 소문자·숫자·하이픈만 쓸 수 있습니다')
  if (!SLUG_RE.test(subSlug)) errors.push('서브 슬러그는 영문 소문자·숫자·하이픈만 쓸 수 있습니다')
  if (!/^\d{4}$/.test(editPin)) errors.push('편집 PIN 은 숫자 4자리여야 합니다')
  if (errors.length > 0) return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })

  const supabase = createClient()

  // 중복은 DB 제약(teams_org_sub_unique)이 최종 방어선이지만, 먼저 조회해서
  // "이미 있는 주소입니다" 라고 알려준다 — 23505 원문보다 운영자가 알아볼 수 있다.
  const { data: dup, error: dupErr } = await supabase
    .from('teams')
    .select('id, name')
    .eq('org_slug', orgSlug)
    .eq('sub_slug', subSlug)
    .maybeSingle()
  if (dupErr) return NextResponse.json({ error: '중복 확인 실패' }, { status: 500 })
  if (dup) {
    return NextResponse.json({
      error: `이미 사용 중인 주소입니다 — /${orgSlug}/${subSlug} (${dup.name}). 슬러그를 바꾸세요`,
    }, { status: 409 })
  }

  // org_id 는 일부러 넣지 않는다(마이그레이션 108). 조직 개념은 폐기됐고 orgs 는
  // 앱이 읽지 않는 죽은 테이블이라, 팀마다 껍데기 org 행을 만들 이유가 없다.
  const { data, error } = await supabase
    .from('teams')
    .insert({
      org_slug: orgSlug,
      sub_slug: subSlug,
      name,
      accent_color: accentColor,
      edit_pin: editPin,
      is_active: true,
      is_public: isPublic,
    })
    .select('id, org_slug, sub_slug, name, accent_color, is_public, is_active, created_at')
    .single()

  if (error) {
    // 마이그레이션 108 미적용 = org_id 가 아직 NOT NULL. 이걸 500 으로 흘리면
    // 운영자는 원인도 조치도 알 수 없다 — 무엇을 해야 하는지 그대로 알려준다.
    if (error.code === '23502' && String(error.message).includes('org_id')) {
      return NextResponse.json({
        error: 'DB 준비가 필요합니다 — 마이그레이션 108(supabase/migrations/108_teams_org_id_nullable.sql)을 ' +
               '아직 적용하지 않았습니다. 적용 전에는 콘솔에서 팀을 만들 수 없습니다.',
      }, { status: 503 })
    }
    if (error.code === '23505') {
      return NextResponse.json({ error: `이미 사용 중인 주소입니다 — /${orgSlug}/${subSlug}` }, { status: 409 })
    }
    // DB 원문 메시지는 노출하지 않는다.
    return NextResponse.json({ error: '팀 생성 실패' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
