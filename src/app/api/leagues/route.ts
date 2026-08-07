import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(req: Request) {
  // 목록 조회는 CEO 콘솔(/admin)만 쓴다 — 실측 호출자 3곳 모두 NextAuth 세션 화면.
  // 공개 소비자가 없으므로 가드를 붙여도 안전하고, 가드가 없으면 익명 방문자가
  // 전 리그의 edit_pin 을 한 번에 받아간다 (단건 GET 보다 더 심각한 노출).
  const session = await auth()
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

// ⚠️ 리그(시즌) 생성은 현재 준비 중 — 501 을 반환한다 (2026-08-04)
//
// 원래 구현은 leagues 에 INSERT 했는데 두 필수 컬럼을 안 넣어 실패하고 있었다.
//   1) leagues.slug    — URL 슬러그 도입(047) 때 NOT NULL 이 됐는데 안 넣음
//   2) leagues.team_id — 멀티테넌트 단계 1 에서 NOT NULL 이 됐는데 안 넣음
//
// team_id 는 자동으로 채울 수 없다. 시즌은 조직이 아니라 **팀**(청년부/장년부)에 매달리는데,
// 이 API 는 org_slug 만 받으므로 어느 팀의 시즌인지 알 수 없다. 즉 입력 자체가 부족하다 —
// 팀 선택 UI 가 먼저 필요하고, 그건 단계 7(온보딩 마법사)의 일이다.
//
// GET 은 그대로 동작한다 (어드민 리그 목록 조회에 쓰임).
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    error: '리그 생성은 준비 중입니다 (단계 7 온보딩 마법사). ' +
           '지금은 온보딩 스크립트를 사용하세요 — node scripts/onboard-club.mjs <설정파일.json> --commit ' +
           '(샘플: scripts/onboard-samples/example-club.json)',
  }, { status: 501 })
}
