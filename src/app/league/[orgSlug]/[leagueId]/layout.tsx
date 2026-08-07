import type { Metadata } from 'next'
import { isLeaguePublic, getApprovedSession } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/admin'
import LeagueLayoutClient from './_components/LeagueLayoutClient'
import PrivateLeagueGate from '@/components/league/auth/PrivateLeagueGate'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}): Promise<Metadata> {
  const { leagueId } = await params

  // 비공개 리그는 탭 제목에도 클럽/리그 이름을 노출하지 않는다 — 링크만 가진 사람이
  // 브라우저 탭을 봐도 "어느 동호회인지" 알 수 없어야 한다 (화면 본문 게이트와 동일한 원칙).
  // openGraph/twitter 를 여기서 지정하지 않으면 루트 layout 의 온볼 브랜드 값을 그대로 상속한다 —
  // 링크 공유 카드도 "로그인이 필요합니다" 조차 노출하지 않고 완전히 중립화되는 효과.
  const publicLeague = await isLeaguePublic(leagueId)
  if (!publicLeague && !(await getApprovedSession(leagueId))) {
    return { title: '로그인이 필요합니다', description: '비공개로 운영되는 페이지입니다.' }
  }

  // 온볼은 서비스 정체성, 클럽/리그 이름은 화면 안에서만 보여준다 — 탭 제목엔 클럽명 대신
  // 페이지 종류(게임로그)로 탭을 구분한다. 그래서 리그명 조회 자체가 더 이상 필요 없다.
  const title = '온볼 — 게임로그'
  const description = '동호회 경기 기록 · 게임로그'
  return { title, description, openGraph: { title, description }, twitter: { title, description } }
}

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { orgSlug, leagueId } = await params

  // 비공개 리그 게이트 — 승인 회원 세션이 없으면 화면 전체를 PrivateLeagueGate 로 대체한다.
  // ⚠ 알려진 제약 1: 서버 컴포넌트는 라우트 핸들러의 req 를 못 받으므로 편집 PIN(canEditLeague 의
  //   PIN 폴백)은 여기서 검사할 수 없다 — canViewLeague 대신 isLeaguePublic + getApprovedSession
  //   만 쓰는 이유. 그 결과 "어드민 role 계정 없이 PIN만 아는 운영자"는 API 호출은 전부 통과하지만
  //   (Task 2 의 canViewLeague 가드가 PIN 도 허용) 화면 자체는 이 게이트에 막혀 로그인 화면을 보게 된다.
  //   임시로 받아들이는 한계 — 정식 해결은 PIN 운영자도 어드민 role 계정으로 전환하는 것.
  // ⚠ 알려진 제약 2 (더 중요): 이 체크는 눈에 보이는 화면(children 미포함)만 막는다.
  //   Next.js App Router 는 layout 과 그 아래 page 를 병렬 렌더하므로, 여기서 {children} 을
  //   반환에서 빼도 하위 page.tsx 의 데이터 fetch 는 이미 시작되어 계속 실행되고, 그 결과가
  //   "쓰이지 않는" flight 청크로 raw HTML 응답에 섞여 나갈 수 있다(화면엔 안 보이지만
  //   view-source/curl/크롤러엔 노출 — 실측 확인됨). 그래서 각 page.tsx 도 자기 함수 맨 위에서
  //   `isLeaguePrivateGated`를 확인하고 데이터를 fetch 하기 전에 return null 한다 — 여기 게이트는
  //   화면(네비게이션 셸 포함)을 막는 역할, page.tsx 쪽 가드는 raw HTML 누출을 막는 역할로 이원화.
  const publicLeague = await isLeaguePublic(leagueId)
  if (!publicLeague && !(await getApprovedSession(leagueId))) {
    return <PrivateLeagueGate leagueId={leagueId} />
  }

  // 좌측 상단 브랜드 라벨용 리그 이름 — 예전엔 클라이언트가 GET /api/leagues/{leagueId} 를
  // 직접 호출했는데, 그 엔드포인트는 select('*') 라 응답에 leagues.edit_pin 까지 실린다.
  // 게이트가 canViewLeague(공개 리그면 익명도 통과) 라서 탭 라벨 텍스트 하나 때문에 PIN 노출
  // 면적이 리그 트리 전 페이지로 넓어져 있었다 — name 컬럼만 좁혀 서버에서 직접 조회하고
  // prop 으로 내려보낸다(추가 라운드트립 없음, '온볼' 폴백 깜빡임도 없음).
  const sb = createClient()
  const { data: leagueRow } = await sb.from('leagues').select('name').eq('id', leagueId).maybeSingle()
  const leagueName = (leagueRow?.name as string | undefined) ?? null

  return (
    <LeagueLayoutClient orgSlug={orgSlug} leagueId={leagueId} leagueName={leagueName}>
      {children}
    </LeagueLayoutClient>
  )
}
