// 스탯 게이팅 서버 가드 (2026-07-28)
//   정책: 집계/시즌/개인 스탯·하이라이트 = 승인(approved) 회원 전용.
//        박스스코어·일정·명단·순위표·공지 = 공개.
//   쿠키(mm_auth) 서명 검증만 믿지 않고 DB 에서 status='approved' 현재값을 재확인
//   (반려/비활성 전환된 계정 즉시 차단).
//   운영자는 편집 권한(어드민 role 회원 · 전환기의 편집 PIN)으로도 통과 — canEditLeague 참조.
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/admin'
import { AUTH_COOKIE, verifySession, type SessionPayload } from './session'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

// 승인 회원 세션 조회 — 서버 컴포넌트/라우트 공용. 미로그인·미승인 시 null.
export async function getApprovedSession(leagueId: string): Promise<SessionPayload | null> {
  const jar = await cookies()
  const session = verifySession(jar.get(AUTH_COOKIE)?.value)
  if (!session || session.lid !== leagueId) return null
  const sb = createClient()
  const { data: acc } = await sb
    .from('league_user_accounts')
    .select('id, status')
    .eq('id', session.uid)
    .maybeSingle()
  if (!acc || acc.status !== 'approved') return null
  return session
}

// API 라우트용 — 승인 회원 세션 또는 리그 편집 권한이면 접근 허용.
export async function canViewStats(req: Request, leagueId: string): Promise<boolean> {
  if (await getApprovedSession(leagueId)) return true
  return canEditLeague(req, leagueId)
}

// 리그(시즌)가 속한 팀이 공개인지. 공개면 로그인 없이도 기본 정보를 볼 수 있다.
// 리그 → 팀 → is_public 으로 유도한다 — 상태는 팀에만 두고 리그에 복제하지 않는다.
export async function isLeaguePublic(leagueId: string): Promise<boolean> {
  const sb = createClient()
  const { data, error } = await sb
    .from('leagues')
    .select('teams(is_public)')
    .eq('id', leagueId)
    .maybeSingle()
  if (error) throw new Error(`leagues: leagueId=${leagueId} 공개여부 조회 실패 — ${error.message}`)
  const team = (data as { teams?: { is_public?: boolean } | null } | null)?.teams
  // 팀을 못 찾으면 공개로 취급하지 않는다 — 판정 불가일 때는 닫는 쪽이 안전하다.
  return team?.is_public === true
}

// API 라우트용 — 공개 리그면 누구나, 비공개면 승인 회원 또는 편집 권한자만.
// canViewStats 와 같은 규칙을 쓰되, 이쪽은 "리그 자체를 볼 수 있는가"를 본다.
export async function canViewLeague(req: Request, leagueId: string): Promise<boolean> {
  if (await isLeaguePublic(leagueId)) return true
  if (await getApprovedSession(leagueId)) return true
  return canEditLeague(req, leagueId)
}

// 리그 페이지(page.tsx)용 — 비공개 + 미승인이면 true (페이지가 이 값이면 즉시 return null 해야 함).
//   ⚠ 왜 layout.tsx 하나로 못 막나: Next.js App Router 는 layout 과 그 아래 page 를 병렬로 렌더한다.
//   layout 이 {children} 을 반환에서 빼도(= PrivateLeagueGate 로 대체) 이미 시작된 page 의 렌더는
//   취소되지 않고, 그 결과(데이터 fetch 로 만들어진 리그/팀 이름 등)가 "쓰이지 않는" flight 청크로
//   HTML 응답에 그대로 섞여 나간다 — 화면에는 안 보이지만 raw HTML(view-source, curl, 크롤러)에는
//   노출된다. 실측 확인(2026-08-04): layout 만 막았을 때 curl 응답에 리그명이 실제로 포함됨.
//   그래서 각 page.tsx 가 자기 함수 맨 위에서 이 값을 먼저 확인하고, 데이터를 하나도 fetch 하기
//   전에 return null 해야 한다 — layout 의 PrivateLeagueGate 가 화면은 이미 대체하므로 여기서는
//   그냥 아무것도 렌더하지 않으면 충분하다(중복 UI 불필요, 데이터 계산 자체를 안 하는 게 목적).
export async function isLeaguePrivateGated(leagueId: string): Promise<boolean> {
  if (await isLeaguePublic(leagueId)) return false
  if (await getApprovedSession(leagueId)) return false
  return true
}
