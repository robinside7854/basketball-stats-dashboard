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
