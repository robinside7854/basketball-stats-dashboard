// 드래프트 단장 코드 검증 — 기존 leaguePinAuth 패턴 모방
//
// 단장은 어드민이 발급한 코드를 보유한다.
// 코드는 X-Draft-Code 헤더로 전달되며, bcrypt 해시와 비교된다.
// 인증 성공 시 league_draft_codes.last_used_at 이 갱신된다.

import bcrypt from 'bcryptjs'
import { createClient } from '@/lib/supabase/admin'

const BCRYPT_ROUNDS = 12

export interface DraftCodeVerifyResult {
  valid: boolean
  codeId?: string
  teamId?: string
  label?: string
  role?: 'manager' | 'supervisor'
}

/**
 * 헤더 X-Draft-Code 의 평문 코드를 추출해 (quarter_id, team_id) 조합의
 * 활성 코드와 일치하는지 검증한다.
 *
 * 일치하면 last_used_at 을 갱신하고 codeId·teamId·label 을 반환.
 * 헤더가 없거나 코드가 틀리면 valid=false.
 */
export async function verifyDraftCode(
  req: Request,
  leagueId: string,
  quarterId: string,
  teamId: string,
): Promise<DraftCodeVerifyResult> {
  const plain = req.headers.get('X-Draft-Code')?.trim()
  if (!plain) return { valid: false }

  const supabase = createClient()
  const { data: rows } = await supabase
    .from('league_draft_codes')
    .select('id, code_hash, label, team_id, role')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
    .eq('team_id', teamId)
    .eq('role', 'manager')
    .eq('is_active', true)
    .limit(1)

  const row = (rows ?? [])[0] as { id: string; code_hash: string; label: string; team_id: string; role: 'manager' | 'supervisor' } | undefined
  if (!row) return { valid: false }

  const ok = await bcrypt.compare(plain, row.code_hash)
  if (!ok) return { valid: false }

  // 마지막 사용 시각 갱신 (비차단 — await 으로 처리하지만 빠름)
  await supabase
    .from('league_draft_codes')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)

  return { valid: true, codeId: row.id, teamId: row.team_id, label: row.label, role: row.role }
}

/**
 * X-Draft-Code 헤더가 해당 분기의 감독관(supervisor) 코드 중 어느 하나라도
 * 일치하는지 검증. 분기당 감독관 코드는 무제한 발급 가능 — 부총무 등 복수
 * 권한 부여 시 사용. (이전엔 .limit(1) 로 한 명만 인증됐음)
 */
export async function verifySupervisorCode(
  req: Request,
  leagueId: string,
  quarterId: string,
): Promise<DraftCodeVerifyResult> {
  const plain = req.headers.get('X-Draft-Code')?.trim()
  if (!plain) return { valid: false }

  const supabase = createClient()
  const { data: rows } = await supabase
    .from('league_draft_codes')
    .select('id, code_hash, label')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
    .eq('role', 'supervisor')
    .eq('is_active', true)

  for (const row of (rows ?? []) as { id: string; code_hash: string; label: string }[]) {
    if (await bcrypt.compare(plain, row.code_hash)) {
      await supabase
        .from('league_draft_codes')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', row.id)
      return { valid: true, codeId: row.id, label: row.label, role: 'supervisor' }
    }
  }
  return { valid: false }
}

/**
 * 평문 코드를 bcrypt 로 해시.
 * 어드민이 새 코드를 발급할 때만 호출.
 */
export async function hashDraftCode(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

/**
 * 단장 인증 없이 단순히 league_draft_codes 에서 평문이 어떤 팀에 매칭되는지 찾는다.
 * 단장이 처음 코드 입력 시 "어떤 팀의 단장인지" 알려주기 위해 사용.
 *
 * @returns 매칭되면 { codeId, teamId, label }, 못 찾으면 null
 */
export async function lookupDraftCode(
  leagueId: string,
  quarterId: string,
  plain: string,
): Promise<{ codeId: string; teamId: string | null; label: string; role: 'manager' | 'supervisor' } | null> {
  if (!plain) return null
  const supabase = createClient()
  const { data: rows } = await supabase
    .from('league_draft_codes')
    .select('id, code_hash, label, team_id, role')
    .eq('league_id', leagueId)
    .eq('quarter_id', quarterId)
    .eq('is_active', true)

  for (const row of (rows ?? []) as { id: string; code_hash: string; label: string; team_id: string | null; role: 'manager' | 'supervisor' }[]) {
    if (await bcrypt.compare(plain, row.code_hash)) {
      return { codeId: row.id, teamId: row.team_id, label: row.label, role: row.role ?? 'manager' }
    }
  }
  return null
}
