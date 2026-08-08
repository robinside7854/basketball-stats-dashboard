import { isLeaguePrivateGated } from '@/lib/auth/guard'
import MePageClient from './MePageClient'

type Params = { orgSlug: string; leagueId: string }

// "내 기록" 탭 진입점(Task 4-A/4-B) — 라커룸이 상단 네비에서 빠지면서 이 페이지가
// 로그인 · 개인 대시보드 · 계정 기능(테마·로그아웃)과 드래프트로 가는 바로가기를 모은
// 계정/개인 화면이 된다(팀 명단·팀 구성은 '팀/경기' 탭으로, 설정은 상단 바 어드민 버튼으로,
// 둘러보기는 기능 자체가 삭제되어 각각 빠졌다).
// 서버 컴포넌트는 비공개 리그 게이트만 확인하고 클라이언트 컴포넌트(PersonalDashboard 재사용)를
// 렌더한다 — 형제 boxscore/page.tsx · 리그 홈 page.tsx 와 동일한 패턴(이 저장소에서 실제로 났던
// 누수 사고 재발 방지, layout·page 병렬 렌더로 게이트 하나로는 raw HTML 누출을 못 막는다).
export default async function MePage({ params }: { params: Promise<Params> }) {
  const { orgSlug, leagueId } = await params

  if (await isLeaguePrivateGated(leagueId)) return null

  return <MePageClient orgSlug={orgSlug} leagueId={leagueId} />
}
