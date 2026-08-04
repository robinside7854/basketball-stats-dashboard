import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// ⚠️ 조직 생성은 현재 준비 중 — 501 을 반환한다 (2026-08-04)
//
// 원래 구현은 teams 에 한 줄 INSERT 했는데, 두 가지 이유로 4개월째 실패하고 있었다.
//   1) teams.sub_slug — 2026-04 멀티팀 전환 때 NOT NULL 이 됐는데 안 넣음
//   2) teams.org_id   — 멀티테넌트 단계 1 에서 NOT NULL 이 됐는데 안 넣음
//
// 빈 칸을 채우는 것으로 끝나지 않는다. 이름은 "조직 생성"인데 실제로는 teams(팀) 한 줄을
// 넣는다 — 조직과 팀이 같은 것이던 시절의 코드다. 이제 둘은 별개 계층이라
// (orgs → teams → leagues) 개념 자체가 어긋난다. 제대로 하려면 조직→팀→시즌 흐름을
// 새로 설계해야 하고 그건 단계 7(온보딩 마법사)의 일이다.
//
// 그때까지 조용히 실패하는 대신 대안을 안내한다.
// 실제 온보딩 경로: docs/superpowers/specs/2026-08-04-multi-tenant-standardization-design.md
export async function POST() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    error: '조직 생성은 준비 중입니다 (단계 7 온보딩 마법사). ' +
           '지금은 온보딩 스크립트를 사용하세요 — node scripts/onboard-club.mjs <설정파일.json> --commit ' +
           '(샘플: scripts/onboard-samples/example-club.json)',
  }, { status: 501 })
}
