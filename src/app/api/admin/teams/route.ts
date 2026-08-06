import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { auth } from '@/lib/auth'

// 전체 팀 목록 — /admin/leagues 가 "대회가 없는 팀"도 빠짐없이 보여주기 위해 쓴다.
// 예전엔 /api/leagues 응답에서 팀을 역으로 추출했는데, 그 방식은 대회가 하나도 없는
// 팀(파란날개 청년부·장년부처럼)을 통째로 누락시켰다.
export async function GET() {
  const session = await auth()
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

// ⚠️ 팀 생성은 현재 준비 중 — 501 을 반환한다 (2026-08-04, 경로 이동 2026-08-06)
//
// 원래 구현(당시 이름 "조직 생성", /api/admin/orgs)은 teams 에 한 줄 INSERT 했는데,
// 두 가지 이유로 실패하고 있었다.
//   1) teams.sub_slug — 2026-04 멀티팀 전환 때 NOT NULL 이 됐는데 안 넣음
//   2) teams.org_id   — 멀티테넌트 단계 1 에서 NOT NULL 이 됐는데 안 넣음
//
// 이제 조직(org) 개념은 어드민 화면에서 사라졌지만 teams.org_id 는 여전히 NOT NULL 이라
// (스키마는 이번 작업 범위 밖) 팀 한 줄을 만들려면 어차피 org 행이 먼저 있어야 한다.
// 팀 선택 UI만으로는 못 채우는 값이라 여전히 온보딩 마법사(단계 7)의 일이다.
//
// 그때까지 조용히 실패하는 대신 대안을 안내한다.
// 실제 온보딩 경로: docs/superpowers/specs/2026-08-04-multi-tenant-standardization-design.md
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    error: '팀 생성은 준비 중입니다 (단계 7 온보딩 마법사). ' +
           '지금은 온보딩 스크립트를 사용하세요 — node scripts/onboard-club.mjs <설정파일.json> --commit ' +
           '(샘플: scripts/onboard-samples/example-club.json)',
  }, { status: 501 })
}
