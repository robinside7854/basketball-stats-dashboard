// 리그 회원 계정의 편집 권한(role) 변경 — 어드민 대시보드(NextAuth)와
// 리그 설정 페이지(어드민 회원/PIN) 두 경로가 공유하는 로직.
//
// 안전장치 3가지:
//   1. 승인(approved) 계정만 admin 승격 가능 — 대기/반려/비활성 계정에 권한이 붙지 않도록
//   2. 마지막 어드민은 강등 불가 — 리그에 어드민이 0명이 되면 아무도 편집할 수 없다
//      (전환기엔 PIN 폴백이 있지만, PIN 제거 후를 대비해 지금부터 막는다)
//   3. league_id 스코프 이중 확인 — 다른 리그 계정을 건드릴 수 없도록
import { createClient } from '@/lib/supabase/admin'

export type AccountRole = 'member' | 'admin'

export interface SetRoleResult {
  ok: boolean
  status: number
  error?: string
  account?: { id: string; role: AccountRole; login_id: string }
}

export async function setAccountRole(
  leagueId: string,
  accountId: string,
  role: AccountRole,
): Promise<SetRoleResult> {
  const sb = createClient()

  const { data: target } = await sb
    .from('league_user_accounts')
    .select('id, login_id, status, role')
    .eq('id', accountId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!target) return { ok: false, status: 404, error: '계정을 찾을 수 없습니다' }

  // 1. 승인 계정만 어드민이 될 수 있다
  if (role === 'admin' && target.status !== 'approved') {
    return { ok: false, status: 400, error: '승인된 회원만 어드민으로 지정할 수 있습니다' }
  }

  // 변경 없음 → 조회 1회로 조기 반환
  if (target.role === role) {
    return { ok: true, status: 200, account: { id: target.id, role, login_id: target.login_id } }
  }

  // 2. 마지막 어드민 강등 차단
  if (role === 'member' && target.role === 'admin') {
    const { count } = await sb
      .from('league_user_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
      .eq('role', 'admin')
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        status: 409,
        error: '마지막 어드민은 해제할 수 없습니다. 다른 회원을 먼저 어드민으로 지정하세요.',
      }
    }
  }

  const { error } = await sb
    .from('league_user_accounts')
    .update({ role })
    .eq('id', accountId)
    .eq('league_id', leagueId)
  if (error) return { ok: false, status: 500, error: error.message }

  return { ok: true, status: 200, account: { id: target.id, role, login_id: target.login_id } }
}

// 권한 부여 화면용 계정 목록 — 선수 메타 조인. 어드민 우선 · 이름순.
export async function listLeagueAccounts(leagueId: string) {
  const sb = createClient()
  const { data, error } = await sb
    .from('league_user_accounts')
    .select('id, league_player_id, login_id, status, role, last_login_at')
    .eq('league_id', leagueId)
  if (error) return { error: error.message, accounts: [] }

  const rows = (data ?? []) as Array<{
    id: string; league_player_id: string; login_id: string
    status: string; role: string; last_login_at: string | null
  }>

  const pids = rows.map(r => r.league_player_id)
  const { data: players } = pids.length > 0
    ? await sb.from('league_players').select('id, name, number, photo_url').in('id', pids)
    : { data: [] as Array<{ id: string; name: string; number: number | null; photo_url: string | null }> }
  const meta = new Map(
    ((players ?? []) as Array<{ id: string; name: string; number: number | null; photo_url: string | null }>)
      .map(p => [p.id, p]),
  )

  const accounts = rows
    .map(r => ({ ...r, player: meta.get(r.league_player_id) ?? null }))
    .sort((a, b) => {
      // 어드민 먼저 → 그 다음 이름순 (권한 현황을 한눈에)
      if ((a.role === 'admin') !== (b.role === 'admin')) return a.role === 'admin' ? -1 : 1
      const an = a.player?.name ?? a.login_id
      const bn = b.player?.name ?? b.login_id
      return an.localeCompare(bn, 'ko')
    })

  return { accounts }
}
