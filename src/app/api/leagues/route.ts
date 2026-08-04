import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const org_slug = searchParams.get('org_slug')
  const supabase = createClient()
  let q = supabase.from('leagues').select('*').order('created_at', { ascending: false })
  if (org_slug) q = q.eq('org_slug', org_slug)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
